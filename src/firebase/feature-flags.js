/**
 * mathicx-file · firebase/feature-flags.js
 * Central switchboard for the Firebase migration.
 *
 * Phase 1 keeps every Firebase-backed runtime path disabled by default.
 * Later phases should flip one flag at a time.
 */

export const featureFlags = Object.freeze({
  authMode: 'firebase', // local | firebase
  firebaseEnabled: true,
  firebaseEmulatorsEnabled: false,

  firebaseAuthEnabled: true,
  firestoreDesktopReadEnabled: true,
  firestoreDesktopWriteEnabled: true,

  firestoreJapaneseReadEnabled: true,
  firestoreJapaneseWriteEnabled: true,

  firestoreFinancesReadEnabled: true,
  firestoreFinancesWriteEnabled: true,

  dictionaryProviderV2Enabled: true,
  dictionaryRemoteManifestEnabled: false,
  dictionaryChunkLoadingEnabled: true,
  dictionaryOfflinePacksEnabled: true,

  localMigrationEnabled: false,
  localFallbackEnabled: true,
});

export function isFirebaseRuntimeEnabled() {
  return featureFlags.firebaseEnabled || featureFlags.authMode === 'firebase';
}
