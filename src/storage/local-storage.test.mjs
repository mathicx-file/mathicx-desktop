import assert from 'node:assert/strict';
import test from 'node:test';

test('guest storage scope cannot read or overwrite the default profile', async () => {
  const localStorage = {
    setItem(key, value) { this[key] = value; },
    getItem(key) { return Object.hasOwn(this, key) ? this[key] : null; },
    removeItem(key) { delete this[key]; },
  };
  globalThis.window = {
    localStorage,
  };
  const { ls } = await import(`./local-storage.js?guest-test=${Date.now()}`);

  ls.set('prefs', { theme: 'dark' });
  ls.setScope('guest-local-v1');
  assert.deepEqual(ls.get('prefs', null), null);
  ls.set('prefs', { theme: 'light' });
  ls.setScope('');
  assert.deepEqual(ls.get('prefs'), { theme: 'dark' });
  ls.setScope('guest-local-v1');
  assert.deepEqual(ls.get('prefs'), { theme: 'light' });

  ls.clear();
  assert.equal(ls.get('prefs', null), null);
  ls.setScope('');
  assert.deepEqual(ls.get('prefs'), { theme: 'dark' });

  ls.clear();
  assert.equal(ls.get('prefs', null), null);
  ls.setScope('guest-local-v1');
  assert.equal(ls.get('prefs', null), null);

  delete globalThis.window;
});
