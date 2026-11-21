import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchFindUs, fetchStation, findUsUrl } from '../scripts/lib/brightdata';

const config = { token: 'jeton', zone: 'web_unlocker1', country: 'fr' };
const originalFetch = globalThis.fetch;

// Réponse de l'API Bright Data : corps relayé tel quel (format « raw »)
const reply = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers });

const findUsBody = JSON.stringify({
  data: {
    data: {
      name: 'Lexy',
      effectivePricebooks: [{ feeType: 'CHARGING', vehicleMakeType: 'TSLA', rateBase: 0.4 }],
      publicStallCount: 12,
      maxPowerKw: 250,
      openToNonTeslas: true,
      siteAddress: { city: 'Lexy' },
    },
  },
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('fetchFindUs', () => {
  it('interroge FindUs via Bright Data et ne garde que les champs utiles', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(findUsBody));
    globalThis.fetch = fetchMock;

    const r = await fetchFindUs('444407', config);

    expect(r.status).toBe(200);
    expect(r.data).toEqual({
      effectivePricebooks: [{ feeType: 'CHARGING', vehicleMakeType: 'TSLA', rateBase: 0.4 }],
      publicStallCount: 12,
      maxPowerKw: 250,
      openToNonTeslas: true,
    });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brightdata.com/request');
    expect(options.headers.Authorization).toBe('Bearer jeton');
    expect(JSON.parse(options.body)).toEqual({ zone: 'web_unlocker1', url: findUsUrl('444407'), format: 'raw', country: 'fr' });
  });

  it('distingue limite Tesla (429), blocage (403), station inconnue (404) et erreur Bright Data (0)', async () => {
    const cases: [Response, number][] = [
      [reply('response status was rejected: 429 status code'), 429],
      [reply('captcha or protection page found'), 403],
      [reply('<HTML><HEAD><TITLE>Access Denied</TITLE></HEAD></HTML>'), 403],
      [reply(JSON.stringify({ data: { data: null } })), 404],
      [reply('zone "web_unlocker1" not found', 400), 0],
      [reply('pas du JSON'), 0],
    ];
    for (const [response, status] of cases) {
      globalThis.fetch = vi.fn().mockResolvedValue(response);
      expect((await fetchFindUs('1', config)).status).toBe(status);
    }
  });

  it('remonte le message d’erreur de Bright Data', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(reply('zone "web_unlocker1" not found', 400));
    expect((await fetchFindUs('1', config)).detail).toBe('Bright Data HTTP 400 : zone "web_unlocker1" not found');
  });
});

describe('fetchStation', () => {
  it('essaie le slug quand le locationId est inconnu', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(JSON.stringify({ data: { data: null } })))
      .mockResolvedValueOnce(reply(findUsBody));
    globalThis.fetch = fetchMock;

    const r = await fetchStation(['444407', 'lexysupercharger'], config, { retryPauseMs: 0 });
    expect(r).toMatchObject({ status: 200, candidate: 'lexysupercharger', requests: 2 });
  });

  it('retente le même identifiant après une limite Tesla, sans passer au slug', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply('response status was rejected: 429 status code'))
      .mockResolvedValueOnce(reply('captcha or protection page found'))
      .mockResolvedValueOnce(reply(findUsBody));
    globalThis.fetch = fetchMock;

    const r = await fetchStation(['417068', 'carpiquetsupercharger'], config, { retryPauseMs: 0 });
    expect(r).toMatchObject({ status: 200, candidate: '417068', requests: 3 });
    expect(fetchMock.mock.calls.every(([, o]) => JSON.parse(o.body).url === findUsUrl('417068'))).toBe(true);
  });

  it('abandonne la station après les essais, ou dès une erreur Bright Data', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () => reply('response status was rejected: 429 status code'));
    expect(await fetchStation(['1', 'slug'], config, { retries: 1, retryPauseMs: 0 })).toMatchObject({ status: 429, requests: 2 });

    globalThis.fetch = vi.fn().mockImplementation(async () => reply('zone inconnue', 400));
    expect(await fetchStation(['1', 'slug'], config, { retryPauseMs: 0 })).toMatchObject({ status: 0, requests: 1 });
  });
});
