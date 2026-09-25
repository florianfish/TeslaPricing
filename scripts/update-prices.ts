import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import type { Supercharger, SuperchargerPricing, PriceSnapshot } from '../src/types.js';

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const DB_FILE = path.join(DATA_DIR, 'superchargers_db.json');
const OUT_STATIONS_FILE = path.join(DATA_DIR, 'out_stations.json');

// Délai de courtoisie entre chaque station (5 secondes pour préserver la connexion résidentielle)
const REQUEST_INTERVAL_MS = 5000;

// Compteur global de 429 (Rate Limit) consécutifs pour arrêt d'urgence
let consecutive429Count = 0;

// --- GESTION DU STATUT DES STATIONS OUT (JUSQU'AU LENDEMAIN) ---
export interface OutStationInfo {
  name: string;
  date: string; // Format YYYY-MM-DD
  reason: string;
}

export interface OutStationsState {
  lastUpdated: string;
  stations: Record<string, OutStationInfo>;
}

function loadOutStations(todayIso: string): OutStationsState {
  if (!fs.existsSync(OUT_STATIONS_FILE)) {
    return { lastUpdated: todayIso, stations: {} };
  }
  try {
    const raw = fs.readFileSync(OUT_STATIONS_FILE, 'utf-8');
    const state: OutStationsState = JSON.parse(raw);
    if (!state.stations) state.stations = {};

    // Purge automatique des stations des jours passés ("jusqu'au lendemain")
    let purgedCount = 0;
    for (const [id, info] of Object.entries(state.stations)) {
      if (info.date !== todayIso) {
        delete state.stations[id];
        purgedCount++;
      }
    }
    if (purgedCount > 0) {
      console.log(`[STATIONS OUT] 🌅 Nouveau jour (${todayIso}) : ${purgedCount} station(s) réactivée(s) pour de nouvelles tentatives.`);
      saveOutStations(state);
    }
    return state;
  } catch (err: any) {
    console.warn(`[STATIONS OUT] ⚠️ Erreur lecture ${OUT_STATIONS_FILE} : ${err.message}. Réinitialisation.`);
    return { lastUpdated: todayIso, stations: {} };
  }
}

function saveOutStations(state: OutStationsState) {
  try {
    fs.writeFileSync(OUT_STATIONS_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err: any) {
    console.error(`[STATIONS OUT] ❌ Impossible de sauvegarder ${OUT_STATIONS_FILE} : ${err.message}`);
  }
}

interface DatabaseSchema {
  superchargers: Supercharger[];
  priceSnapshots: PriceSnapshot[];
  nationalHistory: PriceSnapshot[];
  lastSyncTime: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Clean slug generator
function formatSlug(rawId: string | number, name: string, city: string): string {
  if (typeof rawId === 'string' && rawId.toLowerCase().includes('supercharger')) {
    return rawId.toLowerCase().trim();
  }
  const cleanName = (city || name || 'supercharger')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
  return `${cleanName}supercharger`;
}

// 1. Interroger le registre des stations françaises (supercharge.info)
async function fetchLiveFrenchSites(): Promise<any[]> {
  const url = 'https://supercharge.info/service/supercharge/allSites';
  console.log(`[SCRAPER] 🌍 Interrogation du registre des stations : ${url}...`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TeslaPricingAutomatedScraper/1.0',
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
    }

    const allSites = (await res.json()) as any[];
    const frenchSites = allSites.filter(
      (s) => s.address && (s.address.country === 'France' || s.address.countryId === 110)
    );

    console.log(`[SCRAPER] ✅ ${frenchSites.length} stations françaises répertoriées.`);
    return frenchSites;
  } catch (err: any) {
    clearTimeout(timeout);
    console.warn(`[SCRAPER] ⚠️ Avertissement: Registre externe non disponible (${err.message}). Utilisation des données locales.`);
    return [];
  }
}

// 2. Interroger l'API officielle Tesla FindUs pour une station en direct (via VPN résidentiel)
export interface TeslaPricingResult {
  data: any | null;
  isStationOut: boolean;
}

async function queryTeslaSlug(
  slug: string
): Promise<{ status: number; data: any | null; error?: string }> {
  const url = `https://www.tesla.com/api/findus/get-charger-details?locationSlug=${slug}&programType=supercharger&locale=en-US&isInHkMoTw=false`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': `https://www.tesla.com/findus/location/supercharger/${slug}`,
        'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const json = await res.json();
      const data = json?.data?.data || null;
      return { status: res.status, data };
    }
    return { status: res.status, data: null };
  } catch (err: any) {
    clearTimeout(timeout);
    const isAbort = err.name === 'AbortError' || err.message?.includes('aborted');
    return { status: 0, data: null, error: isAbort ? 'Timeout (12s)' : (err.message || 'Erreur réseau') };
  }
}

