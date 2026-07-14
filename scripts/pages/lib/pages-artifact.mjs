import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

import {
  createArtifactDescriptor,
  createDistributionManifest,
  createDistributionRoutes,
  validateRelativeArtifactPath,
  verifyArtifactDescriptor,
  verifyDictionaryDistribution,
} from '../../dictionary/lib/distribution-manifest.mjs';
import { createEntryShards, validateEntryShards } from '../../dictionary/lib/entry-shards.mjs';
import {
  SEARCH_INDEX_KINDS,
  createSearchIndexes,
  validateSearchIndexes,
} from '../../dictionary/lib/search-indexes.mjs';
import {
  assertNoMojibake,
  readJsonFile,
  writeDeterministicJson,
} from '../../dictionary/lib/source-io.mjs';
import { validatePackageCatalog } from '../../../Applications/japanese-study/js/dictionary/dictionary-package-manager.js';

const STATIC_ROOTS = ['src', 'styles', 'Applications'];
const ROOT_FILES = ['index.html', '.nojekyll'];
const ALLOWED_EXTENSIONS = new Set([
  '.html', '.css', '.js', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp',
  '.gif', '.ico', '.woff', '.woff2', '.ttf',
  '.gz',
]);
const FORBIDDEN_SEGMENTS = new Set([
  '.git', '.github', 'node_modules', 'docs', 'scripts', 'test', 'tests', 'tmp',
]);
const FORBIDDEN_FILES = new Set([
  'package.json', 'package-lock.json', '.gitignore', 'README.md', 'DOCUMENTATION.md',
]);
const GENERATED_DICTIONARY_SEGMENTS = new Set([
  'indexes', 'manifests', 'packs', 'reports', 'routes', 'shards', 'releases', 'licenses',
]);
const DICTIONARY_RELATIVE_ROOT = 'Applications/japanese-study/data/dictionary';

export async function buildPagesArtifact(options = {}) {
  const workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
  const outputRoot = path.resolve(options.outputRoot || path.join(workspaceRoot, '_site'));
  assertSafeOutputRoot(workspaceRoot, outputRoot);
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(outputRoot, { recursive: true });

  for (const file of ROOT_FILES) {
    await copyFile(workspaceRoot, outputRoot, file);
  }
  for (const root of STATIC_ROOTS) {
    await copyRuntimeTree(workspaceRoot, outputRoot, root);
  }

  const dictionary = await generateVersionedDictionaryRelease(workspaceRoot, outputRoot);
  const inventory = await inspectArtifact(outputRoot);
  return { outputRoot, dictionary, ...inventory };
}

