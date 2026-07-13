import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOOTSTRAP_PACKAGE_ID,
  PIPELINE_SCHEMA_VERSION,
  createJmdictEntryId,
  createKanjiEntryId,
  normalizeBootstrapPackage,
  normalizeKanjiEntry,
  normalizeKanjiTranslation,
  normalizeLexicalEntry,
  normalizeTranslation,
} from '../lib/pipeline-schema.mjs';

const HASH = 'a'.repeat(64);
const WORD = '\u98df\u3079\u308b';
const READING = '\u305f\u3079\u308b';
const KANJI = '\u98df';

test('creates stable IDs from authoritative source identifiers', () => {
  assert.equal(createJmdictEntryId('1358280'), 'jmdict-1358280');
  assert.equal(createKanjiEntryId(KANJI), 'kanjidic2-U+98DF');
  assert.throws(() => createJmdictEntryId('word-1'), /only digits/);
  assert.throws(() => createKanjiEntryId('AB'), /one Unicode character/);
});

test('normalizes JMdict lexical data without mixing pt-BR glosses', () => {
  const entry = normalizeLexicalEntry({
    sourceEntryId: '1358280',
    writtenForms: [WORD, WORD],
    readings: [READING],
    common: true,
    senses: [{
      partOfSpeech: ['v1'],
      englishGlosses: ['to eat'],
    }],
  });

  assert.equal(entry.schemaVersion, PIPELINE_SCHEMA_VERSION);
  assert.equal(entry.id, 'jmdict-1358280');
  assert.deepEqual(entry.writtenForms, [WORD]);
  assert.deepEqual(entry.senses[0].glosses, { en: ['to eat'] });
  assert.equal(entry.source.id, 'jmdict');
});

test('normalizes KANJIDIC2 metadata with a Unicode-stable id', () => {
  const entry = normalizeKanjiEntry({
    literal: KANJI,
    strokeCount: 9,
    grade: 2,
    readings: { on: ['\u30b7\u30e7\u30af'], kun: [READING] },
    meanings: { en: ['eat', 'food'] },
  });

  assert.equal(entry.id, 'kanjidic2-U+98DF');
  assert.equal(entry.codePoint, 'U+98DF');
  assert.deepEqual(entry.meanings.en, ['eat', 'food']);
});

test('keeps reviewed pt-BR translations in the project layer', () => {
  const translation = normalizeTranslation({
    entryId: 'jmdict-1358280',
    senseId: 'jmdict-1358280:sense:1',
    language: 'pt-BR',
    glosses: ['comer', 'alimentar-se'],
    status: 'reviewed',
    reviewedAt: '2026-07-13',
  });

  assert.equal(translation.source.id, 'mathicx-ptbr');
  assert.equal(translation.status, 'reviewed');
  assert.throws(
    () => normalizeTranslation({ ...translation, language: 'en' }),
    /must use pt-BR/,
  );
});

test('keeps kanji meanings in a separate reviewed pt-BR layer', () => {
  const translation = normalizeKanjiTranslation({
    entryId: 'kanjidic2-U+98DF',
    language: 'pt-BR',
    meanings: ['comer', 'alimento'],
    status: 'reviewed',
  });
  assert.equal(translation.source.id, 'mathicx-ptbr');
  assert.deepEqual(translation.meanings, ['comer', 'alimento']);
});

test('validates package IDs, hashes and cross references', () => {
  const payload = createValidPackage();
  const normalized = normalizeBootstrapPackage(payload, { requireReviewedTranslations: true });

  assert.equal(normalized.id, BOOTSTRAP_PACKAGE_ID);
  assert.equal(normalized.entries.length, 1);
  assert.equal(normalized.kanji.length, 1);
  assert.equal(normalized.translations.length, 1);
  assert.equal(normalized.strokeAssets.length, 1);
});

test('rejects duplicate IDs, missing references and draft publication', () => {
  const duplicate = createValidPackage();
  duplicate.entries.push(duplicate.entries[0]);
  assert.throws(() => normalizeBootstrapPackage(duplicate), /Duplicate lexical entry id/);

  const missingEntry = createValidPackage();
  missingEntry.translations[0].entryId = 'jmdict-999';
  assert.throws(() => normalizeBootstrapPackage(missingEntry), /missing entry/);

  const draft = createValidPackage();
  draft.translations[0].status = 'draft';
  assert.throws(
    () => normalizeBootstrapPackage(draft, { requireReviewedTranslations: true }),
    /not reviewed/,
  );

  const missingSource = createValidPackage();
  missingSource.sources = missingSource.sources.filter((source) => source.id !== 'kanjivg');
  assert.throws(() => normalizeBootstrapPackage(missingSource), /source missing from package metadata/);
});

function createValidPackage() {
  return {
    id: BOOTSTRAP_PACKAGE_ID,
    version: '2026.07.13-1',
    sources: [
      { id: 'jmdict', version: '2026-07-13', sha256: HASH },
      { id: 'kanjidic2', version: '2026-07-13', sha256: HASH },
      { id: 'kanjivg', version: 'r-test', sha256: HASH },
      { id: 'mathicx-ptbr', version: 'test', sha256: HASH },
    ],
    entries: [{
      sourceEntryId: '1358280',
      writtenForms: [WORD],
      readings: [READING],
      senses: [{ englishGlosses: ['to eat'] }],
    }],
    kanji: [{ literal: KANJI, strokeCount: 9, meanings: { en: ['eat'] } }],
    kanjiTranslations: [{
      entryId: 'kanjidic2-U+98DF',
      language: 'pt-BR',
      meanings: ['comer'],
      status: 'reviewed',
    }],
    translations: [{
      entryId: 'jmdict-1358280',
      senseId: 'jmdict-1358280:sense:1',
      language: 'pt-BR',
      glosses: ['comer'],
      status: 'reviewed',
    }],
    strokeAssets: [{
      literal: KANJI,
      path: 'assets/strokes/kanji/098df.svg',
      sha256: HASH,
    }],
  };
}