async function fetchTeslaPricing(
  primarySlug: string,
  fallbackSlug?: string,
  stationName = '',
  maxRetries = 2
): Promise<TeslaPricingResult> {
  const slugsToTry = [primarySlug];
  if (fallbackSlug && fallbackSlug !== primarySlug) {
    slugsToTry.push(fallbackSlug);
  }

  let confirmed404Count = 0;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    for (const slug of slugsToTry) {
      console.log(`       🌐 [Direct] Interrogation de ${stationName} (${slug}) [essai ${attempt}/${maxRetries}]...`);
      const result = await queryTeslaSlug(slug);

      if (result.data) {
        consecutive429Count = 0;
        return { data: result.data, isStationOut: false };
      }

      // Si 404 : slug non répertorié chez Tesla
      if (result.status === 404) {
        consecutive429Count = 0;
        confirmed404Count++;
        continue;
      }

      // Si 429 (rate limit) : temporisation de sécurité (15 secondes) et détection double 429
      if (result.status === 429) {
        consecutive429Count++;
        console.warn(`       ⚠️ [RATE LIMIT 429] Alerte 429 #${consecutive429Count} reçue de Tesla.`);
        if (consecutive429Count >= 2) {
          throw new Error('RATE_LIMIT_DOUBLE_429');
        }
        console.warn(`       ⚠️ [RATE LIMIT 429] Pause de 15 secondes avant nouvelle tentative...`);
        await sleep(15000);
        break;
      }

      // Si 403 / timeout : passer à l'essai suivant
      if (result.status === 403 || result.status === 0) {
        break;
      }
    }

    if (attempt < maxRetries) {
      await sleep(1500);
    }
  }

  // La station n'est marquée OUT que si TOUS les slugs ont renvoyé 404 (station inexistante/fermée chez Tesla)
  // Jamais à cause d'un 403 (Accès refusé) ou d'un timeout réseau
  const isTruly404 = confirmed404Count >= slugsToTry.length * maxRetries;
  return { data: null, isStationOut: isTruly404 };
}

