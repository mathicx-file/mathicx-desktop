import { DictionaryCacheRepository } from './dictionary-cache-repository.js';
import { sha256Hex, verifyArtifact } from './dictionary-cache-installer.js';

const DEFAULT_DATA_URL = new URL('../../data/dictionary/', import.meta.url);
const DEFAULT_MANIFEST_URL = new URL('manifests/2026.07.13-3.json', DEFAULT_DATA_URL);
const INDEX_KINDS = ['written', 'reading', 'romaji', 'pt'];

export class LazyDictionarySource {
  constructor(options = {}) {
    this.id = options.id || 'sharded-local-dictionary';
    this.dataUrl = options.dataUrl || DEFAULT_DATA_URL;
    this.manifestUrl = options.manifestUrl || DEFAULT_MANIFEST_URL;
    this.providedManifest = options.manifest || null;
    this.fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
    this.repository = options.repository || new DictionaryCacheRepository();
    this.crypto = options.crypto || globalThis.crypto;
    this.now = options.now || (() => globalThis.performance?.now?.() || Date.now());
    this.decoder = options.textDecoder || new TextDecoder();
    this.decodeArtifact = options.decodeArtifact || ((bytes) => bytes);
    this.maxConcurrentDownloads = normalizeConcurrency(options.maxConcurrentDownloads);
    this.networkLimiter = new NetworkLimiter(this.maxConcurrentDownloads);
    this.manifest = null;
    this.routes = null;
    this.initPromise = null;
    this.metrics = createMetrics();

    if (typeof this.fetchImpl !== 'function') {
      throw new Error('Fetch is unavailable for the sharded dictionary source.');
    }
  }

  async load() {
    if (!this.initPromise) this.initPromise = this.initialize();
    return this.initPromise;
  }

  async initialize() {
    const manifest = await this.resolveManifest();
    validateManifest(manifest);
    this.manifest = manifest;

    const routePairs = [
      ['entries', manifest.routes.entries],
      ...INDEX_KINDS.map((kind) => [kind, manifest.routes.indexes[kind]]),
    ];
    const loadedRoutes = await Promise.all(routePairs.map(async ([kind, descriptor]) => {
      const bytes = await this.loadArtifact(descriptor, 'route');
      const route = parseJson(bytes, descriptor.path, this.decoder);
      validateRoute(route, manifest, kind);
      return [kind, route];
    }));
    this.routes = Object.fromEntries(loadedRoutes);

    return {
      entries: [],
      metadata: {
        sourceId: this.id,
        version: manifest.dictionaryVersion,
        format: 'sharded-indexeddb-v1',
        count: this.routes.entries?.coverage?.entries || 0,
        lazy: true,
      },
    };
  }

  async resolveManifest() {
    if (this.providedManifest) return this.providedManifest;
    const cacheState = await this.repository.getCacheState();
    if (cacheState.activeVersion) {
      const versionState = await this.repository.getVersionState(cacheState.activeVersion);
      const descriptor = versionState?.manifestDescriptor;
      if (versionState?.status === 'ready' && descriptor) {
        const cached = await this.repository.getArtifact(cacheState.activeVersion, descriptor.path);
        if (cached) {
          try {
            await verifyArtifact(cached.bytes, descriptor, this.crypto);
            const manifest = parseJson(cached.bytes, descriptor.path, this.decoder);
            validateManifest(manifest);
            if (manifest.dictionaryVersion !== cacheState.activeVersion) {
              throw new Error('Active dictionary manifest version differs from cache state.');
            }
            return manifest;
          } catch (error) {
            this.metrics.invalidCacheEntries += 1;
            console.warn('[dictionary-cache] active manifest is invalid; using embedded release', error);
          }
        }
      }
    }
    return this.fetchJson(this.manifestUrl, undefined, 'manifest');
  }

