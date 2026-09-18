# 🤖 AGENTS.md — Directives & Guide Technique pour Agents IA

Ce document contient les informations d'architecture, règles techniques, pièges connus et instructions opérationnelles pour tout agent IA (ou développeur) intervenant sur le dépôt **TeslaPricing**.

---

## 🎯 1. Vision et Périmètre du Projet

- **Objectif** : Observatoire complet des stations Tesla Supercharger en France (plus de 330 stations répertoriées).
- **Fonctionnalités clés** :
  1. Suivi et historisation précise des tarifs en €/kWh (Heures Pleines / Heures Creuses, propriétaires Tesla vs marques tierces).
  2. Cartographie interactive avec Leaflet (statuts Ouvert/Travaux/Projet, V2/V3/V4, compatibilité CCS).
  3. Répertoire de recherche avec filtres avancés et tris instantanés.
  4. Visualisation des tendances macro-économiques (graphiques Recharts depuis 2021).
  5. Simulateur de coût de recharge paramétrable.
  6. Enregistrement persistant de nouveaux relevés communautaires dans une base locale JSON.

---

## 🏗️ 2. Architecture Technique

Le projet adopte une architecture full-stack unifiée servie par un unique processus Node.js :

```
                        +----------------------------+
                        |       server.ts            |
                        | (Express + TSX runner)     |
                        +--------------+-------------+
                                       |
                +----------------------+----------------------+
                |                                             |
                v                                             v
        [API Routes /api/*]                       [Vite Middleware SPA]
                |                                             |
                v                                             v
        [server/db.ts]                            [React 19 + Tailwind v4]
                |                                             |
        [superchargers_db.json]                     [Leaflet + Recharts]
```

### A. Serveur (`server.ts`)
- Utilise **Express** avec le middleware Vite en mode développement (`createViteServer({ server: { middlewareMode: true }, appType: 'spa' })`).
- En production (`NODE_ENV=production`), sert le dossier statique `dist/` pré-construit.
- Port par défaut : `3000` (écoute sur `0.0.0.0`).

### B. Couche Données (`server/db.ts`)
- **Pas d'ORM lourd** : La persistance repose sur `server/data/superchargers_db.json` (~3.2 Mo).
- Les données sont chargées en mémoire via un singleton `dbInstance` lors du premier appel à `initDatabase()`.
- Chaque écriture (par ex. `addPriceSnapshot()`) modifie l'instance en mémoire et déclenche une sérialisation synchrone atomique via `fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))`.
- Seed d'origine : `server/data/france_sites_raw.json`.

### C. Frontend (`src/`)
- Entrée : `src/main.tsx` montant `src/App.tsx`.
- Gestion des onglets : Vue simple par état React (`activeTab: 'map' | 'list' | 'stats' | 'simulator'`).
- Style : **Tailwind CSS v4** via `@tailwindcss/vite` (imports dans `src/index.css`).
- Graphiques : **Recharts** (nécessite `react-is`).
- Carte : **Leaflet** avec tuiles CartoDB Dark/Light adaptées à la charte sombre.

---

## ⚠️ 3. Gotchas & Pièges Fréquents (Important pour Agents)

1. **Installation des Dépendances** :
   - ⚠️ Toujours exécuter `npm install --legacy-peer-deps` (ou `npm i --legacy-peer-deps`).
   - Raison : Conflit de version optionnelle de peer dependency entre `vite@8.3.0`, `esbuild` et `tsx`.
2. **Dépendance Recharts & `react-is`** :
   - `recharts` requiert `react-is` au runtime dans le bundler Vite. Ne jamais supprimer `react-is` du `package.json`.
3. **Vite Config `__dirname`** :
   - Vite 8 recommande `import.meta.dirname` au lieu de `__dirname` dans `vite.config.ts`.
4. **Persistance JSON & Sauvegarde** :
   - Ne pas corrompre `server/data/superchargers_db.json`. Si une migration de schéma est requise, s'assurer d'écrire un script de migration propre dans `server/` ou faire une copie de sauvegarde préalable.
5. **Slug et Clé Unique des Superchargeurs** :
   - Le champ `locationSlug` (ex: `rennessupercharger`, `charollessupercharger`) sert d'identifiant stable dans les routes REST (`/api/superchargers/:slug`). Toujours normaliser en minuscules.
6. **Gestion des dev servers par agents** :
   - La commande `npm run dev` lance `tsx server.ts` qui est un processus daemon bloquant. Toujours utiliser l'option `IsDaemon: true` lors de son lancement via l'outil d'exécution de commandes.

---

## 📋 4. Guide des Typages Principaux (`src/types.ts`)

Pour toute modification ou extension de données, respecter scrupuleusement ces interfaces :

- `Supercharger` :
  - `id`: string
  - `locationSlug`: string (clé d'URL et de recherche)
  - `name`: string
  - `status`: `'OPEN' | 'CONSTRUCTION' | 'PLAN'`
  - `powerKw`: number (150, 250, 300, etc.)
  - `stallCount`: number
  - `otherEVs`: boolean (vrai si accessible aux non-Tesla)
  - `currentPricing`: `SuperchargerPricing`
  - `priceHistory`: `PriceSnapshot[]`

- `SuperchargerPricing` :
  - `teslaPeak`: number (€/kWh, ex: `0.36`)
  - `teslaOffPeak`: number (€/kWh, ex: `0.30`)
  - `nonTeslaPeak`: number
  - `nonTeslaOffPeak`: number
  - `peakHours`: string (ex: `"16:00 - 20:00"`)
  - `idleFeeStandard`: number (ex: `0.50`)
  - `idleFeeCongested`: number (ex: `1.00`)
  - `lastUpdated`: string (ISO)

- `PriceSnapshot` :
  - `id`: string
  - `superchargerId`: string
  - `date`: string (`YYYY-MM-DD`)
  - `changePercentage`: number

---

## 🛠️ 5. Procédures et Workflows Courants

### Ajouter un nouvel Endpoint API
1. Déclarer la logique métier dans `server/db.ts`.
2. Déclarer la route dans `server.ts` sous le bloc `// --- API ROUTES ---`.
3. Mettre à jour les types partagés dans `src/types.ts` si un nouveau payload est introduit.
4. Mettre à jour le tableau des routes dans `README.md`.

### Ajouter une nouvelle Vue ou Composant UI
1. Créer le composant dans `src/components/MonNouveauComposant.tsx`.
2. Respecter la charte graphique : fond sombre `bg-slate-950`, bordures `border-slate-800`, accents `red-500` / `red-600`, typographie moderne `font-['Plus_Jakarta_Sans',sans-serif]`.
3. Connecter la vue dans `src/App.tsx` en ajoutant le type d'onglet et le rendu conditionnel.

### Valider les Changements
Avant de conclure toute tâche :
```bash
# Vérification du typage TypeScript
npm run lint

# Vérification de l'intégrité de l'API (PowerShell)
Invoke-RestMethod -Uri http://localhost:3000/api/health
Invoke-RestMethod -Uri http://localhost:3000/api/prices/stats
```
