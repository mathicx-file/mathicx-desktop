import assert from 'node:assert/strict';

import { appRegistry, canonicalAppId } from '../src/apps/registry.js';
import { store } from '../src/core/state.js';
import { getFavorites, getPinned } from '../src/launcher/registry.js';

appRegistry.registerAll();

assert.equal(canonicalAppId('finanças'), 'finances');
assert.equal(canonicalAppId('finances'), 'finances');
assert.equal(appRegistry.get('finanças')?.id, 'finances');
assert.equal(appRegistry.get('finances')?.id, 'finances');

store.set({
  favorites: ['finanças', 'finances', 'japanese-study'],
  pinned: ['finanças'],
});

assert.deepEqual(getFavorites(), ['finances', 'japanese-study']);
assert.deepEqual(getPinned(), ['finances']);

console.log('App id migration tests passed.');
