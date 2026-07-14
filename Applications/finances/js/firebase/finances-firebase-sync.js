import { FinancesFirestoreRepository } from './finances-firestore-repository.js';

const WRITE_DEBOUNCE_MS = 1800;
const SYNC_METADATA_KEY = 'finances_firebase_sync_v1';

class FinancesFirebaseSync {
  constructor() {
    this.storage = null;
    this.repo = null;
    this.uid = '';
    this.flags = null;
    this.ready = false;
    this.hydrating = false;
    this.writeTimer = null;
    this.unsubscribeStorage = null;
    this.remoteRevision = 0;
    this.pendingConflict = null;
    this.uploadPromise = null;
    this.syncMetadata = { revision: 0, dirty: false };
    this.restoreDepth = 0;
    this.restoreDirty = false;
  }

  async init({ storage }) {
    if (this.ready || !storage) return { enabled: false, reason: 'already-ready-or-missing-storage' };

    this.storage = storage;
    this.emitStatus({ state: 'checking', message: 'Verificando Firebase e usuario aprovado.' });
    this.flags = await loadFeatureFlags();

    if (!this.flags.firebaseEnabled || !this.flags.firestoreFinancesReadEnabled) {
      this.emitStatus({ state: 'disabled', message: 'Sincronizacao remota desativada por feature flag.' });
      return { enabled: false, reason: 'feature-disabled' };
    }

    this.repo = new FinancesFirestoreRepository();
    const user = await this.repo.getApprovedUser();
    if (!user?.uid) {
      this.emitStatus({ state: 'pending', message: 'A conta precisa estar aprovada para sincronizar.' });
      return { enabled: false, reason: 'user-not-approved' };
    }

    this.uid = user.uid;
    this.storage.setUserScope?.(user.uid);
    this.syncMetadata = this.loadSyncMetadata();
    const remote = await this.loadRemoteSnapshot();
    let result = null;

    if (this.flags.firestoreFinancesWriteEnabled) {
      if (this.syncMetadata.dirty && remote && remote.revision !== this.syncMetadata.revision) {
        this.remoteRevision = this.syncMetadata.revision;
        this.pendingConflict = remote;
        result = { ok: false, conflict: true, remote };
        this.emitConflictStatus(remote, 'startup');
      } else if (this.syncMetadata.dirty) {
        this.remoteRevision = remote?.revision || 0;
        result = await this.uploadNow('resume-pending');
      } else if (remote) {
        this.hydrateLocalFromRemote(remote);
        result = { ok: true, counts: remote.counts, revision: remote.revision };
      } else {
        result = await this.uploadNow('initial');
      }
      const counts = result?.counts || {};
      await this.repo.markMigration(this.uid, {
        status: 'completed',
        reason: 'initial-sync',
        counts,
      }).catch((error) => {
        console.warn('[finances-firebase-sync] failed to mark migration', error);
      });
      this.watchLocalChanges();
    } else {
      this.emitStatus({
        state: 'synced',
        message: 'Dados remotos carregados. Escrita remota esta desativada.',
      });
    }

    this.ready = true;
    return { enabled: true, uid: this.uid };
  }

  async loadRemoteSnapshot() {
    this.emitStatus({ state: 'hydrating', message: 'Baixando snapshot remoto do Finances.' });
    const remote = await this.repo.loadSnapshot(this.uid);
    this.remoteRevision = remote?.revision || 0;
    return remote;
  }

  hydrateLocalFromRemote(remote) {
    if (!remote?.state) return;
    this.hydrating = true;
    try {
      this.storage.importSnapshot(remote.state, {
        replace: true,
        source: 'firebase',
      });
      this.saveSyncMetadata({ revision: remote.revision, dirty: false });
      this.emitStatus({
        state: 'synced',
        message: 'Dados financeiros carregados da sua conta.',
        reason: 'remote-hydration',
        counts: remote.counts,
        revision: remote.revision,
        lastSyncedAt: remote.updatedAt,
      });
    } finally {
      this.hydrating = false;
    }
  }

  watchLocalChanges() {
    this.unsubscribeStorage?.();
    this.unsubscribeStorage = this.storage.subscribe((event) => {
      if (event?.type === 'firebase-sync-updated') return;
      if (event?.type === 'scope:change') return;
      this.saveSyncMetadata({ revision: this.remoteRevision, dirty: true });
      this.scheduleUpload();
    });
  }

