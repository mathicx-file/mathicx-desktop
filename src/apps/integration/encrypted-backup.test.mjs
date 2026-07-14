import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decryptUnifiedBackup,
  encryptUnifiedBackup,
  PBKDF2_ITERATIONS,
  validateEncryptedBackupEnvelope,
} from './encrypted-backup.js';
import { createUnifiedBackupPackage } from './unified-backup.js';

const PASSWORD = 'uma senha longa e unica';

test('encrypts and decrypts a financial unified backup', async () => {
  const unified = await createUnifiedBackupPackage([
    createEntry('desktop', 'mathicx-desktop-backup', false),
    createEntry('finances', 'finances-backup', true),
  ], { encrypted: true, now: () => new Date('2026-07-14T18:00:00.000Z') });
  const encrypted = await encryptUnifiedBackup(unified, PASSWORD);
  const secondEncrypted = await encryptUnifiedBackup(unified, PASSWORD);
  const decrypted = await decryptUnifiedBackup(encrypted, PASSWORD);

  assert.equal(encrypted.encryption.kdf.iterations, PBKDF2_ITERATIONS);
  assert.equal(validateEncryptedBackupEnvelope(encrypted).ok, true);
  assert.deepEqual(decrypted, unified);
  assert.deepEqual(decrypted.apps.map((app) => app.appId), ['desktop', 'finances']);
  assert.notEqual(secondEncrypted.encryption.iv, encrypted.encryption.iv);
  assert.notEqual(secondEncrypted.encryption.kdf.salt, encrypted.encryption.kdf.salt);
});

test('rejects an incorrect password without exposing plaintext', async () => {
  const unified = await createUnifiedBackupPackage([
    createEntry('desktop', 'mathicx-desktop-backup', false),
  ], { encrypted: true });
  const encrypted = await encryptUnifiedBackup(unified, PASSWORD);

  await assert.rejects(decryptUnifiedBackup(encrypted, 'outra senha bastante longa'), {
    code: 'invalid-password-or-corrupted-backup',
  });
  await assert.rejects(decryptUnifiedBackup({ ...encrypted, exportedAt: '2026-07-15T00:00:00.000Z' }, PASSWORD), {
    code: 'invalid-password-or-corrupted-backup',
  });
  assert.equal(JSON.stringify(encrypted).includes('mathicx-desktop-backup'), false);
});

test('rejects weak passwords and tampered encryption metadata', async () => {
  const unified = await createUnifiedBackupPackage([
    createEntry('desktop', 'mathicx-desktop-backup', false),
  ], { encrypted: true });
  await assert.rejects(encryptUnifiedBackup(unified, 'curta'), { code: 'invalid-backup-password' });

  const encrypted = await encryptUnifiedBackup(unified, PASSWORD);
  encrypted.encryption.kdf.iterations = 10;
  assert.equal(validateEncryptedBackupEnvelope(encrypted).ok, false);
});

function createEntry(appId, format, containsFinancialData) {
  return {
    appId,
    capabilities: { backup: { format, schemaVersion: 1, containsFinancialData } },
    backup: { format, schemaVersion: 1, data: { value: 42 } },
  };
}
