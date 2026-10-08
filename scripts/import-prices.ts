// Importe un fichier tesla-prices-AAAA-MM-JJ.json produit par le collecteur
// navigateur (scripts/collector.js) dans server/data/superchargers_db.json.
//
// Usage : npm run import-prices -- <fichier.json>
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { applyTeslaData, type DatabaseSchema } from './lib/tesla-pricing.js';

interface CollectorFile {
  collectedAt: string;
  abortReason: string | null;
  counts: Record<string, number>;
  results: Record<string, { status: number; data?: any; error?: string }>;
}

const DB_FILE = path.join(process.env.DATA_DIR || path.join(process.cwd(), 'server', 'data'), 'superchargers_db.json');

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));

  if (!file || !fs.existsSync(file)) {
    console.error('Usage : npm run import-prices -- <tesla-prices-AAAA-MM-JJ.json>');
    process.exit(1);
  }

  const collected: CollectorFile = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (!collected.results || !collected.collectedAt) {
    console.error(`❌ ${file} n'est pas un fichier produit par le collecteur.`);
    process.exit(1);
  }

  const db: DatabaseSchema = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  const dateIso = collected.collectedAt.slice(0, 10);

  console.log(`📥 Import du relevé du ${collected.collectedAt} (${Object.keys(collected.results).length} stations)`);
  if (collected.abortReason) console.warn(`⚠️ Collecte interrompue : ${collected.abortReason}`);

  let updated = 0;
  let confirmed = 0;
  let skipped = 0;

  for (const [id, result] of Object.entries(collected.results)) {
    const charger = db.superchargers.find((s) => s.id === id);
    if (!charger) {
      skipped++;
      continue;
    }
    if (result.status !== 200 || !result.data) {
      skipped++;
      continue;
    }

    const { outcome, changePercentage } = applyTeslaData(db, charger, result.data, dateIso);
    if (outcome === 'updated') {
      updated++;
      const p = charger.currentPricing;
      console.log(
        `🎯 ${charger.name} : TSLA ${p.teslaPeak}€/${p.teslaOffPeak}€ | NTSLA ${p.nonTeslaPeak}€/${p.nonTeslaOffPeak}€ ` +
        `(${changePercentage! > 0 ? '+' : ''}${changePercentage}%)`
      );
    } else if (outcome === 'confirmed') {
      confirmed++;
    } else {
      skipped++;
    }
  }

  if (updated > 0) {
    db.lastSyncTime = new Date().toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  }

  console.log('\n================================================================');
  console.log(`• Tarifs modifiés    : ${updated}`);
  console.log(`• Tarifs inchangés   : ${confirmed}`);
  console.log(`• Ignorés (404/403…) : ${skipped}`);
  console.log(updated > 0 ? `💾 Base enregistrée : ${DB_FILE}` : 'ℹ️ Aucun changement : base inchangée.');
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('[ERREUR IMPORT]', err);
  process.exit(1);
});
