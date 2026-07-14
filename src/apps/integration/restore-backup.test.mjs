import assert from 'node:assert/strict';
import test from 'node:test';

import { APP_DATA_ACTIONS } from './app-data-contract.js';
import {
  parseBackupFile,
  restoreBackupPackage,
  unlockBackupFile,
} from './restore-backup.js';
import { createUnifiedBackupPackage } from './unified-backup.js';

test('parses and validates a plain unified backup file', async () => {
  const unified = await createPackage(['desktop']);
  const parsed = parseBackupFile(JSON.stringify(unified));
  const unlocked = await unlockBackupFile(parsed, '');
  assert.equal(parsed.encrypted, false);
  assert.deepEqual(unlocked.unified, unified);
});

test('restores selected apps only after preventive backup is saved', async () => {
  const unified = await createPackage(['desktop', 'japanese-study']);
  const events = [];
  const host = createHost(events);
  const result = await restoreBackupPackage(host, unified, [
    selection('desktop', 'replace'),
  ], {
    saveRecoveryBackup: async (recovery) => events.push({ action: 'recovery-saved', recovery }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.restored, [{ appId: 'desktop', mode: 'replace' }]);
  assert.ok(events.findIndex((event) => event.action === 'recovery-saved') < events.findIndex((event) => event.action === APP_DATA_ACTIONS.backupImport));
  assert.equal(events.at(-1).payload.commit, true);
});

test('rolls back touched apps in reverse order when restore fails', async () => {
  const unified = await createPackage(['desktop', 'japanese-study']);
  const events = [];
  const host = createHost(events, { failImportFor: 'japanese-study' });

  await assert.rejects(restoreBackupPackage(host, unified, [
    selection('desktop', 'replace'),
    selection('japanese-study', 'merge'),
  ], {
    saveRecoveryBackup: async () => events.push({ action: 'recovery-saved' }),
  }), {
    code: 'restore-failed-rolled-back',
    failedAppId: 'japanese-study',
    failedStage: 'importacao (merge)',
  });

  const imports = events.filter((event) => event.action === APP_DATA_ACTIONS.backupImport);
  assert.deepEqual(imports.map((event) => [event.appId, event.payload.mode]), [
    ['desktop', 'replace'],
    ['japanese-study', 'merge'],
    ['japanese-study', 'replace'],
    ['desktop', 'replace'],
  ]);
  assert.deepEqual(events.filter((event) => event.action === APP_DATA_ACTIONS.restoreEnd).map((event) => event.payload.commit), [false, false]);
});

test('rejects a corrupted package before pausing apps or saving recovery', async () => {
  const unified = await createPackage(['desktop']);
  unified.apps[0].backup.data.value = 'tampered';
  const events = [];

  await assert.rejects(restoreBackupPackage(createHost(events), unified, [
    selection('desktop', 'replace'),
  ], {
    saveRecoveryBackup: async () => events.push({ action: 'recovery-saved' }),
  }), { code: 'invalid-unified-backup' });

  assert.deepEqual(events, []);
});

test('does not import when the preventive recovery cannot be saved', async () => {
  const unified = await createPackage(['desktop', 'japanese-study']);
  const events = [];

  await assert.rejects(restoreBackupPackage(createHost(events), unified, [
    selection('desktop', 'replace'),
    selection('japanese-study', 'merge'),
  ], {
    saveRecoveryBackup: async () => { throw new Error('download blocked'); },
  }), {
    code: 'restore-failed-rolled-back',
    failedStage: 'backup preventivo',
  });

  assert.equal(events.some((event) => event.action === APP_DATA_ACTIONS.backupImport), false);
  assert.deepEqual(events.filter((event) => event.action === APP_DATA_ACTIONS.restoreEnd)
    .map((event) => [event.appId, event.payload.commit]), [
    ['japanese-study', false],
    ['desktop', false],
  ]);
});

test('resumes only apps paused before a later pause failure', async () => {
  const unified = await createPackage(['desktop', 'japanese-study']);
  const events = [];

  await assert.rejects(restoreBackupPackage(createHost(events, {
    failBeginFor: 'japanese-study',
  }), unified, [
    selection('desktop', 'replace'),
    selection('japanese-study', 'replace'),
  ], {
    saveRecoveryBackup: async () => events.push({ action: 'recovery-saved' }),
  }), {
    code: 'restore-failed-rolled-back',
    failedAppId: 'japanese-study',
    failedStage: 'pausa da sincronizacao',
  });

  assert.deepEqual(events.filter((event) => event.action === APP_DATA_ACTIONS.restoreEnd)
    .map((event) => event.appId), ['desktop']);
  assert.equal(events.some((event) => event.action === 'recovery-saved'), false);
});

test('reports incomplete rollback and identifies the app that could not recover', async () => {
  const unified = await createPackage(['desktop', 'japanese-study']);
  const events = [];

  await assert.rejects(restoreBackupPackage(createHost(events, {
    failImportFor: 'japanese-study',
    failRollbackFor: 'desktop',
  }), unified, [
    selection('desktop', 'replace'),
    selection('japanese-study', 'merge'),
  ], {
    saveRecoveryBackup: async () => events.push({ action: 'recovery-saved' }),
  }), (error) => {
    assert.equal(error.code, 'restore-failed-rollback-incomplete');
    assert.deepEqual(error.rollbackErrors.map((item) => item.appId), ['desktop']);
    return true;
  });
});

async function createPackage(appIds) {
  return createUnifiedBackupPackage(appIds.map((appId) => ({
    appId,
    capabilities: capabilities(appId),
    backup: backup(appId, 'source'),
  })));
}

function selection(appId, mode) {
  return { appId, mode, capabilities: capabilities(appId) };
}

function capabilities(appId) {
  return {
    actions: Object.values(APP_DATA_ACTIONS),
    backup: { format: `${appId}-backup`, schemaVersion: 1, containsFinancialData: false },
  };
}

function backup(appId, value) {
  return { format: `${appId}-backup`, schemaVersion: 1, data: { value } };
}

function createHost(events, options = {}) {
  const failed = new Set();
  return {
    async request(appId, action, payload = {}) {
      events.push({ appId, action, payload });
      if (action === APP_DATA_ACTIONS.backupValidate) return { ok: true };
      if (action === APP_DATA_ACTIONS.backupExport) return backup(appId, 'current');
      if (action === APP_DATA_ACTIONS.restoreBegin) {
        if (options.failBeginFor === appId) throw new Error('simulated pause failure');
        return { ok: true };
      }
      if (action === APP_DATA_ACTIONS.restoreEnd) return { ok: true };
      if (action === APP_DATA_ACTIONS.backupImport) {
        if (options.failImportFor === appId && !failed.has(appId) && payload.backup?.data?.value === 'source') {
          failed.add(appId);
          throw new Error('simulated import failure');
        }
        if (options.failRollbackFor === appId && payload.backup?.data?.value === 'current') {
          throw new Error('simulated rollback failure');
        }
        return { imported: true };
      }
      throw new Error(`unsupported: ${action}`);
    },
  };
}
