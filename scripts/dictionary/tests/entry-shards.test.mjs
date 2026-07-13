import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  createEntryShardId,
  createEntryShards,
  validateEntryShards,
} from '../lib/entry-shards.mjs';

const HASH = 'a'.repeat(64);
const CONFIG = {
  schemaVersion: 1,
  strategy: 'sha256-id-prefix',
  prefixLength: 2,
  emitEmptyShards: false,
  idealCompressedBytes: { min: 50 * 1024, max: 250 * 1024 },
  maxCompressedBytes: 500 * 1024,
};

test('routes stable entry ids by the configured SHA-256 prefix', () => {
  const id = 'jmdict-1358280';
  const expected = createHash('sha256').update(id).digest('hex').slice(0, 2);
  assert.equal(createEntryShardId(id, CONFIG), expected);
  assert.equal(createEntryShardId(id, CONFIG), createEntryShardId(id, CONFIG));
});

test('creates deterministic non-empty shards with colocated translations', () => {
  const packageData = createPackage();
  const first = createEntryShards(packageData, CONFIG);
  const second = createEntryShards(packageData, CONFIG);

  assert.deepEqual(first, second);
  assert.equal(first.report.coverage.lexicalEntries, 3);
  assert.equal(first.report.coverage.lexicalTranslations, 3);
  assert.equal(first.report.routing.logicalShardCount, 256);
  assert.equal(first.shards.every((shard) => shard.entries.length > 0), true);
  first.shards.forEach((shard) => {
    assert.deepEqual(
      new Set(shard.translations.map((item) => item.entryId)),
      new Set(shard.entries.map((item) => item.id)),
    );
  });
});

test('rejects missing records, misplaced entries and oversized shards', () => {
  const packageData = createPackage();
  const { shards } = createEntryShards(packageData, CONFIG);
  assert.throws(() => validateEntryShards(packageData, shards.slice(1), CONFIG), /do not preserve all/);

  const misplaced = structuredClone(shards);
  misplaced[0].shardId = misplaced[0].shardId === '00' ? '01' : '00';
  assert.throws(() => validateEntryShards(packageData, misplaced, CONFIG), /wrong shard/);

  const tinyLimit = { ...CONFIG, idealCompressedBytes: { min: 1, max: 1 }, maxCompressedBytes: 1 };
  assert.throws(() => validateEntryShards(packageData, shards, tinyLimit), /exceeds/);
});

function createPackage() {
  const entries = ['1000000', '1000001', '1000002'].map((sequence, index) => ({
    sourceEntryId: sequence,
    writtenForms: [`word-${index}`],
    readings: [`reading-${index}`],
    senses: [{ englishGlosses: [`meaning-${index}`] }],
  }));
  return {
    id: 'bootstrap-n5',
    version: '2026.07.13-2',
    sources: [
      { id: 'jmdict', version: '2026-07-13', sha256: HASH },
      { id: 'mathicx-ptbr', version: 'test', sha256: HASH },
    ],
    entries,
    kanji: [],
    translations: entries.map((entry, index) => ({
      entryId: `jmdict-${entry.sourceEntryId}`,
      senseId: `jmdict-${entry.sourceEntryId}:sense:1`,
      language: 'pt-BR',
      glosses: [`traducao-${index}`],
      status: 'reviewed',
    })),
    kanjiTranslations: [],
    strokeAssets: [],
  };
}
