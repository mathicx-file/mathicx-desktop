import { gzipSync } from 'node:zlib';
import { VERSION as WANAKANA_VERSION, toHiragana, toRomaji } from 'wanakana';

import { normalizeBootstrapPackage } from './pipeline-schema.mjs';

export const SEARCH_INDEX_SCHEMA_VERSION = 1;
export const SEARCH_INDEX_KIND = 'dictionary-search-index-shard';
export const SEARCH_INDEX_KINDS = Object.freeze(['written', 'reading', 'romaji', 'pt']);

export function createSearchIndexes(packageData, config) {
  const normalizedConfig = validateSearchIndexConfig(config);
  const normalizedPackage = normalizeBootstrapPackage(packageData, { requireReviewedTranslations: true });
  const termMaps = createTermMaps(normalizedPackage);
  const shards = [];

  for (const indexKind of normalizedConfig.indexKinds) {
    const buckets = new Map();
    for (const [term, ids] of [...termMaps[indexKind]].sort(byKey)) {
      const bucket = createIndexBucket(indexKind, term);
      if (!buckets.has(bucket)) buckets.set(bucket, []);
      buckets.get(bucket).push([term, [...ids].sort()]);
    }
    for (const [bucket, terms] of [...buckets.entries()].sort(byKey)) {
      shards.push({
        schemaVersion: SEARCH_INDEX_SCHEMA_VERSION,
        kind: SEARCH_INDEX_KIND,
        indexKind,
        packageId: normalizedPackage.id,
        dictionaryVersion: normalizedPackage.version,
        bucket,
        normalization: normalizationFor(indexKind, normalizedConfig),
        terms: Object.fromEntries(terms),
      });
    }
  }

  return validateSearchIndexes(packageData, shards, normalizedConfig);
}

export function validateSearchIndexes(packageData, shards, config) {
  const normalizedConfig = validateSearchIndexConfig(config);
  const normalizedPackage = normalizeBootstrapPackage(packageData, { requireReviewedTranslations: true });
  if (!Array.isArray(shards) || !shards.length) throw new TypeError('Search indexes cannot be empty.');
  const expected = buildExpectedShards(normalizedPackage, normalizedConfig);
  const expectedByKey = new Map(expected.map((shard) => [shardKey(shard), shard]));
  const actualKeys = new Set();
  const validEntryIds = new Set(normalizedPackage.entries.map((entry) => entry.id));
  const metrics = [];

  for (const shard of shards) {
    validateIndexHeader(shard, normalizedPackage, normalizedConfig);
    const key = shardKey(shard);
    if (actualKeys.has(key)) throw new TypeError(`Duplicate search index shard: ${key}.`);
    actualKeys.add(key);
    if (!expectedByKey.has(key)) throw new TypeError(`Unexpected search index shard: ${key}.`);

    const terms = Object.entries(shard.terms || {});
    if (!terms.length) throw new TypeError(`Search index shard ${key} cannot be empty.`);
    if (!sameJson(terms, [...terms].sort(byKey))) {
      throw new TypeError(`Search index shard ${key} is not sorted.`);
    }
    for (const [term, ids] of terms) {
      if (createIndexBucket(shard.indexKind, term) !== shard.bucket) {
        throw new TypeError(`Search term ${term} is stored in the wrong bucket.`);
      }
      if (!Array.isArray(ids) || !ids.length || !sameJson(ids, [...new Set(ids)].sort())) {
        throw new TypeError(`Search term ${term} has invalid or unsorted ids.`);
      }
      if (ids.some((id) => !validEntryIds.has(id))) {
        throw new TypeError(`Search term ${term} references an unknown entry.`);
      }
    }
    if (!sameJson(shard, expectedByKey.get(key))) {
      throw new TypeError(`Search index shard ${key} does not match the package content.`);
    }

    const size = measureShard(shard);
    if (size.compressedBytes > normalizedConfig.maxCompressedBytes) {
      throw new TypeError(`Search index shard ${key} exceeds the compressed size limit.`);
    }
    metrics.push({
      indexKind: shard.indexKind,
      bucket: shard.bucket,
      terms: terms.length,
      references: terms.reduce((total, [, ids]) => total + ids.length, 0),
      ...size,
    });
  }

  if (actualKeys.size !== expectedByKey.size || [...expectedByKey.keys()].some((key) => !actualKeys.has(key))) {
    throw new TypeError('Search indexes do not preserve every generated term.');
  }
  return { shards, report: createReport(normalizedPackage, normalizedConfig, metrics, expected) };
}

