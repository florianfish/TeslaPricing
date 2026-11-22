// Relevé des tarifs Tesla via Bright Data Web Unlocker, puis envoi à l'add-on et notification Telegram.
// Lancé chaque semaine par .github/workflows/collect-prices.yml ; remplace l'extension navigateur
// (qui reste utilisable en secours).
//
// 1. Liste des stations et tarifs actuels : lus sur l'add-on (sa base fait foi, pas celle du dépôt).
// 2. Chaque station est interrogée via Bright Data (locationId, puis slug), 5 s entre deux requêtes.
// 3. Le relevé est importé par POST /api/prices/import (même format que l'extension).
// 4. Les stations dont le tarif change sont envoyées sur Telegram.
//
// Variables : TESLAPRICING_URL, IMPORT_KEY, BRIGHTDATA_API_TOKEN (obligatoires) ; BRIGHTDATA_ZONE
// (web_unlocker1), BRIGHTDATA_COUNTRY (fr), DELAY_SEC (5), LIMIT (toutes), DRY_RUN (1 = ni import ni
// Telegram), TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, PUBLIC_URL.

import 'dotenv/config';
import fs from 'fs';
import { fetchStation, type BrightDataConfig } from './lib/brightdata.js';
import { parseTeslaData, pricingChanged, gridChanged } from './lib/tesla-pricing.js';
import { priceLevels } from '../src/pricebooks.js';
import { notifyPriceCollection, type PriceChange, type PriceCollectionReport } from './lib/telegram.js';
import type { Supercharger } from '../src/types.js';

const env = (name: string, fallback = '') => (process.env[name] || '').trim() || fallback;

const BASE_URL = env('TESLAPRICING_URL').replace(/\/+$/, '');
const IMPORT_KEY = env('IMPORT_KEY');
const DRY_RUN = /^(1|true|yes|oui)$/i.test(env('DRY_RUN'));
const DELAY_MS = Math.max(1, Number(env('DELAY_SEC', '5')) || 5) * 1000;
const LIMIT = Number(env('LIMIT')) || Infinity;
// Arrêt si les N premières stations échouent toutes (Bright Data ou Tesla bloque tout)
const EARLY_ABORT_AFTER = 10;
// Requêtes en parallèle : Bright Data change d'adresse IP à chaque requête, la limite de Tesla par
// adresse (≈ 1 requête / 5 s) ne s'applique donc pas à l'ensemble. Chaque file garde DELAY_SEC entre ses requêtes.
const CONCURRENCY = Math.min(8, Math.max(1, Math.round(Number(env('CONCURRENCY', '3')) || 3)));
// Durée maximale du relevé : au-delà, plus de nouvelle station, et ce qui est relevé est importé
// (sinon GitHub coupe le job et tout est perdu, comme le 22/11/2026 à la station 209/292)
const MAX_MINUTES = Number(env('MAX_MINUTES', '200')) || 200;

