import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import {
  importJmdictSnapshot,
  importKanjidic2Snapshot,
  validateImportArtifacts,
} from '../lib/import-pipeline.mjs';
import { selectKanjiTier, selectLexicalTier } from '../lib/bootstrap-selection.mjs';
import { readSourceSnapshot } from '../lib/source-io.mjs';
import { parseJmdictXml, parseKanjidic2Xml } from '../lib/xml-sources.mjs';

const fixtureRoot = new URL('./fixtures/', import.meta.url);
const [jmdictXml, kanjidicXml] = await Promise.all([
  fs.readFile(new URL('JMdict_e.fixture.xml', fixtureRoot), 'utf8'),
  fs.readFile(new URL('kanjidic2.fixture.xml', fixtureRoot), 'utf8'),
]);
const selection = {
  schemaVersion: 1,
  packageId: 'bootstrap-n5',
  allowAmbiguousLexicalMatches: true,
  requireAllKanjiMatches: true,
};
const lexicalBaseline = [
  { id: 'hira_mizu', word: 'みず' },
  { id: 'hira_hana', word: 'はな' },
];
const kanjiBaseline = {
  kanji: [
    { id: 'water', char: '水' },
    { id: 'fire', char: '火' },
  ],
};

test('parses JMdict entities, language attributes and stable sequences', () => {
  const entries = parseJmdictXml(jmdictXml, { version: 'fixture' });

  assert.equal(entries.length, 4);
  assert.equal(entries[0].id, 'jmdict-1000010');
  assert.equal(entries[0].common, true);
  assert.match(entries[0].senses[0].partOfSpeech[0], /noun/);
  assert.deepEqual(entries[1].senses[0].glosses.en, ['flower']);
});

test('parses only Japanese readings and English KANJIDIC2 meanings', () => {
  const entries = parseKanjidic2Xml(kanjidicXml, { version: 'fixture' });
  const water = entries.find((entry) => entry.literal === '水');

  assert.equal(entries.length, 2);
  assert.equal(water.id, 'kanjidic2-U+6C34');
  assert.deepEqual(water.readings.on, ['スイ']);
  assert.deepEqual(water.readings.kun, ['みず']);
  assert.deepEqual(water.meanings.en, ['water']);
});

test('selects common and full package tiers deterministically', () => {
  const lexical = [
    { id: 'jmdict-2', common: false },
    { id: 'jmdict-1', common: true },
  ];
  const kanji = [
    { id: 'kanjidic2-4e00', grade: 1 },
    { id: 'kanjidic2-4e01', grade: 9 },
    { id: 'kanjidic2-4e02', grade: 8 },
  ];
  assert.deepEqual(selectLexicalTier(lexical, 'common').entries.map((entry) => entry.id), ['jmdict-1']);
  assert.deepEqual(selectLexicalTier(lexical, 'full').entries.map((entry) => entry.id), [
    'jmdict-1', 'jmdict-2',
  ]);
  assert.deepEqual(selectKanjiTier(kanji, 'common').entries.map((entry) => entry.id), [
    'kanjidic2-4e00', 'kanjidic2-4e02',
  ]);
  assert.equal(selectKanjiTier(kanji, 'full').entries.length, 3);
});

test('selects bootstrap aliases and reports controlled lexical ambiguity', async () => {
  const jmdict = await importJmdictSnapshot({
    version: '2026-07-13', selection, baseline: lexicalBaseline,
    snapshot: snapshot('JMdict_e.xml', jmdictXml),
  });
  const kanjidic2 = await importKanjidic2Snapshot({
    version: '2026-07-13', selection, baseline: kanjiBaseline,
    snapshot: snapshot('kanjidic2.xml', kanjidicXml),
  });
  const report = validateImportArtifacts(jmdict, kanjidic2, selection);

  assert.equal(jmdict.entries.length, 3);
  assert.equal(jmdict.selection.ambiguous.length, 1);
  assert.deepEqual(jmdict.aliases[1].entryIds, ['jmdict-1000020', 'jmdict-1000030']);
  assert.equal(kanjidic2.entries.length, 2);
  assert.equal(report.valid, true);
  assert.equal(report.counts.lexicalAmbiguities, 1);
});

test('rejects unmatched required baseline records', async () => {
  const jmdict = await importJmdictSnapshot({
    version: '2026-07-13', selection, baseline: [...lexicalBaseline, { id: 'missing', word: '不存在' }],
    snapshot: snapshot('JMdict_e.xml', jmdictXml),
  });
  const kanjidic2 = await importKanjidic2Snapshot({
    version: '2026-07-13', selection, baseline: kanjiBaseline,
    snapshot: snapshot('kanjidic2.xml', kanjidicXml),
  });

  assert.throws(() => validateImportArtifacts(jmdict, kanjidic2, selection), /unmatched baseline/);
});

test('reads gzip snapshots, verifies hashes and rejects invalid UTF-8', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mathicx-dictionary-'));
  const gzipPath = path.join(directory, 'JMdict_e.xml.gz');
  const invalidPath = path.join(directory, 'invalid.xml');
  const compressed = gzipSync(Buffer.from(jmdictXml, 'utf8'));
  const hash = createHash('sha256').update(compressed).digest('hex');
  await fs.writeFile(gzipPath, compressed);
  await fs.writeFile(invalidPath, Buffer.from([0xc3, 0x28]));

  const result = await readSourceSnapshot(gzipPath, { expectedSha256: hash });
  assert.equal(result.compressed, true);
  assert.equal(result.sha256, hash);
  assert.equal(result.text, jmdictXml);
  await assert.rejects(() => readSourceSnapshot(gzipPath, { expectedSha256: '0'.repeat(64) }), /mismatch/);
  await assert.rejects(() => readSourceSnapshot(invalidPath), /not valid UTF-8/);
});

test('produces byte-equivalent artifacts for the same pinned inputs', async () => {
  const options = {
    version: '2026-07-13', selection, baseline: lexicalBaseline,
    snapshot: snapshot('JMdict_e.xml', jmdictXml),
  };
  const first = await importJmdictSnapshot(options);
  const second = await importJmdictSnapshot(options);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('requires a valid source date for reproducible imports', async () => {
  await assert.rejects(
    () => importJmdictSnapshot({
      version: 'latest', selection, baseline: lexicalBaseline,
      snapshot: snapshot('JMdict_e.xml', jmdictXml),
    }),
    /YYYY-MM-DD/,
  );
});

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
