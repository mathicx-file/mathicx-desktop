import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('source files do not contain common mojibake patterns', () => {
  const result = spawnSync(process.execPath, ['scripts/mojibake-check.mjs'], {
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
