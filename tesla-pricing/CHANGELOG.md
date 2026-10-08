# Changelog

## 1.4.5

- Correction : plusieurs stations d'une même ville partageant un identifiant Tesla (Rennes, Marseille, Cagnes-sur-Mer…), la fiche ouverte pouvait être celle d'une autre station, et l'historique des prix mélangeait les deux. Les liens de fiche utilisent désormais l'identifiant unique de la station (`#/carte?station=6507`) ; les anciens liens restent valides.
- Retrait du bouton « Tester API FindUs » de la fiche station et de la route `/api/tesla/proxy-details` (appel à Tesla toujours bloqué depuis un serveur).
- Les routes d'API inconnues répondent 404.
- Tests automatisés (unitaires, API, navigateur) et intégration continue.

## 1.4.4

- Passage à Node.js 24 (image `node:24-alpine`), comme le workflow nocturne.

## 1.4.3

- Suppression des relevés communautaires : route `POST /api/superchargers/:slug/prices` (non protégée) et fichier `user_contributions.json`, le formulaire n'étant plus proposé.

## 1.4.2

- Notes de version consultables dans l'application : clic sur le numéro de version en pied de page.

## 1.4.1

- Mise à jour des dépendances : Express 5, lucide-react 1, esbuild 0.28, dotenv 18 ; retrait des dépendances inutilisées.

## 1.4.0

- Fraîcheur des tarifs : badge « Relevé il y a N j » sur chaque station (liste, fiche, carte), mis à jour à chaque passage du collecteur même si le prix n'a pas changé.
- État de la collecte dans l'onglet « Mises à jour » : dernier relevé reçu de l'extension, alerte au-delà de 10 jours, ancienneté des tarifs et stations à revérifier. Avertissement quotidien dans le journal de l'add-on (`GET /api/prices/collection-status`).
- Liens partageables : onglet, recherche, filtres et fiche station dans l'URL ; le bouton Retour referme la fiche.
- « Autour de moi » : superchargeurs les plus proches sur la carte et tri par distance dans la liste.
- Suppression de la route `POST /api/sync` (non protégée, sans utilisation).

## 1.3.1

- Affichage de la plage d'heures creuses (HC) à côté des heures pleines, dans la fiche station et dans « Liste & recherche ».

## 1.3.0

- Google Analytics 4 facultatif : option `ga_measurement_id` (ou variable `GA_MEASUREMENT_ID`), une page vue par onglet consulté.
- Bandeau de consentement aux cookies : Google Analytics n'est chargé qu'après acceptation ; choix modifiable via le lien « Cookies » en pied de page.

## 1.2.1

- Purge de l'historique des prix (`POST /api/prices/purge-history`, protégé par la clé d'import) : un relevé par station, sauvegarde préalable dans `/data`.

## 1.2.0

- Synchronisation quotidienne des stations depuis supercharge.info (nouvelles stations, changements de statut, bornes), sans toucher aux tarifs.
- Onglet « Mises à jour » : nouvelle section « Évolutions des stations ».
- Retrait du bouton « Synchroniser BDD ».

## 1.1.1

- Nouvel onglet « Mises à jour » : derniers changements de tarif par station, avec l'ancien et le nouveau prix.

## 1.1.0

- Import des tarifs Tesla collectés par l'extension navigateur (`POST /api/prices/import`), protégé par l'option `import_key`.

## 1.0.1

- Écoute en IPv4 et IPv6 : le proxy Nginx de Home Assistant joint les add-ons en IPv6.

## 1.0.0

- Première version de l'add-on : interface intégrée via Ingress, données persistées dans `/data`, port d'accès direct configurable.