// 3. Extraire et normaliser les tarifs depuis le schéma Tesla (effectivePricebooks)
function parseTeslaData(teslaData: any): {
  pricing: SuperchargerPricing;
  stallCount?: number;
  powerKw?: number;
  otherEVs?: boolean;
} | null {
  const pricebooks: any[] = teslaData?.effectivePricebooks || [];
  if (!Array.isArray(pricebooks) || pricebooks.length === 0) {
    return null;
  }

  const tslaCharging = pricebooks.filter((p) => p.feeType === 'CHARGING' && p.vehicleMakeType === 'TSLA');
  const ntslaCharging = pricebooks.filter((p) => p.feeType === 'CHARGING' && p.vehicleMakeType === 'NTSLA');

  if (tslaCharging.length === 0) {
    return null;
  }

  // Tarification Tesla
  let teslaPeak = 0.36;
  let teslaOffPeak = 0.30;
  let peakHours = '09:00 - 20:00';

  const tslaTou = tslaCharging.filter((p) => p.isTou && typeof p.rateBase === 'number');
  if (tslaTou.length > 0) {
    // Le créneau avec le taux le plus élevé est le Peak
    const peakBook = tslaTou.reduce((prev, curr) => (curr.rateBase > prev.rateBase ? curr : prev), tslaTou[0]);
    teslaPeak = peakBook.rateBase;
    if (peakBook.startTime && peakBook.endTime) {
      peakHours = `${peakBook.startTime} - ${peakBook.endTime}`;
    }

    // Le créneau le plus bas est le OffPeak (nuit/super-creux)
    const offPeakBook = tslaTou.reduce((prev, curr) => (curr.rateBase < prev.rateBase ? curr : prev), tslaTou[0]);
    teslaOffPeak = offPeakBook.rateBase;
  } else if (tslaCharging[0]?.rateBase) {
    teslaPeak = tslaCharging[0].rateBase;
    teslaOffPeak = tslaCharging[0].rateBase;
  }

  // Tarification Non-Tesla (NTSLA)
  let nonTeslaPeak = Number((teslaPeak * 1.35).toFixed(2));
  let nonTeslaOffPeak = Number((teslaOffPeak * 1.35).toFixed(2));

  const ntslaTou = ntslaCharging.filter((p) => p.isTou && typeof p.rateBase === 'number');
  if (ntslaTou.length > 0) {
    const peakNtsla = ntslaTou.reduce((prev, curr) => (curr.rateBase > prev.rateBase ? curr : prev), ntslaTou[0]);
    nonTeslaPeak = peakNtsla.rateBase;
    const offPeakNtsla = ntslaTou.reduce((prev, curr) => (curr.rateBase < prev.rateBase ? curr : prev), ntslaTou[0]);
    nonTeslaOffPeak = offPeakNtsla.rateBase;
  } else if (ntslaCharging[0]?.rateBase) {
    nonTeslaPeak = ntslaCharging[0].rateBase;
    nonTeslaOffPeak = ntslaCharging[0].rateBase;
  }

  // Frais de congestion / inoccupation
  const congestion = pricebooks.find((p) => p.feeType === 'CONGESTION');
  const idleFeeStandard = congestion?.rateBase || 0.50;
  const idleFeeCongested = idleFeeStandard * 2;

  const pricing: SuperchargerPricing = {
    teslaPeak,
    teslaOffPeak,
    nonTeslaPeak,
    nonTeslaOffPeak,
    peakHours,
    idleFeeStandard,
    idleFeeCongested,
    lastUpdated: new Date().toISOString(),
  };

  return {
    pricing,
    stallCount: teslaData.publicStallCount,
    powerKw: teslaData.maxPowerKw,
    otherEVs: teslaData.openToNonTeslas,
  };
}

