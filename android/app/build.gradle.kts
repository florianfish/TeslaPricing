// Appli Android TeslaPricing : Trusted Web Activity qui affiche le site en plein écran (moteur de Chrome).
// Aucun code d'interface : tout vient de la PWA. Build par la CI mutualisée Forge-Apk.
import java.net.URI

plugins {
    id("com.android.application")
}

// Adresse du site affiché : variable TWA_URL (ex. dans la CI), sinon l'instance publique
val twaUrl: String = System.getenv("TWA_URL")?.takeIf { it.isNotBlank() } ?: "https://suc.poissonmail.fr/"
val twaHost: String = URI(twaUrl).host
val twaOrigin: String = "https://$twaHost"

android {
    namespace = "fr.florian.teslapricing"
    compileSdk = 37
    defaultConfig {
        applicationId = "fr.florian.teslapricing"
        minSdk = 26
        targetSdk = 35
        // Fournis par les workflows Forge-Apk (numéro de run, tag sans le « v »)
        versionCode = System.getenv("VERSION_CODE")?.toIntOrNull() ?: 1
        versionName = System.getenv("VERSION_NAME") ?: "1.0"

        manifestPlaceholders["twaUrl"] = twaUrl
        manifestPlaceholders["twaHost"] = twaHost
        // Lien vérifié avec /.well-known/assetlinks.json du site (sans lui : barre d'adresse en haut)
        resValue(
            "string",
            "asset_statements",
            """[{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"web","site":"$twaOrigin"}}]""",
        )
    }
    // Clé fixe pour que chaque release s'installe par-dessus la précédente
    signingConfigs {
        create("release") {
            System.getenv("KEYSTORE_FILE")?.let { storeFile = file(it) }
            storePassword = System.getenv("KEYSTORE_PASSWORD")
            keyAlias = System.getenv("KEY_ALIAS")
            keyPassword = System.getenv("KEY_PASSWORD")
        }
    }
    buildTypes {
        // APK de debug installable à côté de la release ; n° du run CI dans la version
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug" + (System.getenv("GITHUB_RUN_NUMBER")?.let { ".$it" } ?: "")
            resValue("string", "app_name", "Superchargeurs (debug)")
        }
        release {
            signingConfig = signingConfigs.getByName("release")
            resValue("string", "app_name", "Superchargeurs")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        resValues = true
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
}
