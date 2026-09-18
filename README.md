# ⚡ Tesla Superchargers France — Observatoire & Historique des Prix

Application web complète permettant de visualiser, répertorier, comparer et historiser les tarifs au kWh des stations de Superchargeurs Tesla en France (heures pleines, heures creuses, véhicules Tesla et marques tierces).

---

## 🚀 Fonctionnalités Principales

- **🗺️ Carte Interactive Leaflet** :
  - Visualisation des 330+ stations réparties en France (ouvertes, en construction, en projet).
  - Filtrage par puissance (V2 150kW, V3 250kW, V4), ouverture aux véhicules non-Tesla (CCS) et région.
  - Marqueurs stylisés et popups détaillés avec accès instantané aux tarifs.

- **📋 Répertoire & Recherche Avancée** :
  - Recherche instantanée par ville, nom de station ou code postal.
  - Filtres multicritères (ouvert à tous, puissance mini, statut).
  - Tri par tarif (€/kWh le moins cher), nombre de stèles, puissance ou nom.

- **📈 Historique & Évolution des Prix** :
  - Graphiques d'évolution des tarifs nationaux depuis 2021 jusqu'à aujourd'hui (crise de l'énergie 2022, baisses successives, tarification dynamique).
  - Comparaison directe : Heures Pleines vs Heures Creuses, Propriétaires Tesla vs Autres Véhicules Électriques.
  - Historique individuel propre à chaque station.

- **🔋 Simulateur de Coût de Recharge** :
  - Estimation du coût d'un plein ou d'un trajet selon la capacité de batterie (kWh) et le niveau de charge initial/cible.
  - Calcul comparatif en direct entre Tesla et véhicules non-Tesla (abonnement ou tarif standard).
  - Économies estimées par rapport à un véhicule thermique équivalent (essence/diesel).

- **📊 Consultation & Fiche Détaillée des Stations** :
  - Modal d'informations complètes par station (adresses, stèles, puissance, frais d'inactivité, graphique Recharts).
  - Tarifs actualisés automatiquement de manière centralisée (automatisation nocturne et synchronisation BDD).

- **🔄 Proxy API Tesla FindUs** :
  - Route d'interrogation de l'API officielle Tesla FindUs avec basculement automatique (*graceful fallback*) sur le miroir local en cas de blocage IP (Akamai Edge).

---

## 🛠️ Stack Technique

### Frontend
- **React 19** avec **TypeScript**
- **Vite 8** (mode middleware intégré au serveur Express)
- **Tailwind CSS v4** & **Lucide React** (icônes)
- **Leaflet** & **React-Leaflet** (cartographie)
- **Recharts** (visualisation de données graphiques)
- **Framer Motion** (micro-animations fluides)

### Backend
- **Node.js** & **Express**
- **TSX** (exécution TypeScript native sans build intermédiaire en dev)
- Base de données locale persistante au format JSON (`server/data/superchargers_db.json`)

---

## 📦 Installation et Démarrage

