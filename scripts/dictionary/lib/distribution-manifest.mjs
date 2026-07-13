import { createHash } from 'node:crypto';

import { validateEntryShards } from './entry-shards.mjs';
import { normalizeBootstrapPackage } from './pipeline-schema.mjs';
import { SEARCH_INDEX_KINDS, validateSearchIndexes } from './search-indexes.mjs';

export const DISTRIBUTION_SCHEMA_VERSION = 1;
export const DISTRIBUTION_FORMAT = 'mathicx-japanese-dictionary';

export function createArtifactDescriptor(relativePath, bytes) {
  const path = validateRelativeArtifactPath(relativePath);
  const buffer = toBuffer(bytes);
  return {
    path,
    byteLength: buffer.byteLength,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

export function verifyArtifactDescriptor(descriptor, bytes) {
  validateDescriptor(descriptor);
  const actual = createArtifactDescriptor(descriptor.path, bytes);
  if (actual.byteLength !== descriptor.byteLength || actual.sha256 !== descriptor.sha256) {
    throw new TypeError(`Dictionary artifact hash or size mismatch: ${descriptor.path}.`);
  }
  return descriptor;
}

export function createDistributionRoutes(options) {
  const packageData = normalizeBootstrapPackage(options.packageData, { requireReviewedTranslations: true });
  const entryPayloads = options.entryArtifacts.map((item) => item.payload);
  const indexPayloads = options.indexArtifacts.map((item) => item.payload);
  validateEntryShards(options.packageData, entryPayloads, options.entryConfig);
  validateSearchIndexes(options.packageData, indexPayloads, options.indexConfig);

  const entryItems = [...options.entryArtifacts].sort((left, right) => (
    left.payload.shardId.localeCompare(right.payload.shardId)
  ));
  const entries = {
    schemaVersion: DISTRIBUTION_SCHEMA_VERSION,
    kind: 'dictionary-entry-routes',
    packageId: packageData.id,
    dictionaryVersion: packageData.version,
    routing: {
      strategy: options.entryConfig.strategy,
      prefixLength: options.entryConfig.prefixLength,
    },
    coverage: {
      shards: entryItems.length,
      entries: packageData.entries.length,
    },
    buckets: Object.fromEntries(entryItems.map((item) => [item.payload.shardId, item.descriptor])),
  };

  const indexes = Object.fromEntries(SEARCH_INDEX_KINDS.map((indexKind) => {
    const items = options.indexArtifacts
      .filter((item) => item.payload.indexKind === indexKind)
      .sort((left, right) => left.payload.bucket.localeCompare(right.payload.bucket));
    return [indexKind, {
      schemaVersion: DISTRIBUTION_SCHEMA_VERSION,
      kind: 'dictionary-search-routes',
      indexKind,
      packageId: packageData.id,
      dictionaryVersion: packageData.version,
      routing: options.indexConfig.routing[indexKind],
      normalization: uniqueValue(items.map((item) => item.payload.normalization), `${indexKind} normalization`),
      coverage: {
        shards: items.length,
        terms: sum(items.map((item) => Object.keys(item.payload.terms).length)),
        references: sum(items.map((item) => Object.values(item.payload.terms).flat().length)),
      },
      buckets: Object.fromEntries(items.map((item) => [item.payload.bucket, item.descriptor])),
    }];
  }));

  return { entries, indexes };
}

export function createDistributionManifest(options) {
  const packageData = normalizeBootstrapPackage(options.packageData, { requireReviewedTranslations: true });
  validateDescriptor(options.packDescriptor);
  validateDescriptor(options.licensesDescriptor);
  validateDescriptor(options.routeDescriptors.entries);
  SEARCH_INDEX_KINDS.forEach((kind) => validateDescriptor(options.routeDescriptors.indexes[kind]));

  return {
    format: DISTRIBUTION_FORMAT,
    schemaVersion: DISTRIBUTION_SCHEMA_VERSION,
    releaseStatus: 'staged',
    packageId: packageData.id,
    dictionaryVersion: packageData.version,
    sources: packageData.sources,
    defaultPack: options.packDescriptor,
    licenses: options.licensesDescriptor,
    routes: {
      entries: options.routeDescriptors.entries,
      indexes: Object.fromEntries(SEARCH_INDEX_KINDS.map((kind) => [kind, options.routeDescriptors.indexes[kind]])),
    },
    runtime: {
      active: false,
      activeSource: 'legacy-json',
      requiredBeforeActivation: ['indexeddb-cache', 'lazy-loading', 'rollback'],
    },
  };
}

export function verifyDictionaryDistribution(options) {
  const { manifest } = options;
  validateManifestHeader(manifest);
  const packageData = normalizeBootstrapPackage(options.packageData, { requireReviewedTranslations: true });
  if (manifest.packageId !== packageData.id || manifest.dictionaryVersion !== packageData.version) {
    throw new TypeError('Dictionary manifest does not match the package identity.');
  }
  if (!sameJson(manifest.sources, packageData.sources)) {
    throw new TypeError('Dictionary manifest sources do not match the package.');
  }
  const licensedIds = new Set((options.licenses?.sources || []).map((source) => source.id));
  if (packageData.sources.some((source) => !licensedIds.has(source.id))) {
    throw new TypeError('Dictionary manifest package has an unattributed source.');
  }

  verifyArtifactFromMap(manifest.defaultPack, options.artifacts);
  verifyArtifactFromMap(manifest.licenses, options.artifacts);
  verifyArtifactFromMap(manifest.routes.entries, options.artifacts);
  SEARCH_INDEX_KINDS.forEach((kind) => verifyArtifactFromMap(manifest.routes.indexes[kind], options.artifacts));

  validateEntryRoute(options.routes.entries, packageData, options.entryArtifacts);
  SEARCH_INDEX_KINDS.forEach((kind) => (
    validateIndexRoute(options.routes.indexes[kind], packageData, kind, options.indexArtifacts)
  ));
  for (const descriptor of Object.values(options.routes.entries.buckets)) {
    verifyArtifactFromMap(descriptor, options.artifacts);
  }
  for (const route of Object.values(options.routes.indexes)) {
    for (const descriptor of Object.values(route.buckets)) verifyArtifactFromMap(descriptor, options.artifacts);
  }

  return {
    valid: true,
    dictionaryVersion: packageData.version,
    releaseStatus: manifest.releaseStatus,
    entryShards: Object.keys(options.routes.entries.buckets).length,
    indexShards: sum(Object.values(options.routes.indexes).map((route) => Object.keys(route.buckets).length)),
    verifiedArtifacts: options.artifacts.size,
  };
}

export function validateRelativeArtifactPath(value) {
  const path = String(value || '').replace(/\\/gu, '/');
  if (!path || path.startsWith('/') || /^[a-z]:/iu.test(path) || path.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new TypeError(`Unsafe dictionary artifact path: ${value || '<empty>'}.`);
  }
  return path;
}

function validateManifestHeader(manifest) {
  if (!manifest || manifest.format !== DISTRIBUTION_FORMAT || manifest.schemaVersion !== DISTRIBUTION_SCHEMA_VERSION) {
    throw new TypeError('Unsupported dictionary distribution manifest.');
  }
  if (manifest.releaseStatus !== 'staged') throw new TypeError('Dictionary distribution must remain staged in Phase 12.3.');
  if (manifest.runtime?.active !== false || manifest.runtime?.activeSource !== 'legacy-json') {
    throw new TypeError('Phase 12.3 manifest cannot activate the new dictionary runtime.');
  }
  validateDescriptor(manifest.defaultPack);
  validateDescriptor(manifest.licenses);
  validateDescriptor(manifest.routes?.entries);
  SEARCH_INDEX_KINDS.forEach((kind) => validateDescriptor(manifest.routes?.indexes?.[kind]));
}

function validateEntryRoute(route, packageData, artifacts) {
  if (!route || route.schemaVersion !== DISTRIBUTION_SCHEMA_VERSION || route.kind !== 'dictionary-entry-routes') {
    throw new TypeError('Unsupported dictionary entry routes.');
  }
  assertRouteIdentity(route, packageData);
  const expected = new Map(artifacts.map((item) => [item.payload.shardId, item.descriptor]));
  assertExactBuckets(route.buckets, expected, 'entry routes');
  if (route.coverage?.shards !== expected.size || route.coverage?.entries !== packageData.entries.length) {
    throw new TypeError('Dictionary entry route coverage is inconsistent.');
  }
}

function validateIndexRoute(route, packageData, indexKind, artifacts) {
  if (!route || route.schemaVersion !== DISTRIBUTION_SCHEMA_VERSION
    || route.kind !== 'dictionary-search-routes' || route.indexKind !== indexKind) {
    throw new TypeError(`Unsupported ${indexKind} search routes.`);
  }
  assertRouteIdentity(route, packageData);
  const items = artifacts.filter((item) => item.payload.indexKind === indexKind);
  const expected = new Map(items.map((item) => [item.payload.bucket, item.descriptor]));
  assertExactBuckets(route.buckets, expected, `${indexKind} routes`);
  const terms = sum(items.map((item) => Object.keys(item.payload.terms).length));
  const references = sum(items.map((item) => Object.values(item.payload.terms).flat().length));
  if (route.coverage?.shards !== expected.size || route.coverage?.terms !== terms || route.coverage?.references !== references) {
    throw new TypeError(`Dictionary ${indexKind} route coverage is inconsistent.`);
  }
}

function assertRouteIdentity(route, packageData) {
  if (route.packageId !== packageData.id || route.dictionaryVersion !== packageData.version) {
    throw new TypeError('Dictionary routes do not match the package identity.');
  }
}

function assertExactBuckets(actual, expected, label) {
  const entries = Object.entries(actual || {});
  const canonicalEntries = Object.entries(Object.fromEntries(
    [...entries].sort(([left], [right]) => left.localeCompare(right)),
  ));
  if (!sameJson(entries, canonicalEntries)) {
    throw new TypeError(`Dictionary ${label} are not sorted.`);
  }
  if (entries.length !== expected.size) throw new TypeError(`Dictionary ${label} do not cover every bucket.`);
  for (const [bucket, descriptor] of entries) {
    if (!expected.has(bucket) || !sameJson(descriptor, expected.get(bucket))) {
      throw new TypeError(`Dictionary ${label} contain an invalid bucket: ${bucket}.`);
    }
  }
}

function verifyArtifactFromMap(descriptor, artifacts) {
  validateDescriptor(descriptor);
  if (!artifacts.has(descriptor.path)) throw new TypeError(`Dictionary artifact is missing: ${descriptor.path}.`);
  verifyArtifactDescriptor(descriptor, artifacts.get(descriptor.path));
}

function validateDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    throw new TypeError('Dictionary artifact descriptor must be an object.');
  }
  validateRelativeArtifactPath(descriptor.path);
  if (!Number.isSafeInteger(descriptor.byteLength) || descriptor.byteLength <= 0) {
    throw new TypeError(`Dictionary artifact has an invalid byte length: ${descriptor.path}.`);
  }
  if (!/^[a-f0-9]{64}$/u.test(String(descriptor.sha256 || ''))) {
    throw new TypeError(`Dictionary artifact has an invalid SHA-256: ${descriptor.path}.`);
  }
}

function uniqueValue(values, label) {
  const unique = [...new Set(values)];
  if (unique.length !== 1 || !unique[0]) throw new TypeError(`Dictionary routes require one ${label}.`);
  return unique[0];
}

function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(String(value), 'utf8');
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}
