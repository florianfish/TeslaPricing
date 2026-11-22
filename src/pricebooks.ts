// Grille tarifaire complète d'une station, telle que publiée par Tesla (effectivePricebooks).
// Partagé entre le serveur (import), le relevé (Telegram) et l'interface (fiche station).
//
// Une grille Tesla compte souvent plus de deux niveaux (Gassin : 0,40 de 10 h à 20 h, 0,28 de
// 20 h à minuit, 0,19 de minuit à 10 h) et trois types de véhicules : TSLA (Tesla), NTSLA (autres
// VE sans abonnement) et MSP. Le modèle HP / HC de `SuperchargerPricing` reste l'affichage résumé.

export interface PricebookSlot {
  vehicle: string;            // TSLA, NTSLA, MSP…
  fee: string;                // CHARGING (€/kWh) ou CONGESTION (€/min)
  rate: number;
  uom: string;                // kwh, min
  start: string | null;       // « HH:MM » pour un créneau horaire, null pour le tarif de base
  end: string | null;         // « 00:00 » = minuit (fin de journée)
  days: number[] | null;      // jours d'application tels que publiés par Tesla, null = tous
  tou: boolean;               // créneau horaire (time of use)
  minOccupancy?: number | null; // tarification selon l'affluence (vide en France fin 2026)
  maxOccupancy?: number | null;
}

export const VEHICLE_LABELS: Record<string, string> = {
  TSLA: 'Tesla',
  NTSLA: 'Autres VE',
  MSP: 'MSP',
};
export const VEHICLE_ORDER = ['TSLA', 'NTSLA', 'MSP'];

const HHMM = /^\d{1,2}:\d{2}$/;
const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const pad = (n: number) => String(n).padStart(2, '0');
const fromMinutes = (min: number) => `${pad(Math.floor((min % 1440) / 60))}:${pad(min % 60)}`;

// Réponse FindUs → créneaux normalisés (champs utiles seulement, ordre stable)
export function normalizePricebooks(raw: unknown): PricebookSlot[] {
  if (!Array.isArray(raw)) return [];
  const slots: PricebookSlot[] = [];
  for (const p of raw as any[]) {
    if (!p || typeof p.rateBase !== 'number' || !p.feeType) continue;
    const start = typeof p.startTime === 'string' && HHMM.test(p.startTime) ? p.startTime : null;
    const end = typeof p.endTime === 'string' && HHMM.test(p.endTime) ? p.endTime : null;
    const days =
      typeof p.days === 'string' && p.days.trim()
        ? p.days.split(',').map((d: string) => Number(d.trim())).filter((d: number) => Number.isInteger(d))
        : null;
    const slot: PricebookSlot = {
      vehicle: String(p.vehicleMakeType || 'TSLA'),
      fee: String(p.feeType),
      rate: p.rateBase,
      uom: String(p.uom || (p.feeType === 'CONGESTION' ? 'min' : 'kwh')),
      start,
      end,
      days: days && days.length && days.length < 7 ? days : null,
      tou: Boolean(p.isTou) && !!start && !!end,
    };
    if (p.minSiteOccupancy != null) slot.minOccupancy = p.minSiteOccupancy;
    if (p.maxSiteOccupancy != null) slot.maxOccupancy = p.maxSiteOccupancy;
    slots.push(slot);
  }
  const key = (s: PricebookSlot) => `${s.vehicle}|${s.fee}|${s.tou ? 1 : 0}|${s.start ?? ''}|${s.end ?? ''}|${s.days?.join() ?? ''}|${s.minOccupancy ?? ''}`;
  return slots.sort((a, b) => key(a).localeCompare(key(b)));
}

// Deux grilles diffèrent-elles ? (ordre indifférent)
export function pricebooksChanged(a: PricebookSlot[] | undefined, b: PricebookSlot[] | undefined): boolean {
  const norm = (s?: PricebookSlot[]) => JSON.stringify(normalizePricebooksFromSlots(s || []));
  return norm(a) !== norm(b);
}

// Re-trier des créneaux déjà normalisés (bases anciennes ou objets construits à la main)
function normalizePricebooksFromSlots(slots: PricebookSlot[]): PricebookSlot[] {
  return normalizePricebooks(
    slots.map((s) => ({
      vehicleMakeType: s.vehicle,
      feeType: s.fee,
      rateBase: s.rate,
      uom: s.uom,
      startTime: s.start ?? '',
      endTime: s.end ?? '',
      days: s.days?.join(',') ?? '',
      isTou: s.tou,
      minSiteOccupancy: s.minOccupancy ?? null,
      maxSiteOccupancy: s.maxOccupancy ?? null,
    }))
  );
}

