import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  escapeHtml,
  formatStatusLabel,
  formatEventTitle,
  formatSingleEvent,
  formatStationEventsMessage,
  sendTelegramMessage,
  notifyStationEvents,
  formatPriceChange,
  formatPriceCollectionMessage,
  notifyPriceCollection,
  teslaChangePercent,
  type PriceChange,
} from '../scripts/lib/telegram';
import type { StationEvent, Supercharger } from '../src/types';

describe('Telegram helper & formatting', () => {
  it('escapeHtml échappe les caractères HTML réservés', () => {
    expect(escapeHtml('A & B < C > D')).toBe('A &amp; B &lt; C &gt; D');
    expect(escapeHtml('Normal text')).toBe('Normal text');
  });

  it('formatStatusLabel renvoie le libellé en français', () => {
    expect(formatStatusLabel('OPEN')).toBe('Ouvert');
    expect(formatStatusLabel('CONSTRUCTION')).toBe('En travaux');
    expect(formatStatusLabel('PLAN')).toBe('En projet');
  });

  it('formatEventTitle adapte le titre selon le type et la transition', () => {
    expect(formatEventTitle({ date: '2026-10-26', type: 'NEW', superchargerId: '1', superchargerName: 'Test', city: 'Paris', region: 'IDF', to: 'OPEN' }))
      .toContain('Nouveau Supercharger ouvert');
    expect(formatEventTitle({ date: '2026-10-26', type: 'NEW', superchargerId: '1', superchargerName: 'Test', city: 'Paris', region: 'IDF', to: 'CONSTRUCTION' }))
      .toContain('Nouveau Supercharger en travaux');
    expect(formatEventTitle({ date: '2026-10-26', type: 'NEW', superchargerId: '1', superchargerName: 'Test', city: 'Paris', region: 'IDF', to: 'PLAN' }))
      .toContain('Nouveau Supercharger en projet');

    expect(formatEventTitle({ date: '2026-10-26', type: 'STATUS', superchargerId: '1', superchargerName: 'Test', city: 'Paris', region: 'IDF', from: 'CONSTRUCTION', to: 'OPEN' }))
      .toContain('Ouverture d\'un Supercharger');
    expect(formatEventTitle({ date: '2026-10-26', type: 'STATUS', superchargerId: '1', superchargerName: 'Test', city: 'Paris', region: 'IDF', from: 'PLAN', to: 'CONSTRUCTION' }))
      .toContain('Début des travaux');
    expect(formatEventTitle({ date: '2026-10-26', type: 'STATUS', superchargerId: '1', superchargerName: 'Test', city: 'Paris', region: 'IDF', from: 'OPEN', to: 'CONSTRUCTION' }))
      .toContain('Fermeture temporaire');
  });

  it('formatSingleEvent formate correctement une station avec tous ses attributs et liens', () => {
    const event: StationEvent = {
      date: '2026-10-26',
      type: 'STATUS',
      superchargerId: '10743',
      superchargerName: 'Alès, France',
      city: 'Alès',
      region: 'Occitanie',
      from: 'CONSTRUCTION',
      to: 'OPEN',
    };
    const station: Supercharger = {
      id: '10743',
      locationSlug: 'alessupercharger',
      name: 'Alès, France',
      city: 'Alès',
      department: 'Dép. 30',
      region: 'Occitanie',
      street: 'Chemin de Larnac',
      postalCode: '30100',
      latitude: 44.13,
      longitude: 4.09,
      status: 'OPEN',
      stallCount: 8,
      powerKw: 250,
      stallsBreakdown: { v4: 8 },
      otherEVs: true,
      currentPricing: {
        teslaPeak: 0.35,
        teslaOffPeak: 0.29,
        nonTeslaPeak: 0.47,
        nonTeslaOffPeak: 0.39,
        peakHours: '09:00 - 20:00',
        idleFeeStandard: 0.5,
        idleFeeCongested: 1,
        lastUpdated: '2026-10-26T12:00:00Z',
      },
    };

    const text = formatSingleEvent(event, station, 'https://superchargers.example.com');
    expect(text).toContain('Ouverture d\'un Supercharger');
    expect(text).toContain('Alès');
    expect(text).toContain('Dép. 30');
    expect(text).toContain('En travaux ➔ <b>Ouvert</b>');
    expect(text).toContain('8 bornes · 250 kW · V4 · Ouvert à tous (CCS)');
    expect(text).toContain('https://superchargers.example.com/superchargeur-alessupercharger-10743');
    expect(text).toContain('https://www.google.com/maps/search/?api=1&query=44.13,4.09');
  });

  it('formatStationEventsMessage gère le découpage et les listes vides', () => {
    expect(formatStationEventsMessage([], [])).toEqual([]);

    const event: StationEvent = {
      date: '2026-10-26',
      type: 'NEW',
      superchargerId: '999',
      superchargerName: 'Vitré, France',
      city: 'Vitré',
      region: 'Bretagne',
      to: 'CONSTRUCTION',
    };
    const station: Supercharger = {
      id: '999',
      locationSlug: 'vitresupercharger',
      name: 'Vitré, France',
      city: 'Vitré',
      department: 'Dép. 35',
      region: 'Bretagne',
      street: '',
      postalCode: '35500',
      latitude: 48.12,
      longitude: -1.2,
      status: 'CONSTRUCTION',
      stallCount: 12,
      powerKw: 250,
      stallsBreakdown: {},
      otherEVs: false,
      currentPricing: {} as any,
    };

    const messages = formatStationEventsMessage([event, event], [station], { date: '26 octobre 2026' });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('26 octobre 2026');
    expect(messages[0]).toContain('2 évolutions');

    // Test de chunking avec un maxChunkLength réduit
    const chunked = formatStationEventsMessage([event, event, event], [station], {
      date: '26 octobre 2026',
      maxChunkLength: 300,
    });
    expect(chunked.length).toBeGreaterThan(1);
  });
});

