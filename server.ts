import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  initDatabase,
  getImportKey,
  syncStationsFromRegistry,
  STATION_SYNC_ENABLED,
  getCollectionStatus,
} from './server/db.js';
import { createApp } from './server/app.js';
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
  const PORT = Number(process.env.PORT) || 3000;

  // Initialize database
  try {
    initDatabase();
    console.log('Superchargers database successfully initialized.');
  } catch (e) {
    console.error('Database initialization error:', e);
  }

  // --- API ROUTES --- (server/app.ts)
  const app = createApp();

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
