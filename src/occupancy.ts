// Occupation d'une station côté interface : réponse de /api/superchargers/:id/occupancy et « meilleure heure ».

export interface OccupancyResponse {
  enabled: boolean;
  matched: boolean;
  points: number;
  current: { occupied: number; total: number; at: string } | null;
  grid: (number | null)[][]; // [jour 0 = lundi][heure], taux moyen 0–1
  samples: number;
  lastSampleAt: string | null;
}

export const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// Jour (0 = lundi) et heure à Paris
export function parisDayHour(now: Date): { day: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return { day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')), hour: Number(get('hour')) };
}

// Heure la moins chargée d'ici la fin de la journée (heure en cours comprise) ; à égalité, la plus proche
export function bestHourToday(grid: (number | null)[][], now: Date): { hour: number; rate: number } | null {
  const { day, hour } = parisDayHour(now);
  let best: { hour: number; rate: number } | null = null;
  for (let h = hour; h < 24; h++) {
    const rate = grid[day]?.[h];
    if (rate == null) continue;
    if (!best || rate < best.rate) best = { hour: h, rate };
  }
  return best;
}

// Libellé d'ancienneté : « à l'instant », « il y a 12 min », « il y a 2 h »
export function ageLabel(iso: string, now: Date): string {
  const min = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  if (min < 2) return "à l'instant";
  if (min < 90) return `il y a ${min} min`;
  return `il y a ${Math.round(min / 60)} h`;
}
