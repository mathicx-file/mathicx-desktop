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
  }

  async init() {
    if (this._ready || !featureFlags.firestoreDesktopReadEnabled) return;

    const user = await authProvider.getCurrentUserAsync();
    if (!user?.uid || user.accessStatus !== 'approved') return;

    this._repo = new FirestoreDesktopRepository({ uid: user.uid });
    await this._hydrateRemoteSettings();
    this._wireWrites();
    this._ready = true;
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
    clearTimeout(this._writeTimer);
    this._writeTimer = setTimeout(() => {
      this._repo.saveSettings(_settingsFromStore())
        .catch((err) => console.warn('[desktop-sync] failed to save settings', err));
    }, WRITE_DEBOUNCE_MS);
  }

  dispose() {
    clearTimeout(this._writeTimer);
    this._unsubscribers.forEach((unsubscribe) => unsubscribe());
    this._unsubscribers = [];
    this._repo = null;
    this._ready = false;
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
