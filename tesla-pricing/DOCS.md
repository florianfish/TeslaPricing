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

Les tarifs Tesla sont collectés par l'extension Chrome « Collecteur Tesla Pricing » (dossier `extension/` du dépôt), qui les envoie à l'add-on via le port direct. Renseigner une clé (au moins 20 caractères aléatoires) dans l'option **Clé d'import**, puis la même clé dans l'extension. Laisser vide pour désactiver l'import.

### Google Analytics

Pour suivre la fréquentation de l'interface, renseigner l'ID de mesure Google Analytics 4 (`G-XXXXXXXXXX`, visible dans **Admin → Flux de données** de la propriété GA4) dans l'option **ID de mesure Google Analytics**, puis redémarrer l'add-on. Une page vue est envoyée à chaque onglet consulté. Laisser vide pour désactiver le suivi (aucun script Google n'est alors chargé).

Un bandeau demande le consentement de chaque visiteur : Google Analytics n'est chargé qu'après acceptation. Le choix est mémorisé dans le navigateur et modifiable via le lien **Cookies** en pied de page (un refus ultérieur supprime les cookies `_ga`).

## Données

La base (`superchargers_db.json`) et les relevés saisis depuis l'interface (`user_contributions.json`) sont stockés dans le dossier persistant de l'add-on (`/data`). Ils sont conservés lors des mises à jour et inclus dans les sauvegardes Home Assistant.

Au premier démarrage, la base livrée avec la version installée est copiée dans `/data`. Les mises à jour de l'add-on n'écrasent pas une base existante.

La liste des stations (nouvelles stations, passages de « En travaux » à « Ouverte », nombre de bornes) est synchronisée depuis supercharge.info au démarrage puis chaque jour, sans toucher aux tarifs. Les évolutions apparaissent dans l'onglet « Mises à jour ».

### Purger l'historique des prix

Pour repartir d'un historique propre (un seul relevé par station, son tarif actuel), appeler depuis le réseau local :

```bash
curl -X POST -H "Authorization: Bearer <clé d'import>" http://<ip-home-assistant>:<port>/api/prices/purge-history
```

Une sauvegarde `superchargers_db.backup-<date>.json` est créée dans `/data` avant la purge. La courbe nationale depuis 2021 est conservée.
