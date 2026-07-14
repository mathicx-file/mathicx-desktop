import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

import { verifyArtifactDescriptor } from './lib/distribution-manifest.mjs';
import { assertNoMojibake } from './lib/source-io.mjs';

const [rootArgument, manifestArgument] = process.argv.slice(2);
if (!rootArgument || !manifestArgument) {
  throw new TypeError('Usage: node validate-offline-package.mjs <dictionary-root> <manifest-path>');
}
const root = path.resolve(rootArgument);
const manifestPath = normalizePath(manifestArgument);
const manifestBytes = await fs.readFile(resolveArtifact(root, manifestPath));
const manifest = parseJson(manifestBytes, manifestPath);
validateManifest(manifest);

const descriptors = new Map();
for (const descriptor of manifest.artifacts) {
  if (descriptors.has(descriptor.path)) throw new TypeError(`Duplicate package artifact: ${descriptor.path}`);
  descriptors.set(descriptor.path, descriptor);
}

const payloads = new Map();
let compressedBytes = manifestBytes.byteLength;
let expandedBytes = 0;
for (const descriptor of manifest.artifacts) {
  const bytes = await fs.readFile(resolveArtifact(root, descriptor.path));
  verifyArtifactDescriptor(descriptor, bytes);
  if (descriptor.encoding !== 'gzip') throw new TypeError(`Package artifact is not gzip: ${descriptor.path}`);
  const expanded = gunzipSync(bytes);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(expanded);
  assertNoMojibake(text, descriptor.path);
  if (descriptor.kind === 'route') payloads.set(descriptor.path, JSON.parse(text));
  compressedBytes += bytes.byteLength;
  expandedBytes += expanded.byteLength;
}

const routes = {
  entries: requirePayload(manifest.routes.entries, payloads),
  indexes: Object.fromEntries(['written', 'reading', 'romaji', 'pt'].map((kind) => (
    [kind, requirePayload(manifest.routes.indexes[kind], payloads)]
  ))),
  browse: requirePayload(manifest.routes.browse, payloads),
};
validateRoute(routes.entries, manifest, 'entries');
for (const [kind, route] of Object.entries(routes.indexes)) validateRoute(route, manifest, kind);
validateRoute(routes.browse, manifest, 'browse');

let lexicalEntries = 0;
for (const [bucket, descriptor] of Object.entries(routes.entries.buckets)) {
  assertManifestDescriptor(descriptor, descriptors);
  const shard = await readPayload(root, descriptor);
  if (shard.kind !== 'dictionary-entry-shard' || shard.shardId !== bucket
    || shard.packageId !== manifest.packageId || shard.dictionaryVersion !== manifest.dictionaryVersion) {
    throw new TypeError(`Invalid package entry shard: ${bucket}`);
  }
  lexicalEntries += shard.entries.length;
}
if (lexicalEntries !== routes.entries.coverage.entries) {
  throw new TypeError('Package entry route coverage is inconsistent.');
}

let indexShards = 0;
for (const [kind, route] of Object.entries(routes.indexes)) {
  let terms = 0;
  let references = 0;
  for (const [bucket, descriptor] of Object.entries(route.buckets)) {
    assertManifestDescriptor(descriptor, descriptors);
    const shard = await readPayload(root, descriptor);
    if (shard.kind !== 'dictionary-search-index-shard' || shard.indexKind !== kind
      || shard.bucket !== bucket || shard.packageId !== manifest.packageId
      || shard.dictionaryVersion !== manifest.dictionaryVersion) {
      throw new TypeError(`Invalid package index shard: ${kind}/${bucket}`);
    }
    terms += Object.keys(shard.terms).length;
    references += Object.values(shard.terms).flat().length;
    indexShards += 1;
  }
  if (terms !== route.coverage.terms || references !== route.coverage.references) {
    throw new TypeError(`Package ${kind} index route coverage is inconsistent.`);
  }
}