export async function validatePagesArtifact(options = {}) {
  const outputRoot = path.resolve(options.outputRoot || path.resolve('_site'));
  const inventory = await inspectArtifact(outputRoot);
  const relativeFiles = new Set(inventory.files.map((item) => item.path));

  for (const required of [
    'index.html',
    '.nojekyll',
    'src/main.js',
    'src/firebase/firebase-config.prod.js',
    'Applications/japanese-study/service-worker.js',
    'Applications/japanese-study/js/pwa-manager.js',
    'Applications/japanese-study/js/dictionary/installed-dictionary-packages-source.js',
  ]) {
    if (!relativeFiles.has(required)) throw new TypeError(`Pages artifact is missing: ${required}.`);
  }
  for (const item of inventory.files) validatePublishedPath(item.path);
  await validateFirebaseConfig(path.join(outputRoot, 'src/firebase/firebase-config.prod.js'));

  const dictionaryRoot = path.join(outputRoot, ...DICTIONARY_RELATIVE_ROOT.split('/'));
  const currentRelease = await readJsonFile(path.join(dictionaryRoot, 'releases/current.json'));
  validateReleaseHeader(currentRelease);
  const packageCatalog = validatePackageCatalog(await readJsonFile(path.join(
    dictionaryRoot,
    'packages/catalog.json',
  )));
  if (packageCatalog.dictionaryVersion !== currentRelease.dictionaryVersion) {
    throw new TypeError('Dictionary package catalog and stable release versions differ.');
  }
  const versionedRelease = await readJsonFile(path.join(
    dictionaryRoot, `releases/${currentRelease.dictionaryVersion}.json`,
  ));
  if (JSON.stringify(currentRelease) !== JSON.stringify(versionedRelease)) {
    throw new TypeError('Current dictionary release does not match its versioned descriptor.');
  }

  const artifacts = new Map();
  const manifest = await readDescribedJson(dictionaryRoot, currentRelease.manifest, artifacts);
  if (manifest.dictionaryVersion !== currentRelease.dictionaryVersion) {
    throw new TypeError('Pages release and dictionary manifest versions differ.');
  }
  validateVersionedManifestPaths(manifest);
  const packageData = await readDescribedJson(dictionaryRoot, manifest.defaultPack, artifacts);
  const licenses = await readDescribedJson(dictionaryRoot, manifest.licenses, artifacts);
  const routes = {
    entries: await readDescribedJson(dictionaryRoot, manifest.routes.entries, artifacts),
    indexes: Object.fromEntries(await Promise.all(SEARCH_INDEX_KINDS.map(async (kind) => (
      [kind, await readDescribedJson(dictionaryRoot, manifest.routes.indexes[kind], artifacts)]
    )))),
  };
  const entryArtifacts = await Promise.all(Object.values(routes.entries.buckets).map(async (descriptor) => ({
    descriptor,
    payload: await readDescribedJson(dictionaryRoot, descriptor, artifacts),
  })));
  const indexArtifacts = [];
  for (const kind of SEARCH_INDEX_KINDS) {
    indexArtifacts.push(...await Promise.all(Object.values(routes.indexes[kind].buckets).map(
      async (descriptor) => ({ descriptor, payload: await readDescribedJson(dictionaryRoot, descriptor, artifacts) }),
    )));
  }
  const [entryConfig, indexConfig] = await Promise.all([
    readJsonFile(path.resolve('scripts/dictionary/config/sharding.json')),
    readJsonFile(path.resolve('scripts/dictionary/config/search-indexes.json')),
  ]);
  validateEntryShards(packageData, entryArtifacts.map((item) => item.payload), entryConfig);
  validateSearchIndexes(packageData, indexArtifacts.map((item) => item.payload), indexConfig);
  const distribution = verifyDictionaryDistribution({
    manifest, packageData, licenses, routes, entryArtifacts, indexArtifacts, artifacts,
  });
  if (currentRelease.artifacts.distribution !== distribution.verifiedArtifacts) {
    throw new TypeError('Pages release artifact count is inconsistent.');
  }
  const optionalPackages = await validatePublishedPackages(dictionaryRoot, packageCatalog);

  return {
    valid: true,
    files: inventory.fileCount,
    byteLength: inventory.byteLength,
    dictionaryVersion: currentRelease.dictionaryVersion,
    distributionArtifacts: currentRelease.artifacts.distribution,
    entryShards: distribution.entryShards,
    indexShards: distribution.indexShards,
    packages: packageCatalog.packages.length,
    optionalPackageArtifacts: optionalPackages.artifacts,
    optionalPackageBytes: optionalPackages.byteLength,
  };
}

