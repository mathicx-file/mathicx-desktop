import { JapaneseFirestoreRepository } from './japanese-firestore-repository.js';

const WRITE_DEBOUNCE_MS = 1800;

class JapaneseFirebaseSync {
  constructor() {
    this.storage = null;
    this.repo = null;
    this.uid = '';
    this.flags = null;
    this.ready = false;
    this.hydrating = false;
    this.writeTimer = null;
    this.onStorageChange = null;
  }

  async init({ storage }) {
    if (this.ready || !storage) return { enabled: false, reason: 'already-ready-or-missing-storage' };

    this.storage = storage;
    this.flags = await loadFeatureFlags();

    if (!this.flags.firebaseEnabled || !this.flags.firestoreJapaneseReadEnabled) {
      return { enabled: false, reason: 'feature-disabled' };
    }

    this.repo = new JapaneseFirestoreRepository();
    const user = await this.repo.getApprovedUser();
    if (!user?.uid) return { enabled: false, reason: 'user-not-approved' };
    this.uid = user.uid;

    await this.hydrateLocalFromRemote();

    if (this.flags.firestoreJapaneseWriteEnabled) {
      await this.uploadNow('initial');
      this.watchLocalChanges();
    }

    this.ready = true;
    return { enabled: true, uid: this.uid };
  }

  async hydrateLocalFromRemote() {
    this.hydrating = true;
    try {
      const remoteBackup = await this.repo.loadSnapshot(this.uid);
      const summary = remoteBackup?.data || {};
      const hasRemoteData = Boolean(
        summary.settings && Object.keys(summary.settings).length > 0
        || summary.srs && Object.keys(summary.srs).length > 0
        || summary.favorites?.length
        || summary.dictionaryFavorites?.length
      );

      if (hasRemoteData) {
        await this.storage.importBackup(remoteBackup, 'merge');
      }
    } finally {
      this.hydrating = false;
    }
  }

  watchLocalChanges() {
    this.onStorageChange = (event) => {
      if (event?.detail?.type === 'firebase-sync-updated') return;
      this.scheduleUpload();
    };
    document.addEventListener('japanese:storage', this.onStorageChange);
  }

  scheduleUpload() {
    if (this.hydrating || !this.flags?.firestoreJapaneseWriteEnabled) return;
    clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.uploadNow('local-change').catch((error) => {
        console.warn('[japanese-firebase-sync] failed to upload local data', error);
      });
    }, WRITE_DEBOUNCE_MS);
  }

  async uploadNow(reason = 'manual') {
    if (!this.repo || !this.uid) return null;
    const backup = await this.storage.exportBackup();
    const counts = await this.repo.saveSnapshot(this.uid, backup);
    this.storage.emitChange('firebase-sync-updated', { reason, counts });
    return counts;
  }

  dispose() {
    clearTimeout(this.writeTimer);
    if (this.onStorageChange) {
      document.removeEventListener('japanese:storage', this.onStorageChange);
    }
    this.onStorageChange = null;
    this.ready = false;
  }
}

async function loadFeatureFlags() {
  try {
    const module = await import('../../../../src/firebase/feature-flags.js');
    return module.featureFlags || {};
  } catch {
    return {};
  }
}

export const japaneseFirebaseSync = new JapaneseFirebaseSync();
