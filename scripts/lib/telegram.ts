import type { Supercharger, StationEvent, SuperchargerPricing } from '../../src/types.js';

export interface TelegramConfig {
  botToken?: string;
  chatId?: string;
  publicUrl?: string;
}

export interface NotifyResult {
  sent: boolean;
  count: number;
  error?: string;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatStatusLabel(status?: Supercharger['status']): string {
  switch (status) {
    case 'OPEN':
      return 'Ouvert';
    case 'CONSTRUCTION':
      return 'En travaux';
    case 'PLAN':
      return 'En projet';
    default:
      return status || 'Inconnu';
  }
}

export function formatEventTitle(event: StationEvent): string {
  if (event.type === 'NEW') {
    switch (event.to) {
      case 'OPEN':
        return '⚡ <b>Nouveau Supercharger ouvert !</b>';
      case 'CONSTRUCTION':
        return '🚧 <b>Nouveau Supercharger en travaux !</b>';
      case 'PLAN':
      default:
        return '📌 <b>Nouveau Supercharger en projet</b>';
    }
  }

  // STATUS change
  if (event.from === 'CONSTRUCTION' && event.to === 'OPEN') {
    return '🎉 <b>Ouverture d\'un Supercharger !</b>';
  }
  if (event.from === 'PLAN' && event.to === 'CONSTRUCTION') {
    return '🚧 <b>Début des travaux !</b>';
  }
  if (event.from === 'PLAN' && event.to === 'OPEN') {
    return '🎉 <b>Ouverture directe d\'un Supercharger !</b>';
  }
  if (event.from === 'OPEN' && event.to === 'CONSTRUCTION') {
    return '⚠️ <b>Fermeture temporaire pour travaux</b>';
  }
  return '🔄 <b>Changement de statut</b>';
}

export function formatSingleEvent(
  event: StationEvent,
  station?: Supercharger,
  publicUrl?: string
): string {
  const title = formatEventTitle(event);
  const cleanName = escapeHtml(event.superchargerName.replace(/, France$/, ''));
  const locationParts = [event.city, station?.department, event.region].filter(Boolean);
  const locationStr = escapeHtml(locationParts.join(' · '));

  const lines: string[] = [title, `📍 <b>${cleanName}</b>`];
  if (locationStr) {
    lines.push(`🏙️ ${locationStr}`);
  }

  if (event.type === 'STATUS' && event.from) {
    lines.push(`🔄 ${formatStatusLabel(event.from)} ➔ <b>${formatStatusLabel(event.to)}</b>`);
  }

  if (station) {
    const techParts: string[] = [];
    if (station.stallCount) {
      techParts.push(`${station.stallCount} borne${station.stallCount > 1 ? 's' : ''}`);
    }
    if (station.powerKw) {
      techParts.push(`${station.powerKw} kW`);
    }
    const v4 = station.stallsBreakdown?.v4;
    const v3 = station.stallsBreakdown?.v3;
    const v2 = station.stallsBreakdown?.v2;
    if (v4 && v4 > 0) techParts.push('V4');
    else if (v3 && v3 > 0) techParts.push('V3');
    else if (v2 && v2 > 0) techParts.push('V2');

    techParts.push(station.otherEVs ? 'Ouvert à tous (CCS)' : 'Réservé Tesla');
    lines.push(`🔌 ${techParts.join(' · ')}`);

    // Liens
    const links: string[] = [];
    const cleanPublicUrl = (publicUrl || '').replace(/\/+$/, '');
    if (cleanPublicUrl && station.locationSlug && station.id) {
      links.push(`<a href="${cleanPublicUrl}/superchargeur-${station.locationSlug}-${station.id}">Fiche Observatoire</a>`);
    }
    if (station.latitude && station.longitude) {
      links.push(`<a href="https://www.google.com/maps/search/?api=1&query=${station.latitude},${station.longitude}">Google Maps</a>`);
    }
    if (links.length > 0) {
      lines.push(`🔗 ${links.join(' · ')}`);
    }
  }

  return lines.join('\n');
}

export function formatStationEventsMessage(
  events: StationEvent[],
  stations: Supercharger[],
  options?: { publicUrl?: string; date?: string; maxChunkLength?: number }
): string[] {
  if (events.length === 0) return [];

  const stationsMap = new Map(stations.map((s) => [String(s.id), s]));
  const dateStr = options?.date || new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const header = `⚡ <b>Tesla Superchargers France — Évolutions</b>\n📅 ${dateStr} · ${events.length} évolution${events.length > 1 ? 's' : ''}\n`;
  const separator = '\n\n' + '─'.repeat(24) + '\n\n';
  const maxLength = options?.maxChunkLength || 3800; // Telegram limit is 4096

  const formattedEvents = events.map((event) =>
    formatSingleEvent(event, stationsMap.get(String(event.superchargerId)), options?.publicUrl)
  );

  const chunks: string[] = [];
  let currentChunk = header;

  for (const eventBlock of formattedEvents) {
    const toAdd = (currentChunk === header ? '\n' : separator) + eventBlock;
    if (currentChunk.length + toAdd.length > maxLength && currentChunk !== header) {
      chunks.push(currentChunk.trim());
      currentChunk = header + '\n' + eventBlock;
    } else {
      currentChunk += toAdd;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

export async function sendTelegramMessage(
  text: string,
  config: { botToken: string; chatId: string; timeoutMs?: number }
): Promise<void> {
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: config.chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(config.timeoutMs || 10000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Telegram API HTTP ${res.status}: ${body}`);
  }
}

export async function notifyStationEvents(
  events: StationEvent[],
  stations: Supercharger[],
  options?: TelegramConfig
): Promise<NotifyResult> {
  if (!events || events.length === 0) {
    return { sent: false, count: 0 };
  }

  const botToken = options?.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = options?.chatId || process.env.TELEGRAM_CHAT_ID;
  const publicUrl = options?.publicUrl || process.env.PUBLIC_URL;

  if (!botToken || !chatId) {
    console.log('[TELEGRAM] Variables TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID absentes : notification ignorée.');
    return { sent: false, count: events.length };
  }

  try {
    const messages = formatStationEventsMessage(events, stations, { publicUrl });
    console.log(`[TELEGRAM] 📤 Envoi de ${messages.length} message(s) pour ${events.length} évolution(s)...`);
    for (const msg of messages) {
      await sendTelegramMessage(msg, { botToken, chatId });
    }
    console.log(`[TELEGRAM] ✅ Notification Telegram envoyée avec succès (${events.length} évolution(s)).`);
    return { sent: true, count: events.length };
  } catch (err: any) {
    console.warn(`[TELEGRAM] ⚠️ Erreur lors de l'envoi de la notification Telegram: ${err.message}`);
    return { sent: false, count: events.length, error: err.message };
  }
}

// --- Relevé des tarifs (Bright Data) ------------------------------------------------------------

type PricingFields = Pick<SuperchargerPricing, 'teslaPeak' | 'teslaOffPeak' | 'nonTeslaPeak' | 'nonTeslaOffPeak' | 'peakHours'>;

export interface PriceChange {
  id: string;
  name: string;
  locationSlug?: string;
  before: PricingFields;
  after: PricingFields;
}

export interface PriceCollectionReport {
  stations: number;              // stations interrogées
  collected: number;             // stations dont les tarifs ont été reçus
  changes: PriceChange[];
  failed?: { name: string; detail: string }[];
  abortReason?: string | null;   // relevé interrompu
  importError?: string | null;   // envoi à l'add-on en échec
}

const euro = (n: number) => n.toFixed(2).replace('.', ',');

// « 0,38 → <b>0,42</b> » si la valeur change, « 0,33 » sinon
function priceDiff(before: number, after: number): string {
  return before === after ? euro(after) : `${euro(before)} → <b>${euro(after)}</b>`;
}

// Variation moyenne du tarif Tesla (HP + HC), comme l'historique des relevés
export function teslaChangePercent(change: PriceChange): number {
  const oldAvg = (change.before.teslaPeak + change.before.teslaOffPeak) / 2;
  const newAvg = (change.after.teslaPeak + change.after.teslaOffPeak) / 2;
  return oldAvg ? Number((((newAvg - oldAvg) / oldAvg) * 100).toFixed(1)) : 0;
}

export function formatPriceChange(change: PriceChange, publicUrl?: string): string {
  const { before, after } = change;
  const pct = teslaChangePercent(change);
  const trend = pct > 0 ? '🔺' : pct < 0 ? '🔻' : '🔁';
  const pctStr = pct ? ` (${pct > 0 ? '+' : ''}${String(pct).replace('.', ',')} %)` : '';
  const lines = [
    `${trend} <b>${escapeHtml(change.name.replace(/, France$/, ''))}</b>${pctStr}`,
    `⚡ Tesla : HP ${priceDiff(before.teslaPeak, after.teslaPeak)} · HC ${priceDiff(before.teslaOffPeak, after.teslaOffPeak)} €/kWh`,
    `🔌 Autres VE : HP ${priceDiff(before.nonTeslaPeak, after.nonTeslaPeak)} · HC ${priceDiff(before.nonTeslaOffPeak, after.nonTeslaOffPeak)} €/kWh`,
  ];
  if (before.peakHours !== after.peakHours) {
    lines.push(`🕒 Heures pleines : ${escapeHtml(before.peakHours)} → <b>${escapeHtml(after.peakHours)}</b>`);
  }
  const cleanPublicUrl = (publicUrl || '').replace(/\/+$/, '');
  if (cleanPublicUrl && change.locationSlug) {
    lines.push(`🔗 <a href="${cleanPublicUrl}/superchargeur-${change.locationSlug}-${change.id}">Fiche Observatoire</a>`);
  }
  return lines.join('\n');
}

export function formatPriceCollectionMessage(
  report: PriceCollectionReport,
  options?: { publicUrl?: string; date?: string; maxChunkLength?: number }
): string[] {
  const dateStr = options?.date || new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
  const n = report.changes.length;
  const headerLines = [
    '💶 <b>Tesla Superchargeurs — Relevé des tarifs</b>',
    `📅 ${dateStr} · ${report.collected}/${report.stations} stations relevées · ${n ? `${n} tarif${n > 1 ? 's' : ''} modifié${n > 1 ? 's' : ''}` : 'aucun changement'}`,
  ];
  if (report.abortReason) headerLines.push(`⛔ Relevé interrompu : ${escapeHtml(report.abortReason)}`);
  if (report.importError) headerLines.push(`⚠️ Envoi à l'add-on en échec : ${escapeHtml(report.importError)} — tarifs non enregistrés`);
  const failed = report.failed || [];
  if (failed.length) {
    const names = failed.slice(0, 10).map((f) => escapeHtml(f.name.replace(/, France$/, ''))).join(', ');
    headerLines.push(`⚠️ ${failed.length} station${failed.length > 1 ? 's' : ''} non relevée${failed.length > 1 ? 's' : ''} : ${names}${failed.length > 10 ? '…' : ''}`);
  }
  const header = headerLines.join('\n');

  if (n === 0) return [header];

  const separator = '\n\n';
  const maxLength = options?.maxChunkLength || 3800;
  const blocks = [...report.changes]
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    .map((c) => formatPriceChange(c, options?.publicUrl));

  const chunks: string[] = [];
  let current = header;
  for (const block of blocks) {
    const toAdd = separator + block;
    if (current.length + toAdd.length > maxLength && current !== header) {
      chunks.push(current.trim());
      current = header + separator + block;
    } else {
      current += toAdd;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export async function notifyPriceCollection(report: PriceCollectionReport, options?: TelegramConfig): Promise<NotifyResult> {
  const botToken = options?.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = options?.chatId || process.env.TELEGRAM_CHAT_ID;
  const publicUrl = options?.publicUrl || process.env.PUBLIC_URL;
  const count = report.changes.length;

  if (!botToken || !chatId) {
    console.log('[TELEGRAM] Variables TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID absentes : notification ignorée.');
    return { sent: false, count };
  }
  try {
    for (const msg of formatPriceCollectionMessage(report, { publicUrl })) {
      await sendTelegramMessage(msg, { botToken, chatId });
    }
    console.log(`[TELEGRAM] ✅ Relevé des tarifs notifié (${count} changement(s)).`);
    return { sent: true, count };
  } catch (err: any) {
    console.warn(`[TELEGRAM] ⚠️ Erreur lors de l'envoi de la notification Telegram: ${err.message}`);
    return { sent: false, count, error: err.message };
  }
}
