// Contrôle des factures Superchargeur : sessions TeslaMate (coût réel facturé par Tesla) comparées au
// tarif relevé pour la station à cette date. Logique pure ; récupération et accès dans server/my-charges.ts.

import type { Supercharger, PriceSnapshot } from '../../src/types.js';

// Session de recharge telle que renvoyée par TeslaMate API (GET /api/v1/cars/:id/charges)
export interface TeslaMateCharge {
  charge_id: number;
  start_date: string;
  end_date: string;
  address?: string | null;
  charge_energy_added?: number | null;
  charge_energy_used?: number | null;
  cost?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

export type TariffPeriod = 'peak' | 'offPeak';

export interface ChargeAnalysis {
  chargeIds: number[];          // plusieurs sessions regroupées (voir groupSessions)
  start: string;
  end: string;
  stationId: string;
  stationName: string;
  address: string;
  energyAdded: number;          // kWh entrés dans la batterie
  energyUsed: number;           // kWh fournis par la borne (base de la facture)
  cost: number;                 // € facturés
  realRate: number;             // €/kWh réel = coût / énergie fournie
  period: TariffPeriod | null;  // créneau au début de la session (heure de Paris)
  expectedRate: number | null;  // tarif Tesla relevé pour ce créneau, à cette date
  priceDate: string | null;     // date du relevé de prix utilisé
  expectedCost: number | null;
  diff: number | null;          // coût réel − coût attendu (positif = payé plus que le tarif relevé)
  offPeakCost: number | null;   // même énergie au tarif heures creuses
}

export interface ChargesReport {
  sessions: ChargeAnalysis[];   // les plus récentes d'abord
  totals: {
    sessions: number;
    compared: number;           // sessions avec un relevé de prix à comparer
    cost: number;
    expectedCost: number;       // sur les sessions comparées
    diff: number;
    possibleSaving: number;     // si chaque session comparée avait été faite en heures creuses
    energy: number;
  };
  unmatched: number;            // sessions payantes « Supercharger » sans station reconnue
}

export const MATCH_MAX_DISTANCE_M = 300;
const MERGE_GAP_MS = 30 * 60_000;
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

const simplify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// Station de la session : la plus proche à moins de 300 m ; sans position, par le nom de ville dans
// l'adresse TeslaMate (« Supercharger Ruffec, Ruffec »), si une seule station correspond.
export function matchStation(charge: TeslaMateCharge, stations: Supercharger[]): Supercharger | null {
  if (typeof charge.latitude === 'number' && typeof charge.longitude === 'number') {
    let best: { s: Supercharger; d: number } | null = null;
    for (const s of stations) {
      const d = distanceM(charge.latitude, charge.longitude, s.latitude, s.longitude);
      if (d <= MATCH_MAX_DISTANCE_M && (!best || d < best.d)) best = { s, d };
    }
    return best?.s ?? null;
  }
  const address = simplify(charge.address || '');
  if (!address.includes('supercharger')) return null;
  const candidates = stations.filter((s) => s.city && simplify(s.city).length > 2 && address.includes(simplify(s.city)));
  return candidates.length === 1 ? candidates[0] : null;
}

// Heure de Paris en minutes depuis minuit
function parisMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return get('hour') * 60 + get('minute');
}

// Créneau HP / HC d'après la plage d'heures pleines (« 09:00 - 20:00 »), heure de Paris
export function periodAt(peakHours: string, date: Date): TariffPeriod | null {
  const m = peakHours.match(/^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/);
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  if (start === end) return null;
  const t = parisMinutes(date);
  return (start < end ? t >= start && t < end : t >= start || t < end) ? 'peak' : 'offPeak';
}

// Relevé de prix en vigueur à cette date : le dernier relevé de la station à cette date ou avant
export function priceInEffect(station: Supercharger, date: Date): PriceSnapshot | null {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(date); // AAAA-MM-JJ, jour à Paris
  const history = [...(station.priceHistory || [])].sort((a, b) => a.date.localeCompare(b.date));
  let found: PriceSnapshot | null = null;
  for (const snap of history) {
    if (snap.date <= day) found = snap;
    else break;
  }
  return found;
}

