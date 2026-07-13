import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { DictionaryProvider } from '../Applications/japanese-study/js/dictionary/dictionary-provider.js';
import { normalizeDictionaryEntries } from '../Applications/japanese-study/js/dictionary/dictionary-schema.js';
import { LauncherDictionarySearch } from '../src/launcher/japanese-dictionary-search.js';

const dictionaryUrl = new URL('../Applications/japanese-study/data/dictionary.json', import.meta.url);
const dictionaryData = JSON.parse(await fs.readFile(dictionaryUrl, 'utf8'));

test('launcher uses provider ranking and preserves result payload data', async () => {
  const search = new LauncherDictionarySearch({
    providerEnabled: true,
    provider: new DictionaryProvider({
      source: { id: 'test-source', load: async () => dictionaryData },
    }),
    loadLegacyWords: async () => {
      throw new Error('legacy loader should not run');
    },
  });

  const results = await search.search('mizu', { limit: 6 });
  const cached = search.getByResultId('japanese-study:dictionary:hira_mizu');

  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'hira_mizu');
  assert.equal(results[0].word, 'みず');
  assert.equal(cached.romaji, 'mizu');
  assert.equal(search.getState().mode, 'provider');
});

test('launcher limits provider results', async () => {
  const normalizedEntries = normalizeDictionaryEntries(dictionaryData, { sourceId: 'test-source' });
  const receivedLimits = [];
  const search = new LauncherDictionarySearch({
    providerEnabled: true,
    provider: {
      async search(_query, options) {
        receivedLimits.push(options.limit);
        return normalizedEntries.slice(0, options.limit);
      },
    },
  });

  assert.equal((await search.search('kana', { limit: 6 })).length, 6);
  assert.equal((await search.search('kana', { limit: 2 })).length, 2);
  assert.deepEqual(receivedLimits, [6, 2]);
});

test('launcher falls back to legacy ranking after provider failure', async () => {
  const search = new LauncherDictionarySearch({
    providerEnabled: true,
    provider: { search: async () => { throw new Error('provider failed'); } },
    loadLegacyWords: async () => dictionaryData,
  });

  const results = await search.search('mizu');

  assert.equal(results[0].id, 'hira_mizu');
  assert.equal(search.getState().mode, 'legacy-fallback');
  assert.equal(search.getState().fallback, true);
});

test('launcher ignores one-character dictionary queries', async () => {
  let providerCalls = 0;
  const search = new LauncherDictionarySearch({
    providerEnabled: true,
    provider: { search: async () => { providerCalls += 1; return []; } },
  });

  assert.deepEqual(await search.search('a'), []);
  assert.equal(providerCalls, 0);
});

test('global launcher search resolves provider result into Japanese Study action', async () => {
  const previousFetch = globalThis.fetch;
  const previousLocation = globalThis.location;
  globalThis.location = { search: '?dictionaryProviderV2=1' };
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => dictionaryData,
  });

  try {
    const launcherSearch = await import(`../src/launcher/search.js?provider-test=${Date.now()}`);
    const results = await launcherSearch.globalSearch('mizu');
    const dictionaryResult = results.find((result) => result.type === 'dictionary');
    const action = launcherSearch.resolveAction(dictionaryResult?.id);

    assert.equal(dictionaryResult?.id, 'japanese-study:dictionary:hira_mizu');
    assert.equal(action?.appId, 'japanese-study');
    assert.equal(action?.payload.view, 'dictionary');
    assert.equal(action?.payload.query, 'mizu');
    assert.equal(action?.payload.dictionaryId, 'hira_mizu');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousLocation === undefined) delete globalThis.location;
    else globalThis.location = previousLocation;
  }
});
