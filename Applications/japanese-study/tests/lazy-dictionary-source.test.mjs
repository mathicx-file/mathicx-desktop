import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexedDB } from 'fake-indexeddb';

import { DictionaryCacheRepository } from '../js/dictionary/dictionary-cache-repository.js';
import { DictionaryCacheInstaller } from '../js/dictionary/dictionary-cache-installer.js';
import { DictionaryUpdateManager } from '../js/dictionary/dictionary-update-manager.js';
import {
  LazyDictionarySource,
  createRuntimeIndexBucket,
} from '../js/dictionary/lazy-dictionary-source.js';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dictionaryRoot = path.join(appRoot, 'data', 'dictionary');
const dataUrl = new URL('https://dictionary.test/data/dictionary/');
const manifestUrl = new URL('manifests/2026.07.13-3.json', dataUrl);

test('routes expanded Latin indexes by two-character prefixes', () => {
  assert.equal(createRuntimeIndexBucket('romaji', 'mizu', 'first-ascii-prefix-2'), 'mi');
  assert.equal(createRuntimeIndexBucket('pt', 'agua', 'first-ascii-prefix-2'), 'ag');
});

test('initializes with manifest and routes without downloading packs or shards', async () => {
  const requests = [];
  const source = createSource('init', createFileFetch(requests));
  const result = await source.load();

  assert.equal(result.metadata.lazy, true);
  assert.equal(result.metadata.version, '2026.07.13-3');
  assert.equal(result.metadata.count, 44);
  assert.equal(requests.length, 6);
  assert.ok(requests.every((item) => item.includes('/manifests/') || item.includes('/routes/')));
  assert.ok(source.getMetrics().maxConcurrentNetworkRequests <= 3);
  await source.repository.close();
});

test('opens the promoted cache version while offline instead of the embedded manifest', async () => {
  const repository = new DictionaryCacheRepository({
    indexedDB,
    dbName: `MathicxLazyDictionary-active-${Date.now()}-${Math.random()}`,
  });
  const manifest = JSON.parse(await fs.readFile(
    path.join(dictionaryRoot, 'manifests', '2026.07.13-3.json'),
    'utf8',
  ));
  const installer = new DictionaryCacheInstaller({
    repository,
    loadArtifact: (artifactPath) => fs.readFile(path.join(dictionaryRoot, ...artifactPath.split('/'))),
  });
  await installer.installAndPromote(manifest);

  const source = new LazyDictionarySource({
    repository,
    dataUrl,
    manifestUrl,
    fetchImpl: async () => { throw new Error('offline'); },
  });
  const result = await source.load();
  assert.equal(result.metadata.version, '2026.07.13-3');
  assert.equal((await source.search('mizu'))[0].id, 'jmdict-1371260');
  assert.equal(source.getMetrics().networkRequests, 0);
  await repository.close();
});

test('prepares the current release online and reopens the complete essential dictionary offline', async () => {
  const repository = new DictionaryCacheRepository({
    indexedDB,
    dbName: `MathicxLazyDictionary-prepared-${Date.now()}-${Math.random()}`,
  });
  const manifest = JSON.parse(await fs.readFile(
    path.join(dictionaryRoot, 'manifests', '2026.07.13-3.json'),
    'utf8',
  ));
  const manager = new DictionaryUpdateManager({
    repository,
    dataUrl,
    fetchImpl: createFileFetch([]),
  });
  const prepared = await manager.prepareOffline({
    status: 'current',
    remoteVersion: manifest.dictionaryVersion,
    manifest,
    release: { artifacts: { byteLength: 300000 } },
  });
  assert.equal(prepared.status, 'promoted');

  const offline = new LazyDictionarySource({
    repository,
    dataUrl,
    manifestUrl,
    fetchImpl: async () => { throw new Error('offline'); },
  });
  assert.equal((await offline.load()).metadata.version, manifest.dictionaryVersion);
  assert.equal((await offline.search('mizu'))[0].id, 'jmdict-1371260');
  assert.equal(offline.getMetrics().networkRequests, 0);
  await repository.close();
});

