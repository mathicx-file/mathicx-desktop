import assert from 'node:assert/strict';
import test from 'node:test';

import { APP_DATA_ACTIONS } from './app-data-contract.js';
import {
  createIntegratedAppDataHandlers,
  defineIntegratedAppManifest,
  listIntegratedAppDefinitions,
  validateIntegratedAppCapabilities,
} from './integrated-app.js';
import {
  GUEST_USER_SCOPE,
  appendUserScope,
  createUserScopeMessage,
  isRemoteUserScope,
  normalizeUserScope,
  resolveAuthenticatedUserScope,
} from './user-scope.js';
import { verifyIntegratedAppDataContract } from '../../../scripts/testing/integrated-app-contract.mjs';

test('defines and discovers integrated manifests in stable order', () => {
  const later = defineIntegratedAppManifest(createManifest('later-app', 20));
  const earlier = defineIntegratedAppManifest(createManifest('earlier-app', 10));
  const definitions = listIntegratedAppDefinitions([later, { id: 'plain-app' }, earlier]);

  assert.deepEqual(definitions.map((item) => item.appId), ['desktop', 'earlier-app', 'later-app']);
  assert.equal(definitions[1].userScoped, true);
  assert.equal(definitions[1].version, '1.0.0');
  assert.throws(() => defineIntegratedAppManifest({ id: 'invalid app', integration: { appData: true } }));
});

test('builds a complete reusable sync and backup adapter', async () => {
  const imported = [];
  const backup = { format: 'sample-backup', schemaVersion: 1, data: { value: 1 } };
  const handlers = createIntegratedAppDataHandlers({
    appId: 'sample-app',
    appVersion: '3.2.1',
    backup: {
      format: backup.format,
      schemaVersion: backup.schemaVersion,
      modes: ['merge', 'replace'],
      containsFinancialData: false,
    },
    getSyncStatus: () => ({ state: 'synced' }),
    syncNow: () => ({ ok: true }),
    exportBackup: () => structuredClone(backup),
    validateBackup: (value) => ({ ok: value?.format === backup.format, errors: [] }),
    importBackup: (value, mode) => {
      imported.push({ value, mode });
      return { summary: { values: 1 } };
    },
  });

  const capabilities = await verifyIntegratedAppDataContract({
    appId: 'sample-app',
    handlers,
    sampleBackup: backup,
  });
  assert.equal(capabilities.actions.includes(APP_DATA_ACTIONS.backupImport), true);
  assert.equal(capabilities.appVersion, '3.2.1');
  assert.equal((await handlers[APP_DATA_ACTIONS.backupImport]({
    backup,
    mode: 'replace',
    confirmed: true,
  })).summary.values, 1);
  assert.equal(imported.length, 1);
});

test('rejects incomplete backup contracts and invalid capabilities', async () => {
  assert.throws(() => createIntegratedAppDataHandlers({
    appId: 'sample-app',
    backup: { format: 'sample', schemaVersion: 1, modes: ['replace'] },
  }), /requires export/);

  assert.equal(validateIntegratedAppCapabilities({
    appId: 'sample-app',
    protocolVersion: 99,
    actions: ['unknown'],
  }, 'sample-app').ok, false);
});

test('normalizes and transports a Firebase user scope without changing URL fragments', () => {
  const auth = { getCurrentUser: () => ({ uid: 'firebase/user@example.com' }) };
  assert.equal(resolveAuthenticatedUserScope(auth), 'firebase_user_example_com');
  assert.equal(normalizeUserScope(''), 'local');
  assert.equal(
    appendUserScope('./app/index.html?mode=full#settings', 'user-1'),
    './app/index.html?mode=full&desktopUserScope=user-1#settings',
  );
  assert.deepEqual(createUserScopeMessage('sample-app', 'user/1'), {
    appId: 'sample-app',
    scope: 'user_1',
  });
  assert.equal(isRemoteUserScope('firebase-user-1'), true);
  assert.equal(isRemoteUserScope('local'), false);
  assert.equal(isRemoteUserScope(GUEST_USER_SCOPE), false);
});

function createManifest(id, order) {
  return {
    id,
    name: id,
    integration: {
      appData: true,
      version: '1.0.0',
      shortName: id.slice(0, 2),
      canOpen: true,
      financial: false,
      userScoped: true,
      order,
    },
    loader: async () => ({}),
  };
}
