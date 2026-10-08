import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { makeDataDir } from './helpers';

// L'API est testée sur une copie de la base de test : DATA_DIR doit être défini avant le chargement de server/db.ts
const dataDir = makeDataDir();
process.env.DATA_DIR = dataDir;
process.env.STATION_SYNC = '0';
process.env.IMPORT_KEY = 'cle-de-test';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { createApp } = await import('../server/app');
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  process.env.IMPORT_KEY = 'cle-de-test';
});

const get = async (route: string) => {
  const res = await fetch(baseUrl + route);
  return { status: res.status, body: await res.json() };
};

const post = async (route: string, body?: unknown, key: string | null = 'cle-de-test') => {
  const res = await fetch(baseUrl + route, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

// Réponse FindUs pour un import du collecteur
const findUs = (peak: number, offPeak: number, ntPeak: number, ntOffPeak: number) => ({
  effectivePricebooks: [
    { feeType: 'CHARGING', vehicleMakeType: 'TSLA', isTou: true, rateBase: peak, startTime: '09:00', endTime: '20:00' },
    { feeType: 'CHARGING', vehicleMakeType: 'TSLA', isTou: true, rateBase: offPeak },
    { feeType: 'CHARGING', vehicleMakeType: 'NTSLA', isTou: true, rateBase: ntPeak },
    { feeType: 'CHARGING', vehicleMakeType: 'NTSLA', isTou: true, rateBase: ntOffPeak },
  ],
});

describe('lecture', () => {
  it('GET /api/health', async () => {
    const { status, body } = await get('/api/health');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
  });

  it('GET /api/config : Google Analytics désactivé par défaut', async () => {
    expect((await get('/api/config')).body).toEqual({ gaMeasurementId: null });
  });

  it('GET /api/superchargers : toutes les stations', async () => {
    const { body } = await get('/api/superchargers');
    expect(body.total).toBe(5);
    expect(body.data.map((s: any) => s.id).sort()).toEqual(['10340', '10743', '6507', '662', '7768']);
  });

  it('GET /api/superchargers : recherche, filtres et tri', async () => {
    const ids = async (query: string) => (await get(`/api/superchargers?${query}`)).body.data.map((s: any) => s.id);
    expect(await ids('search=rennes&sortBy=price')).toEqual(['6507', '662']);
    expect(await ids('search=rennes&sortBy=price&sortOrder=desc')).toEqual(['662', '6507']);
    expect((await ids('status=OPEN')).sort()).toEqual(['6507', '662', '7768']);
    expect(await ids('otherEVsOnly=true')).not.toContain('7768');
    expect(await ids('minPower=200')).not.toContain('7768');
    expect((await ids('region=Bretagne')).sort()).toEqual(['6507', '662']);
  });

  it('GET /api/superchargers/:slug : par identifiant ou par slug, 404 sinon', async () => {
    expect((await get('/api/superchargers/662')).body.name).toBe('Rennes, France - Avenue du Canada');
    expect((await get('/api/superchargers/parissupercharger')).body.id).toBe('7768');
    expect((await get('/api/superchargers/inconnue')).status).toBe(404);
  });

  it("GET /api/superchargers/:slug/prices : historique de la seule station demandée", async () => {
    const { body } = await get('/api/superchargers/662/prices');
    expect(body.history.map((p: any) => p.superchargerId)).toEqual(['662']);
    const cleunay = await get('/api/superchargers/6507/prices');
    expect(cleunay.body.history.map((p: any) => p.date)).toEqual(['2026-08-01', '2026-09-18']);
  });

  it('GET /api/prices/stats : moyennes sur les stations ouvertes', async () => {
    const { body } = await get('/api/prices/stats');
    expect(body).toMatchObject({
      totalStations: 5,
      openStations: 3,
      constructionStations: 1,
      plannedStations: 1,
      avgTeslaOffPeak: 0.23, // (0.16 + 0.18 + 0.34) / 3
      avgTeslaPeak: 0.37, // (0.36 + 0.36 + 0.40) / 3
      minPriceStation: { city: 'Rennes', price: 0.16 },
      maxPriceStation: { city: 'Paris', price: 0.4 },
      lastSyncTime: '2026-10-01T03:00:00.000Z',
    });
    expect(body.nationalHistory).toHaveLength(3);
  });

  it('GET /api/prices/updates : relevé et relevé précédent de la même station', async () => {
    const { body } = await get('/api/prices/updates?limit=10');
    expect(body.data[0].snapshot).toMatchObject({ superchargerId: '7768', date: '2026-09-25' });
    const cleunay = body.data.find((u: any) => u.snapshot.id === '6507-2026-09-18');
    expect(cleunay.previous).toMatchObject({ date: '2026-08-01', teslaOffPeak: 0.2 });
    expect(body.data.find((u: any) => u.snapshot.id === '662-2026-09-18').previous).toBeNull();
    expect((await get('/api/prices/updates?limit=2')).body.data).toHaveLength(2);
  });

  it('GET /api/stations/events', async () => {
    const { body } = await get('/api/stations/events');
    expect(body.data.map((e: any) => e.type)).toEqual(['STATUS', 'NEW']);
  });

  it('GET /api/prices/collector-stations : stations ouvertes à interroger', async () => {
    const { body } = await get('/api/prices/collector-stations');
    expect(body.data).toEqual([
      ['6507', '300313', 'rennessupercharger'],
      ['662', '300100', 'rennessupercharger'],
      ['7768', '300200', 'parissupercharger'],
    ]);
  });

  it('routes supprimées ou inconnues : 404 JSON', async () => {
    expect((await post('/api/sync', { superchargers: [{}] })).status).toBe(404);
    expect((await post('/api/superchargers/6507/prices', { date: '2026-10-08', teslaPeak: 1, teslaOffPeak: 1 })).status).toBe(404);
    expect((await get('/api/tesla/proxy-details?locationSlug=rennessupercharger')).status).toBe(404);
    expect((await get('/api/inconnue')).body.error).toMatch(/Route inconnue/);
  });
});

describe('import des tarifs (POST /api/prices/import)', () => {
  it('refuse sans clé, avec une mauvaise clé, ou si aucune clé n’est configurée', async () => {
    expect((await post('/api/prices/import', {}, null)).status).toBe(401);
    expect((await post('/api/prices/import', {}, 'mauvaise')).status).toBe(401);
    process.env.IMPORT_KEY = '';
    expect((await post('/api/prices/import', {})).status).toBe(403);
  });

  it('refuse un relevé mal formé', async () => {
    expect((await post('/api/prices/import', { results: {} })).status).toBe(400);
  });

  it('importe, historise et met à jour l’état de la collecte', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T10:00:00.000Z'));
    try {
      const { status, body } = await post('/api/prices/import', {
        collectedAt: '2026-10-08T08:00:00.000Z',
        abortReason: null,
        results: {
          '6507': { status: 200, data: findUs(0.36, 0.2, 0.53, 0.22) }, // HC 0.16 → 0.20
          '662': { status: 200, data: findUs(0.36, 0.18, 0.53, 0.25) }, // inchangé
          '7768': { status: 403 },
          inconnue: { status: 200, data: findUs(1, 1, 1, 1) },
        },
      });
      expect(status).toBe(200);
      expect(body).toEqual({ success: true, updated: 1, confirmed: 1, skipped: 2 });

      const cleunay = (await get('/api/superchargers/6507')).body;
      expect(cleunay.currentPricing.teslaOffPeak).toBe(0.2);
      expect(cleunay.lastCheckedAt).toBe('2026-10-08');
      expect((await get('/api/superchargers/662')).body.currentPricing.teslaOffPeak).toBe(0.18);
      expect((await get('/api/superchargers/6507/prices')).body.history.at(-1).date).toBe('2026-10-08');

      const collection = (await get('/api/prices/collection-status')).body;
      expect(collection).toMatchObject({
        alertDays: 10,
        staleDays: 14,
        openStations: 3,
        fresh: 2, // les deux stations de Rennes, relevées il y a 4 jours
        aging: 0,
        stale: 1, // Paris : dernier tarif le 2026-09-25, il y a 17 jours
        never: 0,
        lastImport: { source: 'extension', updated: 1, confirmed: 1, skipped: 2, collectedAt: '2026-10-08T08:00:00.000Z' },
      });
      expect(collection.staleStations.map((s: any) => s.id)).toEqual(['7768']);

      // Écrit sur disque : la base rechargée contient l'import
      const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'superchargers_db.json'), 'utf-8'));
      expect(saved.importLog).toHaveLength(1);
      expect(saved.superchargers.find((s: any) => s.id === '6507').lastCheckedAt).toBe('2026-10-08');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("purge de l'historique (POST /api/prices/purge-history)", () => {
  it('exige la clé', async () => {
    expect((await post('/api/prices/purge-history', undefined, null)).status).toBe(401);
  });

  it('garde un relevé par station et sauvegarde la base avant', async () => {
    const { status, body } = await post('/api/prices/purge-history');
    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, stations: 5 });
    expect(fs.existsSync(path.join(dataDir, body.backup))).toBe(true);
    const history = (await get('/api/superchargers/6507/prices')).body.history;
    expect(history).toHaveLength(1);
    expect(history[0].teslaOffPeak).toBe(0.2);
  });
});
