# Changelog

## À venir

- Appli Android : elle ne se fermait plus aussitôt ouverte. Elle démarre désormais normalement et affiche le site.
- L'encart de l'offre de parrainage, une fois fermé, ne réapparaît plus pendant 15 jours.
- Carte sur téléphone : les filtres et le choix du fond de carte ne se chevauchent plus ; les filtres tiennent sur une ligne qui défile.

## 3.0.0

- Appli Android « Superchargeurs » : le site en plein écran, avec son icône et son écran de démarrage, sans barre d'adresse. Nouvelle option « Empreintes de l'appli Android » : les empreintes SHA-256 de ses clés de signature, publiées dans `/.well-known/assetlinks.json` pour qu'Android reconnaisse l'appli.

## 2.2.0

- Occupation des stations : les cumuls (carte d'affluence) sont sauvegardés chaque dimanche à 20 h sur GitHub. Un add-on réinstallé ou une nouvelle instance repart de cette sauvegarde au lieu de zéro.

## 2.1.0

- Nouvel onglet Affluence : toutes les stations en ce moment, les plus chargées et les plus calmes, celles plus chargées que d'habitude à cette heure, avec un filtre par région.
- Onglet Mises à jour : suivi du relevé de l'occupation (dernier relevé, stations suivies, remplissage de la carte d'affluence) avec une alerte s'il est en retard ou en échec.

## 2.0.1

- Mes recharges : connexion à TeslaMate API par identifiant et mot de passe, comme sur MyTeslaMate. Pour une instance MyTeslaMate, le mot de passe suffit (l'identifiant est le sous-domaine de l'adresse). Nouvelle option « Identifiant TeslaMate API ».

## 2.0.0

- Grille tarifaire complète : la fiche de chaque station affiche maintenant tous les prix publiés par Tesla, créneau par créneau, pour les Tesla, les autres véhicules et le tarif « MSP ». Beaucoup de stations ont trois prix dans la journée : à Gassin, 0,40 € de 10 h à 20 h, 0,28 € de 20 h à minuit et 0,19 € de minuit à 10 h, alors que seuls les prix heures pleines / heures creuses étaient affichés jusqu'ici. Le créneau en cours est mis en évidence.
- Affluence des stations : bornes occupées en ce moment, affluence moyenne par jour et par heure, et meilleure heure d'ici ce soir avec son prix, d'après les données publiques des bornes (transport.data.gouv.fr). L'add-on relève l'occupation toutes les 15 minutes (nouvelle option « Occupation des stations », 0 pour désactiver) ; la grille d'affluence se remplit au fil des semaines.
- Mes recharges : nouvel onglet qui compare chacune de vos recharges au Superchargeur, lue dans TeslaMate ou MyTeslaMate, au tarif relevé pour la station ce jour-là : prix payé au kWh, écart, et coût de la même recharge en heures creuses. À activer avec les nouvelles options « Adresse de TeslaMate API » et « Jeton de TeslaMate API ». Ces données personnelles ne sont visibles que depuis Home Assistant, jamais sur l'adresse publique du site.
- Le relevé hebdomadaire des tarifs signale aussi les changements de grille, même quand les prix heures pleines / heures creuses ne bougent pas.

## 1.7.0

- Les tarifs sont désormais relevés automatiquement chaque semaine, sans navigateur ouvert : un workflow GitHub Actions interroge Tesla via Bright Data, envoie le relevé à l'add-on et annonce sur Telegram les stations dont le tarif a changé. L'extension Chrome reste utilisable en secours.
- État de la collecte : les imports du relevé hebdomadaire apparaissent comme « Relevé hebdo ».

## 1.6.0

- Application installable sur Android (PWA) : bouton « Installer » dans l'en-tête ou menu de Chrome, ouverture en plein écran depuis l'écran d'accueil, raccourcis vers la carte, la liste, les mises à jour et le simulateur.
- Hors connexion, les derniers tarifs consultés restent affichés, avec un bandeau indiquant la date de leur enregistrement ; ils se rechargent dès le retour du réseau.

## 1.5.0

- Référencement : nouvelle option « URL publique » (variable `PUBLIC_URL` hors add-on). Une fois renseignée, chaque station a sa propre page indexable (`/superchargeur-abbeville-9655`) avec titre, tarifs et données structurées, accompagnée de `robots.txt`, `sitemap.xml`, d'une URL canonique et d'une image d'aperçu pour les partages. Sans elle, l'instance reste privée et non indexée.
- Le bouton « Partager » d'une fiche copie l'adresse de la page de la station.
- Fiche station : le tarif du créneau en cours (heures pleines ou creuses, heure de Paris) est mis en évidence.
- Fiche station : le lien « Page Tesla.com » ouvre la bonne page (identifiant Tesla de la station) ; le slug Tesla n'est plus affiché.
- Logo de l'application en favicon et dans la boutique d'add-ons Home Assistant.

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
