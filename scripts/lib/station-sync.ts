import type { Supercharger, SuperchargerPricing, PriceSnapshot, StationEvent } from '../../src/types.js';
import type { DatabaseSchema } from './tesla-pricing.js';

const REGISTRY_URL = 'https://supercharge.info/service/supercharge/allSites';
const MAX_EVENTS = 1000;

export interface StationSyncResult {
  created: number;
  statusChanged: number;
  updated: number;
  events: StationEvent[];
}

// Clean slug generator
function formatSlug(rawId: string | number, name: string, city: string): string {
  if (typeof rawId === 'string' && rawId.toLowerCase().includes('supercharger')) {
    return rawId.toLowerCase().trim();
  }
  const cleanName = (city || name || 'supercharger')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
  return `${cleanName}supercharger`;
}

// Registre des stations françaises (supercharge.info, non protégé par Akamai)
export async function fetchFrenchSites(timeoutMs = 15000): Promise<any[]> {
  const res = await fetch(REGISTRY_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TeslaPricingAutomatedScraper/1.0',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
  const allSites = (await res.json()) as any[];
  return allSites.filter((s) => s.address && (s.address.country === 'France' || s.address.countryId === 110));
}

// Appliquer le registre à la base : statuts, nouvelles stations, bornes. Les tarifs existants ne sont jamais modifiés.
export function applyRegistrySites(db: DatabaseSchema, sites: any[], now = new Date()): StationSyncResult {
  const todayIso = now.toISOString().split('T')[0];
  const result: StationSyncResult = { created: 0, statusChanged: 0, updated: 0, events: [] };

  for (const site of sites) {
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
      let changed = false;
      if (locationId && !existing.locationId) {
        existing.locationId = locationId;
        changed = true;
      }
      if (existing.status !== status) {
        result.events.push({
          date: todayIso,
          type: 'STATUS',
          superchargerId: siteId,
          superchargerName: existing.name,
          city: existing.city,
          region: existing.region,
          from: existing.status,
          to: status,
        });
        existing.status = status;
        result.statusChanged++;
      }
      if (existing.stallCount !== stallCount) { existing.stallCount = stallCount; changed = true; }
      if (existing.powerKw !== powerKw) { existing.powerKw = powerKw; changed = true; }
      if (existing.otherEVs !== otherEVs) { existing.otherEVs = otherEVs; changed = true; }
      if (changed) result.updated++;
      continue;
    }

    // Nouvelle station
    const cityName = site.address?.city || site.name?.split(',')[0]?.trim() || 'France';
    const slug = formatSlug(site.locationId || site.id, site.name, cityName);
    const postalCode = site.address?.zip || '';
    const department = postalCode ? `Dép. ${postalCode.slice(0, 2)}` : 'France';
    const region = site.address?.state || 'France';

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
      region,
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
    result.events.push({
      date: todayIso,
      type: 'NEW',
      superchargerId: siteId,
      superchargerName: site.name,
      city: cityName,
      region,
      to: status,
    });
    result.created++;
  }

  if (result.events.length > 0) {
    db.stationEvents = [...result.events, ...(db.stationEvents || [])].slice(0, MAX_EVENTS);
  }
  if (result.created || result.statusChanged || result.updated) {
    db.lastSyncTime = now.toISOString();
  }
  return result;
}
