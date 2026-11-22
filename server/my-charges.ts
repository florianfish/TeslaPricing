// « Mes recharges » : sessions Superchargeur de l'utilisateur (TeslaMate API, ex. MyTeslaMate) comparées
// aux tarifs relevés. Données personnelles (lieux, dates, montants) : servies seulement via l'Ingress de
// Home Assistant, ou avec la clé d'import, jamais sur l'adresse publique du site.

import crypto from 'crypto';
import type { Request } from 'express';
import { analyzeCharges, type ChargesReport, type TeslaMateCharge } from '../scripts/lib/invoices.js';
import { getSetting, getImportKey, initDatabase } from './db.js';

const CACHE_MS = 60 * 60_000;
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

export function getTeslaMateConfig(): { url: string; token: string; carId: string } {
  let url = getSetting('TESLAMATE_API_URL', 'teslamate_api_url').replace(/\/+$/, '');
  if (url && !/\/api\/v1$/.test(url)) url += '/api/v1';
  return {
    url: /^https?:\/\/[^\s]+$/i.test(url) ? url : '',
    token: getSetting('TESLAMATE_API_TOKEN', 'teslamate_api_token'),
    carId: getSetting('TESLAMATE_CAR_ID', 'teslamate_car_id') || '1',
  };
}

export function isMyChargesConfigured(): boolean {
  return getTeslaMateConfig().url !== '';
}

// Proxy Ingress du Supervisor Home Assistant : seule source des requêtes authentifiées par HA
const INGRESS_PROXY = new Set(['172.30.32.2', '::ffff:172.30.32.2']);

export function isPrivateRequest(req: Request): boolean {
  if (INGRESS_PROXY.has(req.socket.remoteAddress || '')) return true;
  const key = getImportKey();
  if (!key) return false;
  const given = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(key);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

let cache: { at: number; key: string; charges: TeslaMateCharge[] } | null = null;

async function fetchAllCharges(): Promise<TeslaMateCharge[]> {
  const { url, token, carId } = getTeslaMateConfig();
  const key = `${url}|${carId}`;
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return cache.charges;

  const charges: TeslaMateCharge[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(`${url}/cars/${encodeURIComponent(carId)}/charges?page=${page}&show=${PAGE_SIZE}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`TeslaMate API : HTTP ${res.status}`);
    const body: any = await res.json();
    const list: TeslaMateCharge[] = body?.data?.charges || [];
    charges.push(...list);
    if (list.length < PAGE_SIZE) break;
  }
  cache = { at: Date.now(), key, charges };
  return charges;
}

export async function getMyCharges(): Promise<ChargesReport & { fetchedAt: string }> {
  const charges = await fetchAllCharges();
  return { ...analyzeCharges(charges, initDatabase().superchargers), fetchedAt: new Date(cache?.at ?? Date.now()).toISOString() };
}

// Pour les tests
export function resetMyChargesCache() {
  cache = null;
}
