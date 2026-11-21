// Test de relevé des tarifs Tesla via Bright Data Web Unlocker — LECTURE SEULE.
// N'écrit ni dans la base, ni dans le dépôt, ni vers l'add-on : affiche seulement ce que
// renvoie l'API FindUs pour quelques stations, pour juger si Bright Data passe Akamai.
//
// Usage : BRIGHTDATA_API_TOKEN=... node scripts/test-brightdata.ts
// Variables : BRIGHTDATA_ZONE (web_unlocker1), BRIGHTDATA_COUNTRY (fr), LIMIT (10), DELAY_SEC (2),
// STATIONS (ids supercharge.info séparés par des virgules, sinon les LIMIT premières stations ouvertes).
// Sorties : résumé Markdown (GITHUB_STEP_SUMMARY si défini) et brightdata-results.json.

import fs from 'node:fs';
import { parseTeslaData } from './lib/tesla-pricing.ts';

const TOKEN = (process.env.BRIGHTDATA_API_TOKEN || '').trim();
const ZONE = (process.env.BRIGHTDATA_ZONE || '').trim() || 'web_unlocker1';
const COUNTRY = (process.env.BRIGHTDATA_COUNTRY || '').trim();
const ENDPOINT = process.env.BRIGHTDATA_ENDPOINT || 'https://api.brightdata.com/request';
const LIMIT = Math.max(1, Number(process.env.LIMIT) || 10);
const DELAY_MS = Math.max(0, Number(process.env.DELAY_SEC ?? 2)) * 1000;
const ONLY = (process.env.STATIONS || '').split(',').map((s) => s.trim()).filter(Boolean);
const DB_FILE = 'server/data/superchargers_db.json';

if (!TOKEN) {
  console.error('BRIGHTDATA_API_TOKEN manquant (secret GitHub du dépôt).');
  process.exit(1);
}

const apiUrl = (id: string) =>
  `https://www.tesla.com/api/findus/get-charger-details?locationSlug=${encodeURIComponent(id)}` +
  '&programType=supercharger&locale=fr-FR&isInHkMoTw=false';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Attempt = { candidate: string; httpStatus: number; brdError?: string; outcome: string; ms: number };

async function fetchViaBrightData(candidate: string): Promise<{ attempt: Attempt; data?: any }> {
  const started = Date.now();
  const body: Record<string, string> = { zone: ZONE, url: apiUrl(candidate), format: 'raw' };
  if (COUNTRY) body.country = COUNTRY;
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
  } catch (e: any) {
    return { attempt: { candidate, httpStatus: 0, outcome: `erreur réseau : ${e?.message || e}`, ms: Date.now() - started } };
  }
  const text = await res.text();
  const attempt: Attempt = {
    candidate,
    httpStatus: res.status,
    brdError: res.headers.get('x-brd-error') || res.headers.get('x-luminati-error') || undefined,
    outcome: '',
    ms: Date.now() - started,
  };
  if (!res.ok) {
    const detail = text.replace(/\s+/g, ' ').trim().slice(0, 300);
    attempt.outcome = `HTTP ${res.status}${detail ? ` : ${detail}` : ''}`;
    return { attempt };
  }
  if (/access denied|cpr_chlge/i.test(text) || /^\s*<(!doctype|html)/i.test(text)) {
    attempt.outcome = 'bloqué (page HTML / Access Denied)';
    return { attempt };
  }
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    attempt.outcome = 'réponse non JSON';
    return { attempt };
  }
  const data = json?.data?.data;
  if (!data) {
    attempt.outcome = 'JSON sans données (station inconnue ?)';
    return { attempt };
  }
  attempt.outcome = 'OK';
  return { attempt, data };
}

const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const open = (db.superchargers as any[]).filter((s) => s.status === 'OPEN' && (s.locationId || s.locationSlug));
const stations = ONLY.length ? open.filter((s) => ONLY.includes(String(s.id))) : open.slice(0, LIMIT);

console.log(`Zone ${ZONE}${COUNTRY ? `, pays ${COUNTRY}` : ''} — ${stations.length} station(s) à tester.`);

const fmt = (n?: number) => (typeof n === 'number' ? n.toFixed(2) : '—');
const rows: string[] = [];
const results: any[] = [];
let ok = 0;
let requests = 0;

for (const s of stations) {
  const candidates = [s.locationId, s.locationSlug].filter((v: string, i: number, a: string[]) => v && a.indexOf(v) === i);
  const attempts: Attempt[] = [];
  let data: any;
  for (const candidate of candidates) {
    if (requests > 0) await sleep(DELAY_MS);
    requests++;
    const r = await fetchViaBrightData(candidate);
    attempts.push(r.attempt);
    console.log(`${s.name} [${candidate}] → ${r.attempt.outcome}${r.attempt.brdError ? ` (${r.attempt.brdError})` : ''} en ${r.attempt.ms} ms`);
    if (r.data) {
      data = r.data;
      break;
    }
  }

  const parsed = data ? parseTeslaData(data) : null;
  if (parsed) ok++;
  const p = parsed?.pricing;
  const ref = s.currentPricing || {};
  const last = attempts[attempts.length - 1];
  rows.push(
    `| ${s.name} (${s.id}) | ${last?.candidate || '—'} | ${parsed ? '✅' : `❌ ${last?.outcome || ''}`} | ` +
      `${fmt(p?.teslaPeak)} / ${fmt(p?.teslaOffPeak)} | ${fmt(p?.nonTeslaPeak)} / ${fmt(p?.nonTeslaOffPeak)} | ${p?.peakHours || '—'} | ` +
      `${fmt(ref.teslaPeak)} / ${fmt(ref.teslaOffPeak)} | ${last ? Math.round(last.ms / 1000) : '—'} s |`
  );
  results.push({ id: s.id, name: s.name, attempts, pricing: p || null, raw: data || null });

  // Erreur de requête Bright Data (zone, clé…) identique sur 3 stations : inutile d'insister
  const apiErrors = results.slice(-3).map((r) => r.attempts.at(-1)?.outcome || '');
  if (!ok && apiErrors.length === 3 && /^HTTP 4/.test(apiErrors[0]) && apiErrors.every((o) => o === apiErrors[0])) {
    console.log(`Arrêt : Bright Data refuse toutes les requêtes (${apiErrors[0]}).`);
    break;
  }
}

const summary = [
  '## Test Bright Data Web Unlocker — tarifs Superchargeurs',
  '',
  `**${ok}/${stations.length} stations relevées**, ${requests} requête(s) Bright Data (zone \`${ZONE}\`${COUNTRY ? `, pays \`${COUNTRY}\`` : ''}). Aucune écriture en base.`,
  '',
  '| Station | Identifiant | Résultat | Tesla HP / HC | Autres VE HP / HC | Heures pleines | Base GitHub (Tesla HP / HC) | Durée |',
  '|---|---|---|---|---|---|---|---|',
  ...rows,
  '',
  '_« Base GitHub » : tarifs de la base du dépôt, pas de celle de l’add-on (qui reçoit les relevés de l’extension)._',
  '',
].join('\n');

console.log('\n' + summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
fs.writeFileSync('brightdata-results.json', JSON.stringify({ testedAt: new Date().toISOString(), zone: ZONE, results }, null, 2));

process.exit(ok > 0 ? 0 : 1);
