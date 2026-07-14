import assert from 'node:assert/strict';
import test from 'node:test';

import { APP_DATA_ACTIONS } from './app-data-contract.js';
import {
  collectUnifiedBackup,
  createUnifiedBackupFileName,
  createUnifiedBackupPackage,
  downloadUnifiedBackup,
  validateUnifiedBackupPackage,
} from './unified-backup.js';

test('builds and validates a deterministic unified backup package', async () => {
  const entries = [createEntry('desktop', 'mathicx-desktop-backup')];
  const backup = await createUnifiedBackupPackage(entries, {
    now: () => new Date('2026-07-14T15:30:00.000Z'),
  });

  assert.equal(backup.encrypted, false);
  assert.equal(backup.apps[0].sha256.length, 64);
  assert.equal((await validateUnifiedBackupPackage(backup)).ok, true);
  assert.equal(createUnifiedBackupFileName(backup.exportedAt), 'mathicx-backup-2026-07-14T15-30-00-000.json');
});

test('detects content changes through the app checksum', async () => {
  const backup = await createUnifiedBackupPackage([createEntry('desktop', 'mathicx-desktop-backup')]);
  backup.apps[0].backup.data.theme = 'light';
  const validation = await validateUnifiedBackupPackage(backup);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join(' '), /Checksum invalido/);
});

test('rejects financial data until encrypted package support exists', async () => {
  const entry = createEntry('finances', 'finances-backup', true);
  await assert.rejects(createUnifiedBackupPackage([entry]), {
    code: 'financial-data-requires-encryption',
  });
});

test('plain downloader rejects content marked for a protected envelope', async () => {
  const protectedContent = await createUnifiedBackupPackage([
    createEntry('desktop', 'mathicx-desktop-backup'),
  ], { encrypted: true });
  assert.throws(() => downloadUnifiedBackup(protectedContent), {
    code: 'protected-package-required',
  });
});

test('collects and validates app exports through the shared contract', async () => {
  const calls = [];
  const entry = createEntry('desktop', 'mathicx-desktop-backup');
  const host = {
    async request(appId, action, payload) {
      calls.push({ appId, action, payload });
      if (action === APP_DATA_ACTIONS.backupExport) return entry.backup;
      if (action === APP_DATA_ACTIONS.backupValidate) return { ok: true };
      throw new Error('unsupported');
    },
  };
  const backup = await collectUnifiedBackup(host, [{
    appId: entry.appId,
    capabilities: entry.capabilities,
  }]);

  assert.equal(backup.apps.length, 1);
  assert.deepEqual(calls.map((call) => call.action), [
    APP_DATA_ACTIONS.backupExport,
    APP_DATA_ACTIONS.backupValidate,
  ]);
});

function createEntry(appId, format, containsFinancialData = false) {
  return {
    appId,
    capabilities: {
      backup: { format, schemaVersion: 1, containsFinancialData },
    },
    backup: { format, schemaVersion: 1, data: { theme: 'dark' } },
  };
}
