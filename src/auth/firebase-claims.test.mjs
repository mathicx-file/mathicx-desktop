import assert from 'node:assert/strict';
import test from 'node:test';

import { hasAdminClaim, roleFromClaims } from './firebase-claims.js';

test('only the signed admin claim grants the Firebase admin role', () => {
  assert.equal(hasAdminClaim({ admin: true }), true);
  assert.equal(roleFromClaims({ admin: true }), 'admin');
  assert.equal(hasAdminClaim({ admin: 'true' }), false);
  assert.equal(roleFromClaims({ role: 'admin' }), 'user');
  assert.equal(roleFromClaims(null), 'user');
});
