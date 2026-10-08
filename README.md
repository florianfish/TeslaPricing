# ⚡ Tesla Superchargers France — Observatoire & Historique des Prix

Application web complète permettant de visualiser, répertorier, comparer et historiser les tarifs au kWh des stations de Superchargeurs Tesla en France (heures pleines, heures creuses, véhicules Tesla et marques tierces).

---

## 🚀 Fonctionnalités Principales

- **🗺️ Carte Interactive Leaflet** :
  - Visualisation des 330+ stations réparties en France (ouvertes, en construction, en projet).
  - Filtrage par puissance (V2 150kW, V3 250kW, V4), ouverture aux véhicules non-Tesla (CCS) et région.
  - Marqueurs stylisés et popups détaillés avec accès instantané aux tarifs.
  - Bouton « Autour de moi » : position de l'utilisateur et les 5 superchargeurs les plus proches avec leurs tarifs (la position reste dans le navigateur).

- **📋 Répertoire & Recherche Avancée** :
  - Recherche instantanée par ville, nom de station ou code postal.
  - Filtres multicritères (ouvert à tous, puissance mini, statut).
  - Tri par tarif (€/kWh le moins cher), nombre de stèles, puissance, nom ou distance depuis votre position.
  - Recherche et filtres conservés dans l'URL : un lien partagé rouvre la même recherche.

- **📈 Historique & Évolution des Prix** :
  - Graphiques d'évolution des tarifs nationaux depuis 2021 jusqu'à aujourd'hui (crise de l'énergie 2022, baisses successives, tarification dynamique).
  - Comparaison directe : Heures Pleines vs Heures Creuses, Propriétaires Tesla vs Autres Véhicules Électriques.
  - Historique individuel propre à chaque station.

- **🕒 Mises à jour de tarif** :
  - Liste chronologique des derniers changements de prix, station par station, avec l'ancien et le nouveau tarif (HC/HP, Tesla/non-Tesla).
  - Filtres par station/ville/région et par sens (hausses / baisses).
  - État de la collecte : dernier relevé reçu de l'extension (alerte au-delà de 10 jours), ancienneté des tarifs par station et liste des stations à revérifier.

- **🔋 Simulateur de Coût de Recharge** :
  - Estimation du coût d'un plein ou d'un trajet selon la capacité de batterie (kWh) et le niveau de charge initial/cible.
  - Calcul comparatif en direct entre Tesla et véhicules non-Tesla (abonnement ou tarif standard).
  - Économies estimées par rapport à un véhicule thermique équivalent (essence/diesel).

- **📊 Consultation & Fiche Détaillée des Stations** :
  - Modal d'informations complètes par station (adresses, stèles, puissance, frais d'inactivité, graphique Recharts).
  - Tarifs actualisés automatiquement de manière centralisée (automatisation nocturne et synchronisation BDD).
  - Badge de fraîcheur (« Relevé il y a N j ») sur chaque station, dans la liste, la fiche et la carte.
  - Lien direct partageable vers chaque fiche (`#/carte?station=rennessupercharger`) ; le bouton Retour du navigateur referme la fiche.

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

### Backend
- **Node.js** & **Express 5**
- **TSX** (exécution TypeScript native sans build intermédiaire en dev)
- Base de données locale persistante au format JSON (`server/data/superchargers_db.json`)

---

## 📦 Installation et Démarrage

