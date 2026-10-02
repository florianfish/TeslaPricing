import express from 'express';
import crypto from 'crypto';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  initDatabase,
  reloadDatabase,
  getAllSuperchargers,
  getSuperchargerBySlug,
  getPriceHistoryForCharger,
  addPriceSnapshot,
  getStats,
  saveDatabase,
  getImportKey,
  getCollectorStations,
  importCollectedPrices,
  purgeHistory,
  getRecentPriceUpdates,
  getStationEvents,
  syncStationsFromRegistry,
  STATION_SYNC_ENABLED,
} from './server/db.js';

const STATION_SYNC_INTERVAL_MS = 24 * 3600 * 1000;

async function runStationSync() {
  try {
    const r = await syncStationsFromRegistry();
    console.log(`Stations synchronisées (supercharge.info) : ${r.created} nouvelle(s), ${r.statusChanged} statut(s) modifié(s), ${r.updated} mise(s) à jour.`);
  } catch (err: any) {
    console.warn(`Synchronisation des stations impossible : ${err.message}`);
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

  // Add new price snapshot to database
  app.post('/api/superchargers/:slug/prices', (req, res) => {
    try {
      const { slug } = req.params;
      const {
        date,
        teslaPeak,
        teslaOffPeak,
        nonTeslaPeak,
        nonTeslaOffPeak,
        peakHours,
        notes,
        source,
      } = req.body;

      if (!date || !teslaPeak || !teslaOffPeak) {
        return res.status(400).json({
          error: 'Champs obligatoires manquants: date, teslaPeak, teslaOffPeak',
        });
      }

      const result = addPriceSnapshot({
        locationSlug: slug,
        date,
        teslaPeak: Number(teslaPeak),
        teslaOffPeak: Number(teslaOffPeak),
        nonTeslaPeak: nonTeslaPeak ? Number(nonTeslaPeak) : Number((Number(teslaPeak) * 1.3).toFixed(2)),
        nonTeslaOffPeak: nonTeslaOffPeak ? Number(nonTeslaOffPeak) : Number((Number(teslaOffPeak) * 1.3).toFixed(2)),
        peakHours,
        notes,
        source,
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.status(201).json({
        message: 'Relevé de prix enregistré avec succès en base de données',
        snapshot: result.snapshot,
      });
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

  // Sync endpoint - Rechargement ou mise à jour directe depuis le webhook GitHub Actions
  app.post('/api/sync', async (req, res) => {
    try {
      // Si GitHub Actions transmet la nouvelle base dans le corps de la requête
      if (req.body && Array.isArray(req.body.superchargers) && req.body.superchargers.length > 0) {
        saveDatabase(req.body);
      }

      const db = reloadDatabase();

      res.json({
        success: true,
        message: 'Base de données synchronisée et rechargée avec succès',
        totalStations: db.superchargers.length,
        lastSyncTime: db.lastSyncTime,
        stats: getStats(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Proxy / Direct Inspector for Tesla API get-charger-details
  app.get('/api/tesla/proxy-details', async (req, res) => {
    const slug = (req.query.locationSlug as string) || 'rennessupercharger';
    const teslaUrl = `https://www.tesla.com/api/findus/get-charger-details?locationSlug=${encodeURIComponent(slug)}&programType=supercharger&locale=fr-FR&isInHkMoTw=false`;

    const localStation = getSuperchargerBySlug(slug);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);

      const response = await fetch(teslaUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'fr-FR,fr;q=0.9',
          'Referer': `https://www.tesla.com/fr_FR/findus/location/supercharger/${slug}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        return res.json({
          source: 'TESLA_LIVE_API',
          teslaUrl,
          data,
        });
      }
    } catch (fetchErr) {
      // Akamai / Bot protection blocked datacenter IP, fallback to local DB representation
    }

    // Fallback format matching Tesla details structure + DB enhanced data
    return res.json({
      source: 'LOCAL_DATABASE_MIRROR',
      notice: 'L\'API directe de Tesla bloque les adresses IP hébergées via Akamai Edge. Les données sont servies fidèlement depuis votre base de données persistante.',
      teslaUrl,
      locationSlug: slug,
      data: localStation || {
        locationSlug: slug,
        name: 'Superchargeur non trouvé dans la base',
      },
    });
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
    app.get('*', (req, res) => {
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
}

startServer();
