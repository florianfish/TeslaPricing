# Appli Android (Trusted Web Activity)

L'appli **Superchargeurs** affiche le site (`https://suc.poissonmail.fr/` par défaut) en plein écran avec le moteur de Chrome, sans barre d'adresse : c'est la PWA, avec une icône et un écran de démarrage natifs. Aucun code d'interface à maintenir ; une mise à jour du site n'impose pas de republier l'APK.

- Bibliothèque : [android-browser-helper](https://github.com/GoogleChrome/android-browser-helper) (`LauncherActivity`), sans Kotlin ni Compose.
- Projet Gradle déclaré **à la racine du dépôt** (`settings.gradle.kts`, `build.gradle.kts`, `gradle.properties`) car la CI mutualisée [Forge-Apk](https://github.com/florianfish/Forge-Apk) compile depuis la racine ; le module est dans `android/app`.
- Paquets : `fr.florian.teslapricing` (release) et `fr.florian.teslapricing.debug` (debug, installable à côté).
- Autre adresse : variable `TWA_URL` au moment du build.

## Builds

| Workflow | Déclencheur | Résultat |
|---|---|---|
| `android.yml` (Forge-Apk `android-build`) | push sur `main` ou PR touchant `android/` | APK de debug : commentaire sur la PR, pré-release « debug » (`releases/download/debug/TeslaPricing-debug.apk`) |
| `android-release.yml` (Forge-Apk `android-release`) | bouton « Run workflow » | APK signé publié dans une release `vX.Y.Z` |

Secrets du dépôt, comme pour les autres applis de la forge : `DEBUG_KEYSTORE_BASE64` (sinon, clé jetable sur les PR), et `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` pour les releases.

## Lien vérifié avec le site (pas de barre d'adresse)

Android vérifie que le site autorise l'appli via `https://<site>/.well-known/assetlinks.json`, servi par l'add-on à partir de l'option **Empreintes de l'appli Android** (`android_cert_sha256`, ou variable `ANDROID_CERT_SHA256`).

1. Récupérer l'empreinte SHA-256 de chaque clé de signature :
   - dans le journal du build Forge-Apk, étape « Vérification de la signature », ligne `SHA-256 digest` ;
   - ou `keytool -list -v -keystore debug.keystore -alias androiddebugkey`.
2. Les coller dans l'option de l'add-on (debug et release séparées par une virgule), puis redémarrer.
3. Vérifier `https://suc.poissonmail.fr/.well-known/assetlinks.json`, puis réinstaller l'appli (Android revérifie le lien à l'installation).

Sans empreinte, l'appli fonctionne quand même, mais avec une barre d'adresse en haut.