  async search(query, options = {}) {
    await this.load();
    const startedAt = this.now();
    this.metrics.searches += 1;

    try {
      throwIfAborted(options.signal);
      const normalized = normalizeQuery(query);
      if (!normalized) {
        const bytes = await this.loadArtifact(this.manifest.defaultPack, 'pack', options.signal);
        const pack = parseJson(bytes, this.manifest.defaultPack.path, this.decoder);
        const entries = convertPayloadEntries(pack.entries, pack.translations);
        return filterByScript(entries, options.script).slice(0, normalizeLimit(options.limit));
      }

      if (isShortLatinQuery(normalized)) {
        const bytes = await this.loadArtifact(this.manifest.defaultPack, 'pack', options.signal);
        const pack = parseJson(bytes, this.manifest.defaultPack.path, this.decoder);
        return searchBootstrap(convertPayloadEntries(pack.entries, pack.translations), normalized, options);
      }

      const lookups = createLookups(normalized);
      const scores = new Map();
      const romajiHints = new Map();

      for (const lookup of lookups) {
        throwIfAborted(options.signal);
        const route = this.routes[lookup.kind];
        const bucket = indexBucket(lookup.kind, lookup.term, route.routing);
        const descriptor = route.buckets[bucket];
        if (!descriptor) continue;
        const bytes = await this.loadArtifact(descriptor, 'index-shard', options.signal);
        this.metrics.indexShardsRead += 1;
        const shard = parseJson(bytes, descriptor.path, this.decoder);
        validateIndexShard(shard, this.manifest, lookup.kind, bucket);

        for (const [term, ids] of Object.entries(shard.terms)) {
          const score = scoreTerm(term, lookup.term, lookup.kind);
          if (!score) continue;
          for (const id of ids) {
            scores.set(id, Math.max(scores.get(id) || 0, score));
            if (lookup.kind === 'romaji' && !romajiHints.has(id)) romajiHints.set(id, term);
          }
        }
      }

      const ids = [...scores.keys()];
      const entries = await this.loadEntries(ids, { signal: options.signal, romajiHints });
      return filterByScript(entries, options.script)
        .sort((left, right) => (
          (scores.get(right.id) || 0) - (scores.get(left.id) || 0)
          || Number(right.common) - Number(left.common)
          || left.headword.localeCompare(right.headword)
        ))
        .slice(0, normalizeLimit(options.limit));
    } catch (error) {
      if (isAbortError(error)) this.metrics.abortedSearches += 1;
      else this.metrics.failedSearches += 1;
      throw error;
    } finally {
      this.metrics.searchDurationMs += Math.max(0, this.now() - startedAt);
    }
  }

  async getById(id, options = {}) {
    const [entry] = await this.getMany([id], options);
    return entry || null;
  }

  async getMany(ids, options = {}) {
    await this.load();
    const requested = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(isStableEntryId))];
    if (!requested.length) return [];
    const entries = await this.loadEntries(requested, { signal: options.signal });
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    return requested.map((id) => byId.get(id)).filter(Boolean);
  }

  getMetrics() {
    return { ...this.metrics };
  }

  async loadEntries(ids, options = {}) {
    const groups = new Map();
    const prefixLength = Number(this.routes.entries.routing?.prefixLength || 2);
    for (const id of ids) {
      const bucket = (await sha256Hex(new TextEncoder().encode(id), this.crypto)).slice(0, prefixLength);
      if (!groups.has(bucket)) groups.set(bucket, new Set());
      groups.get(bucket).add(id);
    }

    const found = [];
    for (const [bucket, bucketIds] of groups) {
      throwIfAborted(options.signal);
      const descriptor = this.routes.entries.buckets[bucket];
      if (!descriptor) continue;
      const bytes = await this.loadArtifact(descriptor, 'entry-shard', options.signal);
      this.metrics.entryShardsRead += 1;
      const shard = parseJson(bytes, descriptor.path, this.decoder);
      validateEntryShard(shard, this.manifest, bucket);
      const entries = shard.entries.filter((entry) => bucketIds.has(entry.id));
      found.push(...convertPayloadEntries(entries, shard.translations, options.romajiHints));
    }
    return found;
  }

  async loadArtifact(descriptor, kind, signal) {
    throwIfAborted(signal);
    const version = this.manifest.dictionaryVersion;
    const cached = await this.repository.getArtifact(version, descriptor.path);
    if (cached) {
      try {
        await verifyArtifact(cached.bytes, descriptor, this.crypto);
        this.metrics.cacheHits += 1;
        return this.decodeArtifact(new Uint8Array(cached.bytes), descriptor);
      } catch {
        this.metrics.invalidCacheEntries += 1;
        await this.repository.deleteArtifact(version, descriptor.path);
      }
    }

    this.metrics.cacheMisses += 1;
    const url = new URL(descriptor.path, this.dataUrl);
    const bytes = await this.fetchBytes(url, signal, kind);
    await verifyArtifact(bytes, descriptor, this.crypto);
    throwIfAborted(signal);
    await this.repository.putArtifact(version, descriptor, bytes, kind);
    return this.decodeArtifact(bytes, descriptor);
  }

  async fetchJson(url, signal, kind) {
    return parseJson(await this.fetchBytes(url, signal, kind), String(url), this.decoder);
  }

  async fetchBytes(url, signal, kind) {
    return this.networkLimiter.run(async () => {
      throwIfAborted(signal);
      this.metrics.activeNetworkRequests += 1;
      this.metrics.maxConcurrentNetworkRequests = Math.max(
        this.metrics.maxConcurrentNetworkRequests,
        this.metrics.activeNetworkRequests,
      );
      try {
        const response = await this.fetchImpl(url, { signal });
        if (!response?.ok) {
          throw new Error(`Unable to load dictionary ${kind}: HTTP ${response?.status || 'unknown'}.`);
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        throwIfAborted(signal);
        this.metrics.networkRequests += 1;
        this.metrics.networkBytes += bytes.byteLength;
        return bytes;
      } finally {
        this.metrics.activeNetworkRequests -= 1;
      }
    }, signal);
  }
}

