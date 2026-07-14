/**
 * Syncs lightweight desktop preferences with Firestore.
 */

import { authProvider } from '../../auth/provider.js';
import { featureFlags } from '../../firebase/feature-flags.js';
import { store } from '../../core/state.js';
import { FirestoreDesktopRepository } from './firestore-desktop-repository.js';
import { canonicalAppId } from '../../apps/registry.js';

const SETTINGS_KEYS = ['theme', 'widgets', 'widgetLayout', 'shortcuts', 'favorites', 'pinned'];
const WRITE_DEBOUNCE_MS = 600;

class DesktopSync {
  constructor() {
    this._repo = null;
    this._ready = false;
    this._hydrating = false;
    this._writeTimer = null;
    this._unsubscribers = [];
    this._restoreDepth = 0;
    this._restoreDirty = false;
    this._status = {
      state: 'checking',
      message: 'Sincronizacao do desktop ainda nao inicializada.',
    };
  }

  async init() {
    if (this._ready) return { enabled: true };
    if (!featureFlags.firestoreDesktopReadEnabled) {
      this._setStatus('disabled', 'Sincronizacao do desktop desativada por feature flag.');
      return { enabled: false, reason: 'feature-disabled' };
    }

    const user = await authProvider.getCurrentUserAsync();
    if (!user?.uid || user.accessStatus !== 'approved') {
      this._setStatus('pending', 'A conta precisa estar aprovada para sincronizar o desktop.');
      return { enabled: false, reason: 'user-not-approved' };
    }

    this._repo = new FirestoreDesktopRepository({ uid: user.uid });
    this._setStatus('hydrating', 'Carregando preferencias do desktop.');
    await this._hydrateRemoteSettings();
    this._wireWrites();
    this._ready = true;
    this._setStatus('synced', 'Preferencias do desktop sincronizadas.');
    return { enabled: true, uid: user.uid };
  }

  async _hydrateRemoteSettings() {
    this._hydrating = true;
    try {
      const remote = await this._repo.loadSettings();
      if (remote) {
        const normalized = _settingsFromRemote(remote);
        store.set(normalized);
        if (featureFlags.firestoreDesktopWriteEnabled && _hasLegacyAppIds(remote, normalized)) {
          await this._repo.saveSettings(normalized);
        }
      } else if (featureFlags.firestoreDesktopWriteEnabled) {
        await this._repo.saveSettings(_settingsFromStore());
      }
    } finally {
      this._hydrating = false;
    }
  }

  _wireWrites() {
    if (!featureFlags.firestoreDesktopWriteEnabled) return;
    this._unsubscribers = SETTINGS_KEYS.map((key) => (
      store.subscribe(key, () => this._scheduleWrite())
    ));
  }

  _scheduleWrite() {
    if (this._hydrating || !this._repo) return;
    if (this._restoreDepth > 0) {
      this._restoreDirty = true;
      return;
    }
    clearTimeout(this._writeTimer);
    this._writeTimer = setTimeout(() => {
      this.syncNow('local-change')
        .catch((err) => console.warn('[desktop-sync] failed to save settings', err));
    }, WRITE_DEBOUNCE_MS);
  }

  async syncNow(reason = 'manual') {
    if (!this._repo || !featureFlags.firestoreDesktopWriteEnabled) {
      return { ok: false, reason: this._repo ? 'write-disabled' : 'not-ready' };
    }
    clearTimeout(this._writeTimer);
    this._setStatus('syncing', 'Enviando preferencias do desktop.');
    try {
      await this._repo.saveSettings(_settingsFromStore());
      const lastSyncedAt = new Date().toISOString();
      this._status = {
        state: 'synced',
        message: 'Preferencias do desktop sincronizadas.',
        reason,
        lastSyncedAt,
      };
      return { ok: true, reason, lastSyncedAt };
    } catch (error) {
      this._status = {
        state: 'error',
        message: 'Nao foi possivel sincronizar as preferencias do desktop.',
        error: error?.message || String(error),
      };
      throw error;
    }
  }

  getStatus() {
    return { ...this._status };
  }

  beginRestore() {
    this._restoreDepth += 1;
    clearTimeout(this._writeTimer);
    this._setStatus('restoring', 'Restauracao local em andamento.');
    return { ok: true, depth: this._restoreDepth };
  }

  endRestore({ commit = false } = {}) {
    this._restoreDepth = Math.max(0, this._restoreDepth - 1);
    if (this._restoreDepth > 0) return { ok: true, depth: this._restoreDepth };
    const dirty = this._restoreDirty;
    this._restoreDirty = false;
    if (dirty) this._scheduleWrite();
    else this._setStatus('synced', commit ? 'Restauracao concluida.' : 'Estado anterior restaurado.');
    return { ok: true, commit, pendingSync: dirty };
  }

  _setStatus(state, message) {
    this._status = { state, message };
  }

  dispose() {
    clearTimeout(this._writeTimer);
    this._unsubscribers.forEach((unsubscribe) => unsubscribe());
    this._unsubscribers = [];
    this._repo = null;
    this._ready = false;
    this._restoreDepth = 0;
    this._restoreDirty = false;
    this._setStatus('checking', 'Sincronizacao do desktop ainda nao inicializada.');
  }
}

function _settingsFromStore() {
  return {
    theme: store.get('theme', 'dark'),
    widgets: store.get('widgets', null),
    widgetLayout: store.get('widgetLayout', null),
    shortcuts: _canonicalShortcuts(store.get('shortcuts', null)),
    favorites: _canonicalAppIds(store.get('favorites', [])),
    pinned: _canonicalAppIds(store.get('pinned', [])),
  };
}

function _settingsFromRemote(remote) {
  return {
    theme: remote.theme ?? 'dark',
    widgets: remote.widgets ?? null,
    widgetLayout: remote.widgetLayout ?? null,
    shortcuts: _canonicalShortcuts(remote.shortcuts),
    favorites: _canonicalAppIds(remote.favorites),
    pinned: _canonicalAppIds(remote.pinned),
  };
}

function _canonicalAppIds(items) {
  return [...new Set(
    (Array.isArray(items) ? items : []).map(canonicalAppId).filter(Boolean)
  )];
}

function _canonicalShortcuts(shortcuts) {
  if (!Array.isArray(shortcuts)) return shortcuts ?? null;
  return shortcuts.map((shortcut) => (
    shortcut?.appId
      ? { ...shortcut, appId: canonicalAppId(shortcut.appId) }
      : shortcut
  ));
}

function _hasLegacyAppIds(remote, normalized) {
  return JSON.stringify(remote.favorites ?? []) !== JSON.stringify(normalized.favorites)
    || JSON.stringify(remote.pinned ?? []) !== JSON.stringify(normalized.pinned)
    || JSON.stringify(remote.shortcuts ?? null) !== JSON.stringify(normalized.shortcuts);
}

export const desktopSync = new DesktopSync();