  scheduleUpload() {
    if (this.hydrating || !this.flags?.firestoreFinancesWriteEnabled) return;
    if (this.restoreDepth > 0) {
      this.restoreDirty = true;
      return;
    }
    this.emitStatus({ state: 'syncing', message: 'Alteracoes locais aguardando envio.' });
    clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.uploadNow('local-change').catch((error) => {
        console.warn('[finances-firebase-sync] failed to upload local data', error);
        this.emitStatus({
          state: 'error',
          message: 'Nao foi possivel enviar as alteracoes para o Firebase.',
          error: error?.message || String(error),
        });
      });
    }, WRITE_DEBOUNCE_MS);
  }

  async uploadNow(reason = 'manual') {
    if (this.uploadPromise) return this.uploadPromise;
    this.uploadPromise = this.performUpload(reason);
    try {
      return await this.uploadPromise;
    } finally {
      this.uploadPromise = null;
    }
  }

  async performUpload(reason) {
    if (!this.repo || !this.uid) return null;
    this.emitStatus({ state: 'syncing', message: 'Enviando dados financeiros para o Firebase.' });
    const result = await this.repo.saveSnapshot(this.uid, this.storage.exportSnapshot(), reason, {
      expectedRevision: this.remoteRevision,
    });
    if (result?.conflict) {
      this.pendingConflict = result.remote;
      this.saveSyncMetadata({ revision: this.remoteRevision, dirty: true });
      this.emitConflictStatus(result.remote, reason);
      return result;
    }

    this.remoteRevision = result.revision;
    this.pendingConflict = null;
    const counts = result.counts;
    const lastSyncedAt = new Date().toISOString();
    this.saveSyncMetadata({ revision: result.revision, dirty: false, lastSyncedAt });
    this.storage.emit({ type: 'firebase-sync-updated', payload: { reason, counts, lastSyncedAt } });
    this.emitStatus({
      state: 'synced',
      message: 'Dados financeiros sincronizados com sua conta.',
      reason,
      counts,
      revision: result.revision,
      lastSyncedAt,
    });
    return result;
  }

  async syncNow() {
    if (!this.ready || !this.flags?.firestoreFinancesWriteEnabled) {
      this.emitStatus({
        state: this.ready ? 'disabled' : 'checking',
        message: this.ready
          ? 'Escrita remota desativada para este ambiente.'
          : 'A sincronizacao ainda esta inicializando.',
      });
      return { ok: false, reason: this.ready ? 'write-disabled' : 'not-ready' };
    }

    clearTimeout(this.writeTimer);
    try {
      const result = await this.uploadNow('manual');
      if (result?.conflict) return { ok: false, reason: 'conflict' };
      return { ok: true, counts: result?.counts };
    } catch (error) {
      console.warn('[finances-firebase-sync] manual sync failed', error);
      this.emitStatus({
        state: 'error',
        message: 'Nao foi possivel sincronizar manualmente.',
        error: error?.message || String(error),
      });
      return { ok: false, reason: 'upload-failed', error };
    }
  }

  beginRestore() {
    this.restoreDepth += 1;
    clearTimeout(this.writeTimer);
    this.emitStatus({ state: 'restoring', message: 'Restauracao local em andamento.' });
    return { ok: true, depth: this.restoreDepth };
  }

  endRestore({ commit = false } = {}) {
    this.restoreDepth = Math.max(0, this.restoreDepth - 1);
    if (this.restoreDepth > 0) return { ok: true, depth: this.restoreDepth };
    const dirty = this.restoreDirty;
    this.restoreDirty = false;
    if (dirty) this.scheduleUpload();
    else this.emitStatus({ state: 'synced', message: commit ? 'Restauracao concluida.' : 'Estado anterior restaurado.' });
    return { ok: true, commit, pendingSync: dirty };
  }

  async resolveConflict(strategy) {
    if (!this.pendingConflict) return { ok: false, reason: 'no-conflict' };

    if (strategy === 'remote') {
      this.hydrating = true;
      try {
        this.storage.importSnapshot(this.pendingConflict.state, {
          replace: true,
          source: 'firebase-conflict',
        });
        this.remoteRevision = this.pendingConflict.revision;
        const remote = this.pendingConflict;
        this.pendingConflict = null;
        this.saveSyncMetadata({
          revision: remote.revision,
          dirty: false,
          lastSyncedAt: remote.updatedAt || new Date().toISOString(),
        });
        this.emitStatus({
          state: 'synced',
          message: 'Versao do Firebase carregada neste dispositivo.',
          reason: 'conflict-remote',
          counts: remote.counts,
          revision: remote.revision,
          lastSyncedAt: remote.updatedAt || new Date().toISOString(),
        });
        return { ok: true, strategy };
      } finally {
        this.hydrating = false;
      }
    }

    if (strategy === 'local') {
      this.remoteRevision = this.pendingConflict.revision;
      this.pendingConflict = null;
      const result = await this.uploadNow('conflict-local');
      if (result?.conflict) return { ok: false, reason: 'conflict' };
      return { ok: true, strategy, counts: result?.counts };
    }

    return { ok: false, reason: 'invalid-strategy' };
  }

  emitConflictStatus(remote, reason) {
    this.emitStatus({
      state: 'conflict',
      message: 'Ha alteracoes locais e uma versao mais recente em outro dispositivo.',
      reason,
      revision: remote?.revision || 0,
      remoteUpdatedAt: remote?.updatedAt || '',
    });
  }

  loadSyncMetadata() {
    try {
      const parsed = JSON.parse(localStorage.getItem(this.syncMetadataKey()) || '{}');
      return {
        revision: Number.isSafeInteger(parsed.revision) && parsed.revision >= 0 ? parsed.revision : 0,
        dirty: parsed.dirty === true,
        lastSyncedAt: typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : '',
      };
    } catch {
      return { revision: 0, dirty: false, lastSyncedAt: '' };
    }
  }

  saveSyncMetadata(patch) {
    this.syncMetadata = { ...this.syncMetadata, ...patch };
    try {
      localStorage.setItem(this.syncMetadataKey(), JSON.stringify(this.syncMetadata));
    } catch (error) {
      console.warn('[finances-firebase-sync] failed to save local sync metadata', error);
    }
  }

  syncMetadataKey() {
    return `${SYNC_METADATA_KEY}:${this.uid || 'local'}`;
  }

  emitStatus(detail) {
    window.dispatchEvent(new CustomEvent('finances:firebase-sync-status', {
      detail: {
        uid: this.uid,
        ...detail,
      },
    }));
  }

  dispose() {
    clearTimeout(this.writeTimer);
    this.unsubscribeStorage?.();
    this.unsubscribeStorage = null;
    this.uploadPromise = null;
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

export const financesFirebaseSync = new FinancesFirebaseSync();
