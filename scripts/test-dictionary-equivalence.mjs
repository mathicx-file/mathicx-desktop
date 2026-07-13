import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { JapaneseDictionary } from '../Applications/japanese-study/js/dictionary.js';
import { DictionaryProvider } from '../Applications/japanese-study/js/dictionary/dictionary-provider.js';
import { DictionaryRuntime } from '../Applications/japanese-study/js/dictionary/dictionary-runtime.js';
import { toLegacyDictionaryEntry } from '../Applications/japanese-study/js/dictionary/dictionary-schema.js';
import { LauncherDictionarySearch } from '../src/launcher/japanese-dictionary-search.js';

const dictionaryUrl = new URL('../Applications/japanese-study/data/dictionary.json', import.meta.url);
const dictionaryData = JSON.parse(await fs.readFile(dictionaryUrl, 'utf8'));

function createProvider() {
  return new DictionaryProvider({
    source: { id: 'equivalence-test', load: async () => dictionaryData },
  });
}

function sortedIds(entries) {
  return entries.map((entry) => entry.id).sort();
}

test('provider and legacy return equivalent reference query sets', async () => {
  JapaneseDictionary.setData(dictionaryData);
  const provider = createProvider();
  const queries = ['mizu', 'agua', 'nihon', 'kamera', 'tecnologia', 'substantivo'];

  for (const query of queries) {
    const legacy = JapaneseDictionary.search(query);
    const normalized = (await provider.search(query)).map(toLegacyDictionaryEntry);
    assert.deepEqual(sortedIds(normalized), sortedIds(legacy), `query=${query}`);
  }
});

test('provider and legacy return equivalent script filters', async () => {
  JapaneseDictionary.setData(dictionaryData);
  const provider = createProvider();

  for (const script of ['all', 'hiragana', 'katakana', 'kanji']) {
    const legacy = JapaneseDictionary.search('', { script });
    const normalized = (await provider.search('', { script })).map(toLegacyDictionaryEntry);
    assert.deepEqual(sortedIds(normalized), sortedIds(legacy), `script=${script}`);
  }
});

test('provider preserves favorites and history id ordering', async () => {
  JapaneseDictionary.setData(dictionaryData);
  const provider = createProvider();
  const ids = ['kanji_nihon', 'hira_mizu', 'kata_kamera'];

  const legacy = JapaneseDictionary.filterByIds(ids, { script: 'all' });
  const normalized = (await provider.getMany(ids)).map(toLegacyDictionaryEntry);

  assert.deepEqual(normalized.map((entry) => entry.id), legacy.map((entry) => entry.id));
});

test('launcher provider and legacy agree on reference top results', async () => {
  const providerSearch = new LauncherDictionarySearch({
    providerEnabled: true,
    provider: createProvider(),
    loadLegacyWords: async () => dictionaryData,
  });
  const legacySearch = new LauncherDictionarySearch({
    providerEnabled: false,
    loadLegacyWords: async () => dictionaryData,
  });

  for (const query of ['mizu', 'nihon', 'kamera', 'tecnologia']) {
    const providerResults = await providerSearch.search(query, { limit: 6 });
    const legacyResults = await legacySearch.search(query, { limit: 6 });
    assert.equal(providerResults[0]?.id, legacyResults[0]?.id, `query=${query}`);
  }
});

test('explicit rollback keeps application runtime on legacy mode', async () => {
  const runtime = new DictionaryRuntime({
    providerEnabled: false,
    provider: { init: async () => { throw new Error('provider must remain disabled'); } },
    legacyDictionary: JapaneseDictionary,
    loadLegacyEntries: async () => dictionaryData,
  });

  const state = await runtime.init();
  const results = await runtime.search('mizu');

  assert.equal(state.mode, 'legacy');
  assert.equal(state.providerRequested, false);
  assert.equal(results[0]?.id, 'hira_mizu');
});
