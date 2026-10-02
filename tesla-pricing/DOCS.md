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

## Données

La base (`superchargers_db.json`) et les relevés saisis depuis l'interface (`user_contributions.json`) sont stockés dans le dossier persistant de l'add-on (`/data`). Ils sont conservés lors des mises à jour et inclus dans les sauvegardes Home Assistant.

Au premier démarrage, la base livrée avec la version installée est copiée dans `/data`. Les mises à jour de l'add-on n'écrasent pas une base existante.
