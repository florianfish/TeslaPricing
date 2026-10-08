// Plage d'heures creuses déduite de la plage d'heures pleines : "16:00 - 20:00" → "20:00 - 16:00".
export function offPeakHours(peakHours: string): string | null {
  const match = peakHours.match(/^\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*$/);
  if (!match) return null;
  const [, start, end] = match;
  return `${end} - ${start}`;
}