test('routes romaji and Portuguese searches through only required shards', async () => {
  const requests = [];
  const source = createSource('search', createFileFetch(requests));
  await source.load();
  const afterInit = requests.length;

  const [mizu] = await source.search('mizu');
  assert.equal(mizu.id, 'jmdict-1371260');
  assert.equal(mizu.romaji[0], 'mizu');
  assert.ok(mizu.meanings.some((meaning) => normalizeLatin(meaning.text) === 'agua'));
  assert.ok(requests.slice(afterInit).some((item) => item.includes('/indexes/2026.07.13-3/romaji/m.json')));
  assert.ok(requests.slice(afterInit).some((item) => item.includes('/shards/entries/2026.07.13-3/35.json')));
  assert.ok(!requests.slice(afterInit).some((item) => item.includes('/packs/')));

  const afterFirstSearch = requests.length;
  assert.equal((await source.search('mizu'))[0].id, 'jmdict-1371260');
  assert.equal(requests.length, afterFirstSearch);

  assert.equal((await source.search('agua'))[0].id, 'jmdict-1371260');
  const metrics = source.getMetrics();
  assert.ok(metrics.cacheHits >= 3);
  assert.ok(metrics.indexShardsRead >= 4);
  assert.equal(metrics.failedSearches, 0);
  await source.repository.close();
});

test('loads the essential pack only for an empty dictionary query', async () => {
  const requests = [];
  const source = createSource('pack', createFileFetch(requests));
  await source.load();

  const entries = await source.search('', { limit: 10 });
  assert.equal(entries.length, 10);
  assert.ok(requests.some((item) => item.endsWith('/packs/bootstrap-n5.json')));
  assert.ok(!requests.some((item) => item.includes('/indexes/')));
  assert.ok(!requests.some((item) => item.includes('/shards/entries/')));
  await source.repository.close();
});

test('browses deterministic essential pages without loading search indexes', async () => {
  const requests = [];
  const source = createSource('browse', createFileFetch(requests));
  await source.load();

  const first = await source.browse({ page: 1, pageSize: 10 });
  const second = await source.browse({ page: 2, pageSize: 10 });
  assert.equal(first.entries.length, 10);
  assert.equal(first.total, 44);
  assert.equal(first.hasPrevious, false);
  assert.equal(first.hasNext, true);
  assert.equal(second.entries.length, 10);
  assert.equal(second.hasPrevious, true);
  assert.equal(new Set([...first.entries, ...second.entries].map((entry) => entry.id)).size, 20);
  assert.ok(requests.some((item) => item.includes('/shards/entries/')));
  assert.ok(!requests.some((item) => item.includes('/indexes/')));
  await source.repository.close();
});

test('resolves stable IDs lazily and leaves legacy aliases for runtime fallback', async () => {
  const source = createSource('ids', createFileFetch([]));
  await source.load();

  const entries = await source.getMany(['jmdict-1371260', 'hira_mizu', 'jmdict-1582710']);
  assert.deepEqual(entries.map((entry) => entry.id), ['jmdict-1371260', 'jmdict-1582710']);
  assert.equal(entries[0].romaji[0], 'mizu');
  await source.repository.close();
});

test('aborts an obsolete shard request without caching partial data', async () => {
  const requests = [];
  const baseFetch = createFileFetch(requests);
  const fetchImpl = async (url, options = {}) => {
    if (String(url).includes('/indexes/2026.07.13-3/romaji/m.json')) {
      await waitForAbort(options.signal);
    }
    return baseFetch(url, options);
  };
  const source = createSource('abort', fetchImpl);
  await source.load();
  const controller = new AbortController();
  const pending = source.search('mizu', { signal: controller.signal });
  controller.abort();

  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(source.getMetrics().abortedSearches, 1);
  const cached = await source.repository.getVersionArtifacts('2026.07.13-3');
  assert.ok(!cached.some((item) => item.path.includes('/romaji/m.json')));
  await source.repository.close();
});

test('uses only the essential pack for one-character Latin queries', async () => {
  const requests = [];
  const source = createSource('short-query', createFileFetch(requests));
  await source.load();
  const afterInit = requests.length;

  const entries = await source.search('a', { limit: 5 });
  assert.ok(entries.length > 0);
  assert.ok(requests.slice(afterInit).some((item) => item.includes('/packs/bootstrap-n5.json')));
  assert.ok(!requests.slice(afterInit).some((item) => item.includes('/indexes/')));
  assert.ok(!requests.slice(afterInit).some((item) => item.includes('/shards/entries/')));
  await source.repository.close();
});

