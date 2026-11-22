// Échantillonnage de l'occupation des stations (données IRVE) : téléchargements, stockage, planification.
// Logique pure dans scripts/lib/occupancy.ts. Stockage séparé de la base (fichier occupancy.json du
// dossier de données) : réécrit à chaque échantillon, il ne doit pas alourdir superchargers_db.json.

import fs from 'fs';
import path from 'path';
import {
  IRVE_DYNAMIC_URL,
  IRVE_STATIC_URL,
  emptyStore,
  groupIrveStations,
  matchStations,
  occupancyView,
  readPointStatuses,
  readTeslaRows,
  sampleAll,
  slotIndex,
  MIN_SAMPLES_PER_SLOT,
  type OccupancyStore,
  type OccupancyView,
} from '../scripts/lib/occupancy.js';
import { DATA_DIR, initDatabase, getSetting, isPersistentDataDir } from './db.js';
import type { OccupancyStatus, OccupancyLive } from '../src/types.js';

const STORE_FILE = () => path.join(DATA_DIR, 'occupancy.json');
const MAPPING_MAX_AGE_MS = 7 * 24 * 3600_000;

let store: OccupancyStore | null = null;
let running = false;

export function loadOccupancyStore(): OccupancyStore {
  if (store) return store;
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE(), 'utf-8'));
    store = parsed?.version === 1 ? { ...emptyStore(), ...parsed } : emptyStore();
  } catch {
    store = emptyStore();
  }
  return store!;
}

function saveStore() {
  if (!store) return;
  const tmp = `${STORE_FILE()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store));
  fs.renameSync(tmp, STORE_FILE());
}

// Intervalle d'échantillonnage en minutes : variable OCCUPANCY_INTERVAL_MIN, sinon option
// « occupancy_interval_min » de l'add-on ; par défaut 15 min sur une base persistante (add-on), 0 sinon.
export function getOccupancyIntervalMin(): number {
  const raw = getSetting('OCCUPANCY_INTERVAL_MIN', 'occupancy_interval_min');
  if (raw !== '') {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.max(5, Math.round(n)) : 0;
  }
  return isPersistentDataDir() ? 15 : 0;
}

// Lignes d'une réponse HTTP, lues au fil de l'eau (le fichier statique fait ≈ 130 Mo)
async function* responseLines(res: Response): AsyncGenerator<string> {
  if (!res.body) return;
  const decoder = new TextDecoder();
  let rest = '';
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    rest += decoder.decode(chunk, { stream: true });
    const lines = rest.split('\n');
    rest = lines.pop() ?? '';
    yield* lines;
  }
  rest += decoder.decode();
  if (rest) yield rest;
}

// Le lecteur CSV attend un itérable synchrone : on ne garde en mémoire que l'en-tête et les lignes Tesla
async function fetchTeslaLines(url: string, timeoutMs: number): Promise<string[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'TeslaPricing (occupation des stations)' } });
  if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`);
  const kept: string[] = [];
  for await (const line of responseLines(res)) {
    if (kept.length === 0 || line.includes('FRTSLE')) kept.push(line);
  }
  return kept;
}

export async function refreshOccupancyMapping(): Promise<number> {
  const s = loadOccupancyStore();
  const irve = groupIrveStations(readTeslaRows(await fetchTeslaLines(IRVE_STATIC_URL, 10 * 60_000)));
  if (irve.length === 0) throw new Error('aucune station Tesla dans le fichier statique IRVE');
  const ours = initDatabase().superchargers.filter((st) => st.status === 'OPEN');
  s.mapping = matchStations(ours, irve);
  s.mappingAt = new Date().toISOString();
  saveStore();
  console.log(`Occupation : ${Object.keys(s.mapping).length}/${ours.length} stations rapprochées des données IRVE (${irve.length} stations Tesla publiées).`);
  return Object.keys(s.mapping).length;
}

export async function sampleOccupancy(now = new Date()): Promise<{ stations: number }> {
  if (running) return { stations: 0 };
  running = true;
  const s = loadOccupancyStore();
  try {
    const stale = !s.mappingAt || now.getTime() - Date.parse(s.mappingAt) > MAPPING_MAX_AGE_MS;
    if (stale || Object.keys(s.mapping).length === 0) await refreshOccupancyMapping();

    const statuses = readPointStatuses(readTeslaRows(await fetchTeslaLines(IRVE_DYNAMIC_URL, 2 * 60_000)));
    const result = sampleAll(s, statuses, now);
    s.lastError = null;
    saveStore();
    // Nouvelles stations ou points renommés : rapprochement à refaire au prochain échantillon
    if (result.unknownShare > 0.05) s.mappingAt = null;
    return { stations: result.stations };
  } catch (err: any) {
    s.lastError = `${now.toISOString()} : ${err?.message || err}`;
    saveStore();
    throw err;
  } finally {
    running = false;
  }
}

export function getOccupancy(stationId: string): OccupancyView & { enabled: boolean } {
  return { ...occupancyView(loadOccupancyStore(), stationId), enabled: getOccupancyIntervalMin() > 0 };
}

// État du relevé, pour le tableau de bord de la collecte
export function getOccupancyStatus(now = new Date()): OccupancyStatus {
  const s = loadOccupancyStore();
  const intervalMin = getOccupancyIntervalMin();
  const openStations = initDatabase().superchargers.filter((st) => st.status === 'OPEN').length;
  const lastSampleAge = s.lastSampleAt ? (now.getTime() - Date.parse(s.lastSampleAt)) / 60_000 : null;
  let state: OccupancyStatus['state'];
  if (intervalMin === 0) state = 'disabled';
  else if (s.lastError) state = 'error';
  else if (lastSampleAge === null) state = 'pending';
  else if (lastSampleAge > 3 * intervalMin) state = 'late';
  else state = 'ok';
  const visibleSlots = Object.values(s.slots).reduce((sum, st) => sum + st.n.filter((n) => n >= MIN_SAMPLES_PER_SLOT).length, 0);
  return {
    state,
    intervalMin,
    lastSampleAt: s.lastSampleAt,
    lastError: s.lastError,
    mappingAt: s.mappingAt,
    matchedStations: Object.keys(s.mapping).length,
    openStations,
    liveStations: Object.keys(s.current).length,
    samples: Object.values(s.slots).reduce((sum, st) => sum + st.n.reduce((a, b) => a + b, 0), 0),
    gridFill: Object.keys(s.mapping).length ? visibleSlots / (168 * Object.keys(s.mapping).length) : 0,
  };
}

// Toutes les stations en ce moment, avec l'occupation habituelle du créneau (jour × heure en cours)
export function getOccupancyNow(now = new Date()): OccupancyLive {
  const s = loadOccupancyStore();
  const slot = slotIndex(now);
  const byId = new Map(initDatabase().superchargers.map((st) => [st.id, st]));
  const stations: OccupancyLive['stations'] = [];
  for (const [id, cur] of Object.entries(s.current)) {
    const st = byId.get(id);
    if (!st) continue;
    const cell = s.slots[id];
    stations.push({
      id,
      name: st.name,
      city: st.city,
      region: st.region,
      occupied: cur.occupied,
      total: cur.total,
      at: cur.at,
      usual: cell && cell.n[slot] >= MIN_SAMPLES_PER_SLOT ? Math.round((cell.sum[slot] / cell.n[slot]) * 100) / 100 : null,
    });
  }
  return { enabled: getOccupancyIntervalMin() > 0, lastSampleAt: s.lastSampleAt, stations };
}
