import { createIntegratedAppDataHandlers } from '../../../src/apps/integration/integrated-app.js';

const APP_ID = 'japanese-study';

export function createJapaneseAppDataHandlers(options = {}) {
  const storage = options.storage;
  if (!storage?.exportBackup || !storage?.validateImportedBackup || !storage?.importBackup) {
    throw new Error('Japanese Study app data adapter requires the storage backup API.');
  }

  return createIntegratedAppDataHandlers({
    appId: APP_ID,
    appVersion: '2.0.0',
    backup: {
      format: 'japanese-study-backup',
      schemaVersion: 1,
      modes: ['merge', 'replace'],
      containsFinancialData: false,
    },
    getSyncStatus: () => clone(options.getSyncStatus?.() || {
      state: 'checking',
      message: 'Sincronizacao ainda nao inicializada.',
    }),
    syncNow: () => (
      options.syncNow?.() || { ok: false, reason: 'not-ready' }
    ),
    exportBackup: () => storage.exportBackup(),
    validateBackup: (backup) => storage.validateImportedBackup(backup),
    importBackup: async (backup, mode) => ({ summary: await storage.importBackup(backup, mode) }),
    afterImport: (mode) => options.afterImport?.(mode),
    beginRestore: () => options.beginRestore?.() || { ok: true, supported: false },
    endRestore: (payload) => options.endRestore?.(payload) || { ok: true, supported: false },
  });
}

function clone(value) {
  return value && typeof value === 'object' ? structuredClone(value) : value;
}
