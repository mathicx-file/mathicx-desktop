import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';

import { generateBootstrapPackage, validateBootstrapOutput } from '../lib/bootstrap-package.mjs';
import { importJmdictSnapshot, importKanjidic2Snapshot } from '../lib/import-pipeline.mjs';
import { normalizeBootstrapPackage } from '../lib/pipeline-schema.mjs';
import { createEditorialReview } from '../lib/editorial-review.mjs';

const fixtureRoot = new URL('./fixtures/', import.meta.url);
const [jmdictXml, kanjidicXml] = await Promise.all([
  fs.readFile(new URL('JMdict_e.fixture.xml', fixtureRoot), 'utf8'),
  fs.readFile(new URL('kanjidic2.fixture.xml', fixtureRoot), 'utf8'),
]);
const HASH = 'a'.repeat(64);
const selection = {
  schemaVersion: 1,
  packageId: 'bootstrap-n5',
  allowAmbiguousLexicalMatches: true,
  requireAllKanjiMatches: true,
};
const legacyDictionary = [
  { id: 'hira_mizu', word: 'みず', definition: 'agua' },
  { id: 'hira_hana', word: 'はな', definition: 'flor; nariz' },
];
const legacyKanji = {
  kanji: [
    { id: 'water', char: '水', meanings: ['agua'] },
    { id: 'fire', char: '火', meanings: ['fogo'] },
  ],
};

test('generates a reviewable bootstrap without overwriting source glosses', async () => {
  const inputs = await createInputs();
  const { packageData, report } = generateBootstrapPackage(inputs);

  assert.equal(packageData.entries.length, 3);
  assert.equal(packageData.kanji.length, 2);
  assert.equal(packageData.translations.length, 1);
  assert.equal(packageData.translations[0].status, 'draft');
  assert.deepEqual(packageData.translations[0].glosses, ['agua']);
  assert.deepEqual(packageData.entries[0].senses[0].glosses, { en: packageData.entries[0].senses[0].glosses.en });
  assert.equal(packageData.kanjiTranslations.length, 2);
  assert.equal(packageData.strokeAssets.length, 2);
  assert.equal(report.coverage.ambiguousWords, 1);
  assert.equal(report.publication.ready, false);
  assert.equal(report.reviewQueue[0].legacyId, 'hira_hana');
});

test('generated package is deterministic and cannot publish drafts as reviewed', async () => {
  const inputs = await createInputs();
  const first = generateBootstrapPackage(inputs);
  const second = generateBootstrapPackage(inputs);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.throws(
    () => normalizeBootstrapPackage(first.packageData, { requireReviewedTranslations: true }),
    /not reviewed/,
  );
});

test('applies a complete editorial review and marks the package publication-ready', async () => {
  const inputs = await createInputs();
  const review = createEditorialReview({
    ...inputs,
    packageVersion: inputs.version,
    acceptedAt: '2026-07-13',
  });
  const ambiguous = review.lexical.find((item) => item.status === 'pending');
  ambiguous.status = 'reviewed';
  const selectedEntry = inputs.jmdict.entries.find((entry) => entry.id === ambiguous.candidateEntryIds[0]);
  ambiguous.selections = [{
    entryId: selectedEntry.id,
    senseId: selectedEntry.senses[0].id,
    glossesPtBR: ['flor'],
  }];

  const { packageData, report } = generateBootstrapPackage({ ...inputs, editorialReview: review });
  assert.equal(packageData.editorial.status, 'reviewed');
  assert.equal(packageData.entries.length, 2);
  assert.deepEqual(
    packageData.aliases.lexical.find((alias) => alias.legacyId === ambiguous.legacyId).entryIds,
    [selectedEntry.id],
  );
  assert.equal(packageData.editorial.draftTranslations, 0);
  assert.equal(packageData.translations.every((item) => item.status === 'reviewed'), true);
  assert.equal(packageData.kanjiTranslations.every((item) => item.status === 'reviewed'), true);
  assert.equal(report.publication.ready, true);
  assert.equal(report.coverage.draftLexicalTranslations, 0);
  assert.equal(report.coverage.draftKanjiTranslations, 0);
  assert.equal(report.coverage.reviewedTranslations, packageData.translations.length + packageData.kanjiTranslations.length);
  assert.deepEqual(report.publication.blockers, []);
  assert.deepEqual(report.reviewQueue, []);
});

test('rejects unstable package versions', async () => {
  const inputs = await createInputs();
  assert.throws(() => generateBootstrapPackage({ ...inputs, version: 'latest' }), /YYYY.MM.DD-N/);
});

test('validates size, report counts and source licenses independently', async () => {
  const result = generateBootstrapPackage(await createInputs());
  const licenses = {
    sources: ['jmdict', 'kanjidic2', 'kanjivg', 'mathicx-ptbr'].map((id) => ({ id })),
  };
  const validation = validateBootstrapOutput(result.packageData, result.report, licenses, {
    byteLength: 1000,
    maxBytes: 2000,
  });
  assert.equal(validation.valid, true);
  assert.equal(validation.publicationReady, false);
  assert.throws(
    () => validateBootstrapOutput(result.packageData, result.report, licenses, { byteLength: 3000, maxBytes: 2000 }),
    /exceeds/,
  );
});

async function createInputs() {
  const jmdict = await importJmdictSnapshot({
    version: '2026-07-13', selection, baseline: legacyDictionary,
    snapshot: snapshot('JMdict_e.xml', jmdictXml),
  });
  const kanjidic2 = await importKanjidic2Snapshot({
    version: '2026-07-13', selection, baseline: legacyKanji,
    snapshot: snapshot('kanjidic2.xml', kanjidicXml),
  });
  return {
    jmdict,
    kanjidic2,
    selection,
    legacyDictionary,
    legacyKanji,
    version: '2026.07.13-1',
    kanjivgVersion: 'r-test',
    kanjivgSha256: HASH,
    projectVersion: 'test-commit',
    projectSha256: HASH,
    strokeAssets: [
      { literal: '水', path: 'assets/strokes/kanji/06c34.svg', sha256: HASH },
      { literal: '火', path: 'assets/strokes/kanji/0706b.svg', sha256: HASH },
    ],
  };
}

function snapshot(fileName, text) {
  const bytes = Buffer.from(text, 'utf8');
  return {
    fileName,
    compressed: false,
    byteLength: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    text,
  };
}
