// Taux d'occupation des stations, à partir des données publiques IRVE (transport.data.gouv.fr).
// Logique pure (lecture CSV, rapprochement, agrégation) ; téléchargements et stockage dans server/occupancy.ts.
//
// - Fichier statique (≈ 130 Mo, nuit) : points de recharge Tesla (« FRTSLE… ») regroupés par station,
//   avec leurs coordonnées. Rapprochés de nos stations par position (≈ 18 m en médiane).
// - Fichier dynamique (≈ 10 Mo, temps réel) : état de chaque point (libre, occupé…) et date de mise à jour.
// - Chaque échantillon donne, par station, la part de bornes occupées ; elle est cumulée par jour de
//   semaine × heure (heure de Paris), soit 168 cases par station.

export const TESLA_PDC_PREFIX = 'FRTSLE';
export const IRVE_STATIC_URL = 'https://transport.data.gouv.fr/resources/84013/download';
export const IRVE_DYNAMIC_URL = 'https://transport.data.gouv.fr/resources/84098/download';
export const MATCH_MAX_DISTANCE_M = 400;
export const MAX_POINT_AGE_H = 6;      // un point non mis à jour depuis plus longtemps n'est pas compté
export const MIN_SAMPLES_PER_SLOT = 2; // en dessous, la case de la grille reste vide

// --- CSV ---------------------------------------------------------------------------------------

// Une ligne CSV (séparateur virgule, champs entre guillemets possibles, "" pour un guillemet)
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(field);
      field = '';
    } else field += c;
  }
  out.push(field.replace(/\r$/, ''));
  return out;
}

// Lignes du fichier → objets, en ne gardant que les lignes Tesla (filtre rapide avant analyse)
export function readTeslaRows(lines: Iterable<string>): Record<string, string>[] {
  let header: string[] | null = null;
  const rows: Record<string, string>[] = [];
  for (const line of lines) {
    if (!header) {
      header = parseCsvLine(line.replace(/^﻿/, ''));
      continue;
    }
    if (!line.includes(TESLA_PDC_PREFIX)) continue;
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = values[i] ?? ''));
    if (row.id_pdc_itinerance?.startsWith(TESLA_PDC_PREFIX)) rows.push(row);
  }
  return rows;
}

// --- Stations IRVE et rapprochement ---------------------------------------------------------------

export interface IrveStation {
  id: string;       // id_station_itinerance (FRTSLP…)
  name: string;
  lat: number;
  lon: number;
  pdc: string[];    // points de recharge (id_pdc_itinerance)
}

function coordinates(row: Record<string, string>): [number, number] | null {
  // Schéma 2.3.1 : coordonneesXY = "[lon, lat]" ; schéma 3 : station_latitude / station_longitude
  const xy = row.coordonneesXY?.match(/^\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]\s*$/);
  if (xy) return [Number(xy[2]), Number(xy[1])];
  const lat = Number(row.station_latitude ?? row.consolidated_latitude);
  const lon = Number(row.station_longitude ?? row.consolidated_longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon) ? [lat, lon] : null;
}

export function groupIrveStations(rows: Record<string, string>[]): IrveStation[] {
  const byId = new Map<string, IrveStation>();
  for (const row of rows) {
    const id = row.id_station_itinerance;
    const pos = coordinates(row);
    if (!id || !pos) continue;
    let station = byId.get(id);
    if (!station) {
      station = { id, name: row.nom_station || id, lat: pos[0], lon: pos[1], pdc: [] };
      byId.set(id, station);
    }
    if (!station.pdc.includes(row.id_pdc_itinerance)) station.pdc.push(row.id_pdc_itinerance);
  }
  return [...byId.values()];
}

export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const simplify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/,?\s*france$/, '').replace(/[^a-z0-9]/g, '');

export interface OurStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  stallCount: number;
}

// Nos stations ↔ stations IRVE, une pour une. Coût d'un couple : distance, + 100 m par borne d'écart,
// + 150 m si les noms diffèrent ; les couples les moins coûteux sont retenus en premier
// (plusieurs stations d'une même ville peuvent être à moins de 400 m l'une de l'autre).
export function matchStations(ours: OurStation[], irve: IrveStation[], maxDistance = MATCH_MAX_DISTANCE_M): Record<string, string[]> {
  const pairs: { cost: number; ourId: string; irve: IrveStation }[] = [];
  for (const s of ours) {
    for (const st of irve) {
      const d = distanceM(s.latitude, s.longitude, st.lat, st.lon);
      if (d > maxDistance) continue;
      const cost = d + 100 * Math.abs((s.stallCount || 0) - st.pdc.length) + (simplify(s.name) === simplify(st.name) ? 0 : 150);
      pairs.push({ cost, ourId: s.id, irve: st });
    }
  }
  pairs.sort((a, b) => a.cost - b.cost);
  const mapping: Record<string, string[]> = {};
  const usedIrve = new Set<string>();
  for (const p of pairs) {
    if (mapping[p.ourId] || usedIrve.has(p.irve.id)) continue;
    mapping[p.ourId] = [...p.irve.pdc].sort();
    usedIrve.add(p.irve.id);
  }
  return mapping;
}

