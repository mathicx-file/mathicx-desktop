import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { normalizeBootstrapPackage } from './pipeline-schema.mjs';

export const ENTRY_SHARD_SCHEMA_VERSION = 1;
export const ENTRY_SHARD_KIND = 'dictionary-entry-shard';

export function createEntryShardId(entryId, config) {
  const normalized = validateShardingConfig(config);
  const id = String(entryId || '').trim();
  if (!id) throw new TypeError('Entry shard routing requires a stable entry id.');
  return createHash('sha256').update(id, 'utf8').digest('hex').slice(0, normalized.prefixLength);
}

export function createEntryShards(packageData, config) {
  const normalizedConfig = validateShardingConfig(config);
  const normalizedPackage = normalizeBootstrapPackage(packageData, { requireReviewedTranslations: true });
  const translationsByEntry = groupBy(normalizedPackage.translations, (item) => item.entryId);
  const buckets = new Map();

  for (const entry of [...normalizedPackage.entries].sort(byId)) {
    const shardId = createEntryShardId(entry.id, normalizedConfig);
    if (!buckets.has(shardId)) buckets.set(shardId, []);
    buckets.get(shardId).push(entry);
  }

  const shards = [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([shardId, entries]) => ({
      schemaVersion: ENTRY_SHARD_SCHEMA_VERSION,
      kind: ENTRY_SHARD_KIND,
      packageId: normalizedPackage.id,
      dictionaryVersion: normalizedPackage.version,
      shardId,
      entries,
      translations: entries
        .flatMap((entry) => translationsByEntry.get(entry.id) || [])
        .sort(byId),
    }));

  return validateEntryShards(packageData, shards, normalizedConfig);
}

export function validateEntryShards(packageData, shards, config) {
  const normalizedConfig = validateShardingConfig(config);
  const normalizedPackage = normalizeBootstrapPackage(packageData, { requireReviewedTranslations: true });
  if (!Array.isArray(shards) || (!shards.length && normalizedPackage.entries.length)) {
    throw new TypeError('Entry shards must contain every lexical entry.');
  }

  const shardIds = new Set();
  const actualEntries = [];
  const actualTranslations = [];
  const metrics = [];

  for (const shard of shards) {
    validateShardHeader(shard, normalizedPackage, normalizedConfig);
    if (shardIds.has(shard.shardId)) throw new TypeError(`Duplicate entry shard: ${shard.shardId}.`);
    shardIds.add(shard.shardId);
    if (!shard.entries.length) throw new TypeError(`Entry shard ${shard.shardId} cannot be empty.`);

    const sortedEntries = [...shard.entries].sort(byId);
    const sortedTranslations = [...shard.translations].sort(byId);
    if (!sameJson(shard.entries, sortedEntries) || !sameJson(shard.translations, sortedTranslations)) {
      throw new TypeError(`Entry shard ${shard.shardId} is not deterministically sorted.`);
    }
    for (const entry of shard.entries) {
      if (createEntryShardId(entry.id, normalizedConfig) !== shard.shardId) {
        throw new TypeError(`Entry ${entry.id} is stored in the wrong shard.`);
      }
    }
    for (const translation of shard.translations) {
      if (!shard.entries.some((entry) => entry.id === translation.entryId)) {
        throw new TypeError(`Translation ${translation.id} is stored without its entry.`);
      }
    }

    const size = measureShard(shard);
    if (size.compressedBytes > normalizedConfig.maxCompressedBytes) {
      throw new TypeError(`Entry shard ${shard.shardId} exceeds the compressed size limit.`);
    }
    metrics.push({ shardId: shard.shardId, entries: shard.entries.length, ...size });
    actualEntries.push(...shard.entries);
    actualTranslations.push(...shard.translations);
  }

  assertExactRecords(actualEntries, normalizedPackage.entries, 'lexical entries');
  assertExactRecords(actualTranslations, normalizedPackage.translations, 'lexical translations');

  return {
    shards,
    report: createReport(normalizedPackage, normalizedConfig, metrics),
  };
}

