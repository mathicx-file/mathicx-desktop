import {
  APP_DATA_ACTIONS,
  createProtocolError,
} from '../../../src/apps/integration/app-data-contract.js';

const APP_ID = 'japanese-study';

export function createJapaneseAppDataHandlers(options = {}) {
  const storage = options.storage;
  if (!storage?.exportBackup || !storage?.validateImportedBackup || !storage?.importBackup) {
    throw new Error('Japanese Study app data adapter requires the storage backup API.');
  }

  return {
    [APP_DATA_ACTIONS.capabilities]: async () => ({
      appId: APP_ID,
      protocolVersion: 1,
      actions: Object.values(APP_DATA_ACTIONS),
      backup: {
        format: 'japanese-study-backup',
        schemaVersion: 1,
        modes: ['merge', 'replace'],
        containsFinancialData: false,
      },
    }),
    [APP_DATA_ACTIONS.syncStatus]: async () => clone(options.getSyncStatus?.() || {
      state: 'checking',
      message: 'Sincronizacao ainda nao inicializada.',
    }),
    [APP_DATA_ACTIONS.syncNow]: async () => (
      options.syncNow?.() || { ok: false, reason: 'not-ready' }
    ),
    [APP_DATA_ACTIONS.backupExport]: async () => storage.exportBackup(),
    [APP_DATA_ACTIONS.backupValidate]: async ({ backup } = {}) => storage.validateImportedBackup(backup),
    [APP_DATA_ACTIONS.backupImport]: async ({ backup, mode, confirmed } = {}) => {
      if (confirmed !== true) {
        throw createProtocolError('confirmation-required', 'Backup import requires explicit confirmation.');
      }
      if (!['merge', 'replace'].includes(mode)) {
        throw createProtocolError('invalid-import-mode', `Unsupported backup import mode: ${mode}`);
      }
      const validation = storage.validateImportedBackup(backup);
      if (!validation.ok) {
        throw createProtocolError('invalid-backup', validation.errors.join(' '));
      }
      const summary = await storage.importBackup(backup, mode);
      await options.afterImport?.(mode);
      return { imported: true, mode, summary };
    },
    [APP_DATA_ACTIONS.restoreBegin]: async () => options.beginRestore?.() || { ok: true, supported: false },
    [APP_DATA_ACTIONS.restoreEnd]: async (payload = {}) => options.endRestore?.(payload) || { ok: true, supported: false },
  };
}

function clone(value) {
  return value && typeof value === 'object' ? structuredClone(value) : value;
}