// --- État des points et échantillons ---------------------------------------------------------------

export interface PointStatus {
  occupation: string; // libre, occupe, reserve, inconnu
  etat: string;       // en_service, hors_service, inconnu
  at: number;         // horodatage (ms)
}

export function readPointStatuses(rows: Record<string, string>[]): Map<string, PointStatus> {
  const map = new Map<string, PointStatus>();
  for (const r of rows) {
    // « 2026-11-21 22:45:48.445180+00:00 » : ISO avec un espace
    const at = Date.parse(String(r.horodatage || '').replace(' ', 'T'));
    map.set(r.id_pdc_itinerance, {
      occupation: (r.occupation_pdc || 'inconnu').trim(),
      etat: (r.etat_pdc || 'inconnu').trim(),
      at: Number.isFinite(at) ? at : 0,
    });
  }
  return map;
}

export interface StationOccupancy {
  occupied: number;
  total: number; // points comptés (libres + occupés, à jour et en service)
}

// Occupation d'une station à l'instant : null si aucun point exploitable
export function stationOccupancy(
  pdcIds: string[],
  statuses: Map<string, PointStatus>,
  now: number,
  maxAgeH = MAX_POINT_AGE_H
): StationOccupancy | null {
  let occupied = 0;
  let total = 0;
  for (const id of pdcIds) {
    const s = statuses.get(id);
    if (!s || s.etat === 'hors_service' || now - s.at > maxAgeH * 3600_000) continue;
    if (s.occupation === 'occupe' || s.occupation === 'reserve') {
      occupied++;
      total++;
    } else if (s.occupation === 'libre') total++;
  }
  return total ? { occupied, total } : null;
}

// Case jour × heure, heure de Paris : 0 = lundi 0 h … 167 = dimanche 23 h
export function slotIndex(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'));
  return day * 24 + Number(get('hour'));
}

// --- Stockage cumulé ------------------------------------------------------------------------------

export interface OccupancyStore {
  version: 1;
  mapping: Record<string, string[]>; // notre id → points IRVE
  mappingAt: string | null;          // dernier rapprochement (fichier statique)
  slots: Record<string, { sum: number[]; n: number[] }>; // 168 cases : somme des taux, nombre d'échantillons
  current: Record<string, StationOccupancy & { at: string }>;
  lastSampleAt: string | null;
  lastError: string | null;
}

export function emptyStore(): OccupancyStore {
  return { version: 1, mapping: {}, mappingAt: null, slots: {}, current: {}, lastSampleAt: null, lastError: null };
}

export function addSample(store: OccupancyStore, stationId: string, occ: StationOccupancy, date: Date) {
  const slot = slotIndex(date);
  const s = (store.slots[stationId] ??= { sum: new Array(168).fill(0), n: new Array(168).fill(0) });
  s.sum[slot] = Math.round((s.sum[slot] + occ.occupied / occ.total) * 1000) / 1000;
  s.n[slot] += 1;
  store.current[stationId] = { ...occ, at: date.toISOString() };
}

// Un échantillon complet : toutes les stations rapprochées. Renvoie le nombre de stations échantillonnées
// et la part des points Tesla publiés absents du rapprochement (rapprochement à refaire au-delà de 5 %).
export function sampleAll(store: OccupancyStore, statuses: Map<string, PointStatus>, date: Date): { stations: number; unknownShare: number } {
  let stations = 0;
  for (const [stationId, pdc] of Object.entries(store.mapping)) {
    const occ = stationOccupancy(pdc, statuses, date.getTime());
    if (!occ) {
      delete store.current[stationId]; // pas d'état à jour : ne pas afficher un ancien « en ce moment »
      continue;
    }
    addSample(store, stationId, occ, date);
    stations++;
  }
  const known = new Set(Object.values(store.mapping).flat());
  const unknown = [...statuses.keys()].filter((id) => !known.has(id)).length;
  store.lastSampleAt = date.toISOString();
  return { stations, unknownShare: statuses.size ? unknown / statuses.size : 0 };
}

export interface OccupancyView {
  stationId: string;
  matched: boolean;
  points: number;
  current: (StationOccupancy & { at: string }) | null;
  // grid[jour][heure] : taux moyen 0–1 (lundi = 0), null si pas assez d'échantillons
  grid: (number | null)[][];
  samples: number;
  lastSampleAt: string | null;
}

export function occupancyView(store: OccupancyStore, stationId: string): OccupancyView {
  const s = store.slots[stationId];
  const grid: (number | null)[][] = [];
  for (let d = 0; d < 7; d++) {
    const row: (number | null)[] = [];
    for (let h = 0; h < 24; h++) {
      const i = d * 24 + h;
      row.push(s && s.n[i] >= MIN_SAMPLES_PER_SLOT ? Math.round((s.sum[i] / s.n[i]) * 100) / 100 : null);
    }
    grid.push(row);
  }
  return {
    stationId,
    matched: !!store.mapping[stationId],
    points: store.mapping[stationId]?.length || 0,
    current: store.current[stationId] || null,
    grid,
    samples: s ? s.n.reduce((a, b) => a + b, 0) : 0,
    lastSampleAt: store.lastSampleAt,
  };
}