### Prérequis
- [Node.js](https://nodejs.org/) version 20+ (testé avec Node v24)
- npm 10+

### 1. Installation des dépendances
En raison des dépendances de pairs entre React 19, Vite 8 et Recharts, installer avec l'option `--legacy-peer-deps` :
```bash
npm install --legacy-peer-deps
```

### 2. Lancement en mode Développement
Démarre simultanément le serveur Express sur le port `3000` et le middleware de développement Vite :
```bash
npm run dev
```

Accéder à l'application dans votre navigateur :
👉 **http://localhost:3000**

### 3. Build & Démarrage en Production (Local)
```bash
npm run build
npm run start
```

---

## 🐳 Déploiement Docker sur VPS (Recommandé)

L'application inclut un `Dockerfile` multi-stage optimisé et une configuration `docker-compose.yml` prête pour la production.

### 1. Démarrer avec Docker Compose
Sur votre VPS, lancez simplement :
```bash
docker compose up -d --build
```

### 2. Gestion et surveillance
```bash
# Vérifier l'état du conteneur et du healthcheck
docker compose ps

# Consulter les logs en temps réel
docker compose logs -f

# Mettre à jour l'application
git pull
docker compose up -d --build

# Arrêter l'application
docker compose down
```

### 3. Persistance des Données
Le volume `./server/data:/app/server/data` garantit que :
- Votre fichier `superchargers_db.json` contenant les stations et l'historique des prix est stocké directement sur votre VPS.
- Tous les nouveaux relevés de tarifs ajoutés via l'interface restent conservés lors des mises à jour et redémarrages du conteneur.

### 4. Configuration d'un Reverse Proxy (Nginx / Caddy)
Pour exposer l'application sur votre domaine avec HTTPS :
- **Port d'écoute interne** : `3000` (redirection vers `http://localhost:3000` ou via réseau Docker).
- **Exemple Caddyfile** :
  ```caddyfile
  tesla-pricing.votre-domaine.com {
      reverse_proxy localhost:3000
  }
  ```
- **Exemple Nginx** :
  ```nginx
  server {
      server_name tesla-pricing.votre-domaine.com;
      location / {
          proxy_pass http://127.0.0.1:3000;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
      }
  }
  ```

### 5. Actualisation Nocturne Automatique (GitHub Actions & Synchronisation VPS)

Le workflow `.github/workflows/update-prices.yml` tourne chaque nuit à 03:00 UTC pour :
1. Récupérer les nouvelles stations et changements de statuts/bornes.
2. Mettre à jour `server/data/superchargers_db.json`.
3. Commiter et pousser automatiquement les modifications sur le dépôt GitHub.

**Synchroniser votre VPS automatiquement chaque nuit :**
Ajoutez une ligne dans la crontab de votre VPS (`crontab -e`) pour récupérer les nouveaux prix et recharger l'application à chaud sans interruption de service :
```bash
# Chaque nuit à 04:00 UTC : pull des nouveaux prix + rechargement en mémoire sans redémarrer le conteneur
0 4 * * * cd /chemin/vers/TeslaPricing && git pull origin main && curl -s -X POST http://localhost:3000/api/sync
```
> [!TIP]
> **Zéro conflit Git** : Les relevés de tarifs saisis par les utilisateurs depuis l'interface web sont isolés dans `server/data/user_contributions.json` (ignoré par Git) et ré-appliqués automatiquement par-dessus la base lors du rechargement. Les `git pull` s'exécutent ainsi sans aucun risque de conflit de fusion !

---

## 📡 Documentation des Endpoints API

| Méthode | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Vérification de l'état du serveur |
| `GET` | `/api/superchargers` | Liste des stations filtrable (`search`, `status`, `otherEVsOnly`, `minPower`, `region`, `sortBy`, `sortOrder`) |
| `GET` | `/api/superchargers/:slug` | Détails complets d'un superchargeur via son slug (ex: `rennessupercharger`) |
| `GET` | `/api/superchargers/:slug/prices` | Historique complet des relevés de prix d'une station |
| `POST` | `/api/superchargers/:slug/prices` | Ajout d'un nouveau relevé de tarif (persisté dans la base JSON) |
| `GET` | `/api/prices/stats` | Statistiques globales nationales (moyennes HP/HC, station la moins chère, etc.) |
| `POST` | `/api/sync` | Met à jour le timestamp de synchronisation de la base |
| `GET` | `/api/tesla/proxy-details?locationSlug=:slug` | Relais vers l'API FindUs Tesla ou renvoi du miroir local |

---

## 📂 Structure du Projet

```text
TeslaPricing/
├── index.html                  # Point d'entrée HTML
├── package.json                # Dépendances et scripts
├── vite.config.ts              # Configuration de Vite & Tailwind CSS
├── tsconfig.json               # Configuration TypeScript
├── server.ts                   # Serveur Express principal (API + Vite middleware)
├── server/
│   ├── db.ts                   # Couche d'accès aux données, filtres et persistance
│   └── data/
│       ├── superchargers_db.json   # Base de données persistante (330+ stations, prix)
│       └── france_sites_raw.json   # Données brutes de référence
└── src/
    ├── main.tsx                # Point d'entrée React
    ├── App.tsx                 # Composant racine & gestion d'état des vues
    ├── index.css               # Feuilles de styles Tailwind
    ├── types.ts                # Typages TypeScript (Supercharger, Pricing, Snapshot...)
    └── components/
        ├── Navbar.tsx               # En-tête, navigation par onglets et KPI rapides
        ├── FranceMap.tsx            # Carte interactive Leaflet
        ├── SuperchargerDirectory.tsx# Répertoire, filtres et cartes de stations
        ├── PriceEvolutionView.tsx   # Graphiques et historique national des prix
        ├── CostSimulator.tsx        # Simulateur interactif de coût de recharge
        └── StationDetailModal.tsx   # Modal de détail & formulaire d'ajout de relevé
```

---

## 📄 Licence
Projet sous licence MIT. Données tarifaires et de localisation fournies à titre informatif.