describe('sendTelegramMessage & notifyStationEvents API calls', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  });

  it('sendTelegramMessage envoie le bon payload JSON à l\'API Telegram', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    globalThis.fetch = fetchMock;

    await sendTelegramMessage('<b>Message test</b>', {
      botToken: '123456:ABC-DEF',
      chatId: '-100123456789',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/bot123456:ABC-DEF/sendMessage');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      chat_id: '-100123456789',
      text: '<b>Message test</b>',
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  });

  it('sendTelegramMessage lève une exception si l\'API renvoie une erreur HTTP', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error_code": 400, "description": "Bad Request: chat not found"}',
    });

    await expect(
      sendTelegramMessage('test', { botToken: 'fake', chatId: 'bad_chat' })
    ).rejects.toThrow('Telegram API HTTP 400');
  });

  it('notifyStationEvents ignore l\'envoi si aucun événement ou token absent', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

    // Pas d'événements
    const res1 = await notifyStationEvents([], []);
    expect(res1).toEqual({ sent: false, count: 0 });
    expect(fetchMock).not.toHaveBeenCalled();

    // Événement mais pas de token
    const event: StationEvent = {
      date: '2026-10-26',
      type: 'NEW',
      superchargerId: '1',
      superchargerName: 'Test',
      city: 'Paris',
      region: 'IDF',
      to: 'OPEN',
    };
    const res2 = await notifyStationEvents([event], []);
    expect(res2).toEqual({ sent: false, count: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('notifyStationEvents envoie la notification quand les variables sont fournies', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    globalThis.fetch = fetchMock;

    const event: StationEvent = {
      date: '2026-10-26',
      type: 'STATUS',
      superchargerId: '1',
      superchargerName: 'Rennes - Cleunay',
      city: 'Rennes',
      region: 'Bretagne',
      from: 'CONSTRUCTION',
      to: 'OPEN',
    };

    const res = await notifyStationEvents([event], [], {
      botToken: 'BOT_TOKEN_XYZ',
      chatId: 'CHAT_ID_XYZ',
    });

    expect(res).toEqual({ sent: true, count: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('Relevé des tarifs : message Telegram', () => {
  const lexy: PriceChange = {
    id: '10338',
    name: 'Lexy, France',
    locationSlug: 'lexysupercharger',
    before: { teslaPeak: 0.38, teslaOffPeak: 0.33, nonTeslaPeak: 0.51, nonTeslaOffPeak: 0.42, peakHours: '16:00 - 20:00' },
    after: { teslaPeak: 0.42, teslaOffPeak: 0.24, nonTeslaPeak: 0.57, nonTeslaOffPeak: 0.32, peakHours: '10:00 - 21:00' },
  };
  const ferin: PriceChange = {
    id: '10337',
    name: 'Férin, France',
    before: { teslaPeak: 0.42, teslaOffPeak: 0.15, nonTeslaPeak: 0.57, nonTeslaOffPeak: 0.21, peakHours: '10:00 - 20:00' },
    after: { teslaPeak: 0.42, teslaOffPeak: 0.17, nonTeslaPeak: 0.57, nonTeslaOffPeak: 0.21, peakHours: '10:00 - 20:00' },
  };

  it('détaille l’ancien et le nouveau tarif, en ne soulignant que ce qui change', () => {
    const text = formatPriceChange(ferin);
    expect(text).toContain('🔺 <b>Férin</b> (+3,5 %)');
    expect(text).toContain('⚡ Tesla : HP 0,42 · HC 0,15 → <b>0,17</b> €/kWh');
    expect(text).toContain('🔌 Autres VE : HP 0,57 · HC 0,21 €/kWh');
    expect(text).not.toContain('Heures pleines');
  });

  it('signale le changement d’heures pleines et ajoute le lien de la fiche', () => {
    const text = formatPriceChange(lexy, 'https://suc.example.fr/');
    expect(teslaChangePercent(lexy)).toBe(-7);
    expect(text).toContain('🔻 <b>Lexy</b> (-7 %)');
    expect(text).toContain('🕒 Heures pleines : 16:00 - 20:00 → <b>10:00 - 21:00</b>');
    expect(text).toContain('<a href="https://suc.example.fr/superchargeur-lexysupercharger-10338">Fiche Observatoire</a>');
  });

  it('grille à trois prix : détaillée sous le résumé HP / HC', () => {
    const grid = [
      { vehicle: 'TSLA', fee: 'CHARGING', rate: 0.4, uom: 'kwh', start: '10:00', end: '20:00', days: null, tou: true },
      { vehicle: 'TSLA', fee: 'CHARGING', rate: 0.28, uom: 'kwh', start: '20:00', end: '00:00', days: null, tou: true },
      { vehicle: 'TSLA', fee: 'CHARGING', rate: 0.19, uom: 'kwh', start: '00:00', end: '10:00', days: null, tou: true },
    ];
    expect(formatPriceChange({ ...ferin, afterGrid: grid })).toContain(
      '📋 Grille Tesla : 0,19 (00:00 – 10:00) · 0,40 (10:00 – 20:00) · 0,28 (20:00 – 00:00)'
    );
    // Grille à deux prix inchangée : pas de ligne en plus
    expect(formatPriceChange({ ...ferin, beforeGrid: grid.slice(0, 2), afterGrid: grid.slice(0, 2) })).not.toContain('Grille Tesla');
  });

  it('en-tête : bilan du relevé, stations en échec, import raté ; tri par nom', () => {
    const [msg] = formatPriceCollectionMessage(
      {
        stations: 292,
        collected: 290,
        changes: [lexy, ferin],
        failed: [{ name: 'Cholet, France', detail: 'Tesla HTTP 429' }, { name: 'Alès, France', detail: 'bloqué' }],
        importError: 'HTTP 401',
      },
      { date: '22 novembre 2026' }
    );
    expect(msg).toContain('📅 22 novembre 2026 · 290/292 stations relevées · 2 tarifs modifiés');
    expect(msg).toContain('⚠️ 2 stations non relevées : Cholet, Alès');
    expect(msg).toContain("⚠️ Envoi à l'add-on en échec : HTTP 401");
    expect(msg.indexOf('Férin')).toBeLessThan(msg.indexOf('Lexy'));
  });

  it('sans changement : un seul message court ; beaucoup de changements : plusieurs messages', () => {
    const quiet = formatPriceCollectionMessage({ stations: 10, collected: 10, changes: [] }, { date: 'x' });
    expect(quiet).toHaveLength(1);
    expect(quiet[0]).toContain('aucun changement');

    const many = Array.from({ length: 40 }, (_, i) => ({ ...lexy, id: String(i), name: `Station ${String(i).padStart(2, '0')}` }));
    const chunks = formatPriceCollectionMessage({ stations: 40, collected: 40, changes: many }, { date: 'x', maxChunkLength: 1500 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 1500 && c.startsWith('💶'))).toBe(true);
    expect(chunks.join('').match(/Station \d\d/g)).toHaveLength(40);
  });

  it('notifyPriceCollection ne fait rien sans jeton Telegram', async () => {
    const originalFetch = globalThis.fetch;
    const original = { token: process.env.TELEGRAM_BOT_TOKEN, chat: process.env.TELEGRAM_CHAT_ID };
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    try {
      expect(await notifyPriceCollection({ stations: 1, collected: 1, changes: [ferin] })).toEqual({ sent: false, count: 1 });
      expect(fetchMock).not.toHaveBeenCalled();

      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
      expect(await notifyPriceCollection({ stations: 1, collected: 1, changes: [ferin] }, { botToken: 'b', chatId: 'c' })).toEqual({ sent: true, count: 1 });
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).text).toContain('Férin');
    } finally {
      globalThis.fetch = originalFetch;
      if (original.token !== undefined) process.env.TELEGRAM_BOT_TOKEN = original.token;
      if (original.chat !== undefined) process.env.TELEGRAM_CHAT_ID = original.chat;
    }
  });
});
