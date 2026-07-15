import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertSafeAdminRevocation,
  buildAdminClaims,
  parseAdminCommand,
} from './lib/admin-claims.mjs';

test('grant and revoke preserve unrelated custom claims', () => {
  assert.deepEqual(buildAdminClaims({ plan: 'personal' }, true), {
    plan: 'personal',
    admin: true,
  });
  assert.deepEqual(buildAdminClaims({ plan: 'personal', admin: true }, false), {
    plan: 'personal',
  });
});

test('last administrator cannot be removed accidentally', () => {
  assert.throws(
    () => assertSafeAdminRevocation({ targetIsAdmin: true, adminCount: 1, allowNoAdmin: false }),
    /ultimo administrador/u,
  );
  assert.doesNotThrow(
    () => assertSafeAdminRevocation({ targetIsAdmin: true, adminCount: 2, allowNoAdmin: false }),
  );
  assert.doesNotThrow(
    () => assertSafeAdminRevocation({ targetIsAdmin: true, adminCount: 1, allowNoAdmin: true }),
  );
});

test('command parser requires one target and defaults to dry-run', () => {
  const parsed = parseAdminCommand(['grant', '--email', 'Owner@Example.com']);
  assert.equal(parsed.command, 'grant');
  assert.equal(parsed.email, 'owner@example.com');
  assert.equal(parsed.apply, false);
  assert.throws(() => parseAdminCommand(['grant']), /exatamente um identificador/u);
  assert.throws(
    () => parseAdminCommand(['grant', '--uid', 'one', '--email', 'two@example.com']),
    /exatamente um identificador/u,
  );
});
