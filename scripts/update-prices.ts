import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import type { Supercharger, SuperchargerPricing, PriceSnapshot } from '../src/types.js';

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const DB_FILE = path.join(DATA_DIR, 'superchargers_db.json');
const OUT_STATIONS_FILE = path.join(DATA_DIR, 'out_stations.json');

// --- CONFIGURATION DES PROXYS SEEDBOX ---
export interface ProxyConfig {
  country: string;
  host: string;
  port: number;
  note?: string;
}

export const SEEDBOX_PROXIES: ProxyConfig[] = [
  { country: 'France', host: 'proxy-fr.seedbox.fr', port: 3128, note: 'Ad Block inclus' },
  { country: 'Pays-Bas', host: 'proxy-nl.seedbox.fr', port: 3128 },
  { country: 'Lituanie', host: 'proxy-lt.seedbox.fr', port: 3128 },
  { country: 'Pologne', host: 'proxy-pl.seedbox.fr', port: 3128 },
  { country: 'Belgique', host: 'proxy-be.seedbox.fr', port: 3128 },
  { country: 'Allemagne', host: 'proxy-de.seedbox.fr', port: 3128 },
  { country: 'République Tchèque', host: 'proxy-cz.seedbox.fr', port: 3128 },
  { country: 'Espagne', host: 'proxy-es.seedbox.fr', port: 3128 },
  { country: 'Finlande', host: 'proxy-fi.seedbox.fr', port: 3128 },
  { country: 'Irlande', host: 'proxy-ie.seedbox.fr', port: 3128 },
  { country: 'Italie', host: 'proxy-it.seedbox.fr', port: 3128 },
  { country: 'Portugal', host: 'proxy-pt.seedbox.fr', port: 3128 },
  { country: 'Royaume-Uni', host: 'proxy-uk.seedbox.fr', port: 3128 },
];

const PROXY_USERNAME = process.env.PROXY_USERNAME || 'FlorianFish5';
const PROXY_PASSWORD = process.env.PROXY_PASSWORD || '';

// Pool dynamique de proxys opérationnels pour la session
let activeProxies: ProxyConfig[] = [...SEEDBOX_PROXIES];

// Cache des instances ProxyAgent pour réutiliser les connexions
const proxyAgentCache = new Map<string, ProxyAgent>();

function getProxyAgentForProxy(proxy: ProxyConfig): ProxyAgent {
  const key = `${PROXY_USERNAME}:${PROXY_PASSWORD}@${proxy.host}:${proxy.port}`;
  if (!proxyAgentCache.has(key)) {
    const auth = PROXY_PASSWORD
      ? `${encodeURIComponent(PROXY_USERNAME)}:${encodeURIComponent(PROXY_PASSWORD)}@`
      : '';
    const agent = new ProxyAgent({
      uri: `http://${auth}${proxy.host}:${proxy.port}`,
    });
    proxyAgentCache.set(key, agent);
  }
  return proxyAgentCache.get(key)!;
}

function getRandomActiveProxy(): ProxyConfig | null {
  if (activeProxies.length === 0) return null;
  const idx = Math.floor(Math.random() * activeProxies.length);
  return activeProxies[idx];
}

function disableProxyForSession(proxy: ProxyConfig, reason: string) {
  activeProxies = activeProxies.filter((p) => p.host !== proxy.host);
  console.warn(`       ⚠️ [PROXY EXCLU] ${proxy.country} (${proxy.host}:${proxy.port}) exclu pour cette session (${reason}) - Restants : ${activeProxies.length}`);
}

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

// 2. Interroger l'API officielle Tesla FindUs pour une station avec proxy aléatoire
export interface TeslaPricingResult {
  data: any | null;
  isStationOut: boolean;
  proxyUsed?: ProxyConfig;
}

