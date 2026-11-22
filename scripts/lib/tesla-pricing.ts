import type { Supercharger, SuperchargerPricing, PriceSnapshot, StationEvent, ImportLogEntry } from '../../src/types.js';
import { normalizePricebooks, pricebooksChanged, type PricebookSlot } from '../../src/pricebooks.js';

export interface DatabaseSchema {
  superchargers: Supercharger[];
  priceSnapshots: PriceSnapshot[];
  nationalHistory: PriceSnapshot[];
  stationEvents?: StationEvent[];
  importLog?: ImportLogEntry[];
  lastSyncTime: string;
}

const IMPORT_LOG_SIZE = 50;

// Historiser un import du collecteur (le plus récent en tête)
export function logImport(db: DatabaseSchema, entry: ImportLogEntry) {
  db.importLog = [entry, ...(db.importLog || [])].slice(0, IMPORT_LOG_SIZE);
}

// Extraire et normaliser les tarifs depuis le schéma Tesla (effectivePricebooks)
export function parseTeslaData(teslaData: any): {
  pricing: SuperchargerPricing;
  pricebooks: PricebookSlot[];
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
    pricebooks: normalizePricebooks(pricebooks),
    stallCount: teslaData.publicStallCount,
    powerKw: teslaData.maxPowerKw,
    otherEVs: teslaData.openToNonTeslas,
  };
}

// La grille complète a-t-elle changé ? Une première grille (aucune connue avant) n'est pas un changement.
export function gridChanged(before: PricebookSlot[] | undefined, after: PricebookSlot[] | undefined): boolean {
  return !!before?.length && !!after?.length && pricebooksChanged(before, after);
}

// Un nouveau relevé modifie-t-il le tarif affiché ? (règle commune à l'import et au relevé Bright Data)
export function pricingChanged(
  current: Pick<SuperchargerPricing, 'teslaPeak' | 'teslaOffPeak' | 'nonTeslaPeak' | 'nonTeslaOffPeak' | 'peakHours'>,
  next: Pick<SuperchargerPricing, 'teslaPeak' | 'teslaOffPeak' | 'nonTeslaPeak' | 'nonTeslaOffPeak' | 'peakHours'>
): boolean {
  return (
    current.teslaPeak !== next.teslaPeak ||
    current.teslaOffPeak !== next.teslaOffPeak ||
    current.nonTeslaPeak !== next.nonTeslaPeak ||
    current.nonTeslaOffPeak !== next.nonTeslaOffPeak ||
    current.peakHours !== next.peakHours
  );
}

// Appliquer une réponse Tesla FindUs à une station : met à jour les tarifs et
// ajoute un relevé historique si le prix a changé.
export function applyTeslaData(
  db: DatabaseSchema,
  charger: Supercharger,
  teslaData: any,
  todayIso: string
): { outcome: 'updated' | 'confirmed' | 'invalid'; changePercentage?: number } {
  const parsed = parseTeslaData(teslaData);
  if (!parsed) return { outcome: 'invalid' };
  charger.lastCheckedAt = todayIso;

  const { pricing, pricebooks } = parsed;
  const current = charger.currentPricing;
  // Un changement de la grille complète compte aussi (ex. le palier intermédiaire de 20 h à minuit)
  const changed = pricingChanged(current, pricing) || gridChanged(charger.pricebooks, pricebooks);
  if (!changed) {
    if (pricebooks.length) charger.pricebooks = pricebooks; // première grille connue, ou identique
    return { outcome: 'confirmed' };
  }

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
    notes: 'Relevé collecté depuis le navigateur (collecteur Tesla)',
    changePercentage,
    ...(pricebooks.length ? { pricebooks } : {}),
  };

  if (!charger.priceHistory) charger.priceHistory = [];
  charger.priceHistory.push(snapshot);
  db.priceSnapshots.push(snapshot);

  charger.currentPricing = pricing;
  if (pricebooks.length) charger.pricebooks = pricebooks;
  if (parsed.stallCount) charger.stallCount = parsed.stallCount;
  if (parsed.powerKw) charger.powerKw = parsed.powerKw;
  if (typeof parsed.otherEVs === 'boolean') charger.otherEVs = parsed.otherEVs;

  return { outcome: 'updated', changePercentage };
}

// Purger l'historique des prix : un seul relevé par station, reconstruit depuis son tarif actuel.
// La courbe nationale (nationalHistory) n'est pas touchée.
export function purgePriceHistory(db: DatabaseSchema): { stations: number; removed: number } {
  const before = db.priceSnapshots.length;
  const snapshots: PriceSnapshot[] = [];

  for (const charger of db.superchargers) {
    const latest = [...(charger.priceHistory || [])].sort((a, b) => a.date.localeCompare(b.date)).pop();
    const p = charger.currentPricing;
    const date = (p.lastUpdated || latest?.date || new Date().toISOString()).slice(0, 10);
    const snapshot: PriceSnapshot = {
      id: `${charger.id}-${date}`,
      superchargerId: charger.id,
      superchargerName: charger.name,
      locationSlug: charger.locationSlug,
      date,
      teslaPeak: p.teslaPeak,
      teslaOffPeak: p.teslaOffPeak,
      nonTeslaPeak: p.nonTeslaPeak,
      nonTeslaOffPeak: p.nonTeslaOffPeak,
      peakHours: p.peakHours,
      source: latest?.source || 'Tarif actuel',
      notes: 'Historique purgé : tarif conservé',
      changePercentage: 0,
    };
    charger.priceHistory = [snapshot];
    snapshots.push(snapshot);
  }

  db.priceSnapshots = snapshots;
  db.lastSyncTime = new Date().toISOString();
  return { stations: snapshots.length, removed: before - snapshots.length };
}