// Le créneau couvre-t-il cette minute de la journée ? « 21:00 – 00:00 » va jusqu'à minuit,
// « 22:00 – 06:00 » chevauche minuit.
function covers(slot: PricebookSlot, minute: number, weekday?: number): boolean {
  if (!slot.tou || !slot.start || !slot.end) return false;
  if (weekday !== undefined && slot.days && !slot.days.includes(weekday)) return false;
  const start = toMinutes(slot.start);
  const end = toMinutes(slot.end) || 1440;
  if (start === end % 1440 && start === 0) return true; // 00:00 – 00:00 : toute la journée
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

const charging = (slots: PricebookSlot[], vehicle: string) =>
  slots.filter((s) => s.fee === 'CHARGING' && s.vehicle === vehicle && s.uom === 'kwh');

// Prix au kWh d'un type de véhicule à une minute donnée : créneau horaire, sinon tarif de base
export function rateAtMinute(slots: PricebookSlot[], vehicle: string, minute: number, weekday?: number): number | null {
  const own = charging(slots, vehicle);
  const tou = own.find((s) => covers(s, minute, weekday));
  if (tou) return tou.rate;
  return own.find((s) => !s.tou)?.rate ?? null;
}

// Heure et jour à Paris (les stations sont toutes en France), quel que soit le fuseau de l'appareil
export function parisClock(now: Date): { minute: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { minute: Number(get('hour')) * 60 + Number(get('minute')), weekday };
}

// Jours de semaine : on suppose la convention JavaScript (0 = dimanche). Toutes les grilles
// françaises relevées fin 2026 s'appliquent aux 7 jours, la convention n'y change rien.
export function rateAt(slots: PricebookSlot[], vehicle: string, now: Date = new Date()): number | null {
  const { minute, weekday } = parisClock(now);
  return rateAtMinute(slots, vehicle, minute, weekday);
}

export interface ScheduleRow {
  start: string;                       // « HH:MM »
  end: string;                         // « HH:MM », « 00:00 » = minuit
  rates: Record<string, number | null>; // prix au kWh par type de véhicule
}

// Grille d'une journée sous forme de plages consécutives : les créneaux adjacents au même prix
// pour tous les véhicules sont fusionnés (« 21:00 – 00:00 » + « 00:00 – 10:00 » → « 21:00 – 10:00 »).
export function dailySchedule(slots: PricebookSlot[], weekday?: number): ScheduleRow[] {
  const vehicles = vehiclesOf(slots);
  if (!vehicles.length) return [];
  const bounds = new Set<number>([0]);
  for (const s of slots) {
    if (s.fee !== 'CHARGING' || !s.tou || !s.start || !s.end) continue;
    if (weekday !== undefined && s.days && !s.days.includes(weekday)) continue;
    bounds.add(toMinutes(s.start));
    bounds.add(toMinutes(s.end) % 1440);
  }
  const cuts = [...bounds].sort((a, b) => a - b);
  const segments = cuts.map((start, i) => {
    const end = i + 1 < cuts.length ? cuts[i + 1] : 1440;
    const rates: Record<string, number | null> = {};
    for (const v of vehicles) rates[v] = rateAtMinute(slots, v, start, weekday);
    return { start, end, rates };
  });

  const same = (a: Record<string, number | null>, b: Record<string, number | null>) => vehicles.every((v) => a[v] === b[v]);
  const merged: { start: number; end: number; rates: Record<string, number | null> }[] = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (last && same(last.rates, seg.rates)) last.end = seg.end;
    else merged.push({ ...seg });
  }
  // La dernière plage de la journée continue sur la première (même prix de part et d'autre de minuit)
  if (merged.length > 1 && same(merged[0].rates, merged[merged.length - 1].rates)) {
    const last = merged.pop()!;
    merged[0] = { start: last.start, end: merged[0].end + 1440, rates: last.rates };
  }
  // Plage qui chevauche minuit en tête : la remettre à sa place chronologique (fin de liste)
  merged.sort((a, b) => a.start - b.start);
  return merged.map((m) => ({ start: fromMinutes(m.start), end: fromMinutes(m.end), rates: m.rates }));
}

export function vehiclesOf(slots: PricebookSlot[]): string[] {
  const present = new Set(slots.filter((s) => s.fee === 'CHARGING').map((s) => s.vehicle));
  return [...VEHICLE_ORDER.filter((v) => present.has(v)), ...[...present].filter((v) => !VEHICLE_ORDER.includes(v)).sort()];
}

// Niveaux de prix distincts d'un véhicule sur la journée (du plus cher au moins cher)
export function priceLevels(slots: PricebookSlot[], vehicle = 'TSLA'): number[] {
  const rates = dailySchedule(slots)
    .map((r) => r.rates[vehicle])
    .filter((r): r is number => typeof r === 'number');
  return [...new Set(rates)].sort((a, b) => b - a);
}

// Grille différente selon le jour, ou selon l'affluence de la station
export function hasDaySpecificSlots(slots: PricebookSlot[]): boolean {
  return slots.some((s) => s.days && s.days.length < 7);
}
export function hasOccupancyPricing(slots: PricebookSlot[]): boolean {
  return slots.some((s) => s.minOccupancy != null || s.maxOccupancy != null);
}

// « 0,40 (10:00 – 20:00) · 0,28 (20:00 – 00:00) · 0,19 (00:00 – 10:00) »
export function formatSchedule(slots: PricebookSlot[], vehicle = 'TSLA'): string {
  return dailySchedule(slots)
    .filter((r) => typeof r.rates[vehicle] === 'number')
    .map((r) => `${(r.rates[vehicle] as number).toFixed(2).replace('.', ',')} (${r.start} – ${r.end})`)
    .join(' · ');
}
