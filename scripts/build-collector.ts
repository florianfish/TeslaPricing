// Génère collector.html : un favori (bookmarklet) et un extrait pour la console,
// contenant la liste à jour des stations ouvertes, pour collecter les tarifs
// Tesla depuis un vrai navigateur (voir scripts/collector.js).
import fs from 'fs';
import path from 'path';
import type { DatabaseSchema } from './lib/tesla-pricing.js';

const ROOT = process.cwd();
const DB_FILE = path.join(ROOT, 'server', 'data', 'superchargers_db.json');
const TEMPLATE = path.join(ROOT, 'scripts', 'collector.js');
const OUT_FILE = path.join(ROOT, 'collector.html');

const db: DatabaseSchema = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
const stations = db.superchargers
  .filter((s) => s.status === 'OPEN' && (s.locationId || s.locationSlug))
  .map((s) => [s.id, s.locationId || '', s.locationSlug || '']);

const code = fs
  .readFileSync(TEMPLATE, 'utf-8')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n')
  .replace('__STATIONS__', JSON.stringify(stations));

const bookmarklet = 'javascript:' + encodeURIComponent(code);
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const minutes = Math.round((stations.length * 5) / 60);

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Collecteur Tesla</title>
<style>
  body { margin: 0; padding: 32px 16px; background: #020617; color: #e2e8f0; font: 15px/1.6 system-ui, sans-serif; }
  main { max-width: 760px; margin: 0 auto; }
  h1 { color: #f87171; font-size: 22px; }
  a.bm { display: inline-block; padding: 10px 18px; background: #dc2626; color: #fff; border-radius: 10px; font-weight: 600; text-decoration: none; }
  code, textarea { font: 12px ui-monospace, monospace; }
  textarea { width: 100%; height: 140px; background: #0f172a; color: #cbd5e1; border: 1px solid #334155; border-radius: 8px; padding: 8px; box-sizing: border-box; }
  li { margin-bottom: 6px; }
  .muted { color: #94a3b8; }
</style>
</head>
<body>
<main>
  <h1>⚡ Collecteur de tarifs Tesla</h1>
  <p class="muted">${stations.length} stations ouvertes · environ ${minutes} min · généré le ${new Date().toLocaleString('fr-FR')}</p>
  <ol>
    <li>Glissez ce bouton dans la barre de favoris : <a class="bm" href="${escapeHtml(bookmarklet)}">Collecter tarifs Tesla</a></li>
    <li>Depuis <b>chez vous</b> (pas via le VPN/proxy d'entreprise), ouvrez
      <a href="https://www.tesla.com/fr_FR/findus" style="color:#f87171">www.tesla.com/fr_FR/findus</a>.</li>
    <li>Cliquez sur le favori. Laissez l'onglet ouvert jusqu'à la fin : un fichier
      <code>tesla-prices-AAAA-MM-JJ.json</code> est téléchargé.</li>
    <li>Importez-le : <code>npm run import-prices -- ~/Téléchargements/tesla-prices-AAAA-MM-JJ.json</code></li>
  </ol>
  <p class="muted">Si le favori ne se lance pas, copiez ce code dans la console du navigateur (F12 → Console) sur la page tesla.com :</p>
  <textarea readonly onclick="this.select()">${escapeHtml(code)}</textarea>
  <p class="muted">Regénérez cette page (<code>npm run collector</code>) quand de nouvelles stations apparaissent.</p>
</main>
</body>
</html>
`;

fs.writeFileSync(OUT_FILE, html, 'utf-8');
console.log(`✅ ${OUT_FILE} généré (${stations.length} stations, favori de ${Math.round(bookmarklet.length / 1024)} Ko).`);
