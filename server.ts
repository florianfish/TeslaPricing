import express from 'express';
import crypto from 'crypto';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  initDatabase,
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
  syncStationsFromRegistry,
  STATION_SYNC_ENABLED,
  getCollectionStatus,
} from './server/db.js';
import { daysSince } from './src/freshness.js';

const STATION_SYNC_INTERVAL_MS = 24 * 3600 * 1000;

async function runStationSync() {
  try {
    const r = await syncStationsFromRegistry();
    console.log(`Stations synchronisées (supercharge.info) : ${r.created} nouvelle(s), ${r.statusChanged} statut(s) modifié(s), ${r.updated} mise(s) à jour.`);
  } catch (err: any) {
    console.warn(`Synchronisation des stations impossible : ${err.message}`);
  }
}

// Avertit dans le journal (add-on HA) quand l'extension n'a plus envoyé de relevé depuis longtemps
function checkCollection() {
  if (!getImportKey()) return;
  const { lastImport, alertDays } = getCollectionStatus();
  if (!lastImport) {
    console.warn("Collecte des tarifs : aucun relevé reçu de l'extension pour l'instant.");
  } else if (daysSince(lastImport.at) > alertDays) {
    console.warn(`Collecte des tarifs : aucun relevé reçu depuis ${daysSince(lastImport.at)} jours (dernier : ${lastImport.at}).`);
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '15mb' }));

  // Initialize database
  try {
    initDatabase();
    console.log('Superchargers database successfully initialized.');
  } catch (e) {
    console.error('Database initialization error:', e);
  }

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

  // --- VITE MIDDLEWARE ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Sans hôte explicite : IPv4 et IPv6 (le proxy Nginx de Home Assistant joint les add-ons en IPv6)
  app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://0.0.0.0:${PORT}`);
  });

  // Base persistante séparée (add-on Home Assistant) : stations synchronisées par le serveur lui-même
  if (STATION_SYNC_ENABLED) {
    setTimeout(runStationSync, 30000);
    setInterval(runStationSync, STATION_SYNC_INTERVAL_MS);
  }

  checkCollection();
  setInterval(checkCollection, 24 * 3600 * 1000);
}

startServer();