export function createIndexBucket(indexKind, term) {
  if (!SEARCH_INDEX_KINDS.includes(indexKind)) throw new TypeError(`Unknown search index kind: ${indexKind}.`);
  const first = [...String(term || '')][0];
  if (!first) throw new TypeError('Search index terms cannot be empty.');
  if (indexKind === 'romaji' || indexKind === 'pt') {
    return /^[a-z0-9]$/u.test(first) ? first : '_';
  }
  if (indexKind === 'written') {
    return `u-${Math.floor(first.codePointAt(0) / 256).toString(16).toLowerCase().padStart(2, '0')}`;
  }
  return `u-${first.codePointAt(0).toString(16).toLowerCase().padStart(4, '0')}`;
}

export function normalizeWrittenTerm(value) {
  return cleanText(value).normalize('NFKC').toLocaleLowerCase('ja-JP');
}

export function normalizeReadingTerm(value) {
  return toHiragana(cleanText(value).normalize('NFKC')).toLocaleLowerCase('ja-JP');
}

export function romanizeReading(value) {
  return normalizeLatin(toRomaji(cleanText(value).normalize('NFKC'), { upcaseKatakana: false }));
}

export function romanizeReadingVariants(value) {
  const canonical = romanizeReading(value);
  return [...new Set([canonical, canonical.replace(/['’]/gu, '')].filter(Boolean))];
}

export function tokenizePortuguese(value) {
  return normalizeLatin(value).match(/[a-z0-9]+/gu) || [];
}

export function validateSearchIndexConfig(config) {
  if (!config || config.schemaVersion !== SEARCH_INDEX_SCHEMA_VERSION) {
    throw new TypeError('Unsupported search index config schema.');
  }
  if (!Array.isArray(config.indexKinds)
    || !sameJson(config.indexKinds, SEARCH_INDEX_KINDS)
    || new Set(config.indexKinds).size !== SEARCH_INDEX_KINDS.length) {
    throw new TypeError('Search index config must declare every supported index kind in order.');
  }
  if (config.romanization?.library !== 'wanakana'
    || config.romanization?.version !== WANAKANA_VERSION
    || config.romanization?.style !== 'hepburn'
    || config.romanization?.upcaseKatakana !== false
    || !sameJson(config.romanization?.variants, ['canonical', 'compact-apostrophe'])) {
    throw new TypeError('Search index romanization does not match the installed WanaKana contract.');
  }
  const expectedRouting = {
    written: 'first-code-point-page-256',
    reading: 'hiragana-first-code-point',
    romaji: 'first-ascii-character',
    pt: 'first-ascii-character',
  };
  if (!sameJson(config.routing, expectedRouting)) throw new TypeError('Unsupported search index routing contract.');
  const idealMin = positiveInteger(config.idealCompressedBytes?.min, 'ideal compressed minimum');
  const idealMax = positiveInteger(config.idealCompressedBytes?.max, 'ideal compressed maximum');
  const maxCompressedBytes = positiveInteger(config.maxCompressedBytes, 'compressed maximum');
  if (idealMin > idealMax || idealMax > maxCompressedBytes) {
    throw new TypeError('Search index compressed size limits are inconsistent.');
  }
  return {
    schemaVersion: SEARCH_INDEX_SCHEMA_VERSION,
    indexKinds: [...SEARCH_INDEX_KINDS],
    romanization: { ...config.romanization },
    routing: expectedRouting,
    idealCompressedBytes: { min: idealMin, max: idealMax },
    maxCompressedBytes,
  };
}

function createTermMaps(packageData) {
  const result = Object.fromEntries(SEARCH_INDEX_KINDS.map((kind) => [kind, new Map()]));
  const translationsByEntry = groupBy(packageData.translations, (item) => item.entryId);
  for (const entry of packageData.entries) {
    entry.writtenForms.map(normalizeWrittenTerm).filter(Boolean)
      .forEach((term) => addTerm(result.written, term, entry.id));
    entry.readings.map(normalizeReadingTerm).filter(Boolean)
      .forEach((term) => addTerm(result.reading, term, entry.id));
    entry.readings.flatMap(romanizeReadingVariants).filter(Boolean)
      .forEach((term) => addTerm(result.romaji, term, entry.id));
    (translationsByEntry.get(entry.id) || [])
      .flatMap((translation) => translation.glosses)
      .flatMap(tokenizePortuguese)
      .forEach((term) => addTerm(result.pt, term, entry.id));
  }
  return result;
}

function buildExpectedShards(packageData, config) {
  const termMaps = createTermMaps(packageData);
  const shards = [];
  for (const indexKind of config.indexKinds) {
    const buckets = new Map();
    for (const [term, ids] of [...termMaps[indexKind]].sort(byKey)) {
      const bucket = createIndexBucket(indexKind, term);
      if (!buckets.has(bucket)) buckets.set(bucket, []);
      buckets.get(bucket).push([term, [...ids].sort()]);
    }
    for (const [bucket, terms] of [...buckets.entries()].sort(byKey)) {
      shards.push({
        schemaVersion: SEARCH_INDEX_SCHEMA_VERSION,
        kind: SEARCH_INDEX_KIND,
        indexKind,
        packageId: packageData.id,
        dictionaryVersion: packageData.version,
        bucket,
        normalization: normalizationFor(indexKind, config),
        terms: Object.fromEntries(terms),
      });
    }
  }
  return shards;
}

function normalizationFor(indexKind, config) {
  if (indexKind === 'written') return 'unicode-nfkc-lower-v1';
  if (indexKind === 'reading') return 'wanakana-hiragana-nfkc-v1';
  if (indexKind === 'romaji') return `wanakana-${config.romanization.version}-hepburn-ascii-v1`;
  return 'ptbr-nfkd-alphanumeric-tokens-v1';
}

function validateIndexHeader(shard, packageData, config) {
  if (!shard || shard.schemaVersion !== SEARCH_INDEX_SCHEMA_VERSION || shard.kind !== SEARCH_INDEX_KIND) {
    throw new TypeError('Unsupported search index shard schema or kind.');
  }
  if (!config.indexKinds.includes(shard.indexKind)) throw new TypeError('Unsupported search index kind.');
  if (shard.packageId !== packageData.id || shard.dictionaryVersion !== packageData.version) {
    throw new TypeError('Search index shard targets the wrong package.');
  }
  if (!/^(?:[a-z0-9_]|u-[a-f0-9]{2,6})$/u.test(String(shard.bucket || ''))) {
    throw new TypeError('Search index shard has an invalid bucket.');
  }
  if (!shard.terms || typeof shard.terms !== 'object' || Array.isArray(shard.terms)) {
    throw new TypeError('Search index shard requires a terms map.');
  }
}

function createReport(packageData, config, metrics, shards) {
  const byKind = Object.fromEntries(config.indexKinds.map((indexKind) => {
    const kindMetrics = metrics.filter((item) => item.indexKind === indexKind);
    const kindShards = shards.filter((item) => item.indexKind === indexKind);
    const coveredIds = new Set(kindShards.flatMap((shard) => Object.values(shard.terms).flat()));
    return [indexKind, {
      shards: kindMetrics.length,
      terms: sum(kindMetrics.map((item) => item.terms)),
      references: sum(kindMetrics.map((item) => item.references)),
      entriesCovered: coveredIds.size,
      rawBytes: sum(kindMetrics.map((item) => item.rawBytes)),
      compressedBytes: sum(kindMetrics.map((item) => item.compressedBytes)),
      maxCompressedBytes: maximum(kindMetrics.map((item) => item.compressedBytes)),
    }];
  }));
  const compressedSizes = metrics.map((item) => item.compressedBytes);
  return {
    schemaVersion: SEARCH_INDEX_SCHEMA_VERSION,
    kind: 'dictionary-search-indexes-report',
    packageId: packageData.id,
    dictionaryVersion: packageData.version,
    romanization: config.romanization,
    indexes: byKind,
    distribution: {
      totalShards: metrics.length,
      totalRawBytes: sum(metrics.map((item) => item.rawBytes)),
      totalCompressedBytes: sum(compressedSizes),
      minCompressedBytes: minimum(compressedSizes),
      maxCompressedBytes: maximum(compressedSizes),
      belowIdealShards: compressedSizes.filter((size) => size < config.idealCompressedBytes.min).length,
      aboveIdealShards: compressedSizes.filter((size) => size > config.idealCompressedBytes.max).length,
    },
    limits: {
      idealCompressedBytes: config.idealCompressedBytes,
      maxCompressedBytes: config.maxCompressedBytes,
    },
    shards: metrics,
  };
}

function measureShard(shard) {
  const bytes = Buffer.from(`${JSON.stringify(shard, null, 2)}\n`, 'utf8');
  return { rawBytes: bytes.byteLength, compressedBytes: gzipSync(bytes, { level: 9, mtime: 0 }).byteLength };
}

function normalizeLatin(value) {
  return cleanText(value).normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').toLowerCase();
}

function addTerm(map, term, entryId) {
  if (!map.has(term)) map.set(term, new Set());
  map.get(term).add(entryId);
}

function groupBy(values, keyFor) {
  const result = new Map();
  for (const value of values) {
    const key = keyFor(value);
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(value);
  }
  return result;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new TypeError(`Invalid ${label}.`);
  return number;
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function shardKey(shard) {
  return `${shard.indexKind}/${shard.bucket}`;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function byKey(left, right) {
  return left[0].localeCompare(right[0]);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function minimum(values) {
  return values.length ? Math.min(...values) : 0;
}

function maximum(values) {
  return values.length ? Math.max(...values) : 0;
}
