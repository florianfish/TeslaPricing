import express from 'express';
import crypto from 'crypto';
import {
  getAllSuperchargers,
  getSuperchargerBySlug,
  getPriceHistoryForCharger,
  getStats,
  getImportKey,
  getGaMeasurementId,
  getCollectorStations,
  importCollectedPrices,
  purgeHistory,
  getRecentPriceUpdates,
  getStationEvents,
  getCollectionStatus,
  getPublicUrl,
  getAndroidCertFingerprints,
} from './db.js';
import { homePage, stationPage, renderPage, robotsTxt, sitemapXml } from './seo.js';
import { parseStationPagePath, stationPagePath } from '../src/stationPage.js';
import { getMyCharges, isMyChargesConfigured, isPrivateRequest } from './my-charges.js';
import type { Supercharger } from '../src/types.js';
import { exportOccupancyStore, getOccupancy, getOccupancyIntervalMin, getOccupancyNow, getOccupancyStatus } from './occupancy.js';

export interface AppOptions {
  // Gabarit HTML de l'application (index.html, transformé par Vite en développement) :
  // active l'accueil et les pages station rendues côté serveur
  indexHtml?: (url: string) => Promise<string>;
}

// Application Express avec les routes de l'API, sans frontend ni écoute réseau (testable en mémoire).
// Le frontend (Vite ou dist/) et le démarrage sont ajoutés par server.ts.
// Station sans ses grilles complètes (ni la sienne, ni celles de son historique)
function withoutPricebooks(s: Supercharger): Supercharger {
  const { pricebooks: _grid, ...rest } = s;
  return {
    ...rest,
    priceHistory: s.priceHistory?.map(({ pricebooks: _p, ...snap }) => snap),
  };
}

