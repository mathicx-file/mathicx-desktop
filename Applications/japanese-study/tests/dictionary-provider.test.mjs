import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { DictionaryProvider } from '../js/dictionary/dictionary-provider.js';
import { LegacyDictionarySource } from '../js/dictionary/legacy-dictionary-source.js';
import { DictionaryRuntime } from '../js/dictionary/dictionary-runtime.js';
import {
  DICTIONARY_SCHEMA_VERSION,
  normalizeDictionaryEntry,
  normalizeDictionaryEntries,
  toLegacyDictionaryEntry,
} from '../js/dictionary/dictionary-schema.js';

const dictionaryUrl = new URL('../data/dictionary.json', import.meta.url);
const dictionaryData = JSON.parse(await fs.readFile(dictionaryUrl, 'utf8'));

test('normalizes a legacy dictionary entry into schema v1', () => {
  const normalized = normalizeDictionaryEntry(dictionaryData[0], { sourceId: 'test' });

  assert.equal(normalized.schemaVersion, DICTIONARY_SCHEMA_VERSION);
  assert.equal(normalized.id, dictionaryData[0].id);
  assert.equal(normalized.headword, dictionaryData[0].word);
  assert.deepEqual(normalized.romaji, [dictionaryData[0].romaji]);
  assert.equal(normalized.meanings[0].language, 'pt-BR');
  assert.equal(normalized.source.id, 'test');
});

test('converts normalized entries back to the current UI shape', () => {
  const normalized = normalizeDictionaryEntry(dictionaryData[0], { sourceId: 'test' });
  const legacy = toLegacyDictionaryEntry(normalized);

  assert.equal(legacy.id, dictionaryData[0].id);
  assert.equal(legacy.word, dictionaryData[0].word);
  assert.equal(legacy.definition, dictionaryData[0].definition);
  assert.equal(legacy.category, dictionaryData[0].category);
});

test('schema rejects missing and duplicate stable ids', () => {
  assert.throws(
    () => normalizeDictionaryEntry({ word: 'teste' }),
    /stable id/,
  );
  assert.throws(
    () => normalizeDictionaryEntries([dictionaryData[0], dictionaryData[0]]),
    /Duplicate dictionary id/,
  );
});

test('legacy source loads the current local JSON contract', async () => {
  const source = new LegacyDictionarySource({
    url: dictionaryUrl,
    fetchImpl: async () => ({ ok: true, json: async () => dictionaryData }),
  });
  const result = await source.load();

  assert.equal(result.entries.length, 42);
  assert.equal(result.metadata.sourceId, 'legacy-local-json');
  assert.equal(result.metadata.format, 'legacy-json');
});

test('provider initializes once and exposes normalized metadata', async () => {
  let loads = 0;
  const provider = new DictionaryProvider({
    source: {
      id: 'test-source',
      async load() {
        loads += 1;
        return { entries: dictionaryData, metadata: { sourceId: 'test-source', version: '1' } };
      },
    },
  });

  const [first, second] = await Promise.all([provider.init(), provider.init()]);

  assert.equal(loads, 1);
  assert.deepEqual(first, second);
  assert.equal(first.count, 42);
  assert.equal(first.schemaVersion, DICTIONARY_SCHEMA_VERSION);
});

test('provider searches headword, romaji, meaning and filters', async () => {
  const provider = new DictionaryProvider({
    source: { id: 'test-source', load: async () => dictionaryData },
  });

  assert.equal((await provider.search('mizu'))[0].id, 'hira_mizu');
  assert.equal((await provider.search('agua'))[0].id, 'hira_mizu');
  assert.equal((await provider.search('nihon'))[0].id, 'kanji_nihon');
  const katakanaCount = dictionaryData.filter((entry) => entry.script === 'katakana').length;
  assert.equal((await provider.search('', { script: 'katakana' })).length, katakanaCount);
  assert.equal((await provider.search('', { script: 'all' })).length, dictionaryData.length);
  assert.equal((await provider.search('', { category: 'tecnologia' })).length, 2);
  assert.equal((await provider.search('a', { limit: 3 })).length, 3);
});

test('provider preserves requested id order', async () => {
  const provider = new DictionaryProvider({
    source: { id: 'test-source', load: async () => dictionaryData },
  });
  const entries = await provider.getMany(['kanji_nihon', 'hira_mizu', 'missing']);

  assert.deepEqual(entries.map((entry) => entry.id), ['kanji_nihon', 'hira_mizu']);
  assert.equal((await provider.getById('hira_mizu')).headword, 'みず');
  assert.equal(await provider.getById('missing'), null);
});

test('runtime uses provider and returns the current UI shape', async () => {
  const legacyDictionary = createLegacyDictionaryStub();
  const runtime = new DictionaryRuntime({
    providerEnabled: true,
    provider: new DictionaryProvider({
      source: { id: 'test-source', load: async () => dictionaryData },
    }),
    legacyDictionary,
    loadLegacyEntries: async () => {
      throw new Error('legacy loader should not run');
    },
  });

  const state = await runtime.init();
  const results = await runtime.search('mizu', { script: 'hiragana' });
  const ordered = await runtime.filterByIds(['kanji_nihon', 'hira_mizu'], { script: 'hiragana' });

  assert.equal(state.mode, 'provider');
  assert.equal(state.fallback, false);
  assert.equal(results[0].id, 'hira_mizu');
  assert.equal(results[0].word, 'みず');
  assert.deepEqual(ordered.map((entry) => entry.id), ['hira_mizu']);
  assert.equal(legacyDictionary.getAll().length, 42);
});

test('runtime falls back to legacy data when provider initialization fails', async () => {
  const legacyDictionary = createLegacyDictionaryStub();
  const runtime = new DictionaryRuntime({
    providerEnabled: true,
    provider: { init: async () => { throw new Error('provider failed'); } },
    legacyDictionary,
    loadLegacyEntries: async () => dictionaryData,
  });

  const state = await runtime.init();
  const results = await runtime.search('mizu');

  assert.equal(state.mode, 'legacy');
  assert.equal(state.fallback, true);
  assert.equal(results[0].id, 'hira_mizu');
});

function createLegacyDictionaryStub() {
  let entries = [];
  return {
    setData(value) { entries = Array.isArray(value) ? value : []; },
    getAll() { return [...entries]; },
    search(query, filters = {}) {
      const normalized = String(query || '').toLowerCase();
      return entries.filter((entry) => {
        if (filters.script && filters.script !== 'all' && entry.script !== filters.script) return false;
        return !normalized || [entry.word, entry.reading, entry.romaji, entry.definition, entry.category]
          .some((value) => String(value || '').toLowerCase().includes(normalized));
      });
    },
    filterByIds(ids, filters = {}) {
      return ids
        .map((id) => entries.find((entry) => entry.id === id))
        .filter(Boolean)
        .filter((entry) => !filters.script || filters.script === 'all' || entry.script === filters.script);
    },
  };
}