test('serves a warm search while offline and repairs a corrupted cached shard', async () => {
  const requests = [];
  const source = createSource('offline-repair', createFileFetch(requests));
  await source.load();
  assert.equal((await source.search('mizu'))[0].id, 'jmdict-1371260');

  const networkAfterWarmup = source.getMetrics().networkRequests;
  source.fetchImpl = async () => { throw new Error('offline'); };
  assert.equal((await source.search('mizu'))[0].id, 'jmdict-1371260');
  assert.equal(source.getMetrics().networkRequests, networkAfterWarmup);

  const descriptor = source.routes.romaji.buckets.m;
  await source.repository.putArtifact(
    '2026.07.13-3', descriptor, new TextEncoder().encode('corrupted'), 'index-shard',
  );
  source.fetchImpl = createFileFetch(requests);
  assert.equal((await source.search('mizu'))[0].id, 'jmdict-1371260');
  assert.equal(source.getMetrics().invalidCacheEntries, 1);
  assert.equal((await source.repository.getArtifact('2026.07.13-3', descriptor.path)).byteLength, descriptor.byteLength);
  await source.repository.close();
});

test('reports 404, invalid manifest and IndexedDB quota failures without partial promotion', async () => {
  const notFoundSource = createSource('404', async (url, options) => {
    if (String(url).endsWith('/indexes/2026.07.13-3/romaji/m.json')) {
      return new Response('missing', { status: 404 });
    }
    return createFileFetch([])(url, options);
  });
  await notFoundSource.load();
  await assert.rejects(notFoundSource.search('mizu'), /HTTP 404/);
  assert.equal(notFoundSource.getMetrics().failedSearches, 1);
  await notFoundSource.repository.close();

  const invalidManifestSource = createSource('invalid-manifest', async (url, options) => {
    if (String(url).includes('/manifests/')) {
      return new Response(JSON.stringify({ schemaVersion: 99 }), { status: 200 });
    }
    return createFileFetch([])(url, options);
  });
  await assert.rejects(invalidManifestSource.load(), /Unsupported sharded dictionary manifest/);
  await invalidManifestSource.repository.close();

  const quotaSource = createSource('quota', createFileFetch([]));
  await quotaSource.load();
  const originalPut = quotaSource.repository.putArtifact.bind(quotaSource.repository);
  quotaSource.repository.putArtifact = async (...args) => {
    if (args[3] === 'index-shard') {
      const error = new Error('quota exhausted');
      error.name = 'QuotaExceededError';
      throw error;
    }
    return originalPut(...args);
  };
  await assert.rejects(quotaSource.search('mizu'), { name: 'QuotaExceededError' });
  assert.equal(quotaSource.getMetrics().failedSearches, 1);
  await quotaSource.repository.close();
});

test('allows the newest concurrent search to finish after aborting the obsolete one', async () => {
  const baseFetch = createFileFetch([]);
  const source = createSource('concurrent', async (url, options = {}) => {
    if (String(url).includes('/indexes/2026.07.13-3/romaji/m.json')) {
      await waitForAbort(options.signal);
    }
    return baseFetch(url, options);
  });
  await source.load();
  const obsoleteController = new AbortController();
  const obsolete = source.search('mizu', { signal: obsoleteController.signal });
  const current = source.search('agua');
  obsoleteController.abort();

  await assert.rejects(obsolete, { name: 'AbortError' });
  assert.equal((await current)[0].id, 'jmdict-1371260');
  assert.equal(source.getMetrics().abortedSearches, 1);
  assert.ok(source.getMetrics().maxConcurrentNetworkRequests <= 3);
  await source.repository.close();
});

function createSource(label, fetchImpl) {
  const repository = new DictionaryCacheRepository({
    indexedDB,
    dbName: `MathicxLazyDictionary-${label}-${Date.now()}-${Math.random()}`,
  });
  return new LazyDictionarySource({ repository, fetchImpl, dataUrl, manifestUrl });
}

function createFileFetch(requests) {
  return async (url, options = {}) => {
    if (options.signal?.aborted) throw options.signal.reason;
    const parsed = new URL(url);
    requests.push(parsed.pathname);
    const marker = '/data/dictionary/';
    const relativePath = decodeURIComponent(parsed.pathname.slice(parsed.pathname.indexOf(marker) + marker.length));
    try {
      const bytes = await fs.readFile(path.join(dictionaryRoot, ...relativePath.split('/')));
      return new Response(bytes, { status: 200 });
    } catch {
      return new Response('missing', { status: 404 });
    }
  };
}

function waitForAbort(signal) {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

function normalizeLatin(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
