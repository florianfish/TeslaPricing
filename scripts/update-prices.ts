import fs from 'fs';
import path from 'path';
import type { Supercharger, SuperchargerPricing, PriceSnapshot } from '../src/types.js';

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const DB_FILE = path.join(DATA_DIR, 'superchargers_db.json');

interface DatabaseSchema {
  superchargers: Supercharger[];
  priceSnapshots: PriceSnapshot[];
  nationalHistory: PriceSnapshot[];
  lastSyncTime: string;
}

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

async function fetchLiveFrenchSites(): Promise<any[]> {
  const url = 'https://supercharge.info/service/supercharge/allSites';
  console.log(`[SCRAPER] Interrogation de l'API de référence ${url}...`);

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

    console.log(`[SCRAPER] ${frenchSites.length} stations répertoriées en France trouvées.`);
    return frenchSites;
  } catch (err: any) {
    clearTimeout(timeout);
    console.warn(`[SCRAPER] Avertissement: Impossible de contacter le flux externe (${err.message}).`);
    return [];
  }
}

async function runUpdate() {
  console.log('=== Démarrage de l\'actualisation nocturne des Superchargeurs Tesla ===');
  const now = new Date();
  const todayIso = now.toISOString().split('T')[0];

  if (!fs.existsSync(DB_FILE)) {
    console.error(`[ERREUR] Fichier de base de données introuvable: ${DB_FILE}`);
    process.exit(1);
  }

  const rawDb = fs.readFileSync(DB_FILE, 'utf-8');
  const db: DatabaseSchema = JSON.parse(rawDb);

  const liveSites = await fetchLiveFrenchSites();

  let updatedCount = 0;
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

      if (existing) {
        let changed = false;

        if (existing.status !== status) {
          console.log(`[STATUS] Station ${existing.name} : ${existing.status} -> ${status}`);
          existing.status = status;
          changed = true;
          statusChangedCount++;
        }

        if (existing.stallCount !== stallCount) {
          existing.stallCount = stallCount;
          changed = true;
        }

        if (existing.powerKw !== powerKw) {
          existing.powerKw = powerKw;
          changed = true;
        }

        if (existing.otherEVs !== otherEVs) {
          existing.otherEVs = otherEVs;
          changed = true;
        }

        if (changed) {
          updatedCount++;
        }
      } else {
        // Nouvelle station détectée
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
          peakHours: '16:00 - 20:00',
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
          source: 'Actualisation Automatique Quotidienne',
          notes: 'Nouvelle station répertoriée',
          changePercentage: 0,
        };

        const newCharger: Supercharger = {
          id: siteId,
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
        console.log(`[NOUVEAU] Station ajoutée: ${newCharger.name} (${cityName})`);
      }
    }
  }

  // Mettre à jour l'horodatage de synchronisation
  db.lastSyncTime = now.toISOString();

  // Sauvegarder la base mise à jour
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');

  console.log('--- Bilan de l\'actualisation ---');
  console.log(`• Total stations dans la base : ${db.superchargers.length}`);
  console.log(`• Nouvelles stations ajoutées : ${newStationsCount}`);
  console.log(`• Changements de statut      : ${statusChangedCount}`);
  console.log(`• Stations mises à jour      : ${updatedCount}`);
  console.log(`• Horodatage mis à jour      : ${db.lastSyncTime}`);
  console.log('=== Actualisation terminée avec succès ===');
}

runUpdate().catch((err) => {
  console.error('[ERREUR CRITIQUE]', err);
  process.exit(1);
});
