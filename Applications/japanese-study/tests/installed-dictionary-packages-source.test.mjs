import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import test from 'node:test';

import {
  InstalledDictionaryPackagesSource,
  LayeredDictionarySource,
} from '../js/dictionary/installed-dictionary-packages-source.js';

test('searches a gzip package from cache and composes it with the essential source', async () => {
  const fixture = createInstalledFixture();
  const installedSource = new InstalledDictionaryPackagesSource({
    repository: fixture.repository,
    crypto: webcrypto,
  });
  const baseEntry = { id: 'jmdict-1', headword: '水', readings: ['みず'], meanings: [] };
  const layered = new LayeredDictionarySource({
    baseSource: {
      async load() { return { entries: [], metadata: { sourceId: 'essential', lazy: true } }; },
      async search() { return [baseEntry]; },
      async getMany(ids) { return ids.includes(baseEntry.id) ? [baseEntry] : []; },
      getMetrics() { return { searches: 1 }; },
    },
    installedSource,
  });

  await layered.load();
  const results = await layered.search('inu', { limit: 10 });
  assert.deepEqual(results.map((entry) => entry.id), ['jmdict-1', 'jmdict-999']);
  assert.equal(results[1].headword, '犬');
  assert.equal(results[1].meanings[0].text, 'dog');
  assert.equal(fixture.repository.networkRequests, 0);

  const byId = await layered.getMany(['jmdict-999', 'jmdict-1']);
  assert.deepEqual(byId.map((entry) => entry.id), ['jmdict-999', 'jmdict-1']);

  const page = await layered.browse({ packageId: 'core', page: 1, pageSize: 20 });
  assert.deepEqual(page.entries.map((entry) => entry.id), ['jmdict-999']);
  assert.deepEqual(page.entries[0].romaji, ['inu']);
  assert.equal(page.order, 'romaji-asc-pages');
  assert.equal(page.total, 1);
  assert.equal(page.hasNext, false);
  assert.deepEqual((await layered.search('inu', { packageId: 'core' })).map((entry) => entry.id), ['jmdict-999']);
});

test('ignores optional packages for one-character Latin searches', async () => {
  const fixture = createInstalledFixture();
  const source = new InstalledDictionaryPackagesSource({ repository: fixture.repository, crypto: webcrypto });
  assert.deepEqual(await source.search('i'), []);
});

function createInstalledFixture() {
  const version = '2026.07.13-3';
  const packageId = 'core-common';
  const entryId = 'jmdict-999';
  const entryBucket = createHash('sha256').update(entryId).digest('hex').slice(0, 1);
  const entryShard = {
    schemaVersion: 1,
    kind: 'dictionary-entry-shard',
    packageId,
    dictionaryVersion: version,
    shardId: entryBucket,
    entries: [{
      id: entryId,
      writtenForms: ['犬'],
      readings: ['いぬ'],
      senses: [{ id: 'jmdict-999-s1', glosses: { en: ['dog'] }, partOfSpeech: ['noun'] }],
      tags: [],
      common: true,
      source: { id: 'jmdict', entryId: '999' },
    }],
    translations: [],
  };
  const romajiShard = {
    schemaVersion: 1,
    kind: 'dictionary-search-index-shard',
    indexKind: 'romaji',
    packageId,
    dictionaryVersion: version,
    bucket: 'i',
    normalization: {},
    terms: { inu: [entryId] },
  };
  const emptyRoutes = Object.fromEntries(['written', 'reading', 'pt'].map((kind) => [kind, {
    schemaVersion: 1,
    kind: 'dictionary-search-routes',
    indexKind: kind,
    packageId,
    dictionaryVersion: version,
    routing: kind === 'written' ? 'first-code-point-page-256'
      : kind === 'reading' ? 'hiragana-first-code-point' : 'first-ascii-character',
    buckets: {},
  }]));
  const payloads = new Map();
  const entryDescriptor = addArtifact(payloads, `packages/${version}/core/entries/${entryBucket}.json.gz`, entryShard, 'entry-shard');
  const romajiDescriptor = addArtifact(payloads, `packages/${version}/core/indexes/romaji/i.json.gz`, romajiShard, 'index-shard');
  const browseDescriptor = addArtifact(payloads, `packages/${version}/core/browse/0000.json.gz`, {
    schemaVersion: 1,
    kind: 'dictionary-browse-page',
    packageId,
    dictionaryVersion: version,
    order: 'romaji-asc-pages',
    pageId: '0000',
    rows: [[entryId, '犬', 'いぬ', 'inu', 'dog', 'kanji', 'noun']],
    counts: { all: 1, hiragana: 0, katakana: 0, kanji: 1 },
  }, 'browse-page');
  const routes = {
    entries: addArtifact(payloads, `packages/${version}/core/routes/entries.json.gz`, {
      schemaVersion: 1,
      kind: 'dictionary-entry-routes',
      packageId,
      dictionaryVersion: version,
      routing: { strategy: 'sha256-id-prefix', prefixLength: 1 },
      coverage: { shards: 1, entries: 1 },
      buckets: { [entryBucket]: entryDescriptor },
    }, 'route'),
    indexes: {
      romaji: addArtifact(payloads, `packages/${version}/core/routes/romaji.json.gz`, {
        schemaVersion: 1,
        kind: 'dictionary-search-routes',
        indexKind: 'romaji',
        packageId,
        dictionaryVersion: version,
        routing: 'first-ascii-character',
        buckets: { i: romajiDescriptor },
      }, 'route'),
      ...Object.fromEntries(Object.entries(emptyRoutes).map(([kind, payload]) => [
        kind,
        addArtifact(payloads, `packages/${version}/core/routes/${kind}.json.gz`, payload, 'route'),
      ])),
    },
    browse: addArtifact(payloads, `packages/${version}/core/routes/browse.json.gz`, {
      schemaVersion: 1,
      kind: 'dictionary-browse-routes',
      packageId,
      dictionaryVersion: version,
      order: 'romaji-asc-pages',
      pageSize: 1000,
      coverage: { all: 1, hiragana: 0, katakana: 0, kanji: 1 },
      pages: { '0000': { artifact: browseDescriptor, counts: { all: 1, hiragana: 0, katakana: 0, kanji: 1 } } },
    }, 'route'),
  };
  const manifest = {
    format: 'mathicx-japanese-dictionary-offline-package',
    schemaVersion: 1,
    id: 'core',
    packageId,
    dictionaryVersion: version,
    distributionRevision: 2,
    routes,
    artifacts: [...payloads.keys()],
  };
  const state = { status: 'ready', packageId: 'core', version, distributionRevision: 2, manifest, updatedAt: 1 };
  return {
    repository: {
      networkRequests: 0,
      async getPackageStates() { return [state]; },
      async getArtifact(_version, artifactPath) { return payloads.get(artifactPath) || null; },
      async deleteArtifact() {},
      async putArtifact() { this.networkRequests += 1; },
      async getCacheState() { return { activeVersion: null, previousVersion: null }; },
    },
  };
}

function addArtifact(records, path, payload, kind) {
  const bytes = gzipSync(Buffer.from(`${JSON.stringify(payload)}\n`), { level: 9, mtime: 0 });
  const descriptor = {
    path,
    byteLength: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    kind,
    encoding: 'gzip',
  };
  records.set(path, {
    path,
    bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    byteLength: descriptor.byteLength,
    sha256: descriptor.sha256,
  });
  return descriptor;
}
