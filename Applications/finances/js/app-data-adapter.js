import {
  createAppDataResponder,
} from '../../../src/apps/integration/app-data-contract.js';
import { createIntegratedAppDataHandlers } from '../../../src/apps/integration/integrated-app.js';

export const FINANCES_BACKUP_FORMAT = 'finances-backup';
export const FINANCES_BACKUP_SCHEMA_VERSION = 1;
const APP_ID = 'finances';

export function createFinancesAppDataHandlers(options = {}) {
  const storage = options.storage;
  if (!storage?.exportSnapshot || !storage?.importSnapshot) {
    throw new Error('Finances app data adapter requires the snapshot storage API.');
  }

  return createIntegratedAppDataHandlers({
    appId: APP_ID,
    appVersion: '1.0.0',
    backup: {
      format: FINANCES_BACKUP_FORMAT,
      schemaVersion: FINANCES_BACKUP_SCHEMA_VERSION,
      modes: ['merge', 'replace'],
      containsFinancialData: true,
    },
    getSyncStatus: () => clone(options.getSyncStatus?.() || {
      state: 'checking',
      message: 'Sincronizacao ainda nao inicializada.',
    }),
    syncNow: () => (
      options.syncNow?.() || { ok: false, reason: 'not-ready' }
    ),
    exportBackup: () => createFinancesBackup(storage.exportSnapshot(), options.now),
    validateBackup: (backup) => validateFinancesBackup(backup),
    importBackup: (backup, mode, validation) => {
      storage.importSnapshot(backup.data, { replace: mode === 'replace', source: 'unified-backup' });
      return { summary: validation.summary };
    },
    beginRestore: () => options.beginRestore?.() || { ok: true, supported: false },
    endRestore: (payload) => options.endRestore?.(payload) || { ok: true, supported: false },
  });
}

export function createFinancesBackup(state, now = () => new Date()) {
  return {
    format: FINANCES_BACKUP_FORMAT,
    schemaVersion: FINANCES_BACKUP_SCHEMA_VERSION,
    appVersion: '1.0.0',
    exportedAt: now().toISOString(),
    data: clone(state || {}),
  };
}

export function validateFinancesBackup(backup) {
  const errors = [];
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    errors.push('O backup do Finances nao e um objeto valido.');
  } else {
    if (backup.format !== FINANCES_BACKUP_FORMAT) errors.push('Formato de backup do Finances nao reconhecido.');
    if (!Number.isInteger(backup.schemaVersion) || backup.schemaVersion < 1) {
      errors.push('Versao de schema do Finances ausente ou invalida.');
    } else if (backup.schemaVersion > FINANCES_BACKUP_SCHEMA_VERSION) {
      errors.push('O backup do Finances usa uma versao mais nova que o aplicativo.');
    }
    if (!backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) {
      errors.push('Dados financeiros ausentes ou invalidos.');
    }
  }
  const data = backup?.data || {};
  return {
    ok: errors.length === 0,
    errors,
    summary: {
      profiles: count(data.profiles),
      transactions: count(data.transactions),
      cards: count(data.cards),
      goals: count(data.goals),
    },
  };
}

export function installFinancesAppDataResponder(options = {}) {
  const target = options.target || globalThis.window;
  const app = options.app || target?.App;
  const storage = options.storage || target?.Store;
  return createAppDataResponder({
    target,
    appId: APP_ID,
    handlers: createFinancesAppDataHandlers({
      storage,
      getSyncStatus: () => app?.getFirebaseSyncStatus?.(),
      syncNow: () => app?.syncFirebaseNow?.(),
      beginRestore: () => app?.beginFirebaseRestore?.(),
      endRestore: (payload) => app?.endFirebaseRestore?.(payload),
      now: options.now,
    }),
  });
}

function count(value) {
  return Array.isArray(value) ? value.length : 0;
}

function clone(value) {
  return value && typeof value === 'object' ? structuredClone(value) : value;
}

if (typeof window !== 'undefined') installFinancesAppDataResponder();
