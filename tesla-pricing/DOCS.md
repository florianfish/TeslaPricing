# Tesla Pricing

Observatoire des Superchargeurs Tesla en France : carte interactive, tarifs HP/HC, historique et simulateur de coût.

## Installation

1. **Paramètres → Modules complémentaires → Boutique → ⋮ → Dépôts**, ajouter `https://github.com/florianfish/TeslaPricing`.
2. Installer **Tesla Pricing**, puis le démarrer.
3. Cocher **Afficher dans la barre latérale** pour y accéder directement.

## Configuration

### Port d'accès direct

Par défaut, l'interface n'est accessible que via la barre latérale de Home Assistant (Ingress, authentifié par HA).

Pour y accéder aussi directement (`http://<ip-home-assistant>:<port>`), renseigner un port dans l'onglet **Réseau** de l'add-on, puis redémarrer. Laisser le champ vide pour désactiver cet accès.

> L'accès direct n'est pas authentifié : ne l'exposez pas sur Internet.

### Clé d'import

Les tarifs Tesla sont collectés chaque semaine par un workflow GitHub Actions qui passe par Bright Data et les envoie à l'add-on à son adresse publique (voir la section « Collecte des tarifs Tesla » du README), ou en secours par l'extension Chrome « Collecteur Tesla Pricing » (dossier `extension/` du dépôt) via le port direct. Renseigner une clé (au moins 20 caractères aléatoires) dans l'option **Clé d'import**, puis la même clé dans le secret GitHub `IMPORT_KEY` et/ou dans l'extension. Laisser vide pour désactiver l'import.

### Mes recharges (TeslaMate / MyTeslaMate)

Renseigner l'**Adresse de TeslaMate API** et ses accès pour ajouter l'onglet **Mes recharges** :

- **MyTeslaMate** (`https://abcd.api.myteslamate.com`) : le **mot de passe** suffit, l'identifiant est le sous-domaine (`abcd`) ; le renseigner seulement s'il est différent ;
- autre instance protégée par **identifiant et mot de passe** : renseigner les deux ;
- TeslaMate API auto-hébergée avec **jeton** : laisser l'identifiant vide et mettre le jeton dans « Mot de passe ou jeton ».

L'onglet liste vos sessions payantes au Superchargeur et compare, pour chacune :

- le montant facturé par Tesla au tarif relevé pour la station à cette date, au créneau du début de la session ;
- l'écart, et ce qu'aurait coûté la même énergie en heures creuses.

Les sessions sont rattachées aux stations par leur position (moins de 300 m). Deux sessions consécutives au même coût (TeslaMate reporte parfois la même facture sur chacune) sont regroupées.

Ce sont des données personnelles (lieux, dates, montants) : l'onglet et la route `/api/my-charges` ne répondent que via la barre latérale de Home Assistant (Ingress) ou avec la clé d'import, **jamais** sur l'adresse publique du site. Elles ne sont pas mises en cache par l'application installée.

### Occupation des stations

L'add-on relève toutes les 15 minutes l'état des bornes Tesla publié en open data (base nationale IRVE de transport.data.gouv.fr : ≈ 1,7 Mo compressé par relevé, soit ≈ 160 Mo par jour). La fiche de chaque station affiche alors son **affluence** : bornes occupées en ce moment, moyenne par jour et par heure, et la **meilleure heure** d'ici ce soir. La grille se remplit au fil des semaines.

Les stations sont rapprochées des données publiques par leur position, une fois par semaine (fichier statique de ≈ 130 Mo). Données conservées dans `/data/occupancy.json`.

L'onglet **Affluence** montre toutes les stations en ce moment (les plus chargées, les plus calmes, celles plus chargées que d'habitude). L'onglet **Mises à jour** indique l'état du relevé : dernier relevé, stations suivies, remplissage de la carte d'affluence, et une alerte si le relevé est en retard ou en échec.

Régler l'intervalle avec l'option **Occupation des stations (minutes)**, ou `0` pour désactiver.

### Google Analytics

Pour suivre la fréquentation de l'interface, renseigner l'ID de mesure Google Analytics 4 (`G-XXXXXXXXXX`, visible dans **Admin → Flux de données** de la propriété GA4) dans l'option **ID de mesure Google Analytics**, puis redémarrer l'add-on. Une page vue est envoyée à chaque onglet consulté. Laisser vide pour désactiver le suivi (aucun script Google n'est alors chargé).

Un bandeau demande le consentement de chaque visiteur : Google Analytics n'est chargé qu'après acceptation. Le choix est mémorisé dans le navigateur et modifiable via le lien **Cookies** en pied de page (un refus ultérieur supprime les cookies `_ga`).

### URL publique (référencement)

Si l'interface est exposée sur Internet derrière un reverse proxy (domaine en HTTPS), renseigner son adresse dans l'option **URL publique** (ex. `https://suc.exemple.fr`), puis redémarrer l'add-on. Le site devient alors indexable par les moteurs de recherche :

- une page par station (`/superchargeur-abbeville-9655`), avec titre, description, tarifs et données structurées lisibles sans JavaScript ;
- `robots.txt` et `sitemap.xml` (à déclarer dans Google Search Console) ;
- URL canonique et image d'aperçu pour les partages de liens.

Laisser vide pour une instance privée : `robots.txt` interdit alors toute indexation.

## Données

La base (`superchargers_db.json`) est stockée dans le dossier persistant de l'add-on (`/data`). Elle est conservée lors des mises à jour et incluse dans les sauvegardes Home Assistant.

Au premier démarrage, la base livrée avec la version installée est copiée dans `/data`. Les mises à jour de l'add-on n'écrasent pas une base existante.

La liste des stations (nouvelles stations, passages de « En travaux » à « Ouverte », nombre de bornes) est synchronisée depuis supercharge.info au démarrage puis chaque jour, sans toucher aux tarifs. Les évolutions apparaissent dans l'onglet « Mises à jour ».

### Purger l'historique des prix

Pour repartir d'un historique propre (un seul relevé par station, son tarif actuel), appeler depuis le réseau local :

```bash
curl -X POST -H "Authorization: Bearer <clé d'import>" http://<ip-home-assistant>:<port>/api/prices/purge-history
```

Une sauvegarde `superchargers_db.backup-<date>.json` est créée dans `/data` avant la purge. La courbe nationale depuis 2021 est conservée.
