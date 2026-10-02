import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import type { DatabaseSchema } from './lib/tesla-pricing.js';
import { fetchFrenchSites, applyRegistrySites } from './lib/station-sync.js';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'server', 'data');
const DB_FILE = path.join(DATA_DIR, 'superchargers_db.json');

async function runUpdate() {
  const startTime = Date.now();
  console.log('\n================================================================');
  console.log('⚡ ACTUALISATION DE LA LISTE DES SUPERCHARGEURS TESLA FRANCE ⚡');
  console.log('================================================================\n');

  const now = new Date();

  if (!fs.existsSync(DB_FILE)) {
    console.error(`[ERREUR FATALE] Fichier de base de données introuvable: ${DB_FILE}`);
    process.exit(1);
  }

  const rawDb = fs.readFileSync(DB_FILE, 'utf-8');
  const db: DatabaseSchema = JSON.parse(rawDb);

  // 1. Actualisation de la liste des stations depuis supercharge.info
  console.log('[SCRAPER] 🌍 Interrogation du registre des stations (supercharge.info)...');
  let liveSites: any[] = [];
  try {
    liveSites = await fetchFrenchSites();
    console.log(`[SCRAPER] ✅ ${liveSites.length} stations françaises répertoriées.`);
  } catch (err: any) {
    console.warn(`[SCRAPER] ⚠️ Avertissement: Registre externe non disponible (${err.message}). Utilisation des données locales.`);
  }

  const result = applyRegistrySites(db, liveSites, now);
  for (const e of result.events) {
    console.log(e.type === 'NEW'
      ? `[NOUVEAU] 🆕 Station ajoutée: ${e.superchargerName} (${e.city}, ${e.to})`
      : `[STATUS] 🔄 ${e.superchargerName} : ${e.from} ➔ ${e.to}`);
  }
  const newStationsCount = result.created;
  const statusChangedCount = result.statusChanged;

  // 2. Sauvegarder la base de données UNIQUEMENT s'il y a des changements réels
  // (les tarifs sont collectés séparément depuis le navigateur : voir scripts/collector.js)
  const hasChanges = newStationsCount > 0 || statusChangedCount > 0 || result.updated > 0;

  if (hasChanges) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    console.log(`\n💾 Modifications enregistrées dans la base (${newStationsCount} stations créées, ${statusChangedCount} statuts modifiés, ${result.updated} stations mises à jour).`);
  } else {
    console.log('\nℹ️ Aucun changement de station détecté : base de données inchangée (aucun commit requis).');
  }

  const durationSec = Math.round((Date.now() - startTime) / 1000);

  console.log('\n================================================================');
  console.log('🏁 BILAN DE L\'ACTUALISATION NOCTURNE');
  console.log('================================================================');
  console.log(`• Total des stations en base       : ${db.superchargers.length}`);
  console.log(`• Nouvelles stations créées        : ${newStationsCount}`);
  console.log(`• Changements de statut            : ${statusChangedCount}`);
  console.log(`• Horodatage de synchronisation    : ${db.lastSyncTime}`);
  console.log(`• Durée totale du traitement       : ${durationSec} secondes`);
  console.log('================================================================\n');
}

// Exécution directe du script
runUpdate().catch((err) => {
  console.error('[ERREUR CRITIQUE DANS L\'ACTUALISATION]', err);
  process.exit(1);
});
