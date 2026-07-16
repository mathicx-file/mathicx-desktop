import { appDataHost } from '../../apps/integration/app-data-host.js';
import { createIntegratedAppDataHandlers } from '../../apps/integration/integrated-app.js';

export const DESKTOP_BACKUP_FORMAT = 'mathicx-desktop-backup';
export const DESKTOP_BACKUP_SCHEMA_VERSION = 1;
const APP_ID = 'desktop';
const SETTINGS_KEYS = ['theme', 'widgets', 'widgetLayout', 'shortcuts', 'favorites', 'pinned'];

export function createDesktopAppDataHandlers(options = {}) {
  const stateStore = options.store;
  const sync = options.sync;
  if (!stateStore?.get || !stateStore?.set || !sync?.getStatus || !sync?.syncNow) {
    throw new Error('Desktop app data adapter requires store and sync APIs.');
  }
  return createIntegratedAppDataHandlers({
    appId: APP_ID,
    appVersion: '1.0.0',
    backup: {
      format: DESKTOP_BACKUP_FORMAT,
      schemaVersion: DESKTOP_BACKUP_SCHEMA_VERSION,
      modes: ['merge', 'replace'],
      containsFinancialData: false,
    },
    getSyncStatus: () => sync.getStatus(),
    syncNow: () => sync.syncNow('manual'),
    exportBackup: () => createDesktopBackup(stateStore, options.now),
    validateBackup: (backup) => validateDesktopBackup(backup),
    importBackup: (backup, mode) => {
      const current = stateStore.get();
      const next = mode === 'replace'
        ? Object.fromEntries(SETTINGS_KEYS.map((key) => [key, backup.data[key] ?? null]))
        : Object.fromEntries(SETTINGS_KEYS
          .filter((key) => backup.data[key] !== undefined)
          .map((key) => [key, backup.data[key]]));
      stateStore.set(next);
      return { changedKeys: Object.keys(next), previous: pickSettings(current) };
    },
    beginRestore: () => sync.beginRestore?.() || { ok: true, supported: false },
    endRestore: (payload) => sync.endRestore?.(payload) || { ok: true, supported: false },
  });
}

export function registerDesktopAppData(options = {}) {
  return appDataHost.registerLocal(APP_ID, createDesktopAppDataHandlers(options));
}

export function createDesktopBackup(stateStore, now = () => new Date()) {
  if (!stateStore?.get) throw new Error('Desktop backup requires a state store.');
  return {
    format: DESKTOP_BACKUP_FORMAT,
    schemaVersion: DESKTOP_BACKUP_SCHEMA_VERSION,
    appVersion: '1.0.0',
    exportedAt: now().toISOString(),
    data: pickSettings(stateStore.get()),
  };
}

export function validateDesktopBackup(backup) {
  const errors = [];
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    errors.push('O backup do desktop nao e um objeto valido.');
  } else {
    if (backup.format !== DESKTOP_BACKUP_FORMAT) errors.push('Formato de backup do desktop nao reconhecido.');
    if (!Number.isInteger(backup.schemaVersion) || backup.schemaVersion < 1) {
      errors.push('Versao de schema do desktop ausente ou invalida.');
    } else if (backup.schemaVersion > DESKTOP_BACKUP_SCHEMA_VERSION) {
      errors.push('O backup do desktop usa uma versao mais nova que o aplicativo.');
    }
    if (!backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) {
      errors.push('Preferencias do desktop ausentes ou invalidas.');
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    summary: { keys: SETTINGS_KEYS.filter((key) => backup?.data?.[key] !== undefined) },
  };
}

function pickSettings(state = {}) {
  return Object.fromEntries(SETTINGS_KEYS
    .filter((key) => state[key] !== undefined)
    .map((key) => [key, structuredClone(state[key])]));
}
