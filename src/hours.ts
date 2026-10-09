// Plage d'heures creuses déduite de la plage d'heures pleines : "16:00 - 20:00" → "20:00 - 16:00".
export function offPeakHours(peakHours: string): string | null {
  const match = peakHours.match(/^\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*$/);
  if (!match) return null;
  const [, start, end] = match;
  return `${end} - ${start}`;
}

export type TariffPeriod = 'peak' | 'offPeak';

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// Heure murale en France (les stations y sont toutes), quel que soit le fuseau du navigateur.
function parisMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return get('hour') * 60 + get('minute');
}

// Créneau tarifaire en cours ; "09:00 - 00:00" court jusqu'à minuit, une plage peut chevaucher minuit.
export function currentTariffPeriod(peakHours: string, now: Date = new Date()): TariffPeriod | null {
  const match = peakHours.match(/^\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*$/);
  if (!match) return null;
  const start = toMinutes(match[1]);
  const end = toMinutes(match[2]);
  if (start === end) return null;
  const t = parisMinutes(now);
  const inPeak = start < end ? t >= start && t < end : t >= start || t < end;
  return inPeak ? 'peak' : 'offPeak';
}
