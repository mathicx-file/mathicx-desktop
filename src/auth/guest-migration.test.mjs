import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GUEST_MIGRATION_READY_KEY,
  clearGuestMigrationReady,
  getGuestMigrationReady,
  markGuestMigrationReady,
} from './guest-migration.js';

test('stores only a version and timestamp for a prepared guest migration', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const marker = markGuestMigrationReady(storage, Date.parse('2026-07-16T12:00:00.000Z'));

  assert.deepEqual(marker, { schemaVersion: 1, preparedAt: '2026-07-16T12:00:00.000Z' });
  assert.deepEqual(getGuestMigrationReady(storage), marker);
  assert.equal(values.get(GUEST_MIGRATION_READY_KEY).includes('backup'), false);

  clearGuestMigrationReady(storage);
  assert.equal(getGuestMigrationReady(storage), null);
});
