// Appli Android (Trusted Web Activity) : projet Gradle à la racine du dépôt, car la CI mutualisée
// Forge-Apk compile depuis la racine ; le module lui-même est dans android/app.
pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = "TeslaPricing"
include(":app")
project(":app").projectDir = file("android/app")
