# 💡 Features envisageables — TeslaPricing

Inventaire des évolutions possibles, établi le 2026-10-08 à partir de l'état du dépôt (`server.ts`, `server/db.ts`, `src/`, `extension/`, add-on `tesla-pricing/`).

## ✅ Réalisé

- **Nettoyage du gabarit AI Studio** (ex-1.4) : paquet renommé `tesla-pricing`, dépendances inutilisées (`@google/genai`, `undici`, `motion`, `autoprefixer`) et variables `GEMINI_API_KEY` / `APP_URL` retirées.
- **Suppression de `POST /api/sync`** (ex-1.1) : route non protégée et sans appelant.
- **URLs partageables** (ex-2.1) : onglet, recherche, filtres et fiche station dans le fragment d'URL (`src/router.ts`).
- **Autour de moi** (ex-2.3) : 5 stations les plus proches sur la carte, tri par distance dans la liste (`src/geo.ts`).
- **Fraîcheur des données** (ex-3.4) et **tableau de bord de collecte** (ex-6.2) : `lastCheckedAt` par station, journal des imports, `GET /api/prices/collection-status`, panneau dans l'onglet « Mises à jour ».

---

Légende effort : **S** (≤ ½ jour) · **M** (1–3 jours) · **L** (> 3 jours).
Légende valeur : ⭐ à ⭐⭐⭐.

---

## 1. Fondations & sécurité (prérequis recommandés)

Points relevés dans le code qu'il vaut mieux traiter avant d'ouvrir de nouvelles fonctionnalités au public.

| # | Sujet | Constat | Proposition | Effort | Valeur |
|---|---|---|---|---|---|
| 1.2 | Modérer les relevés communautaires | `POST /api/superchargers/:slug/prices` est ouvert, valide peu (pas de bornes de prix, pas de format de date) et invente les tarifs non-Tesla (`× 1.3`). | Validation stricte (0,05–1,50 €/kWh, date ≤ aujourd'hui), rate limiting par IP, statut `pending` + file de modération protégée par clé. | M | ⭐⭐⭐ |
| 1.3 | Retirer le proxy FindUs | `/api/tesla/proxy-details` appelle encore Tesla côté serveur, ce que l'`AGENTS.md` proscrit (bloqué par Akamai). | Le transformer en simple lecture du miroir local, ou le supprimer ; mettre à jour le README. | S | ⭐ |
| 1.5 | Tests automatisés | Aucun test. La logique critique (`tesla-pricing.ts`, `station-sync.ts`, `importCollectedPrices`, `getStats`) est pure ou presque. | Vitest + quelques jeux de données figés ; exécution dans un workflow CI avec `npm run lint`. | M | ⭐⭐ |
| 1.6 | Durcissement HTTP | Pas de compression, ni d'en-têtes de sécurité, ni de cache sur l'API. | `compression`, `helmet`, `Cache-Control` court + `ETag` sur `/api/superchargers` et `/api/prices/stats`. | S | ⭐⭐ |

---

## 2. Expérience utilisateur

| # | Feature | Description | Effort | Valeur |
|---|---|---|---|---|
| 2.2 | **Indicateur « HC / HP maintenant »** | Afficher en temps réel si une station est en heures creuses ou pleines, et dans combien de temps ça bascule (logique déjà présente dans `src/hours.ts`). Colorer les marqueurs de la carte selon le tarif *actuel*. | S | ⭐⭐⭐ |
| 2.4 | Favoris locaux | Épingler ses stations habituelles (stockage navigateur), avec un filtre « Mes stations » et un rappel de leur dernière variation. | S | ⭐⭐ |
| 2.5 | Comparateur de stations | Sélectionner 2–4 stations et superposer leurs historiques et grilles HP/HC. | M | ⭐⭐ |
| 2.6 | PWA | Manifeste + service worker : installation sur mobile, consultation hors-ligne du dernier jeu de données. | M | ⭐⭐ |
| 2.7 | Mode clair & accessibilité | Thème clair optionnel, contrastes vérifiés, navigation clavier dans la modale et le répertoire. | M | ⭐ |
| 2.8 | Version anglaise | i18n FR/EN (les traductions HA existent déjà côté add-on). Utile pour les touristes en transit. | M | ⭐ |

---

## 3. Données & analyses

| # | Feature | Description | Effort | Valeur |
|---|---|---|---|---|
| 3.1 | **Heatmap des prix** | Couche carte colorant les stations (ou les départements) par €/kWh courant ; vue choroplèthe par région. | M | ⭐⭐⭐ |
| 3.2 | Statistiques par région / département | Moyennes, min/max et dispersion par région ; classement des régions les moins chères. Les champs `region` et `department` existent déjà. | S | ⭐⭐ |
| 3.3 | Écart Tesla / non-Tesla | Graphique dédié à l'évolution du surcoût non-Tesla et seuil de rentabilité de l'abonnement Supercharging. | S | ⭐⭐ |
| 3.5 | Plages horaires multiples | `peakHours` est une chaîne libre ; Tesla publie parfois plusieurs plages ou des tarifs par jour de semaine. Structurer le modèle (`{ start, end, days, price }[]`) via un script de migration. | L | ⭐⭐ |
| 3.6 | Export open data | `GET /api/export.csv` et `.json` (stations + historique), licence ouverte, éventuellement publication sur data.gouv.fr. | S | ⭐⭐ |
| 3.7 | Frise des ouvertures | Exploiter `stationEvents` et `dateOpened` : courbe du nombre de stations / stalles ouvertes en France dans le temps, pipeline construction → ouverture. | S | ⭐⭐ |
| 3.8 | Comparaison avec d'autres réseaux | Mettre en regard Ionity, Fastned, Electra, TotalEnergies (sources publiques ou relevés manuels) sur le graphique national. | L | ⭐⭐ |

---

## 4. Alertes & notifications

| # | Feature | Description | Effort | Valeur |
|---|---|---|---|---|
| 4.1 | **Flux RSS / Atom** | `/feed.xml` des changements de tarif et des nouvelles stations (données déjà disponibles via `getRecentPriceUpdates` et `getStationEvents`). Le plus simple des mécanismes d'alerte. | S | ⭐⭐⭐ |
| 4.2 | **Capteurs Home Assistant** | Exposer pour l'add-on des entités (prix courant d'une station favorite, période HC/HP active, moyenne nationale) via l'API Supervisor ou MQTT discovery. Permet des automatisations (« préviens-moi quand ma station passe en HC »). | M | ⭐⭐⭐ |
| 4.3 | Webhooks | Liste d'URLs (Discord, Slack, ntfy.sh) appelées à chaque variation de tarif, configurable dans l'add-on. | S | ⭐⭐ |
| 4.4 | Notifications push web | Avec la PWA (2.6) : abonnement à une station ou à un seuil de prix. Nécessite VAPID + stockage des abonnements. | L | ⭐ |
| 4.5 | Résumé hebdomadaire | Publication automatique (issue GitHub, page « Cette semaine ») des hausses / baisses et nouvelles stations. | S | ⭐ |

