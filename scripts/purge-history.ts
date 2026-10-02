// Purge l'historique des prix de la base (DATA_DIR ou server/data) : un relevé par station, tarif actuel conservé.
// Une sauvegarde superchargers_db.backup-<date>.json est créée à côté de la base.
//
// Usage : npm run purge-history
import 'dotenv/config';
import { purgeHistory } from '../server/db.js';

const { stations, removed, backup } = purgeHistory();
console.log(`🧹 Historique purgé : ${removed} relevé(s) supprimé(s), ${stations} station(s) conservée(s) avec leur tarif actuel.`);
console.log(`💾 Sauvegarde : ${backup}`);
