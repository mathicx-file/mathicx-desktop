import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const configUrl = new URL('../config/sources.json', import.meta.url);
const licensesUrl = new URL('../../../Applications/japanese-study/data/dictionary/licenses.json', import.meta.url);
const legacyDictionaryUrl = new URL('../../../Applications/japanese-study/data/dictionary.json', import.meta.url);
const legacyKanjiUrl = new URL('../../../Applications/japanese-study/data/kanji.json', import.meta.url);
const japaneseStudyHtmlUrl = new URL('../../../Applications/japanese-study/index.html', import.meta.url);

const [config, licenses, legacyDictionary, legacyKanji] = await Promise.all(
  [configUrl, licensesUrl, legacyDictionaryUrl, legacyKanjiUrl]
    .map(async (url) => JSON.parse(await fs.readFile(url, 'utf8'))),
);
const japaneseStudyHtml = await fs.readFile(japaneseStudyHtmlUrl, 'utf8');

test('source matrix records the approved sources and licenses', () => {
  const expected = new Map([
    ['jmdict', 'CC-BY-SA-4.0'],
    ['kanjidic2', 'CC-BY-SA-4.0'],
    ['kanjivg', 'CC-BY-SA-3.0'],
    ['mathicx-ptbr', 'CC-BY-SA-4.0'],
  ]);

  assert.equal(config.schemaVersion, 1);
  assert.equal(config.updatePolicy.maximumAgeDays, 31);
  assert.deepEqual(new Set(config.sources.map((source) => source.id)), new Set(expected.keys()));
  config.sources.forEach((source) => {
    assert.equal(source.license.spdx, expected.get(source.id));
    assert.match(source.license.url, /^https:\/\//);
    assert.ok(source.versionStrategy);
  });
});

test('runtime attribution mirrors every approved source', () => {
  const approvedIds = config.sources.map((source) => source.id).sort();
  const runtimeIds = licenses.sources.map((source) => source.id).sort();
  assert.deepEqual(runtimeIds, approvedIds);
  assert.equal(licenses.dataLicense, 'CC-BY-SA-4.0');
  licenses.sources.forEach((source) => {
    assert.ok(source.attribution);
    assert.match(source.termsUrl, /^https:\/\//);
  });
});

test('Japanese Study exposes the dictionary attributions in its interface', () => {
  assert.match(japaneseStudyHtml, /Fontes e licen&ccedil;as/);
  assert.match(japaneseStudyHtml, /JMdict e KANJIDIC2/);
  assert.match(japaneseStudyHtml, /KanjiVG/);
  assert.match(japaneseStudyHtml, /Revis&atilde;o pt-BR Mathicx-File/);
  new Set(licenses.sources.map((source) => source.termsUrl)).forEach((url) => {
    assert.ok(japaneseStudyHtml.includes(url), `Missing visible attribution URL: ${url}`);
  });
});

test('bootstrap baseline matches the preserved legacy data', () => {
  assert.equal(legacyDictionary.length, config.bootstrap.baselineDictionaryEntries);
  assert.equal(legacyKanji.kanji.length, config.bootstrap.baselineKanjiEntries);
  assert.ok(config.bootstrap.excludeUntilReviewed.includes('unreviewed-portuguese-glosses'));
});
