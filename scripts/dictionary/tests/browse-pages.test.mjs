import test from 'node:test';
import assert from 'node:assert/strict';

import { createArtifactDescriptor } from '../lib/distribution-manifest.mjs';
import { createBrowsePages, createBrowseRoute } from '../lib/browse-pages.mjs';

const CONFIG = {
  schemaVersion: 1,
  strategy: 'romaji-asc-pages',
  pageSize: 100,
  definitionMode: 'first-gloss',
};

test('creates deterministic romaji pages with compact display rows', () => {
  const packageData = createPackage();
  const result = createBrowsePages(packageData, CONFIG);
  assert.deepEqual(result.pages[0].rows.map((row) => row[3]), ['ame', 'inu', 'mizu']);
  assert.deepEqual(result.pages[0].rows[0].slice(1, 7), ['雨', 'あめ', 'ame', 'rain', 'kanji', 'noun']);
  assert.deepEqual(result.report.coverage, { all: 3, hiragana: 0, katakana: 0, kanji: 3 });

  const artifacts = result.pages.map((payload) => {
    const bytes = Buffer.from(`${JSON.stringify(payload)}\n`, 'utf8');
    return { payload, descriptor: createArtifactDescriptor(`browse/${payload.pageId}.json`, bytes) };
  });
  const route = createBrowseRoute(packageData, artifacts, CONFIG);
  assert.equal(route.order, 'romaji-asc-pages');
  assert.equal(route.coverage.all, 3);
  assert.deepEqual(Object.keys(route.pages), ['0000']);
});

test('rejects duplicate and invalid browse rows', () => {
  const packageData = createPackage();
  const result = createBrowsePages(packageData, CONFIG);
  result.pages[0].rows[1] = [...result.pages[0].rows[0]];
  assert.throws(() => createBrowseRoute(packageData, result.pages.map((payload) => ({
    payload,
    descriptor: createArtifactDescriptor(`browse/${payload.pageId}.json`, 'x'),
  })), CONFIG), /duplicate or missing/);
});

function createPackage() {
  return {
    id: 'bootstrap-n5',
    version: '2026.07.13-3',
    sources: [{ id: 'jmdict', version: 'test', sha256: 'a'.repeat(64) }],
    entries: [
      entry('3', '水', 'みず', 'water'),
      entry('1', '雨', 'あめ', 'rain'),
      entry('2', '犬', 'いぬ', 'dog'),
    ],
    translations: [],
    kanji: [],
    kanjiTranslations: [],
    strokeAssets: [],
  };
}

function entry(id, word, reading, gloss) {
  return {
    sourceEntryId: id,
    writtenForms: [word],
    readings: [reading],
    senses: [{ englishGlosses: [gloss], partOfSpeech: ['noun'] }],
  };
}