async function fetchTeslaPricing(
  locationId: string,
  stationName: string,
  maxRetries = 2
): Promise<TeslaPricingResult> {
  const url = `https://www.tesla.com/api/findus/get-charger-details?locationSlug=${locationId}&programType=supercharger&locale=en-US&isInHkMoTw=false`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const useProxy = Boolean(PROXY_PASSWORD && activeProxies.length > 0);
    const proxy = useProxy ? getRandomActiveProxy() : null;
    const dispatcher = proxy ? getProxyAgentForProxy(proxy) : undefined;
    const proxyDesc = proxy ? `[Proxy: ${proxy.country} - ${proxy.host}:${proxy.port}]` : `[Connexion directe]`;

    // Log à chaque fois du proxy sélectionné
    console.log(`       🌐 ${proxyDesc} Interrogation de ${stationName} (essai ${attempt}/${maxRetries})...`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    try {
      const fetchFn = dispatcher ? undiciFetch : fetch;
      const res = await (fetchFn as any)(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': `https://www.tesla.com/findus/location/supercharger/${locationId}`,
          'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin',
        },
        signal: controller.signal,
        dispatcher,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const json = await res.json();
        const data = json?.data?.data || null;
        return { data, isStationOut: !data, proxyUsed: proxy || undefined };
      }

      // 404 : la station n'existe plus ou slug invalide sur FindUs
      if (res.status === 404) {
        console.warn(`       ⛔ [404 FindUs] ${stationName} (${locationId}) n'est plus répertoriée.`);
        return { data: null, isStationOut: true, proxyUsed: proxy || undefined };
      }

      // Si erreur proxy (authentification, passerelle)
      if (res.status === 407 || res.status === 502 || res.status === 503 || res.status === 504) {
        if (proxy) disableProxyForSession(proxy, `HTTP ${res.status}`);
      }

      // Si 403 ou 429, pause courte puis retry
      if ((res.status === 403 || res.status === 429) && attempt < maxRetries) {
        await sleep(1200);
        continue;
      }

      return { data: null, isStationOut: attempt === maxRetries, proxyUsed: proxy || undefined };
    } catch (err: any) {
      clearTimeout(timeout);
      const isAbort = err.name === 'AbortError' || err.message?.includes('aborted');
      const errReason = isAbort ? 'Timeout (7s)' : (err.message || 'Erreur réseau');

      if (proxy && (errReason.includes('ECONNREFUSED') || errReason.includes('ETIMEDOUT') || errReason.includes('ECONNRESET') || isAbort)) {
        disableProxyForSession(proxy, errReason);
      }

      if (attempt < maxRetries) {
        await sleep(1000);
        continue;
      }

      return { data: null, isStationOut: true, proxyUsed: proxy || undefined };
    }
  }

  return { data: null, isStationOut: true };
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

  if (PROXY_PASSWORD) {
    console.log(`[PROXY] 🛡️ Pool actif : ${activeProxies.length}/${SEEDBOX_PROXIES.length} proxys Seedbox (${PROXY_USERNAME}) avec rotation aléatoire.`);
  } else {
    console.warn(`[PROXY] ⚠️ Variable PROXY_PASSWORD absente : interrogation directe sans proxy.`);
  }

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

    // 3. Interrogation de l'API Tesla FindUs avec proxy aléatoire
    const { data: teslaData, isStationOut, proxyUsed } = await fetchTeslaPricing(charger.locationId, charger.name);
    const parsed = parseTeslaData(teslaData);
    const proxyTag = proxyUsed ? `[${proxyUsed.country} - ${proxyUsed.host}]` : `[Direct]`;

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
          `${progress} 🎯 [MISE À JOUR] ${proxyTag} ${charger.name} : ` +
          `TSLA ${pricing.teslaPeak}€/${pricing.teslaOffPeak}€ | ` +
          `NTSLA ${pricing.nonTeslaPeak}€/${pricing.nonTeslaOffPeak}€ (${changePercentage > 0 ? '+' : ''}${changePercentage}%)`
        );
      } else {
        // Prix inchangé et confirmé par l'API Tesla
        console.log(
          `${progress} ✅ [CONFIRMÉ] ${proxyTag} ${charger.name} : ` +
          `TSLA ${current.teslaPeak}€/${current.teslaOffPeak}€ (HP ${current.peakHours})`
        );
      }
    } else {
      teslaApiFallback++;

      if (isStationOut) {
        // Station indisponible ou 404 : enregistrer comme OUT jusqu'au lendemain
        outState.stations[stationKey] = {
          name: charger.name,
          date: todayIso,
          reason: 'Données introuvables ou accès API FindUs restreint',
        };
        saveOutStations(outState);
        stationsMarkedOutToday++;

        console.log(
          `${progress} ⛔ [MARQUÉE OUT] ${proxyTag} ${charger.name} (${charger.locationId}) : ` +
          `Indisponible ➔ non réutilisée jusqu'au lendemain (${todayIso}).`
        );
      } else {
        console.log(
          `${progress} 🛡️ [CONSERVÉ] ${proxyTag} ${charger.name} (${charger.locationId}) : ` +
          `Accès API Tesla restreint ➔ Maintien des tarifs en base (${charger.currentPricing.teslaPeak}€ / ${charger.currentPricing.teslaOffPeak}€)`
        );
      }
    }

    // Temporisation de 250ms entre les requêtes pour un flux fluide
    await sleep(250);
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
  console.log(`• Proxys Seedbox actifs restants   : ${activeProxies.length}/${SEEDBOX_PROXIES.length}`);
  console.log(`• Horodatage de synchronisation    : ${db.lastSyncTime}`);
  console.log(`• Durée totale du traitement       : ${durationSec} secondes`);
  console.log('================================================================\n');
}

const isMainScript = process.argv[1] && (
  process.argv[1].endsWith('update-prices.ts') ||
  process.argv[1].endsWith('update-prices.js') ||
  process.argv[1].includes('update-prices')
);

if (isMainScript) {
  runUpdate().catch((err) => {
    console.error('[ERREUR CRITIQUE DANS L\'ACTUALISATION]', err);
    process.exit(1);
  });
}
