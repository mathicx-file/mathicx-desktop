import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { indexedDB } from 'fake-indexeddb';

import { DictionaryCacheRepository } from '../../Applications/japanese-study/js/dictionary/dictionary-cache-repository.js';
import { LazyDictionarySource } from '../../Applications/japanese-study/js/dictionary/lazy-dictionary-source.js';

const args = parseArgs(process.argv.slice(2));
const iterations = positiveInteger(args.iterations, 20);
const dictionaryRoot = path.resolve('Applications/japanese-study/data/dictionary');
const dataUrl = new URL(args.baseUrl || 'https://dictionary.performance/data/dictionary/');
const manifestUrl = new URL('manifests/2026.07.13-2.json', dataUrl);
const fetchImpl = args.baseUrl ? globalThis.fetch.bind(globalThis) : createFileFetch();
const repository = new DictionaryCacheRepository({
  indexedDB,
  dbName: `MathicxDictionaryPerformance-${Date.now()}`,
});
const source = new LazyDictionarySource({ repository, fetchImpl, dataUrl, manifestUrl });

const init = await measure(() => source.load());
const afterInit = source.getMetrics();
const bootstrap = await measure(() => source.search('', { limit: 30 }));
const afterBootstrap = source.getMetrics();
const cold = await measure(() => source.search('mizu', { limit: 20 }));
const afterCold = source.getMetrics();

const warmSamples = [];
const beforeWarm = source.getMetrics();
for (let index = 0; index < iterations; index += 1) {
  warmSamples.push((await measure(() => source.search('mizu', { limit: 20 }))).durationMs);
}
const afterWarm = source.getMetrics();
const usageBeforeCleanup = await repository.getCacheUsage('2026.07.13-2');
const cleanup = await repository.clearOptionalArtifacts('2026.07.13-2');
const usageAfterCleanup = await repository.getCacheUsage('2026.07.13-2');

const report = {
  schemaVersion: 1,
  kind: 'dictionary-runtime-performance',
  measuredAt: new Date().toISOString(),
  environment: {
    adapter: args.baseUrl ? 'http' : 'local-file-fetch',
    baseUrl: args.baseUrl || null,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    iterations,
  },
  targetsMs: {
    bootstrapSearch: 100,
    cachedChunkSearch: 150,
  },
  initialization: {
    durationMs: round(init.durationMs),
    networkRequests: afterInit.networkRequests,
    networkBytes: afterInit.networkBytes,
    maxConcurrentNetworkRequests: afterInit.maxConcurrentNetworkRequests,
  },
  bootstrap: {
    durationMs: round(bootstrap.durationMs),
    results: bootstrap.value.length,
    networkRequests: afterBootstrap.networkRequests - afterInit.networkRequests,
    networkBytes: afterBootstrap.networkBytes - afterInit.networkBytes,
    targetMet: bootstrap.durationMs < 100,
  },
  coldChunkSearch: {
    durationMs: round(cold.durationMs),
    results: cold.value.length,
    networkRequests: afterCold.networkRequests - afterBootstrap.networkRequests,
    networkBytes: afterCold.networkBytes - afterBootstrap.networkBytes,
  },
  cachedChunkSearch: {
    averageMs: round(average(warmSamples)),
    p95Ms: round(percentile(warmSamples, 0.95)),
    maxMs: round(Math.max(...warmSamples)),
    networkRequests: afterWarm.networkRequests - beforeWarm.networkRequests,
    networkBytes: afterWarm.networkBytes - beforeWarm.networkBytes,
    targetMet: average(warmSamples) < 150,
  },
  cache: {
    beforeCleanup: compactUsage(usageBeforeCleanup),
    cleanup,
    afterCleanup: compactUsage(usageAfterCleanup),
    essentialPackagePreserved: Boolean(usageAfterCleanup.byKind.pack),
  },
  acceptance: {
    bootstrapUnder100Ms: bootstrap.durationMs < 100,
    cachedUnder150Ms: average(warmSamples) < 150,
    noWarmNetworkRequests: afterWarm.networkRequests === beforeWarm.networkRequests,
    concurrencyAtMost3: afterWarm.maxConcurrentNetworkRequests <= 3,
    essentialPackagePreserved: Boolean(usageAfterCleanup.byKind.pack),
  },
};

console.log(JSON.stringify(report, null, 2));
await repository.close();

function createFileFetch() {
  return async (url) => {
    const parsed = new URL(url);
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

async function measure(action) {
  const startedAt = performance.now();
  const value = await action();
  return { value, durationMs: performance.now() - startedAt };
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--base-url') result.baseUrl = values[++index];
    if (value === '--iterations') result.iterations = values[++index];
  }
  return result;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function average(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function compactUsage(usage) {
  return {
    artifacts: usage.artifacts,
    byteLength: usage.byteLength,
    byKind: usage.byKind,
  };
}
