// Serveur de production (dist/) sur une copie de la base de test, pour les tests Playwright.
// Prérequis : npm run build
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const root = path.join(import.meta.dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teslapricing-e2e-'));
fs.copyFileSync(path.join(root, 'tests', 'fixtures', 'superchargers_db.json'), path.join(dataDir, 'superchargers_db.json'));

Object.assign(process.env, {
  NODE_ENV: 'production',
  DATA_DIR: dataDir,
  STATION_SYNC: '0',
  PORT: process.env.PORT || '3199',
});
process.chdir(root);
createRequire(import.meta.url)(path.join(root, 'dist', 'server.cjs'));
