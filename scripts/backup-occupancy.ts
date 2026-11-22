// Sauvegarde hebdomadaire de l'occupation des stations : lit les cumuls sur l'add-on
// (GET /api/occupancy/export, clé d'import) et les écrit dans server/data/occupancy.json, que le
// workflow .github/workflows/backup-occupancy.yml commite. Une instance neuve repart de ce fichier.
//
// Variables : TESLAPRICING_URL, IMPORT_KEY (obligatoires).

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { formatStore, isValidStore } from './lib/occupancy.js';

const BASE_URL = (process.env.TESLAPRICING_URL || '').trim().replace(/\/+$/, '');
const IMPORT_KEY = (process.env.IMPORT_KEY || '').trim();
const OUT = path.join(process.cwd(), 'server', 'data', 'occupancy.json');

async function main() {
  if (!BASE_URL || !IMPORT_KEY) throw new Error('TESLAPRICING_URL et IMPORT_KEY sont obligatoires');

  const res = await fetch(`${BASE_URL}/api/occupancy/export`, {
    headers: { Authorization: `Bearer ${IMPORT_KEY}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Export de l'add-on : HTTP ${res.status}`);
  const store = await res.json();
  // Ne jamais remplacer une sauvegarde par un fichier vide ou inattendu
  if (!isValidStore(store)) throw new Error("Export de l'add-on vide ou invalide : sauvegarde conservée");

  fs.writeFileSync(OUT, formatStore(store));
  const samples = Object.values(store.slots).reduce((sum, s) => sum + s.n.reduce((a, b) => a + b, 0), 0);
  console.log(
    `Occupation sauvegardée : ${Object.keys(store.mapping).length} stations, ${samples} relevés cumulés, dernier relevé ${store.lastSampleAt ?? '—'}.`
  );
}

main().catch((err) => {
  console.error(`[ERREUR] ${err.message || err}`);
  process.exit(1);
});
