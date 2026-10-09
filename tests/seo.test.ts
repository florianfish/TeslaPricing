import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { makeDataDir } from './helpers';
import { parseStationPagePath, stationPagePath } from '../src/stationPage';

// Référencement : pages rendues côté serveur sur le gabarit index.html et la base de test
const dataDir = makeDataDir();
process.env.DATA_DIR = dataDir;
process.env.STATION_SYNC = '0';

const template = fs.readFileSync(path.join(import.meta.dirname, '..', 'index.html'), 'utf-8');
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { createApp } = await import('../server/app');
  server = createApp({ indexHtml: async () => template }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  process.env.PUBLIC_URL = 'https://suc.exemple.fr/';
});

const get = async (route: string) => {
  const res = await fetch(baseUrl + route, { redirect: 'manual' });
  return { status: res.status, type: res.headers.get('content-type'), location: res.headers.get('location'), text: await res.text() };
};

describe('chemins des pages station', () => {
  it('construit un chemin lisible et unique, relu par son identifiant', () => {
    expect(stationPagePath({ id: '6507', name: 'Rennes, France - Cleunay' })).toBe('superchargeur-rennes-cleunay-6507');
    expect(stationPagePath({ id: '10743', name: 'Alès, France' })).toBe('superchargeur-ales-10743');
    expect(parseStationPagePath('/superchargeur-rennes-cleunay-6507')).toBe('6507');
    expect(parseStationPagePath('/sous/dossier/superchargeur-6507')).toBe('6507');
    expect(parseStationPagePath('/')).toBeNull();
    expect(parseStationPagePath('/superchargeur-rennes')).toBeNull();
  });
});

describe('pages rendues côté serveur', () => {
  it('accueil : titre, canonique, aperçu et liens vers chaque station', async () => {
    const { status, text } = await get('/');
    expect(status).toBe(200);
    expect(text).toContain('<link rel="canonical" href="https://suc.exemple.fr/" />');
    expect(text).toContain('<meta property="og:image" content="https://suc.exemple.fr/og-image.png" />');
    expect(text).toContain('<h1>Superchargeurs Tesla en France');
    expect(text).toContain('href="./superchargeur-rennes-avenue-du-canada-662"');
    expect(text).not.toContain('noindex');
  });

  it('station : titre, description, tarifs et données structurées propres à la station', async () => {
    const { status, text } = await get('/superchargeur-rennes-cleunay-6507');
    expect(status).toBe(200);
    expect(text).toContain('<title>Superchargeur Tesla Rennes - Cleunay : prix au kWh | Superchargeurs France</title>');
    expect(text).toMatch(/<meta name="description" content="Prix du Superchargeur Tesla Rennes - Cleunay \(35000\) : 0,16 €/);
    expect(text).toContain('<link rel="canonical" href="https://suc.exemple.fr/superchargeur-rennes-cleunay-6507" />');
    expect(text).toContain('<h1>Superchargeur Tesla Rennes - Cleunay</h1>');
    const jsonLd = JSON.parse(text.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]);
    expect(jsonLd).toMatchObject({ '@type': 'Place', address: { postalCode: '35000', addressCountry: 'FR' } });
  });

  it('station pas encore ouverte : pas de tarif affiché', async () => {
    const { text } = await get('/superchargeur-ales-10743');
    expect(text).toContain('En travaux');
    expect(text).not.toContain('Tarifs actuels');
  });

  it('redirige un nom périmé vers l’adresse actuelle, 404 pour une station inconnue', async () => {
    const renamed = await get('/superchargeur-ancien-nom-6507');
    expect(renamed.status).toBe(301);
    expect(renamed.location).toBe('./superchargeur-rennes-cleunay-6507');
    expect((await get('/superchargeur-inconnue-424242')).status).toBe(404);
  });

  it('sans URL publique : instance privée, non indexée', async () => {
    process.env.PUBLIC_URL = '';
    const page = await get('/superchargeur-rennes-cleunay-6507');
    expect(page.text).toContain('<meta name="robots" content="noindex" />');
    expect(page.text).not.toContain('rel="canonical"');
    expect((await get('/robots.txt')).text).toBe('User-agent: *\nDisallow: /\n');
    expect((await get('/sitemap.xml')).status).toBe(404);
  });

  it('ignore une URL publique invalide', async () => {
    process.env.PUBLIC_URL = 'suc.exemple.fr';
    expect((await get('/robots.txt')).text).toContain('Disallow: /\n');
  });
});

describe('robots.txt et sitemap', () => {
  it('robots.txt pointe vers le sitemap', async () => {
    const { type, text } = await get('/robots.txt');
    expect(type).toContain('text/plain');
    expect(text).toBe('User-agent: *\nDisallow: /api/\n\nSitemap: https://suc.exemple.fr/sitemap.xml\n');
  });

  it('le sitemap liste l’accueil et chaque station', async () => {
    const { status, type, text } = await get('/sitemap.xml');
    expect(status).toBe(200);
    expect(type).toContain('application/xml');
    const locs = [...text.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toHaveLength(6);
    expect(locs[0]).toBe('https://suc.exemple.fr/');
    expect(locs).toContain('https://suc.exemple.fr/superchargeur-paris-7768');
  });
});