async function validatePublishedPackages(dictionaryRoot, packageCatalog) {
  let artifacts = 0;
  let byteLength = 0;
  for (const item of packageCatalog.packages.filter((entry) => entry.availability === 'available')) {
    const manifestBytes = await readDescribedBytes(dictionaryRoot, item.manifest);
    const manifest = parsePublishedJson(manifestBytes, item.manifest.path);
    if (manifest?.format !== 'mathicx-japanese-dictionary-offline-package'
      || manifest.schemaVersion !== 1 || manifest.id !== item.id
      || manifest.packageId !== item.packageId || manifest.dictionaryVersion !== item.version
      || manifest.distributionRevision !== item.distributionRevision
      || !manifest.routes?.entries || !manifest.routes?.indexes || !manifest.routes?.browse
      || !Array.isArray(manifest.artifacts) || !manifest.artifacts.length) {
      throw new TypeError(`Published offline package manifest is invalid: ${item.id}.`);
    }
    const prefix = `packages/${item.version}/${item.id}/`;
    const paths = new Set();
    for (const descriptor of manifest.artifacts) {
      const safePath = validateRelativeArtifactPath(descriptor.path);
      if (!safePath.startsWith(prefix) || paths.has(safePath) || descriptor.encoding !== 'gzip') {
        throw new TypeError(`Published offline package artifact is invalid: ${safePath}.`);
      }
      paths.add(safePath);
      const compressed = await readDescribedBytes(dictionaryRoot, descriptor);
      parsePublishedJson(gunzipSync(compressed), safePath);
      artifacts += 1;
      byteLength += compressed.byteLength;
    }
    const routeDescriptors = [
      manifest.routes.entries,
      ...Object.values(manifest.routes.indexes),
      manifest.routes.browse,
    ];
    if (routeDescriptors.some((descriptor) => descriptor.kind !== 'route' || !paths.has(descriptor.path))) {
      throw new TypeError(`Published offline package routes are invalid: ${item.id}.`);
    }
    const packageBytes = manifestBytes.byteLength
      + manifest.artifacts.reduce((total, descriptor) => total + descriptor.byteLength, 0);
    if (packageBytes !== item.estimatedByteLength) {
      throw new TypeError(`Published offline package size is inconsistent: ${item.id}.`);
    }
    artifacts += 1;
    byteLength += manifestBytes.byteLength;
  }
  return { artifacts, byteLength };
}

async function generateVersionedDictionaryRelease(workspaceRoot, outputRoot) {
  const sourceRoot = path.join(workspaceRoot, ...DICTIONARY_RELATIVE_ROOT.split('/'));
  const outputDictionaryRoot = path.join(outputRoot, ...DICTIONARY_RELATIVE_ROOT.split('/'));
  const [packageData, licenses, entryConfig, indexConfig, appPackage] = await Promise.all([
    readJsonFile(path.join(sourceRoot, 'packs/bootstrap-n5.json')),
    readJsonFile(path.join(sourceRoot, 'licenses.json')),
    readJsonFile(path.join(workspaceRoot, 'scripts/dictionary/config/sharding.json')),
    readJsonFile(path.join(workspaceRoot, 'scripts/dictionary/config/search-indexes.json')),
    readJsonFile(path.join(workspaceRoot, 'Applications/japanese-study/package.json')),
  ]);
  const version = packageData.version;
  const entryResult = createEntryShards(packageData, entryConfig);
  const indexResult = createSearchIndexes(packageData, indexConfig);
  const packPath = `packs/${version}/bootstrap-n5.json`;
  const licensesPath = `licenses/${version}.json`;

  await Promise.all([
    writeDictionaryJson(outputDictionaryRoot, packPath, packageData),
    writeDictionaryJson(outputDictionaryRoot, licensesPath, licenses),
    ...entryResult.shards.map((payload) => writeDictionaryJson(
      outputDictionaryRoot, `shards/entries/${version}/${payload.shardId}.json`, payload,
    )),
    ...indexResult.shards.map((payload) => writeDictionaryJson(
      outputDictionaryRoot, `indexes/${version}/${payload.indexKind}/${payload.bucket}.json`, payload,
    )),
  ]);

  const entryArtifacts = await Promise.all(entryResult.shards.map(async (payload) => ({
    payload,
    descriptor: await descriptorFor(outputDictionaryRoot, `shards/entries/${version}/${payload.shardId}.json`),
  })));
  const indexArtifacts = await Promise.all(indexResult.shards.map(async (payload) => ({
    payload,
    descriptor: await descriptorFor(
      outputDictionaryRoot, `indexes/${version}/${payload.indexKind}/${payload.bucket}.json`,
    ),
  })));
  const routes = createDistributionRoutes({ packageData, entryArtifacts, indexArtifacts, entryConfig, indexConfig });
  const routePaths = {
    entries: `routes/${version}/entries.json`,
    indexes: Object.fromEntries(SEARCH_INDEX_KINDS.map((kind) => [kind, `routes/${version}/${kind}.json`])),
  };
  await Promise.all([
    writeDictionaryJson(outputDictionaryRoot, routePaths.entries, routes.entries),
    ...SEARCH_INDEX_KINDS.map((kind) => writeDictionaryJson(
      outputDictionaryRoot, routePaths.indexes[kind], routes.indexes[kind],
    )),
  ]);
  const manifest = createDistributionManifest({
    packageData,
    packDescriptor: await descriptorFor(outputDictionaryRoot, packPath),
    licensesDescriptor: await descriptorFor(outputDictionaryRoot, licensesPath),
    routeDescriptors: {
      entries: await descriptorFor(outputDictionaryRoot, routePaths.entries),
      indexes: Object.fromEntries(await Promise.all(SEARCH_INDEX_KINDS.map(async (kind) => (
        [kind, await descriptorFor(outputDictionaryRoot, routePaths.indexes[kind])]
      )))),
    },
  });
  const manifestPath = `manifests/${version}.json`;
  await writeDictionaryJson(outputDictionaryRoot, manifestPath, manifest);
  const descriptors = [
    manifest.defaultPack,
    manifest.licenses,
    manifest.routes.entries,
    ...Object.values(manifest.routes.indexes),
    ...Object.values(routes.entries.buckets),
    ...Object.values(routes.indexes).flatMap((route) => Object.values(route.buckets)),
  ];
  const manifestDescriptor = await descriptorFor(outputDictionaryRoot, manifestPath);
  const release = {
    format: 'mathicx-japanese-dictionary-pages-release',
    schemaVersion: 1,
    channel: 'stable',
    minimumAppVersion: appPackage.version,
    releaseStatus: manifest.releaseStatus,
    packageId: packageData.id,
    dictionaryVersion: version,
    manifest: manifestDescriptor,
    artifacts: {
      distribution: descriptors.length + 1,
      byteLength: descriptors.reduce((total, item) => total + item.byteLength, 0)
        + manifestDescriptor.byteLength,
      entryShards: entryArtifacts.length,
      indexShards: indexArtifacts.length,
    },
  };
  await Promise.all([
    writeDictionaryJson(outputDictionaryRoot, `releases/${version}.json`, release),
    writeDictionaryJson(outputDictionaryRoot, 'releases/current.json', release),
  ]);
  return release;
}