export function createApp({ indexHtml }: AppOptions = {}) {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // --- API ROUTES ---

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Configuration publique du frontend (Google Analytics)
  app.get('/api/config', (req, res) => {
    res.json({
      gaMeasurementId: getGaMeasurementId() || null,
      // Onglet « Mes recharges » : configuré, et seulement via Home Assistant (jamais sur l'adresse publique)
      myCharges: isMyChargesConfigured() && isPrivateRequest(req),
      // Onglet « Affluence » : relevé de l'occupation actif
      occupancy: getOccupancyIntervalMin() > 0,
    });
  });

  // Mes recharges au Superchargeur (TeslaMate API) comparées aux tarifs relevés : données personnelles
  app.get('/api/my-charges', async (req, res) => {
    if (!isPrivateRequest(req)) {
      return res.status(403).json({ error: 'Accessible uniquement depuis Home Assistant' });
    }
    if (!isMyChargesConfigured()) return res.json({ enabled: false });
    try {
      res.set('Cache-Control', 'private, no-store');
      res.json({ enabled: true, ...(await getMyCharges()) });
    } catch (err: any) {
      res.status(502).json({ enabled: true, error: err.message });
    }
  });

  // Get all superchargers with filtering & sorting
  app.get('/api/superchargers', (req, res) => {
    try {
      const {
        search,
        status,
        otherEVsOnly,
        minPower,
        region,
        sortBy,
        sortOrder,
      } = req.query;

      const results = getAllSuperchargers({
        search: search as string,
        status: status as string,
        otherEVsOnly: otherEVsOnly === 'true',
        minPower: minPower ? Number(minPower) : undefined,
        region: region as string,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
      });

      // Grilles complètes (≈ 2 Ko par station) : seulement sur demande, la liste reste légère.
      // La fiche station les lit via /api/superchargers/:id, le relevé via ?pricebooks=1.
      const withPricebooks = req.query.pricebooks === '1';
      res.json({
        total: results.length,
        data: withPricebooks ? results : results.map(withoutPricebooks),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get stats and price analytics
  app.get('/api/prices/stats', (req, res) => {
    try {
      const stats = getStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get single supercharger by slug
  app.get('/api/superchargers/:slug', (req, res) => {
    try {
      const { slug } = req.params;
      const charger = getSuperchargerBySlug(slug);

      if (!charger) {
        return res.status(404).json({ error: `Superchargeur '${slug}' non trouvé` });
      }

      res.json(charger);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get price history for a single supercharger
  app.get('/api/superchargers/:slug/prices', (req, res) => {
    try {
      const { slug } = req.params;
      const history = getPriceHistoryForCharger(slug);
      res.json({ locationSlug: slug, history });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Relevé de l'occupation : état (tableau de bord de la collecte) et toutes les stations en ce moment
  app.get('/api/occupancy/status', (req, res) => {
    try {
      res.json(getOccupancyStatus());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Export des cumuls pour la sauvegarde hebdomadaire sur GitHub (clé d'import exigée)
  app.get('/api/occupancy/export', (req, res) => {
    if (!checkImportKey(req, res)) return;
    res.set('Cache-Control', 'no-store');
    res.json(exportOccupancyStore());
  });

  app.get('/api/occupancy/now', (req, res) => {
    try {
      res.json(getOccupancyNow());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Occupation de la station (données IRVE) : en ce moment et moyenne par jour × heure
  app.get('/api/superchargers/:slug/occupancy', (req, res) => {
    try {
      const charger = getSuperchargerBySlug(req.params.slug);
      if (!charger) return res.status(404).json({ error: `Superchargeur '${req.params.slug}' non trouvé` });
      res.json(getOccupancy(charger.id));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Dernières mises à jour de tarif (relevé + relevé précédent de la station)
  app.get('/api/prices/updates', (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000);
      res.json({ data: getRecentPriceUpdates(limit) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Dernières évolutions de stations (nouvelles stations, changements de statut)
  app.get('/api/stations/events', (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000);
    res.json({ data: getStationEvents(limit) });
  });

  // Stations à interroger par le collecteur de tarifs (extension navigateur)
  app.get('/api/prices/collector-stations', (req, res) => {
    res.json({ data: getCollectorStations() });
  });

  // Routes d'administration protégées par la clé d'import (Authorization: Bearer <clé>)
  const checkImportKey = (req: express.Request, res: express.Response): boolean => {
    const key = getImportKey();
    if (!key) {
      res.status(403).json({ error: "Import désactivé : définir la clé d'import (option import_key ou IMPORT_KEY)" });
      return false;
    }
    const given = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    const expected = Buffer.from(key);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      res.status(401).json({ error: "Clé d'import invalide" });
      return false;
    }
    return true;
  };

  // Import d'un relevé du collecteur
  app.post('/api/prices/import', (req, res) => {
    if (!checkImportKey(req, res)) return;
    try {
      const counts = importCollectedPrices(req.body);
      console.log(`Relevé du collecteur importé (${req.body.collectedAt}) :`, counts);
      res.json({ success: true, ...counts });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // État de la collecte des tarifs : derniers imports et fraîcheur des relevés
  app.get('/api/prices/collection-status', (req, res) => {
    try {
      res.json(getCollectionStatus());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Purge de l'historique des prix : un relevé par station (tarif actuel), sauvegarde préalable dans le dossier de données
  app.post('/api/prices/purge-history', (req, res) => {
    if (!checkImportKey(req, res)) return;
    try {
      const result = purgeHistory();
      console.log('Historique des prix purgé :', result);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- RÉFÉRENCEMENT ---

  // Appli Android (TWA, dossier android/) : lien vérifié entre l'appli et le site, sans lequel Android
  // affiche une barre d'adresse en haut de l'appli. Paquets release et debug (suffixe .debug).
  app.get('/.well-known/assetlinks.json', (req, res) => {
    const fingerprints = getAndroidCertFingerprints();
    if (!fingerprints.length) {
      return res.status(404).json({ error: "Aucune empreinte de clé Android configurée (option android_cert_sha256)" });
    }
    res.json(
      ['fr.florian.teslapricing', 'fr.florian.teslapricing.debug'].map((pkg) => ({
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: fingerprints },
      }))
    );
  });

  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(robotsTxt(getPublicUrl()));
  });

  app.get('/sitemap.xml', (req, res) => {
    const publicUrl = getPublicUrl();
    if (!publicUrl) return res.status(404).type('text/plain').send('Aucune URL publique configurée (PUBLIC_URL)');
    res.type('application/xml').send(sitemapXml(getAllSuperchargers(), publicUrl));
  });

  if (indexHtml) {
    const sendPage = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      try {
        const publicUrl = getPublicUrl();
        const stationId = parseStationPagePath(req.path);
        const station = stationId ? getSuperchargerBySlug(stationId) : undefined;
        if (station && req.path !== `/${stationPagePath(station)}`) {
          // Nom de station modifié depuis la création du lien : redirection vers l'adresse actuelle
          return res.redirect(301, `./${stationPagePath(station)}`);
        }
        const page = station ? stationPage(station, publicUrl) : homePage(getAllSuperchargers(), publicUrl);
        res.status(stationId && !station ? 404 : 200).type('html').send(renderPage(await indexHtml(req.originalUrl), page, publicUrl));
      } catch (err) {
        next(err);
      }
    };
    app.get('/', sendPage);
    app.get('/index.html', sendPage);
    app.get(/^\/superchargeur-[a-z0-9-]+$/, sendPage);
  }

  // Route d'API inconnue : 404 JSON plutôt que la page de l'application (repli SPA ajouté ensuite)
  app.use('/api', (req, res) => {
    res.status(404).json({ error: `Route inconnue : ${req.method} ${req.originalUrl}` });
  });

  return app;
}