type Matched = { charge: TeslaMateCharge; station: Supercharger };

// Sessions consécutives à la même station (moins de 30 min d'écart) au coût identique : TeslaMate
// reporte alors la même facture sur chacune (Ruffec, 8 août : 2 sessions à 3,04 €). Regroupées, coût compté une fois.
export function groupSessions(matched: Matched[]): Matched[][] {
  const sorted = [...matched].sort((a, b) => Date.parse(a.charge.start_date) - Date.parse(b.charge.start_date));
  const groups: Matched[][] = [];
  for (const m of sorted) {
    const group = groups[groups.length - 1];
    const prev = group?.[group.length - 1];
    if (
      prev &&
      prev.station.id === m.station.id &&
      prev.charge.cost === m.charge.cost &&
      Date.parse(m.charge.start_date) - Date.parse(prev.charge.end_date) < MERGE_GAP_MS
    ) {
      group.push(m);
    } else groups.push([m]);
  }
  return groups;
}

export function analyzeCharges(charges: TeslaMateCharge[], stations: Supercharger[]): ChargesReport {
  const paid = charges.filter((c) => typeof c.cost === 'number' && c.cost > 0);
  const matched: Matched[] = [];
  let unmatched = 0;
  for (const charge of paid) {
    const station = matchStation(charge, stations);
    if (station) matched.push({ charge, station });
    else if (/supercharger/i.test(charge.address || '')) unmatched++;
  }

  const sessions: ChargeAnalysis[] = groupSessions(matched).map((group) => {
    const first = group[0];
    const last = group[group.length - 1];
    const start = new Date(first.charge.start_date);
    const energyAdded = round(group.reduce((s, g) => s + (g.charge.charge_energy_added || 0), 0));
    const used = round(group.reduce((s, g) => s + (g.charge.charge_energy_used || 0), 0));
    const energyUsed = used > 0 ? used : energyAdded;
    const cost = first.charge.cost as number;

    const snap = priceInEffect(first.station, start);
    const period = snap ? periodAt(snap.peakHours, start) : null;
    const expectedRate = snap && period ? (period === 'peak' ? snap.teslaPeak : snap.teslaOffPeak) : null;
    const expectedCost = expectedRate !== null && energyUsed > 0 ? round(expectedRate * energyUsed) : null;
    return {
      chargeIds: group.map((g) => g.charge.charge_id),
      start: first.charge.start_date,
      end: last.charge.end_date,
      stationId: first.station.id,
      stationName: first.station.name,
      address: first.charge.address || '',
      energyAdded,
      energyUsed,
      cost,
      realRate: energyUsed > 0 ? round(cost / energyUsed, 3) : 0,
      period,
      expectedRate,
      priceDate: snap?.date ?? null,
      expectedCost,
      diff: expectedCost !== null ? round(cost - expectedCost) : null,
      offPeakCost: snap && energyUsed > 0 ? round(snap.teslaOffPeak * energyUsed) : null,
    };
  });
  sessions.sort((a, b) => Date.parse(b.start) - Date.parse(a.start));

  const compared = sessions.filter((s) => s.expectedCost !== null);
  return {
    sessions,
    totals: {
      sessions: sessions.length,
      compared: compared.length,
      cost: round(sessions.reduce((s, x) => s + x.cost, 0)),
      expectedCost: round(compared.reduce((s, x) => s + (x.expectedCost as number), 0)),
      diff: round(compared.reduce((s, x) => s + (x.diff as number), 0)),
      possibleSaving: round(compared.reduce((s, x) => s + Math.max(0, x.cost - (x.offPeakCost ?? x.cost)), 0)),
      energy: round(sessions.reduce((s, x) => s + x.energyUsed, 0), 1),
    },
    unmatched,
  };
}