---

## 5. Simulateur & planification

| # | Feature | Description | Effort | Valeur |
|---|---|---|---|---|
| 5.1 | **Planificateur de trajet** | Saisir départ / arrivée, autonomie et consommation : proposer les arrêts Supercharger sur l'itinéraire (OSRM public) avec le coût total HP/HC selon l'heure de passage estimée. | L | ⭐⭐⭐ |
| 5.2 | Prix carburant réels | Le simulateur utilise un prix essence figé (`1.85 €/L`, `6.5 L/100`). Brancher l'API open data des prix carburants (prix-carburants.gouv.fr) et laisser l'utilisateur régler la consommation thermique. | S | ⭐⭐ |
| 5.3 | Comparaison avec la recharge à domicile | Ajouter un tarif domicile (Base / HC EDF, Tempo) pour comparer Superchargeur et recharge résidentielle. | S | ⭐⭐ |
| 5.4 | Frais d'inactivité | Simuler le coût d'un dépassement (`idleFeeStandard` / `idleFeeCongested`) selon les minutes passées après la fin de charge. | S | ⭐ |
| 5.5 | Courbe de charge réaliste | Estimer la durée de session avec une courbe de puissance par modèle (V2/V3/V4 et préconditionnement), pas seulement l'énergie. | M | ⭐ |

---

## 6. Collecte des tarifs

Rappel : tout appel serveur à Tesla est bloqué par Akamai ; la collecte passe par l'extension `extension/` ou le favori `scripts/collector.js`.

| # | Feature | Description | Effort | Valeur |
|---|---|---|---|---|
| 6.1 | Collecte incrémentale | Interroger d'abord les stations les plus anciennes ou ayant récemment varié plutôt que les ~330 à chaque passage ; reprendre une collecte interrompue. Réduit les ~30 min et le risque de blocage. | M | ⭐⭐ |
| 6.3 | Extension multi-cibles | Envoyer le même relevé à plusieurs instances (plusieurs add-ons HA) et/ou au dépôt GitHub via un token, pour converger les bases. | M | ⭐⭐ |
| 6.4 | Publication de l'extension | Packaging et publication sur le Chrome Web Store / Firefox Add-ons pour élargir la collecte communautaire (avec un endpoint d'import public modéré, cf. 1.2). | L | ⭐ |
| 6.5 | Détection d'anomalies | Rejeter ou signaler à l'import les variations > X % ou les tarifs hors bornes avant de les historiser. | S | ⭐⭐ |

---

## 7. Plateforme & exploitation

| # | Feature | Description | Effort | Valeur |
|---|---|---|---|---|
| 7.1 | Passage à SQLite | La base JSON est réécrite entièrement à chaque écriture (`writeFileSync`). SQLite (`better-sqlite3`) offrirait écritures atomiques, requêtes historiques et croissance sans limite, avec un script de migration. | L | ⭐⭐ |
| 7.2 | API publique documentée | Spécification OpenAPI + page `/api/docs`, versionnage `/api/v1`, CORS ouvert en lecture seule. | M | ⭐⭐ |
| 7.3 | SEO & partage | Pages pré-rendues par station (titre, description, image Open Graph générée avec le tarif courant), `sitemap.xml`. S'appuie sur les URLs partageables (fragment d'URL : nécessiterait un passage à des chemins hors Ingress). | M | ⭐⭐ |
| 7.4 | Observabilité | Endpoint `/api/metrics` (Prometheus) : nombre de stations, âge du dernier import, latence ; logs structurés. | S | ⭐ |
| 7.5 | Sauvegardes tournantes | Les sauvegardes (`superchargers_db.backup-*.json`) s'accumulent ; conserver les N dernières automatiquement. | S | ⭐ |

---

## 🎯 Proposition de priorisation

1. **Sécurité d'abord** : 1.2, 1.3 — rapide et limite les risques actuels.
2. **Quick wins à forte valeur** : 2.2 (HC/HP maintenant), 4.1 (RSS), 5.2 (prix carburant réels).
3. **Différenciants** : 7.3 (SEO, maintenant que les URLs sont partageables), 3.1 (heatmap), 4.2 (capteurs Home Assistant).
4. **Chantiers de fond** : 1.5 (tests), 7.1 (SQLite), 3.5 (plages horaires structurées), 5.1 (planificateur de trajet).
