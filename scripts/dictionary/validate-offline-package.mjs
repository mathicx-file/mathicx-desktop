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
};
validateRoute(routes.entries, manifest, 'entries');
for (const [kind, route] of Object.entries(routes.indexes)) validateRoute(route, manifest, kind);

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

console.log(JSON.stringify({
  valid: true,
  id: manifest.id,
  packageId: manifest.packageId,
  version: manifest.dictionaryVersion,
  artifacts: manifest.artifacts.length + 1,
  entryShards: Object.keys(routes.entries.buckets).length,
  indexShards,
  lexicalEntries,
  compressedBytes,
  expandedBytes,
}, null, 2));

function validateManifest(manifest) {
  if (manifest?.format !== 'mathicx-japanese-dictionary-offline-package' || manifest.schemaVersion !== 1
    || !manifest.id || !manifest.packageId || !manifest.dictionaryVersion
    || !Array.isArray(manifest.artifacts) || !manifest.artifacts.length
    || !manifest.routes?.entries || !manifest.routes?.indexes) {
    throw new TypeError('Offline package manifest is invalid.');
  }
}

function validateRoute(route, manifest, kind) {
  const expectedKind = kind === 'entries' ? 'dictionary-entry-routes' : 'dictionary-search-routes';
  if (route?.kind !== expectedKind || route.packageId !== manifest.packageId
    || route.dictionaryVersion !== manifest.dictionaryVersion || !route.buckets
    || (kind !== 'entries' && route.indexKind !== kind)) {
    throw new TypeError(`Offline package route is invalid: ${kind}`);
  }
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