const brightData: BrightDataConfig = {
  token: env('BRIGHTDATA_API_TOKEN'),
  zone: env('BRIGHTDATA_ZONE', 'web_unlocker1'),
  country: env('BRIGHTDATA_COUNTRY', 'fr'),
  // Une requête bloquée ne doit pas immobiliser une file 2 min : elle est retentée (raté passager)
  timeoutMs: 60_000,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(path: string): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${path} : HTTP ${res.status}`);
  return res.json();
}

function writeSummary(markdown: string) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
}

async function main(): Promise<number> {
  const missing = [
    !BASE_URL && 'TESLAPRICING_URL',
    !brightData.token && 'BRIGHTDATA_API_TOKEN',
    !IMPORT_KEY && !DRY_RUN && 'IMPORT_KEY',
  ].filter(Boolean);
  if (missing.length) {
    console.error(`Configuration manquante : ${missing.join(', ')}`);
    return 1;
  }

  console.log(`⚡ Relevé des tarifs via Bright Data (zone ${brightData.zone}, pays ${brightData.country})${DRY_RUN ? ' — ESSAI : ni import ni Telegram' : ''}`);

  const stationList: [string, string, string][] = (await getJson('/api/prices/collector-stations')).data;
  const current = new Map<string, Supercharger>(
    ((await getJson('/api/superchargers?pricebooks=1')).data as Supercharger[]).map((s) => [String(s.id), s])
  );
  const stations = stationList.slice(0, LIMIT);
  console.log(`${stations.length} station(s) à relever sur ${BASE_URL}\n`);

  const collectedAt = new Date().toISOString();
  const results: Record<string, { status: number; data?: unknown }> = {};
  const changes: PriceChange[] = [];
  const failed: { name: string; detail: string }[] = [];
  let collected = 0;
  let multiLevel = 0; // stations dont la grille Tesla compte plus de deux prix
  let requests = 0;
  let abortReason: string | null = null;

  const deadline = Date.now() + MAX_MINUTES * 60_000;
  let next = 0;
  let done = 0;
  let outOfTime = false;

  const worker = async (lane: number) => {
    // Départs décalés pour ne pas envoyer les premières requêtes ensemble
    await sleep((lane * DELAY_MS) / CONCURRENCY);
    let first = true;
    while (!abortReason) {
      if (Date.now() > deadline) {
        outOfTime = true;
        return;
      }
      const i = next++;
      if (i >= stations.length) return;
      if (!first) await sleep(DELAY_MS);
      first = false;
      await collectStation(i);
    }
  };

  const collectStation = async (i: number) => {
    const [id, locationId, slug] = stations[i];
    const station = current.get(id);
    const name = station?.name || id;

    const r = await fetchStation([locationId, slug].filter((v, k, a) => v && a.indexOf(v) === k), brightData, {
      onAttempt: (candidate, res, attempt) =>
        console.log(`[${i + 1}/${stations.length}] ${name} [${candidate}]${attempt ? ` (essai ${attempt + 1})` : ''} → ${res.detail}`),
    });
    requests += r.requests;
    results[id] = r.status === 200 ? { status: 200, data: r.data } : { status: r.status };

    const parsed = r.status === 200 ? parseTeslaData(r.data) : null;
    if (!parsed) {
      failed.push({ name, detail: r.status === 200 ? 'pas de grille tarifaire Tesla' : r.detail });
    } else {
      collected++;
      if (priceLevels(parsed.pricebooks).length > 2) multiLevel++;
      if (
        station?.currentPricing &&
        (pricingChanged(station.currentPricing, parsed.pricing) || gridChanged(station.pricebooks, parsed.pricebooks))
      ) {
        changes.push({
          id,
          name,
          locationSlug: station.locationSlug,
          before: station.currentPricing,
          after: parsed.pricing,
          beforeGrid: station.pricebooks,
          afterGrid: parsed.pricebooks,
        });
      }
    }

    done++;
    if (collected === 0 && done >= EARLY_ABORT_AFTER && !abortReason) {
      abortReason = `aucun tarif reçu sur les ${done} premières stations (${r.detail})`;
    }
  };

  const started = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, lane) => worker(lane)));
  if (outOfTime && !abortReason) {
    abortReason = `durée maximale de ${MAX_MINUTES} min atteinte : ${stations.length - done} station(s) non relevée(s)`;
  }
  console.log(`Durée du relevé : ${Math.round((Date.now() - started) / 60_000)} min (${CONCURRENCY} requêtes en parallèle).`);

  console.log(`\n${collected}/${stations.length} stations relevées, ${changes.length} changement(s), ${requests} requête(s) Bright Data.`);

  let importError: string | null = null;
  let importCounts = '';
  if (!DRY_RUN && collected > 0) {
    try {
      const res = await fetch(`${BASE_URL}/api/prices/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${IMPORT_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectedAt, source: 'brightdata', abortReason, results }),
        signal: AbortSignal.timeout(60000),
      });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      importCounts = `modifiés ${body.updated}, inchangés ${body.confirmed}, ignorés ${body.skipped}`;
      console.log(`Import dans l'add-on : ${importCounts}`);
    } catch (e: any) {
      importError = e.message || String(e);
      console.error(`Import dans l'add-on en échec : ${importError}`);
    }
  }

  const report: PriceCollectionReport = { stations: stations.length, collected, changes, failed, abortReason, importError, multiLevel };

  writeSummary(
    [
      `## Relevé des tarifs via Bright Data${DRY_RUN ? ' (essai, sans import)' : ''}`,
      '',
      `**${collected}/${stations.length} stations relevées**, ${changes.length} tarif(s) modifié(s), ${requests} requête(s) Bright Data.`,
      `${multiLevel} station(s) avec plus de deux prix dans la journée (grille Tesla).`,
      importCounts && `Import dans l'add-on : ${importCounts}.`,
      importError && `⚠️ Import en échec : ${importError}`,
      abortReason && `⛔ Relevé interrompu : ${abortReason}`,
      '',
      ...(changes.length
        ? [
            '| Station | Tesla HP | Tesla HC | Autres VE HP | Autres VE HC | Heures pleines |',
            '|---|---|---|---|---|---|',
            ...changes.map(
              ({ name, before: b, after: a }) =>
                `| ${name} | ${b.teslaPeak} → ${a.teslaPeak} | ${b.teslaOffPeak} → ${a.teslaOffPeak} | ${b.nonTeslaPeak} → ${a.nonTeslaPeak} | ${b.nonTeslaOffPeak} → ${a.nonTeslaOffPeak} | ${b.peakHours} → ${a.peakHours} |`
            ),
          ]
        : []),
      ...(failed.length ? ['', '<details><summary>Stations non relevées</summary>', '', ...failed.map((f) => `- ${f.name} : ${f.detail}`), '</details>'] : []),
    ]
      .filter((l) => l !== null && l !== undefined)
      .join('\n')
  );

  if (!DRY_RUN) await notifyPriceCollection(report);

  return collected === 0 || importError ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  async (err) => {
    const message = err?.message || String(err);
    console.error(`[ERREUR FATALE] ${message}`);
    // Add-on injoignable, réponse inattendue… : prévenir quand même sur Telegram
    if (!DRY_RUN) await notifyPriceCollection({ stations: 0, collected: 0, changes: [], abortReason: message });
    process.exit(1);
  }
);
