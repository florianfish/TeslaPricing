import fs from 'fs';
import os from 'os';
import path from 'path';
import type { DatabaseSchema } from '../scripts/lib/tesla-pricing';

export const FIXTURE_FILE = path.join(import.meta.dirname, 'fixtures', 'superchargers_db.json');

// Base de test : 5 stations (2 à Rennes partageant le slug « rennessupercharger », Paris, une en travaux, une en projet)
export function loadFixture(): DatabaseSchema {
  return JSON.parse(fs.readFileSync(FIXTURE_FILE, 'utf-8'));
}

// Dossier de données temporaire contenant une copie de la base de test
export function makeDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teslapricing-test-'));
  fs.copyFileSync(FIXTURE_FILE, path.join(dir, 'superchargers_db.json'));
  return dir;
}
