import type { Supercharger } from './types';

// La collecte tourne tous les 7 jours par défaut (extension) : un relevé reste « récent » une semaine,
// devient « ancien » après deux collectes manquées.
export const FRESH_DAYS = 7;
export const STALE_DAYS = 14;
// Alerte de collecte : aucun import reçu depuis ce nombre de jours
export const COLLECTION_ALERT_DAYS = 10;

export type FreshnessLevel = 'fresh' | 'aging' | 'stale' | 'unknown';

// Date du dernier relevé connu : passage du collecteur, à défaut dernier changement de tarif
export function lastCheckedDate(charger: Supercharger): string | null {
  return charger.lastCheckedAt || charger.currentPricing.lastUpdated || null;
}

export function daysSince(iso: string, now = Date.now()): number {
  const day = iso.slice(0, 10);
  const today = new Date(now).toISOString().slice(0, 10);
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(day)) / 86400000));
}

export function freshnessLevel(days: number | null): FreshnessLevel {
  if (days === null) return 'unknown';
  if (days <= FRESH_DAYS) return 'fresh';
  if (days <= STALE_DAYS) return 'aging';
  return 'stale';
}

export function relativeDays(days: number): string {
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  return `il y a ${days} j`;
}

export function stationFreshness(charger: Supercharger): { days: number | null; level: FreshnessLevel; label: string } {
  const date = lastCheckedDate(charger);
  const days = date ? daysSince(date) : null;
  return {
    days,
    level: freshnessLevel(days),
    label: days === null ? 'Jamais relevé' : `Relevé ${relativeDays(days)}`,
  };
}

// Classes Tailwind et couleurs (popups Leaflet) par niveau de fraîcheur
export const FRESHNESS_CLASSES: Record<FreshnessLevel, string> = {
  fresh: 'bg-emerald-950/60 text-emerald-300 border-emerald-900/60',
  aging: 'bg-amber-950/60 text-amber-300 border-amber-900/60',
  stale: 'bg-red-950/60 text-red-300 border-red-900/60',
  unknown: 'bg-slate-800 text-slate-400 border-slate-700',
};

export const FRESHNESS_COLORS: Record<FreshnessLevel, string> = {
  fresh: '#16a34a',
  aging: '#d97706',
  stale: '#dc2626',
  unknown: '#64748b',
};