class NetworkLimiter {
  constructor(limit) {
    this.limit = limit;
    this.active = 0;
    this.queue = [];
  }

  run(task, signal) {
    return new Promise((resolve, reject) => {
      const item = { task, signal, resolve, reject };
      this.queue.push(item);
      this.pump();
    });
  }

  pump() {
    while (this.active < this.limit && this.queue.length) {
      const item = this.queue.shift();
      if (item.signal?.aborted) {
        item.reject(item.signal.reason || createAbortError());
        continue;
      }
      this.active += 1;
      Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(() => {
          this.active -= 1;
          this.pump();
        });
    }
  }
}

function createLookups(query) {
  if (containsHan(query)) {
    const term = normalizeJapanese(query);
    return [{ kind: 'written', term }];
  }
  if (containsKana(query)) {
    const term = katakanaToHiragana(normalizeJapanese(query));
    return [{ kind: 'reading', term }];
  }

  const latin = normalizeLatin(query);
  const lookups = [];
  if (latin) {
    lookups.push({ kind: 'romaji', term: latin.replace(/\s+/g, '') });
    for (const term of latin.match(/[a-z0-9]+/g) || []) {
      lookups.push({ kind: 'pt', term });
    }
  }
  return dedupeLookups(lookups);
}

function searchBootstrap(entries, query, options) {
  const normalized = normalizeLatin(query);
  return filterByScript(entries, options.script)
    .map((entry) => ({ entry, score: scoreBootstrapEntry(entry, normalized) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.headword.localeCompare(right.entry.headword))
    .slice(0, normalizeLimit(options.limit))
    .map((item) => item.entry);
}

function scoreBootstrapEntry(entry, query) {
  const values = [
    entry.headword,
    ...entry.readings,
    ...entry.romaji,
    ...entry.meanings.map((meaning) => meaning.text),
  ].map(normalizeLatin);
  if (values.some((value) => value === query)) return 3;
  if (values.some((value) => value.startsWith(query))) return 2;
  return values.some((value) => value.includes(query)) ? 1 : 0;
}

function convertPayloadEntries(entries = [], translations = [], romajiHints = new Map()) {
  const translationsByEntry = groupBy(translations, (translation) => translation.entryId);
  return entries.map((entry) => {
    const entryTranslations = translationsByEntry.get(entry.id) || [];
    const translationsBySense = groupBy(entryTranslations, (translation) => translation.senseId);
    const meanings = [];
    for (const sense of entry.senses || []) {
      const reviewed = (translationsBySense.get(sense.id) || [])
        .filter((translation) => translation.status === 'reviewed');
      if (reviewed.length) {
        reviewed.flatMap((translation) => translation.glosses || [])
          .forEach((text) => meanings.push({ language: 'pt-BR', text }));
      } else {
        (sense.glosses?.en || []).forEach((text) => meanings.push({ language: 'en', text }));
      }
    }
    const headword = entry.writtenForms?.[0] || entry.readings?.[0] || '';
    const script = detectScript(headword || entry.readings?.[0]);
    const legacyRomaji = legacyRomajiHint(entryTranslations);
    return {
      id: entry.id,
      headword,
      readings: entry.readings || [],
      romaji: [romajiHints.get(entry.id) || legacyRomaji].filter(Boolean),
      meanings,
      scripts: [script],
      tags: [...new Set([
        ...(entry.tags || []),
        ...(entry.senses?.[0]?.partOfSpeech || []),
      ])],
      level: 'N5',
      common: entry.common === true,
      source: entry.source,
    };
  });
}

function validateManifest(manifest) {
  if (manifest?.format !== 'mathicx-japanese-dictionary' || manifest.schemaVersion !== 1) {
    throw new Error('Unsupported sharded dictionary manifest.');
  }
  if (!manifest.dictionaryVersion || !manifest.routes?.entries || !manifest.defaultPack) {
    throw new Error('Sharded dictionary manifest is incomplete.');
  }
  INDEX_KINDS.forEach((kind) => {
    if (!manifest.routes?.indexes?.[kind]) throw new Error(`Missing dictionary route: ${kind}.`);
  });
}

function validateRoute(route, manifest, expectedKind) {
  if (route?.schemaVersion !== 1 || route.dictionaryVersion !== manifest.dictionaryVersion) {
    throw new Error(`Invalid dictionary route: ${expectedKind}.`);
  }
  if (manifest.packageId && route.packageId !== manifest.packageId) {
    throw new Error(`Dictionary route targets another package: ${expectedKind}.`);
  }
  if (expectedKind === 'entries' && route.kind !== 'dictionary-entry-routes') {
    throw new Error('Invalid dictionary entry route.');
  }
  if (expectedKind !== 'entries'
    && (route.kind !== 'dictionary-search-routes' || route.indexKind !== expectedKind)) {
    throw new Error(`Invalid dictionary index route: ${expectedKind}.`);
  }
  if (!route.buckets || typeof route.buckets !== 'object') {
    throw new Error(`Dictionary route has no buckets: ${expectedKind}.`);
  }
  if (expectedKind !== 'entries' && !isSupportedIndexRouting(expectedKind, route.routing)) {
    throw new Error(`Unsupported dictionary index routing: ${expectedKind}/${route.routing}.`);
  }
}

function validateIndexShard(shard, manifest, kind, bucket) {
  if (shard?.schemaVersion !== 1 || shard.kind !== 'dictionary-search-index-shard'
    || shard.dictionaryVersion !== manifest.dictionaryVersion
    || (manifest.packageId && shard.packageId !== manifest.packageId)
    || shard.indexKind !== kind || shard.bucket !== bucket || !shard.terms) {
    throw new Error(`Invalid dictionary index shard: ${kind}/${bucket}.`);
  }
}

function validateEntryShard(shard, manifest, bucket) {
  if (shard?.schemaVersion !== 1 || shard.kind !== 'dictionary-entry-shard'
    || shard.dictionaryVersion !== manifest.dictionaryVersion
    || (manifest.packageId && shard.packageId !== manifest.packageId)
    || shard.shardId !== bucket || !Array.isArray(shard.entries)) {
    throw new Error(`Invalid dictionary entry shard: ${bucket}.`);
  }
}

function scoreTerm(term, query, kind) {
  const base = kind === 'written' ? 40 : kind === 'reading' ? 30 : kind === 'romaji' ? 20 : 10;
  if (term === query) return 300 + base;
  if (term.startsWith(query)) return 200 + base;
  if (term.includes(query)) return 100 + base;
  return 0;
}

function writtenBucket(term) {
  const first = [...term][0];
  return first ? `u-${Math.floor(first.codePointAt(0) / 256).toString(16).padStart(2, '0')}` : '';
}

function readingBucket(term) {
  const first = [...term][0];
  return first ? `u-${first.codePointAt(0).toString(16).padStart(4, '0')}` : '';
}

function latinBucket(term) {
  const first = [...term][0];
  return /^[a-z0-9]$/.test(first || '') ? first : '_';
}

export function createRuntimeIndexBucket(kind, term, routing) {
  if (kind === 'written' && routing === 'first-code-point-page-256') return writtenBucket(term);
  if (kind === 'reading' && routing === 'hiragana-first-code-point') return readingBucket(term);
  if (['romaji', 'pt'].includes(kind) && routing === 'first-ascii-character') return latinBucket(term);
  if (['romaji', 'pt'].includes(kind) && routing === 'first-ascii-prefix-2') {
    const prefix = [...term].slice(0, 2).join('');
    return /^[a-z0-9]{1,2}$/u.test(prefix) ? prefix : '_';
  }
  throw new Error(`Unsupported dictionary index routing: ${kind}/${routing}.`);
}

function indexBucket(kind, term, routing) {
  return createRuntimeIndexBucket(kind, term, routing);
}

function isSupportedIndexRouting(kind, routing) {
  if (kind === 'written') return routing === 'first-code-point-page-256';
  if (kind === 'reading') return routing === 'hiragana-first-code-point';
  return ['romaji', 'pt'].includes(kind)
    && ['first-ascii-character', 'first-ascii-prefix-2'].includes(routing);
}

function normalizeQuery(value) {
  return String(value || '').trim().normalize('NFKC').toLowerCase();
}

function normalizeJapanese(value) {
  return String(value || '').trim().normalize('NFKC').toLocaleLowerCase('ja-JP');
}

function normalizeLatin(value) {
  return String(value || '').trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function katakanaToHiragana(value) {
  return value.replace(/[\u30a1-\u30f6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

function containsHan(value) {
  return /[\u3400-\u9fff\uf900-\ufaff]/u.test(value);
}

function containsKana(value) {
  return /[\u3040-\u30ff]/u.test(value);
}

function isShortLatinQuery(value) {
  const normalized = normalizeLatin(value).replace(/\s+/g, '');
  return normalized.length === 1 && /^[a-z0-9]$/u.test(normalized);
}

function detectScript(value) {
  if (containsHan(value)) return 'kanji';
  if (/[\u30a0-\u30ff]/u.test(value)) return 'katakana';
  return 'hiragana';
}

function legacyRomajiHint(translations) {
  const legacyId = translations.find((translation) => translation.source?.entryId)?.source?.entryId || '';
  return legacyId.replace(/^(?:hira|kata|kanji)_/, '').replace(/_/g, ' ');
}

function filterByScript(entries, script) {
  const normalized = String(script || '').toLowerCase();
  if (!normalized || normalized === 'all' || normalized === 'todas') return entries;
  return entries.filter((entry) => entry.scripts.includes(normalized));
}

function normalizeLimit(value) {
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit > 0 ? limit : Number.MAX_SAFE_INTEGER;
}

function normalizeConcurrency(value) {
  const concurrency = Number(value ?? 3);
  return Number.isSafeInteger(concurrency) && concurrency > 0 ? Math.min(concurrency, 3) : 3;
}

function dedupeLookups(lookups) {
  return [...new Map(lookups.map((lookup) => [`${lookup.kind}:${lookup.term}`, lookup])).values()];
}

function groupBy(values, keyFor) {
  const result = new Map();
  for (const value of values || []) {
    const key = keyFor(value);
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(value);
  }
  return result;
}

function parseJson(bytes, path, decoder) {
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    throw new Error(`Invalid JSON dictionary artifact: ${path}.`);
  }
}

function isStableEntryId(id) {
  return /^jmdict-[0-9]+$/u.test(id);
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  if (typeof signal.throwIfAborted === 'function') signal.throwIfAborted();
  throw createAbortError();
}

function createAbortError() {
  const error = new Error('Dictionary search aborted.');
  error.name = 'AbortError';
  return error;
}

function isAbortError(error) {
  return error?.name === 'AbortError';
}

function createMetrics() {
  return {
    searches: 0,
    abortedSearches: 0,
    failedSearches: 0,
    searchDurationMs: 0,
    cacheHits: 0,
    cacheMisses: 0,
    invalidCacheEntries: 0,
    networkRequests: 0,
    networkBytes: 0,
    activeNetworkRequests: 0,
    maxConcurrentNetworkRequests: 0,
    indexShardsRead: 0,
    entryShardsRead: 0,
  };
}
