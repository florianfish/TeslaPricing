# Changelog

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
