/**
 * mathicx-file · firebase/feature-flags.js
 * Runtime controls retained after the Firebase rollout.
 * Production defaults stay explicit so rollback gates remain auditable.
 */

export const featureFlags = Object.freeze({
  authMode: 'firebase', // local | firebase
  firebaseEnabled: true,
  firebaseEmulatorsEnabled: false,

  firestoreDesktopReadEnabled: true,
  firestoreDesktopWriteEnabled: true,

  firestoreJapaneseReadEnabled: true,
  firestoreJapaneseWriteEnabled: true,

  firestoreFinancesReadEnabled: true,
  firestoreFinancesWriteEnabled: true,

  dictionaryProviderV2Enabled: true,
  dictionaryChunkLoadingEnabled: true,
  dictionaryOfflinePacksEnabled: true,
});

export function isFirebaseRuntimeEnabled() {
  return featureFlags.firebaseEnabled || featureFlags.authMode === 'firebase';
}