async function runUpdate() {
  const startTime = Date.now();
  console.log('\n================================================================');
  console.log('⚡ ACTUALISATION EN DIRECT DES SUPERCHARGEURS TESLA FRANCE ⚡');
  console.log('================================================================\n');

  const now = new Date();
  const todayIso = now.toISOString().split('T')[0];

  if (!fs.existsSync(DB_FILE)) {
    console.error(`[ERREUR FATALE] Fichier de base de données introuvable: ${DB_FILE}`);
    process.exit(1);
  }

  const rawDb = fs.readFileSync(DB_FILE, 'utf-8');
  const db: DatabaseSchema = JSON.parse(rawDb);

  // 1. Actualisation de la liste des stations depuis supercharge.info
  const liveSites = await fetchLiveFrenchSites();

  let newStationsCount = 0;
  let statusChangedCount = 0;

  if (liveSites.length > 0) {
    for (const site of liveSites) {
      const siteId = String(site.id);
      const existing = db.superchargers.find((s) => s.id === siteId);

      const status = (site.status === 'OPEN' || site.status === 'CONSTRUCTION' || site.status === 'PLAN')
        ? site.status
        : 'OPEN';

      const stallCount = site.stallCount || (site.stalls ? (site.stalls.v4 || site.stalls.v3 || site.stalls.v2 || 8) : 8);
      const powerKw = site.powerKilowatt || 250;
      const otherEVs = Boolean(site.otherEVs);
      const locationId = site.locationId ? String(site.locationId) : undefined;

      if (existing) {
        if (locationId && !existing.locationId) {
          existing.locationId = locationId;
        }
        if (existing.status !== status) {
          console.log(`[STATUS] 🔄 ${existing.name} : ${existing.status} ➔ ${status}`);
          existing.status = status;
          statusChangedCount++;
        }
        if (existing.stallCount !== stallCount) existing.stallCount = stallCount;
        if (existing.powerKw !== powerKw) existing.powerKw = powerKw;
        if (existing.otherEVs !== otherEVs) existing.otherEVs = otherEVs;
      } else {
        // Nouvelle station
        const cityName = site.address?.city || site.name?.split(',')[0]?.trim() || 'France';
        const slug = formatSlug(site.locationId || site.id, site.name, cityName);
        const postalCode = site.address?.zip || '';
        const department = postalCode ? `Dép. ${postalCode.slice(0, 2)}` : 'France';

        const isMajorHighway = (site.facilityName || site.name || '').match(/aire|autoroute|a\d+/i);
        const highwayPremium = isMajorHighway ? 0.02 : 0;
        const teslaOffPeak = Number((0.30 + highwayPremium).toFixed(2));
        const teslaPeak = Number((teslaOffPeak + 0.06).toFixed(2));

        const initialPricing: SuperchargerPricing = {
          teslaPeak,
          teslaOffPeak,
          nonTeslaPeak: Number((teslaPeak * 1.35).toFixed(2)),
          nonTeslaOffPeak: Number((teslaOffPeak * 1.3).toFixed(2)),
          peakHours: '09:00 - 20:00',
          idleFeeStandard: 0.50,
          idleFeeCongested: 1.00,
          lastUpdated: now.toISOString(),
        };

        const initialSnapshot: PriceSnapshot = {
          id: `${siteId}-${todayIso}`,
          superchargerId: siteId,
          superchargerName: site.name,
          locationSlug: slug,
          date: todayIso,
          teslaPeak: initialPricing.teslaPeak,
          teslaOffPeak: initialPricing.teslaOffPeak,
          nonTeslaPeak: initialPricing.nonTeslaPeak,
          nonTeslaOffPeak: initialPricing.nonTeslaOffPeak,
          peakHours: initialPricing.peakHours,
          source: 'Nouveau référencement',
          notes: 'Nouvelle station répertoriée',
          changePercentage: 0,
        };

        const newCharger: Supercharger = {
          id: siteId,
          locationId,
          locationSlug: slug,
          name: site.name,
          city: cityName,
          department,
          region: site.address?.state || 'France',
          street: site.address?.street || '',
          postalCode,
          latitude: site.gps?.latitude || 46.6,
          longitude: site.gps?.longitude || 2.2,
          status,
          stallCount,
          powerKw,
          stallsBreakdown: {
            v2: site.stalls?.v2 || 0,
            v3: site.stalls?.v3 || 0,
            v4: site.stalls?.v4 || 0,
          },
          otherEVs,
          currentPricing: initialPricing,
          priceHistory: [initialSnapshot],
        };

        db.superchargers.push(newCharger);
        db.priceSnapshots.push(initialSnapshot);
        newStationsCount++;
        console.log(`[NOUVEAU] 🆕 Station ajoutée: ${newCharger.name} (${cityName})`);
      }
    }
  }

  // 2. Interrogation directe de l'API Tesla FindUs pour les tarifs en temps réel
  console.log('\n----------------------------------------------------------------');
  console.log('📡 INTERROGATION DIRECTE DE L\'API TESLA (FINDUS PRICING)');
  console.log('----------------------------------------------------------------\n');
  console.log(`[CONNEXION DIRECTE] 🚀 Requêtes directes vers l'API Tesla avec temporisation de ${REQUEST_INTERVAL_MS / 1000}s entre chaque station.`);

  // Chargement et purge journalière des stations marquées OUT
  const outState = loadOutStations(todayIso);
  const initialOutCount = Object.keys(outState.stations).length;
  if (initialOutCount > 0) {
    console.log(`[STATIONS OUT] ℹ️ ${initialOutCount} station(s) précédemment marquées 'OUT' pour aujourd'hui (${todayIso}) seront ignorées.`);
  }

  let teslaApiSuccess = 0;
  let teslaApiFallback = 0;
  let pricesUpdatedCount = 0;
  let stationsMarkedOutToday = 0;

  const totalStations = db.superchargers.length;

  let abortReason: string | null = null;

  try {
    for (let i = 0; i < totalStations; i++) {
      const charger = db.superchargers[i];
      const progress = `[${String(i + 1).padStart(3, ' ')}/${totalStations}] (${Math.round(((i + 1) / totalStations) * 100)}%)`;
      const stationKey = charger.locationSlug || charger.id;

      // 1. Si la station est déjà marquée OUT aujourd'hui, ne plus la réutiliser jusqu'au lendemain
      if (outState.stations[stationKey]?.date === todayIso) {
        console.log(`${progress} ⏸️ [STATION OUT] ${charger.name} : Déjà marquée OUT pour aujourd'hui (${todayIso}) ➔ non réutilisée jusqu'à demain.`);
        teslaApiFallback++;
        continue;
      }

      // 2. Si la station n'a pas de locationId ou n'est pas encore ouverte
      if (!charger.locationId) {
        console.log(`${progress} ⏩ ${charger.name} : Pas de locationId Tesla ➔ Tarifs locaux conservés`);
        teslaApiFallback++;
        continue;
      }

      if (charger.status !== 'OPEN') {
        console.log(`${progress} 🚧 ${charger.name} : Station en ${charger.status} ➔ Tarifs non publiés`);
        teslaApiFallback++;
        continue;
      }

      // 3. Interrogation de l'API Tesla FindUs en direct (slug principal + slug textuel de secours)
      const { data: teslaData, isStationOut } = await fetchTeslaPricing(
        charger.locationId,
        charger.locationSlug,
        charger.name
      );
      const parsed = parseTeslaData(teslaData);

      if (parsed) {
        teslaApiSuccess++;
        const { pricing } = parsed;

        // Détecter un changement de prix
        const current = charger.currentPricing;
        const priceChanged =
          current.teslaPeak !== pricing.teslaPeak ||
          current.teslaOffPeak !== pricing.teslaOffPeak ||
          current.nonTeslaPeak !== pricing.nonTeslaPeak ||
          current.nonTeslaOffPeak !== pricing.nonTeslaOffPeak ||
          current.peakHours !== pricing.peakHours;

        if (priceChanged) {
          pricesUpdatedCount++;
          const oldAvg = (current.teslaPeak + current.teslaOffPeak) / 2;
          const newAvg = (pricing.teslaPeak + pricing.teslaOffPeak) / 2;
          const changePercentage = Number((((newAvg - oldAvg) / oldAvg) * 100).toFixed(1));

          const snapshot: PriceSnapshot = {
            id: `${charger.id}-${todayIso}`,
            superchargerId: charger.id,
            superchargerName: charger.name,
            locationSlug: charger.locationSlug,
            date: todayIso,
            teslaPeak: pricing.teslaPeak,
            teslaOffPeak: pricing.teslaOffPeak,
            nonTeslaPeak: pricing.nonTeslaPeak,
            nonTeslaOffPeak: pricing.nonTeslaOffPeak,
            peakHours: pricing.peakHours,
            source: 'Tesla API FindUs (Officiel)',
            notes: 'Relevé automatique temps réel officiel Tesla',
            changePercentage,
          };

          if (!charger.priceHistory) charger.priceHistory = [];
          charger.priceHistory.push(snapshot);
          db.priceSnapshots.push(snapshot);

          charger.currentPricing = pricing;
          if (parsed.stallCount) charger.stallCount = parsed.stallCount;
          if (parsed.powerKw) charger.powerKw = parsed.powerKw;
          if (typeof parsed.otherEVs === 'boolean') charger.otherEVs = parsed.otherEVs;

          console.log(
            `${progress} 🎯 [MISE À JOUR] ${charger.name} : ` +
            `TSLA ${pricing.teslaPeak}€/${pricing.teslaOffPeak}€ | ` +
            `NTSLA ${pricing.nonTeslaPeak}€/${pricing.nonTeslaOffPeak}€ (${changePercentage > 0 ? '+' : ''}${changePercentage}%)`
          );
        } else {
          // Prix inchangé et confirmé par l'API Tesla
          console.log(
            `${progress} ✅ [CONFIRMÉ] ${charger.name} : ` +
            `TSLA ${current.teslaPeak}€/${current.teslaOffPeak}€ (HP ${current.peakHours})`
          );
        }
      } else {
        teslaApiFallback++;

        if (isStationOut) {
          // Station réellement hors service ou 404 permanent
          outState.stations[stationKey] = {
            name: charger.name,
            date: todayIso,
            reason: 'Station inexistante ou fermée sur Tesla FindUs (404)',
          };
          saveOutStations(outState);
          stationsMarkedOutToday++;

          console.log(
            `${progress} ⛔ [CONFIRMÉ OUT] ${charger.name} (${charger.locationId}) : ` +
            `Station fermée / 404 ➔ non réutilisée jusqu'au lendemain (${todayIso}).`
          );
        } else {
          // Accès refusé (403), rate limit (429) ou timeout : conservation des tarifs locaux
          console.log(
            `${progress} 🛡️ [CONSERVÉ] ${charger.name} (${charger.locationId}) : ` +
            `Accès API Tesla restreint ➔ Maintien des tarifs en base (${charger.currentPricing.teslaPeak}€ / ${charger.currentPricing.teslaOffPeak}€)`
          );
        }
      }

      // Temporisation de 5 secondes entre les requêtes pour respecter l'API Tesla sur IP résidentielle
      await sleep(REQUEST_INTERVAL_MS);
    }
  } catch (err: any) {
    if (err.message === 'RATE_LIMIT_DOUBLE_429') {
      abortReason = 'Double erreur HTTP 429 consécutive (Rate Limit Tesla)';
      console.error('\n🛑 ================================================================');
      console.error('🛑 [ARRÊT D\'URGENCE] DOUBLE ERREUR 429 DÉTECTÉE !');
      console.error('🛑 Deux requêtes consécutives ont été bloquées par Tesla en Rate Limit.');
      console.error('🛑 Arrêt immédiat pour protéger votre adresse IP résidentielle.');
      console.error('🛑 ================================================================\n');
    } else {
      throw err;
    }
  }

  // 3. Sauvegarder la base de données UNIQUEMENT s'il y a des changements réels
  const hasChanges = (newStationsCount > 0 || statusChangedCount > 0 || pricesUpdatedCount > 0);

  if (hasChanges) {
    db.lastSyncTime = now.toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    console.log(`\n💾 Modifications enregistrées dans la base (${pricesUpdatedCount} tarifs actualisés, ${newStationsCount} stations créées, ${statusChangedCount} statuts modifiés).`);
  } else {
    console.log('\nℹ️ Aucun changement de tarif ou de station détecté : base de données inchangée (aucun commit requis).');
  }

  const durationSec = Math.round((Date.now() - startTime) / 1000);

  console.log('\n================================================================');
  console.log('🏁 BILAN DE L\'ACTUALISATION NOCTURNE');
  console.log('================================================================');
  console.log(`• Total des stations en base       : ${db.superchargers.length}`);
  console.log(`• Nouvelles stations créées        : ${newStationsCount}`);
  console.log(`• Changements de statut            : ${statusChangedCount}`);
  console.log(`• Réponses API Tesla reçues        : ${teslaApiSuccess}`);
  console.log(`• Stations en maintien local       : ${teslaApiFallback}`);
  console.log(`• Nouvelles stations marquées OUT  : ${stationsMarkedOutToday}`);
  console.log(`• Total stations OUT aujourd'hui   : ${Object.keys(outState.stations).length}`);
  console.log(`• Tarifs réels mis à jour          : ${pricesUpdatedCount}`);
  console.log(`• Mode réseau                      : Connexion directe (${REQUEST_INTERVAL_MS / 1000}s/station)`);
  console.log(`• Statut final                     : ${abortReason ? `🛑 INTERROMPU (${abortReason})` : '✅ Terminé avec succès'}`);
  console.log(`• Horodatage de synchronisation    : ${db.lastSyncTime}`);
  console.log(`• Durée totale du traitement       : ${durationSec} secondes`);
  console.log('================================================================\n');

  if (abortReason) {
    process.exit(1);
  }
}

// Exécution directe du script
runUpdate().catch((err) => {
  console.error('[ERREUR CRITIQUE DANS L\'ACTUALISATION]', err);
  process.exit(1);
});

