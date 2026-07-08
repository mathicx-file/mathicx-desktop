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
    this.emitStatus({ state: 'checking', message: 'Verificando Firebase e usuario aprovado.' });
    this.flags = await loadFeatureFlags();

    if (!this.flags.firebaseEnabled || !this.flags.firestoreJapaneseReadEnabled) {
      this.emitStatus({ state: 'disabled', message: 'Sincronizacao remota desativada por feature flag.' });
      return { enabled: false, reason: 'feature-disabled' };
    }

    this.repo = new JapaneseFirestoreRepository();
    const user = await this.repo.getApprovedUser();
    if (!user?.uid) {
      this.emitStatus({ state: 'pending', message: 'A conta precisa estar aprovada para sincronizar.' });
      return { enabled: false, reason: 'user-not-approved' };
    }
    this.uid = user.uid;
    this.storage.setUserScope?.(user.uid);

    await this.hydrateLocalFromRemote();

    if (this.flags.firestoreJapaneseWriteEnabled) {
      const counts = await this.uploadNow('initial');
      await this.repo.markMigration(this.uid, {
        status: 'completed',
        reason: 'initial-sync',
        counts,
      }).catch((error) => {
        console.warn('[japanese-firebase-sync] failed to mark migration', error);
      });
      this.watchLocalChanges();
    } else {
      this.emitStatus({
        state: 'synced',
        message: 'Dados remotos carregados. Escrita remota esta desativada.'
      });
    }

    this.ready = true;
    return { enabled: true, uid: this.uid };
  }

  async hydrateLocalFromRemote() {
    this.hydrating = true;
    this.emitStatus({ state: 'hydrating', message: 'Baixando dados remotos do Japanese Study.' });
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
    this.emitStatus({ state: 'syncing', message: 'Alteracoes locais aguardando envio.' });
    clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.uploadNow('local-change').catch((error) => {
        console.warn('[japanese-firebase-sync] failed to upload local data', error);
        this.emitStatus({
          state: 'error',
          message: 'Nao foi possivel enviar as alteracoes para o Firebase.',
          error: error?.message || String(error),
        });
      });
    }, WRITE_DEBOUNCE_MS);
  }

  async uploadNow(reason = 'manual') {
    if (!this.repo || !this.uid) return null;
    this.emitStatus({ state: 'syncing', message: 'Enviando dados para o Firebase.' });
    const backup = await this.storage.exportBackup();
    const counts = await this.repo.saveSnapshot(this.uid, backup);
    const lastSyncedAt = new Date().toISOString();
    this.storage.emitChange('firebase-sync-updated', { reason, counts, lastSyncedAt });
    this.emitStatus({
      state: 'synced',
      message: 'Dados sincronizados com sua conta.',
      reason,
      counts,
      lastSyncedAt,
    });
    return counts;
  }

  emitStatus(detail) {
    window.dispatchEvent(new CustomEvent('japanese:firebase-sync-status', {
      detail: {
        uid: this.uid,
        ...detail,
      },
    }));
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
