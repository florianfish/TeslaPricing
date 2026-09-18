import express from 'express';
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
} from './server/db.js';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

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

  // Sync endpoint - Rechargement de la base depuis le disque et réapplication des contributions locales
  app.post('/api/sync', async (req, res) => {
    try {
      const db = reloadDatabase();

      res.json({
        success: true,
        message: 'Base de données rechargée avec succès',
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serveur démarré sur http://0.0.0.0:${PORT}`);
  });
}

startServer();
