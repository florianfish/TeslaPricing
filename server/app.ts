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
} from './db.js';

// Application Express avec les routes de l'API, sans frontend ni écoute réseau (testable en mémoire).
// Le frontend (Vite ou dist/) et le démarrage sont ajoutés par server.ts.
export function createApp() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // --- API ROUTES ---

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Configuration publique du frontend (Google Analytics)
  app.get('/api/config', (req, res) => {
    res.json({ gaMeasurementId: getGaMeasurementId() || null });
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

      res.json({
        total: results.length,
        data: results,
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

  // Route d'API inconnue : 404 JSON plutôt que la page de l'application (repli SPA ajouté ensuite)
  app.use('/api', (req, res) => {
    res.status(404).json({ error: `Route inconnue : ${req.method} ${req.originalUrl}` });
  });

  return app;
}