async function copyRuntimeTree(workspaceRoot, outputRoot, relativeRoot) {
  const sourceRoot = path.join(workspaceRoot, relativeRoot);
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = path.posix.join(relativeRoot.split(path.sep).join('/'), entry.name);
    if (entry.isSymbolicLink()) throw new TypeError(`Runtime source cannot contain symlinks: ${relativePath}.`);
    if (entry.isDirectory()) {
      if (shouldEnterDirectory(relativePath)) await copyRuntimeTree(workspaceRoot, outputRoot, relativePath);
    } else if (entry.isFile() && shouldCopyRuntimeFile(relativePath)) {
      await copyFile(workspaceRoot, outputRoot, relativePath);
    }
  }
}

function shouldEnterDirectory(relativePath) {
  const segments = relativePath.split('/');
  if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) return false;
  const dictionaryOffset = segments.join('/').indexOf(`${DICTIONARY_RELATIVE_ROOT}/`);
  if (dictionaryOffset === 0) {
    const generatedSegment = segments[DICTIONARY_RELATIVE_ROOT.split('/').length];
    if (GENERATED_DICTIONARY_SEGMENTS.has(generatedSegment)) return false;
  }
  return true;
}

function shouldCopyRuntimeFile(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  const name = path.posix.basename(normalized);
  if (FORBIDDEN_FILES.has(name) || name.endsWith('.local.js') || name.startsWith('.env')) return false;
  return ALLOWED_EXTENSIONS.has(path.posix.extname(name).toLowerCase());
}

