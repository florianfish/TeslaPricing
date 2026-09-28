import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import type { Supercharger, SuperchargerPricing, PriceSnapshot } from '../src/types.js';
import type { DatabaseSchema } from './lib/tesla-pricing.js';

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const DB_FILE = path.join(DATA_DIR, 'superchargers_db.json');

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

async function runUpdate() {
  const startTime = Date.now();
  console.log('\n================================================================');
  console.log('⚡ ACTUALISATION DE LA LISTE DES SUPERCHARGEURS TESLA FRANCE ⚡');
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

  // 2. Sauvegarder la base de données UNIQUEMENT s'il y a des changements réels
  // (les tarifs sont collectés séparément depuis le navigateur : voir scripts/collector.js)
  const hasChanges = newStationsCount > 0 || statusChangedCount > 0;

  if (hasChanges) {
    db.lastSyncTime = now.toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    console.log(`\n💾 Modifications enregistrées dans la base (${newStationsCount} stations créées, ${statusChangedCount} statuts modifiés).`);
  } else {
    console.log('\nℹ️ Aucun changement de station détecté : base de données inchangée (aucun commit requis).');
  }

  const durationSec = Math.round((Date.now() - startTime) / 1000);

  console.log('\n================================================================');
  console.log('🏁 BILAN DE L\'ACTUALISATION NOCTURNE');
  console.log('================================================================');
  console.log(`• Total des stations en base       : ${db.superchargers.length}`);
  console.log(`• Nouvelles stations créées        : ${newStationsCount}`);
  console.log(`• Changements de statut            : ${statusChangedCount}`);
  console.log(`• Horodatage de synchronisation    : ${db.lastSyncTime}`);
  console.log(`• Durée totale du traitement       : ${durationSec} secondes`);
  console.log('================================================================\n');
}

// Exécution directe du script
runUpdate().catch((err) => {
  console.error('[ERREUR CRITIQUE DANS L\'ACTUALISATION]', err);
  process.exit(1);
});