### Prérequis
- [Node.js](https://nodejs.org/) version 24 (`.nvmrc` ; même version que l'image Docker et le workflow nocturne)
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

## 🐳 Déploiement Docker

L'application inclut un `Dockerfile` multi-stage optimisé et une configuration `docker-compose.yml` prête pour la production.

### 1. Démarrer avec Docker Compose
Sur le serveur, lancez simplement :
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
- Votre fichier `superchargers_db.json` contenant les stations et l'historique des prix est stocké directement sur l'hôte.
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

### 5. Actualisation Nocturne Automatique (GitHub Actions)

Le workflow `.github/workflows/update-prices.yml` tourne chaque nuit à 03:00 UTC pour :
1. Récupérer les nouvelles stations et changements de statuts/bornes (supercharge.info). Les tarifs sont collectés séparément, voir ci-dessous.
2. Mettre à jour `server/data/superchargers_db.json`.
3. Commiter et pousser automatiquement les modifications sur le dépôt GitHub.

**Base persistante séparée (`DATA_DIR`, add-on Home Assistant) :** le flux nocturne n'atteint pas cette base. Le serveur synchronise donc lui-même les stations depuis supercharge.info, 30 s après le démarrage puis toutes les 24 h (nouvelles stations, changements de statut, bornes ; les tarifs ne sont jamais modifiés). Activé par défaut dès que `DATA_DIR` est défini ; `STATION_SYNC=1` ou `STATION_SYNC=0` force le choix.
### 6. Collecte des tarifs Tesla depuis le navigateur

L'API Tesla FindUs est protégée par Akamai : les requêtes serveur (GitHub Actions, serveurs, `curl`, Node) sont refusées (`403`), même via une IP résidentielle. Seul un vrai navigateur, depuis une connexion personnelle, obtient les tarifs. (L'API GraphQL de l'app mobile Tesla, testée en octobre 2026, n'est pas bloquée mais ne renvoie aucune donnée hors de l'app.)

**Automatique — extension Chrome (`extension/`)** : à intervalle régulier (7 jours par défaut), l'extension ouvre un onglet `www.tesla.com` en arrière-plan, interroge l'API depuis la page — ou, si Akamai refuse ces requêtes, ouvre directement chaque URL JSON `get-charger-details` dans l'onglet (≈ 30 min avec le délai par défaut de 5 s par requête, réglable de 1 à 30 s ; le mode auto / fetch / JSON se choisit aussi dans les options) et envoie le relevé à l'add-on Home Assistant.

1. Dans l'add-on, renseigner l'option **Clé d'import** et un port direct (onglet **Réseau**), puis redémarrer.
2. Dans Chrome/Edge/Brave : `chrome://extensions` → **Mode développeur** → **Charger l'extension non empaquetée** → dossier `extension/`.
3. Cliquer sur l'icône de l'extension : saisir l'adresse de l'add-on (`http://<ip-home-assistant>:<port>`) et la clé, **Enregistrer**, **Tester la connexion**.

Le navigateur doit être ouvert, depuis une connexion personnelle (pas via le VPN/proxy d'entreprise). Une collecte manquée est rattrapée dans l'heure qui suit l'ouverture du navigateur.

**Manuel — favori** :

1. `npm run collector` génère `collector.html` (favori + extrait console, avec la liste à jour des stations).
2. Ouvrez `collector.html`, glissez le bouton dans vos favoris, puis cliquez dessus sur une page `https://www.tesla.com/fr_FR/findus` (≈ 25 min, 5 s par station).
3. Importez le fichier téléchargé : `npm run import-prices -- tesla-prices-AAAA-MM-JJ.json`, puis commitez `server/data/superchargers_db.json`.


---

## 🏠 Add-on Home Assistant

Le dépôt est aussi un dépôt d'add-ons Home Assistant (`repository.yaml` + dossier `tesla-pricing/`). L'interface s'affiche dans la barre latérale de HA via Ingress.

1. **Paramètres → Modules complémentaires → Boutique → ⋮ → Dépôts**, ajouter `https://github.com/florianfish/TeslaPricing`.
2. Installer **Tesla Pricing** et le démarrer.
3. Optionnel : définir un port d'accès direct dans l'onglet **Réseau** de l'add-on (désactivé par défaut).

Les données sont persistées dans `/data` (variable `DATA_DIR`), donc incluses dans les sauvegardes HA. L'image (`amd64` / `aarch64`) est publiée sur GHCR par `.github/workflows/addon-image.yml` à chaque changement de `version` dans `tesla-pricing/config.yaml`. Voir [tesla-pricing/DOCS.md](tesla-pricing/DOCS.md).

## 📡 Documentation des Endpoints API

| Méthode | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Vérification de l'état du serveur |
| `GET` | `/api/config` | Configuration publique du frontend (`gaMeasurementId` Google Analytics, ou `null`) |
| `GET` | `/api/superchargers` | Liste des stations filtrable (`search`, `status`, `otherEVsOnly`, `minPower`, `region`, `sortBy`, `sortOrder`) |
| `GET` | `/api/superchargers/:slug` | Détails complets d'un superchargeur via son slug (ex: `rennessupercharger`) |
| `GET` | `/api/superchargers/:slug/prices` | Historique complet des relevés de prix d'une station |
| `GET` | `/api/prices/stats` | Statistiques globales nationales (moyennes HP/HC, station la moins chère, etc.) |
| `GET` | `/api/prices/updates?limit=200` | Dernières mises à jour de tarif, avec le relevé précédent de chaque station |
| `GET` | `/api/stations/events?limit=200` | Dernières évolutions de stations (nouvelles stations, changements de statut) |
| `GET` | `/api/prices/collection-status` | État de la collecte : derniers imports, ancienneté des tarifs des stations ouvertes, stations à revérifier |
| `GET` | `/api/prices/collector-stations` | Stations à interroger par le collecteur (`[id, locationId, locationSlug]`) |
| `POST` | `/api/prices/import` | Import d'un relevé du collecteur (en-tête `Authorization: Bearer <clé d'import>`) |
| `POST` | `/api/prices/purge-history` | Purge l'historique des prix : un relevé par station (tarif actuel), sauvegarde préalable (en-tête `Authorization: Bearer <clé d'import>`). En local : `npm run purge-history` |
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
        ├── PriceUpdatesView.tsx     # Onglet « Mises à jour » : derniers changements de tarif par station
        ├── CollectionStatusPanel.tsx# État de la collecte des tarifs (onglet « Mises à jour »)
        └── StationDetailModal.tsx   # Modal de détail & formulaire d'ajout de relevé
```

---

## 📄 Licence
Projet sous licence MIT. Données tarifaires et de localisation fournies à titre informatif.