async function copyFile(workspaceRoot, outputRoot, relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  const source = path.join(workspaceRoot, ...normalized.split('/'));
  const target = path.join(outputRoot, ...normalized.split('/'));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function writeDictionaryJson(dictionaryRoot, relativePath, payload) {
  const safePath = validateRelativeArtifactPath(relativePath);
  await writeDeterministicJson(path.join(dictionaryRoot, ...safePath.split('/')), payload);
}

async function descriptorFor(dictionaryRoot, relativePath) {
  const safePath = validateRelativeArtifactPath(relativePath);
  return createArtifactDescriptor(safePath, await fs.readFile(path.join(dictionaryRoot, ...safePath.split('/'))));
}

async function readDescribedJson(dictionaryRoot, descriptor, artifacts) {
  const safePath = validateRelativeArtifactPath(descriptor.path);
  const bytes = await fs.readFile(path.join(dictionaryRoot, ...safePath.split('/')));
  verifyArtifactDescriptor(descriptor, bytes);
  artifacts.set(safePath, bytes);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  assertNoMojibake(text, safePath);
  return JSON.parse(text);
}

async function readDescribedBytes(dictionaryRoot, descriptor) {
  const safePath = validateRelativeArtifactPath(descriptor.path);
  const bytes = await fs.readFile(path.join(dictionaryRoot, ...safePath.split('/')));
  verifyArtifactDescriptor(descriptor, bytes);
  return bytes;
}

function parsePublishedJson(bytes, source) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  assertNoMojibake(text, source);
  return JSON.parse(text);
}

async function inspectArtifact(outputRoot) {
  const files = [];
  await walk(outputRoot, '', files);
  return {
    files,
    fileCount: files.length,
    byteLength: files.reduce((total, item) => total + item.byteLength, 0),
  };
}

async function walk(root, relativeRoot, files) {
  const directory = path.join(root, ...relativeRoot.split('/').filter(Boolean));
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new TypeError(`Pages artifact cannot contain symlinks: ${relativePath}.`);
    if (entry.isDirectory()) await walk(root, relativePath, files);
    if (entry.isFile()) files.push({ path: relativePath, byteLength: (await fs.stat(path.join(directory, entry.name))).size });
  }
}

function validatePublishedPath(relativePath) {
  const segments = relativePath.split('/');
  if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) {
    throw new TypeError(`Forbidden directory in Pages artifact: ${relativePath}.`);
  }
  const name = segments.at(-1);
  if (name.startsWith('.env') || name.endsWith('.local.js') || FORBIDDEN_FILES.has(name)) {
    throw new TypeError(`Forbidden file in Pages artifact: ${relativePath}.`);
  }
}

async function validateFirebaseConfig(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  for (const field of ['apiKey', 'authDomain', 'projectId', 'appId']) {
    const match = content.match(new RegExp(`${field}:\\s*['\"]([^'\"]+)['\"]`));
    if (!match || !match[1] || /YOUR_|PLACEHOLDER|undefined/i.test(match[1])) {
      throw new TypeError(`Firebase production config is incomplete: ${field}.`);
    }
  }
}

function validateReleaseHeader(release) {
  if (release?.format !== 'mathicx-japanese-dictionary-pages-release' || release.schemaVersion !== 1) {
    throw new TypeError('Unsupported Pages dictionary release descriptor.');
  }
  if (!release.dictionaryVersion || !release.manifest || !release.artifacts) {
    throw new TypeError('Pages dictionary release descriptor is incomplete.');
  }
  if (release.channel !== 'stable' || !/^\d+\.\d+\.\d+$/u.test(release.minimumAppVersion || '')) {
    throw new TypeError('Pages dictionary release compatibility contract is invalid.');
  }
}

function validateVersionedManifestPaths(manifest) {
  const version = manifest.dictionaryVersion;
  const descriptors = [
    manifest.defaultPack,
    manifest.licenses,
    manifest.routes.entries,
    ...Object.values(manifest.routes.indexes),
  ];
  if (!manifest.defaultPack.path.startsWith(`packs/${version}/`)) {
    throw new TypeError('Pages dictionary pack path is not versioned.');
  }
  if (manifest.licenses.path !== `licenses/${version}.json`) {
    throw new TypeError('Pages dictionary licenses path is not versioned.');
  }
  if (descriptors.some((descriptor) => !descriptor.path.includes(version))) {
    throw new TypeError('Pages dictionary descriptor path is not versioned.');
  }
}

function assertSafeOutputRoot(workspaceRoot, outputRoot) {
  const relative = path.relative(workspaceRoot, outputRoot);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new TypeError('Pages output must be a child of the workspace.');
  }
}
