import type { Supercharger, StationEvent } from '../../src/types.js';

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
