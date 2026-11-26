import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing comes only from android/key.properties (gitignored; see
// key.properties.example). Debug builds do not need it, so a problem here is
// raised only when a release artifact is actually requested, further down.
val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}
val missingKeystoreKeys = listOf("storeFile", "storePassword", "keyAlias", "keyPassword")
    .filter { keystoreProperties.getProperty(it).isNullOrBlank() }
val releaseSigningProblem: String? = when {
    !keystorePropertiesFile.exists() ->
        "${keystorePropertiesFile.path} does not exist. Copy key.properties.example and fill it in."
    missingKeystoreKeys.isNotEmpty() ->
        "${keystorePropertiesFile.path} is missing: ${missingKeystoreKeys.joinToString()}."
    !rootProject.file(keystoreProperties.getProperty("storeFile")).exists() ->
        "The storeFile named in ${keystorePropertiesFile.path} does not exist " +
            "(relative paths resolve from mobile/android)."
    else -> null
}

android {
    namespace = "com.modestummah.modest_ummah"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.modestummah.modest_ummah"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (releaseSigningProblem == null) {
            create("release") {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // Never falls back to the debug keys: see the check below.
            if (releaseSigningProblem == null) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

gradle.taskGraph.whenReady {
    val buildsRelease = allTasks.any {
        it.project == project && it.name in setOf("assembleRelease", "bundleRelease")
    }
    if (buildsRelease && releaseSigningProblem != null) {
        throw GradleException("Release signing is not configured. $releaseSigningProblem")
    }
}
