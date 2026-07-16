import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GUEST_SESSION_STORAGE_KEY,
  GUEST_USER_SCOPE,
  GuestSession,
} from './guest-session.js';

test('creates, restores and clears a local guest session without credentials', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const first = new GuestSession({ storage });
  const user = first.enter();

  assert.equal(user.id, GUEST_USER_SCOPE);
  assert.equal(user.uid, undefined);
  assert.equal(user.email, '');
  assert.deepEqual(JSON.parse(values.get(GUEST_SESSION_STORAGE_KEY)), {
    schemaVersion: 1,
    active: true,
  });

  const restored = new GuestSession({ storage });
  assert.equal(restored.restore(), true);
  assert.equal(restored.getUser().perfil, 'guest');
  restored.clear();
  assert.equal(restored.getUser(), null);
  assert.equal(values.has(GUEST_SESSION_STORAGE_KEY), false);
});

test('rejects malformed persisted guest sessions', () => {
  const session = new GuestSession({
    storage: { getItem: () => '{invalid', removeItem() {}, setItem() {} },
  });
  assert.equal(session.restore(), false);
});

test('authentication facade exposes guest session restoration for kernel boot', async () => {
  const { authProvider } = await import(`./provider.js?guest-contract=${Date.now()}`);
  assert.equal(typeof authProvider.restoreGuestSession, 'function');
});
