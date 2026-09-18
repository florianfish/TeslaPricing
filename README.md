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

- **📝 Enregistrement & Persistance des Prix** :
  - Modal d'informations complètes par station (adresses, stèles, puissance, frais d'inactivité).
  - Formulaire permettant d'ajouter un nouveau relevé de tarif (date, HP/HC, source, notes), immédiatement persisté dans la base locale JSON.

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

### 3. Build & Démarrage en Production
```bash
npm run build
npm run start
```

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