const browseRows = [];
const browseCounts = { all: 0, hiragana: 0, katakana: 0, kanji: 0 };
for (const [pageId, item] of Object.entries(routes.browse.pages)) {
  assertManifestDescriptor(item.artifact, descriptors);
  const page = await readPayload(root, item.artifact);
  if (page.kind !== 'dictionary-browse-page' || page.pageId !== pageId
    || page.packageId !== manifest.packageId || page.dictionaryVersion !== manifest.dictionaryVersion
    || page.order !== routes.browse.order || !Array.isArray(page.rows)
    || JSON.stringify(page.counts) !== JSON.stringify(item.counts)) {
    throw new TypeError(`Invalid package browse page: ${pageId}`);
  }
  for (const row of page.rows) {
    validateBrowseRow(row);
    browseRows.push(row);
    browseCounts.all += 1;
    browseCounts[row[5]] += 1;
  }
}
if (new Set(browseRows.map((row) => row[0])).size !== browseRows.length
  || browseRows.length !== lexicalEntries
  || JSON.stringify(browseRows) !== JSON.stringify([...browseRows].sort(compareBrowseRows))
  || JSON.stringify(browseCounts) !== JSON.stringify(routes.browse.coverage)) {
  throw new TypeError('Package browse coverage or ordering is inconsistent.');
}

console.log(JSON.stringify({
  valid: true,
  id: manifest.id,
  packageId: manifest.packageId,
  version: manifest.dictionaryVersion,
  artifacts: manifest.artifacts.length + 1,
  entryShards: Object.keys(routes.entries.buckets).length,
  indexShards,
  browsePages: Object.keys(routes.browse.pages).length,
  lexicalEntries,
  compressedBytes,
  expandedBytes,
}, null, 2));

function validateManifest(manifest) {
  if (manifest?.format !== 'mathicx-japanese-dictionary-offline-package' || manifest.schemaVersion !== 1
    || !manifest.id || !manifest.packageId || !manifest.dictionaryVersion
    || !Array.isArray(manifest.artifacts) || !manifest.artifacts.length
    || !manifest.routes?.entries || !manifest.routes?.indexes || !manifest.routes?.browse
    || !Number.isSafeInteger(manifest.distributionRevision) || manifest.distributionRevision < 1) {
    throw new TypeError('Offline package manifest is invalid.');
  }
}

function validateRoute(route, manifest, kind) {
  const expectedKind = kind === 'entries' ? 'dictionary-entry-routes'
    : kind === 'browse' ? 'dictionary-browse-routes' : 'dictionary-search-routes';
  if (route?.kind !== expectedKind || route.packageId !== manifest.packageId
    || route.dictionaryVersion !== manifest.dictionaryVersion
    || (kind === 'browse' ? !route.pages : !route.buckets)
    || (kind === 'browse' && (route.order !== 'romaji-asc-pages'
      || !Number.isSafeInteger(route.pageSize) || route.pageSize < 100
      || !route.coverage || typeof route.coverage !== 'object'))
    || (!['entries', 'browse'].includes(kind) && route.indexKind !== kind)) {
    throw new TypeError(`Offline package route is invalid: ${kind}`);
  }
}

function validateBrowseRow(row) {
  if (!Array.isArray(row) || row.length !== 7 || row.some((value) => typeof value !== 'string')
    || !row[0] || !row[1] || !row[2] || !row[3]
    || !['hiragana', 'katakana', 'kanji'].includes(row[5])) {
    throw new TypeError(`Invalid package browse row: ${row?.[0] || '<unknown>'}`);
  }
}

function compareBrowseRows(left, right) {
  return compareText(left[3], right[3]) || compareText(left[2], right[2])
    || compareText(left[1], right[1]) || compareText(left[0], right[0]);
}

function compareText(left, right) {
  return left === right ? 0 : left < right ? -1 : 1;
}

function assertManifestDescriptor(descriptor, descriptors) {
  const declared = descriptors.get(descriptor.path);
  if (!declared || JSON.stringify(declared) !== JSON.stringify(descriptor)) {
    throw new TypeError(`Route references an undeclared artifact: ${descriptor.path}`);
  }
}

function requirePayload(descriptor, payloads) {
  if (!payloads.has(descriptor.path)) throw new TypeError(`Package payload is missing: ${descriptor.path}`);
  return payloads.get(descriptor.path);
}

async function readPayload(root, descriptor) {
  const bytes = await fs.readFile(resolveArtifact(root, descriptor.path));
  verifyArtifactDescriptor(descriptor, bytes);
  return parseJson(gunzipSync(bytes), descriptor.path);
}

function parseJson(bytes, source) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  assertNoMojibake(text, source);
  return JSON.parse(text);
}

function resolveArtifact(root, relativePath) {
  return path.join(root, ...normalizePath(relativePath).split('/'));
}

function normalizePath(value) {
  const normalized = String(value || '').replace(/\\/gu, '/');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').some((part) => !part || part === '..')) {
    throw new TypeError(`Unsafe offline package path: ${value}`);
  }
  return normalized;
}
