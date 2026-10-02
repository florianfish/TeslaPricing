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

## Données

La base (`superchargers_db.json`) et les relevés saisis depuis l'interface (`user_contributions.json`) sont stockés dans le dossier persistant de l'add-on (`/data`). Ils sont conservés lors des mises à jour et inclus dans les sauvegardes Home Assistant.

Au premier démarrage, la base livrée avec la version installée est copiée dans `/data`. Les mises à jour de l'add-on n'écrasent pas une base existante.

La liste des stations (nouvelles stations, passages de « En travaux » à « Ouverte », nombre de bornes) est synchronisée depuis supercharge.info au démarrage puis chaque jour, sans toucher aux tarifs. Les évolutions apparaissent dans l'onglet « Mises à jour ».