export function validateShardingConfig(config) {
  if (!config || config.schemaVersion !== ENTRY_SHARD_SCHEMA_VERSION) {
    throw new TypeError('Unsupported entry sharding config schema.');
  }
  if (config.strategy !== 'sha256-id-prefix') {
    throw new TypeError('Unsupported entry sharding strategy.');
  }
  if (config.emitEmptyShards !== false) {
    throw new TypeError('Entry sharding must omit empty logical buckets.');
  }
  const prefixLength = Number(config.prefixLength);
  if (!Number.isSafeInteger(prefixLength) || prefixLength < 1 || prefixLength > 4) {
    throw new TypeError('Entry shard prefixLength must be between 1 and 4.');
  }
  const idealMin = positiveInteger(config.idealCompressedBytes?.min, 'ideal compressed minimum');
  const idealMax = positiveInteger(config.idealCompressedBytes?.max, 'ideal compressed maximum');
  const maxCompressedBytes = positiveInteger(config.maxCompressedBytes, 'compressed maximum');
  if (idealMin > idealMax || idealMax > maxCompressedBytes) {
    throw new TypeError('Entry shard compressed size limits are inconsistent.');
  }
  return {
    schemaVersion: ENTRY_SHARD_SCHEMA_VERSION,
    strategy: config.strategy,
    prefixLength,
    emitEmptyShards: false,
    idealCompressedBytes: { min: idealMin, max: idealMax },
    maxCompressedBytes,
  };
}

function validateShardHeader(shard, packageData, config) {
  if (!shard || shard.schemaVersion !== ENTRY_SHARD_SCHEMA_VERSION || shard.kind !== ENTRY_SHARD_KIND) {
    throw new TypeError('Unsupported entry shard schema or kind.');
  }
  if (shard.packageId !== packageData.id || shard.dictionaryVersion !== packageData.version) {
    throw new TypeError(`Entry shard ${shard.shardId || '<unknown>'} targets the wrong package.`);
  }
  if (!new RegExp(`^[a-f0-9]{${config.prefixLength}}$`).test(String(shard.shardId || ''))) {
    throw new TypeError('Entry shard id does not match the configured hash prefix.');
  }
  if (!Array.isArray(shard.entries) || !Array.isArray(shard.translations)) {
    throw new TypeError(`Entry shard ${shard.shardId} has invalid collections.`);
  }
}

function createReport(packageData, config, metrics) {
  const compressedSizes = metrics.map((item) => item.compressedBytes);
  const rawSizes = metrics.map((item) => item.rawBytes);
  const entryCounts = metrics.map((item) => item.entries);
  return {
    schemaVersion: ENTRY_SHARD_SCHEMA_VERSION,
    kind: 'dictionary-entry-shards-report',
    packageId: packageData.id,
    dictionaryVersion: packageData.version,
    routing: {
      strategy: config.strategy,
      prefixLength: config.prefixLength,
      logicalShardCount: 16 ** config.prefixLength,
      emittedShardCount: metrics.length,
    },
    coverage: {
      lexicalEntries: packageData.entries.length,
      lexicalTranslations: packageData.translations.length,
    },
    distribution: {
      minEntries: minimum(entryCounts),
      maxEntries: maximum(entryCounts),
      totalRawBytes: sum(rawSizes),
      minRawBytes: minimum(rawSizes),
      maxRawBytes: maximum(rawSizes),
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
  return {
    rawBytes: bytes.byteLength,
    compressedBytes: gzipSync(bytes, { level: 9, mtime: 0 }).byteLength,
  };
}

function assertExactRecords(actual, expected, label) {
  const sortedActual = [...actual].sort(byId);
  const sortedExpected = [...expected].sort(byId);
  if (!sameJson(sortedActual, sortedExpected)) {
    throw new TypeError(`Entry shards do not preserve all ${label}.`);
  }
}

function groupBy(values, keyFor) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFor(value);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  return groups;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new TypeError(`Invalid ${label}.`);
  return number;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function byId(left, right) {
  return left.id.localeCompare(right.id);
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
