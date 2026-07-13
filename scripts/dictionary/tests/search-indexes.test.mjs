import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  createIndexBucket,
  createSearchIndexes,
  normalizeReadingTerm,
  romanizeReading,
  romanizeReadingVariants,
  tokenizePortuguese,
  validateSearchIndexes,
} from '../lib/search-indexes.mjs';
import { normalizeLexicalEntry } from '../lib/pipeline-schema.mjs';

const projectRoot = new URL('../../../', import.meta.url);

const HASH = 'a'.repeat(64);
const CONFIG = {
  schemaVersion: 1,
  indexKinds: ['written', 'reading', 'romaji', 'pt'],
  romanization: {
    library: 'wanakana', version: '5.3.1', style: 'hepburn', upcaseKatakana: false,
    variants: ['canonical', 'compact-apostrophe'],
  },
  routing: {
    written: 'first-code-point-page-256', reading: 'hiragana-first-code-point',
    romaji: 'first-ascii-character', pt: 'first-ascii-character',
  },
  idealCompressedBytes: { min: 10 * 1024, max: 100 * 1024 },
  maxCompressedBytes: 250 * 1024,
};

test('normalizes kana, Hepburn romaji and Portuguese tokens deterministically', () => {
  assert.equal(normalizeReadingTerm('バス'), 'ばす');
  assert.equal(romanizeReading('コーヒー'), 'koohii');
  assert.deepEqual(romanizeReadingVariants('きんようび'), ["kin'youbi", 'kinyoubi']);
  assert.deepEqual(tokenizePortuguese('Pão; água e café'), ['pao', 'agua', 'e', 'cafe']);
  assert.equal(createIndexBucket('reading', 'ばす'), 'u-3070');
  assert.equal(createIndexBucket('written', '食べる'), 'u-98');
  assert.equal(createIndexBucket('romaji', 'basu'), 'b');
  assert.equal(createIndexBucket('romaji', 'basu', 'first-ascii-prefix-2'), 'ba');
});

test('generates separate term-to-id indexes without embedding entries', () => {
  const result = createSearchIndexes(createPackage(), CONFIG);
  const written = findTerm(result.shards, 'written', '食べる');
  const reading = findTerm(result.shards, 'reading', 'たべる');
  const romaji = findTerm(result.shards, 'romaji', 'taberu');
  const portuguese = findTerm(result.shards, 'pt', 'comer');

  assert.deepEqual(written, ['jmdict-1000000']);
  assert.deepEqual(reading, ['jmdict-1000000']);
  assert.deepEqual(romaji, ['jmdict-1000000']);
  assert.deepEqual(portuguese, ['jmdict-1000000']);
  assert.equal(result.shards.every((shard) => !Object.hasOwn(shard, 'entries')), true);
  assert.equal(result.report.indexes.reading.entriesCovered, 3);
  assert.equal(result.report.indexes.romaji.entriesCovered, 3);
  assert.deepEqual(result, createSearchIndexes(createPackage(), CONFIG));
});

test('keeps numeric object keys in deterministic JavaScript property order', () => {
  const packageData = createPackage();
  packageData.entries.push(normalizeLexicalEntry({
    sourceEntryId: '9999999',
    source: { id: 'jmdict', version: 'fixture', entryId: '9999999' },
    writtenForms: ['10', '2'],
    readings: ['じゅう'],
    senses: [{ englishGlosses: ['ten'] }],
  }));
  const result = createSearchIndexes(packageData, CONFIG);
  const numericShard = result.shards.find((shard) => shard.indexKind === 'written' && shard.bucket === 'u-00');
  assert.deepEqual(Object.keys(numericShard.terms).slice(0, 2), ['2', '10']);
});

