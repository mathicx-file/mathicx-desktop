import { createAppDataResponder } from '../../../src/apps/integration/app-data-contract.js';
import { createIntegratedAppDataHandlers } from '../../../src/apps/integration/integrated-app.js';

const APP_ID = '__APP_ID__';

export function createAppDataHandlers(options = {}) {
  return createIntegratedAppDataHandlers({
    appId: APP_ID,
    appVersion: '1.0.0',
    backup: {
      format: '__APP_ID__-backup',
      schemaVersion: 1,
      modes: ['merge', 'replace'],
      containsFinancialData: false,
    },
    getSyncStatus: options.getSyncStatus,
    syncNow: options.syncNow,
    exportBackup: options.exportBackup,
    validateBackup: options.validateBackup,
    importBackup: options.importBackup,
    beginRestore: options.beginRestore,
    endRestore: options.endRestore,
  });
}

export function installAppDataResponder(options = {}) {
  return createAppDataResponder({
    target: options.target || globalThis.window,
    appId: APP_ID,
    handlers: createAppDataHandlers(options),
  });
}
