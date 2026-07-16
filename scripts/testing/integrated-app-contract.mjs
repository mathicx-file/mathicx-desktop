import assert from 'node:assert/strict';

import { APP_DATA_ACTIONS } from '../../src/apps/integration/app-data-contract.js';
import { validateIntegratedAppCapabilities } from '../../src/apps/integration/integrated-app.js';

export async function verifyIntegratedAppDataContract(options = {}) {
  const appId = String(options.appId || '');
  const handlers = options.handlers || {};
  assert.equal(typeof handlers[APP_DATA_ACTIONS.capabilities], 'function');

  const capabilities = await handlers[APP_DATA_ACTIONS.capabilities]();
  assert.deepEqual(validateIntegratedAppCapabilities(capabilities, appId), { ok: true, errors: [] });

  if (capabilities.actions.includes(APP_DATA_ACTIONS.syncStatus)) {
    const status = await handlers[APP_DATA_ACTIONS.syncStatus]();
    assert.equal(typeof status?.state, 'string');
  }

  if (capabilities.backup) {
    assert.ok(options.sampleBackup, 'A sample backup is required by the reusable contract test.');
    const validation = await handlers[APP_DATA_ACTIONS.backupValidate]({ backup: options.sampleBackup });
    assert.equal(validation?.ok, true);
    await assert.rejects(
      handlers[APP_DATA_ACTIONS.backupImport]({
        backup: options.sampleBackup,
        mode: capabilities.backup.modes[0],
      }),
      { code: 'confirmation-required' },
    );
  }

  return capabilities;
}