test('rejects missing shards, wrong buckets, unknown ids and size overflow', () => {
  const packageData = createPackage();
  const { shards } = createSearchIndexes(packageData, CONFIG);
  assert.throws(() => validateSearchIndexes(packageData, shards.slice(1), CONFIG), /do not preserve/);

  const wrongBucket = structuredClone(shards);
  wrongBucket[0].bucket = wrongBucket[0].bucket === 'a' ? 'b' : 'a';
  assert.throws(() => validateSearchIndexes(packageData, wrongBucket, CONFIG), /wrong bucket|Unexpected/);

  const unknown = structuredClone(shards);
  const firstIds = Object.values(unknown[0].terms)[0];
  firstIds[0] = 'jmdict-9999999';
  assert.throws(() => validateSearchIndexes(packageData, unknown, CONFIG), /unknown entry/);

  const tinyLimit = { ...CONFIG, idealCompressedBytes: { min: 1, max: 1 }, maxCompressedBytes: 1 };
  assert.throws(() => validateSearchIndexes(packageData, shards, tinyLimit), /exceeds/);
});

test('generated indexes preserve every legacy bootstrap lookup through aliases', async () => {
  const [packageData, config, legacy] = await Promise.all([
    readProjectJson('Applications/japanese-study/data/dictionary/packs/bootstrap-n5.json'),
    readProjectJson('scripts/dictionary/config/search-indexes.json'),
    readProjectJson('Applications/japanese-study/data/dictionary.json'),
  ]);
  const maps = Object.fromEntries(['written', 'reading', 'romaji', 'pt'].map((kind) => [kind, new Map()]));
  for (const shard of createSearchIndexes(packageData, config).shards) {
    Object.entries(shard.terms).forEach(([term, ids]) => maps[shard.indexKind].set(term, ids));
  }

  let checks = 0;
  for (const item of legacy) {
    const aliasIds = new Set(packageData.aliases.lexical.find((alias) => alias.legacyId === item.id)?.entryIds || []);
    const resolves = (ids = []) => ids.some((id) => aliasIds.has(id));
    const hasKanji = [...String(item.word || '')].some((char) => /\p{Script=Han}/u.test(char));
    const primaryKind = hasKanji ? 'written' : 'reading';
    const primaryTerm = hasKanji ? item.word.normalize('NFKC') : normalizeReadingTerm(item.word);
    assert.equal(resolves(maps[primaryKind].get(primaryTerm)), true, `${item.id} missing from ${primaryKind}`);
    checks += 1;

    assert.equal(resolves(maps.romaji.get(String(item.romaji || '').toLowerCase())), true, `${item.id} missing from romaji`);
    checks += 1;
    for (const token of tokenizePortuguese(item.definition)) {
      assert.equal(resolves(maps.pt.get(token)), true, `${item.id} missing from pt token ${token}`);
      checks += 1;
    }
  }
  assert.equal(checks, 137);
});

function findTerm(shards, indexKind, term) {
  return shards.find((shard) => shard.indexKind === indexKind && Object.hasOwn(shard.terms, term))?.terms[term];
}

function createPackage() {
  const entries = [
    { sourceEntryId: '1000000', writtenForms: ['食べる'], readings: ['たべる'], gloss: 'comer; alimentar-se' },
    { sourceEntryId: '1000001', writtenForms: [], readings: ['バス'], gloss: 'ônibus' },
    { sourceEntryId: '1000002', writtenForms: ['日本'], readings: ['にほん'], gloss: 'Japão' },
  ];
  return {
    id: 'bootstrap-n5',
    version: '2026.07.13-2',
    sources: [
      { id: 'jmdict', version: '2026-07-13', sha256: HASH },
      { id: 'mathicx-ptbr', version: 'test', sha256: HASH },
    ],
    entries: entries.map((entry) => ({
      sourceEntryId: entry.sourceEntryId,
      writtenForms: entry.writtenForms,
      readings: entry.readings,
      senses: [{ englishGlosses: ['fixture meaning'] }],
    })),
    kanji: [],
    translations: entries.map((entry) => ({
      entryId: `jmdict-${entry.sourceEntryId}`,
      senseId: `jmdict-${entry.sourceEntryId}:sense:1`,
      language: 'pt-BR',
      glosses: entry.gloss.split(';').map((item) => item.trim()),
      status: 'reviewed',
    })),
    kanjiTranslations: [],
    strokeAssets: [],
  };
}

async function readProjectJson(relativePath) {
  return JSON.parse(await fs.readFile(new URL(relativePath, projectRoot), 'utf8'));
}
