# APK updates

Android accepts updates only when the package ID and signing certificate match the installed app and the version code is not lower.

Public APK builds use one persistent PKCS12 keystore (alias: smaj-updates), supplied through the repository secrets SMAJ_ANDROID_KEYSTORE_BASE64 and SMAJ_ANDROID_KEYSTORE_PASSWORD. CI fails if the secrets are missing, instead of silently generating another signing key. Never replace these secrets after publishing the first build with this key.

The previous cache targeted a nonexistent debug.keystore; build logs show a cache miss and a path-validation failure. Older builds can therefore have different signing certificates. Without the original private key, existing installations need a one-time reinstall when moving to the persistent key. Uninstalling removes local app data, so preserve local downloads and other device-only data first.

Keep an offline backup of the keystore and its password. Local backups in android/app ending in .keystore or .signing-password are ignored by Git. Do not commit them. Local builds intended to update the public app must set SMAJ_ANDROID_KEYSTORE_PATH and SMAJ_ANDROID_KEYSTORE_PASSWORD to this same key; builds using the default local debug key cannot update the public APK.
