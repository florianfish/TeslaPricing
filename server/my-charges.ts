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

export interface TeslaMateConfig {
  url: string;    // adresse de l'API, terminée par /api/v1
  user: string;   // identifiant (authentification Basic), vide = jeton Bearer
  secret: string; // mot de passe (Basic) ou jeton (Bearer)
  carId: string;
}

// Identifiant d'une instance MyTeslaMate : le sous-domaine (« abcd » pour abcd.api.myteslamate.com),
// comme dans l'appli MyTeslamateApiMobile
export function myTeslaMateUser(url: string): string {
  const host = url.replace(/^https?:\/\//i, '').split(/[/:]/)[0].toLowerCase();
  return host.endsWith('.api.myteslamate.com') ? host.slice(0, -'.api.myteslamate.com'.length) : '';
}

export function getTeslaMateConfig(): TeslaMateConfig {
  let url = getSetting('TESLAMATE_API_URL', 'teslamate_api_url').replace(/\/+$/, '');
  if (url && !/\/api\/v1$/.test(url)) url += '/api/v1';
  url = /^https?:\/\/[^\s]+$/i.test(url) ? url : '';
  return {
    url,
    // Identifiant saisi, sinon sous-domaine d'une instance MyTeslaMate (authentification Basic)
    user: getSetting('TESLAMATE_API_USER', 'teslamate_api_user') || myTeslaMateUser(url),
    secret: getSetting('TESLAMATE_API_TOKEN', 'teslamate_api_token'),
    carId: getSetting('TESLAMATE_CAR_ID', 'teslamate_car_id') || '1',
  };
}

// En-tête d'authentification : Basic avec identifiant + mot de passe (MyTeslaMate), Bearer avec un jeton
export function teslaMateAuthHeader(config: Pick<TeslaMateConfig, 'user' | 'secret'>): Record<string, string> {
  if (!config.secret) return {};
  if (config.user) return { Authorization: `Basic ${Buffer.from(`${config.user}:${config.secret}`).toString('base64')}` };
  return { Authorization: `Bearer ${config.secret}` };
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
  const config = getTeslaMateConfig();
  const { url, carId } = config;
  const key = `${url}|${config.user}|${carId}`;
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return cache.charges;

  const charges: TeslaMateCharge[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(`${url}/cars/${encodeURIComponent(carId)}/charges?page=${page}&show=${PAGE_SIZE}`, {
      headers: teslaMateAuthHeader(config),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(`TeslaMate API : accès refusé (HTTP ${res.status}), vérifier l'identifiant et le mot de passe (ou le jeton)`);
    }
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
