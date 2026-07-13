import { verifyArtifact } from './dictionary-cache-installer.js';

const DEFAULT_DATA_URL = new URL('../../data/dictionary/', import.meta.url);
const DEFAULT_CATALOG_URL = new URL('packages/catalog.json', DEFAULT_DATA_URL);
const CATALOG_FORMAT = 'mathicx-japanese-dictionary-package-catalog';
const PACKAGE_FORMAT = 'mathicx-japanese-dictionary-offline-package';
const PACKAGE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;
const VERSION_PATTERN = /^\d{4}\.\d{2}\.\d{2}-\d+$/u;

export class DictionaryPackageManager {
  constructor(options = {}) {
    if (!options.repository) throw new Error('Dictionary package repository is required.');
    this.repository = options.repository;
    this.dataUrl = options.dataUrl || DEFAULT_DATA_URL;
    this.catalogUrl = options.catalogUrl || DEFAULT_CATALOG_URL;
    this.fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
    this.crypto = options.crypto || globalThis.crypto;
    this.decoder = options.textDecoder || new TextDecoder();
    this.now = options.now || (() => Date.now());
    this.storageManager = options.storageManager || null;
    this.maxConcurrentDownloads = normalizeConcurrency(options.maxConcurrentDownloads);
    this.catalog = null;
    this.catalogSource = 'none';

    if (typeof this.fetchImpl !== 'function') {
      throw new Error('Fetch is unavailable for dictionary package management.');
    }
  }

  async loadCatalog(options = {}) {
    try {
      const response = await this.fetchImpl(this.catalogUrl, {
        signal: options.signal,
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response?.ok) {
        throw new Error(`Unable to load dictionary package catalog: HTTP ${response?.status || 'unknown'}.`);
      }
      const catalog = parseJson(new Uint8Array(await response.arrayBuffer()), String(this.catalogUrl), this.decoder);
      this.catalog = validatePackageCatalog(catalog);
      this.catalogSource = 'network';
      await this.repository.setPackageCatalog(this.catalog);
    } catch (error) {
      const cached = await this.repository.getPackageCatalog();
      if (!cached) throw error;
      this.catalog = validatePackageCatalog(cached);
      this.catalogSource = 'cache';
    }
    return this.listPackages();
  }

  async listPackages() {
    if (!this.catalog) throw new Error('Dictionary package catalog has not been loaded.');
    const [cacheState, packageStates] = await Promise.all([
      this.repository.getCacheState(),
      this.repository.getPackageStates(),
    ]);
    return Promise.all(this.catalog.packages.map(async (item) => {
      if (item.required) {
        const state = await this.repository.getVersionState(item.version);
        return packageView(item, state, [], cacheState, this.catalogSource);
      }
      const matching = packageStates.filter((state) => state.packageId === item.id);
      const state = matching.find((candidate) => candidate.version === item.version) || null;
      return packageView(item, state, matching, cacheState, this.catalogSource);
    }));
  }

  async install(packageId, options = {}) {
    const item = this.getPackage(packageId);
    if (item.required) return { status: 'included', packageId: item.id, version: item.version };
    if (item.availability !== 'available' || !item.manifest) {
      throw new Error(`Dictionary package is not published yet: ${item.id}`);
    }

    const previous = await this.repository.getPackageState(item.version, item.id);
    if (previous?.status === 'ready') return { ...previous, status: 'ready', reused: true };
    await this.storageManager?.assertCapacity(item.estimatedByteLength, {
      version: item.version,
      packageId: item.id,
    });
    await this.repository.setPackageState(item.version, item.id, {
      status: 'installing',
      startedAt: previous?.startedAt || this.now(),
      resumedAt: previous ? this.now() : null,
    });

    let currentPath = item.manifest.path;
    try {
      const manifestBytes = await this.loadVerifiedArtifact(item.manifest, options.signal);
      const manifest = validatePackageManifest(
        parseJson(manifestBytes, item.manifest.path, this.decoder),
        item,
      );
      const descriptors = [
        { ...item.manifest, kind: 'package-manifest', bytes: manifestBytes },
        ...manifest.artifacts,
      ];
      await this.storageManager?.assertCapacity(
        descriptors.reduce((total, descriptor) => total + descriptor.byteLength, 0),
        { version: item.version, packageId: item.id },
      );
      let downloadedArtifacts = 0;
      let reusedArtifacts = 0;
      let byteLength = 0;

      await mapWithConcurrency(descriptors, this.maxConcurrentDownloads, async (descriptor) => {
        currentPath = descriptor.path;
        const cached = await this.repository.getArtifact(item.version, descriptor.path);
        if (cached) {
          try {
            await verifyArtifact(cached.bytes, descriptor, this.crypto);
            reusedArtifacts += 1;
            byteLength += descriptor.byteLength;
            options.onProgress?.({ packageId: item.id, path: descriptor.path, state: 'reused' });
            return;
          } catch {
            await this.repository.deleteArtifact(item.version, descriptor.path);
          }
        }
        const bytes = descriptor.bytes || await this.loadVerifiedArtifact(descriptor, options.signal);
        await this.repository.putArtifact(
          item.version,
          descriptor,
          bytes,
          descriptor.kind || 'package-artifact',
          item.id,
        );
        downloadedArtifacts += 1;
        byteLength += descriptor.byteLength;
        options.onProgress?.({ packageId: item.id, path: descriptor.path, state: 'downloaded' });
      });

      const result = {
        status: 'ready',
        packageId: item.id,
        version: item.version,
        manifest,
        manifestDescriptor: { ...item.manifest },
        artifactCount: descriptors.length,
        byteLength,
        downloadedArtifacts,
        reusedArtifacts,
        completedAt: this.now(),
      };
      await this.repository.setPackageState(item.version, item.id, result);
      return result;
    } catch (error) {
      await this.repository.setPackageState(item.version, item.id, {
        status: 'interrupted',
        interruptedAt: this.now(),
        failure: {
          path: currentPath,
          code: error?.name === 'QuotaExceededError' ? 'quota-exceeded' : 'installation-failed',
          message: error?.message || String(error),
        },
      }).catch(() => {});
      throw error;
    }
  }

  async remove(packageId) {
    const item = this.getPackage(packageId);
    if (item.required) throw new Error(`Required dictionary package cannot be removed: ${item.id}`);
    const removed = await this.repository.deletePackageArtifacts(item.version, item.id);
    await this.repository.deletePackageState(item.version, item.id);
    return { status: 'available', packageId: item.id, version: item.version, ...removed };
  }

  getPackage(packageId) {
    if (!this.catalog) throw new Error('Dictionary package catalog has not been loaded.');
    const item = this.catalog.packages.find((candidate) => candidate.id === packageId);
    if (!item) throw new Error(`Unknown dictionary package: ${packageId}`);
    return item;
  }

  async loadVerifiedArtifact(descriptor, signal) {
    const response = await this.fetchImpl(new URL(descriptor.path, this.dataUrl), {
      signal,
      cache: 'no-store',
    });
    if (!response?.ok) {
      throw new Error(`Unable to download dictionary package artifact: HTTP ${response?.status || 'unknown'}.`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    await verifyArtifact(bytes, descriptor, this.crypto);
    return bytes;
  }
}

export function validatePackageCatalog(catalog) {
  if (catalog?.format !== CATALOG_FORMAT || catalog.schemaVersion !== 1) {
    throw new Error('Unsupported dictionary package catalog.');
  }
  if (!VERSION_PATTERN.test(String(catalog.dictionaryVersion || '')) || !Array.isArray(catalog.packages)) {
    throw new Error('Dictionary package catalog is incomplete.');
  }
  const ids = new Set();
  const packages = catalog.packages.map((item) => {
    if (!PACKAGE_ID_PATTERN.test(String(item?.id || '')) || ids.has(item.id)) {
      throw new Error(`Invalid or duplicate dictionary package id: ${item?.id}`);
    }
    ids.add(item.id);
    if (!item.packageId || !item.name || !item.description || !VERSION_PATTERN.test(String(item.version || ''))) {
      throw new Error(`Dictionary package metadata is incomplete: ${item.id}`);
    }
    if (!['included', 'available', 'planned'].includes(item.availability)) {
      throw new Error(`Unsupported dictionary package availability: ${item.id}`);
    }
    if (!Number.isSafeInteger(item.estimatedByteLength) || item.estimatedByteLength < 0
      || !Number.isSafeInteger(item.entryCount) || item.entryCount < 0
      || !Number.isSafeInteger(item.kanjiCount) || item.kanjiCount < 0) {
      throw new Error(`Dictionary package metrics are invalid: ${item.id}`);
    }
    if (item.required !== (item.availability === 'included')) {
      throw new Error(`Only an included dictionary package can be required: ${item.id}`);
    }
    if (item.availability === 'available') {
      validateDescriptor(item.manifest);
      if (item.manifest.path !== `packages/${item.version}/${item.id}/manifest.json`) {
        throw new Error(`Dictionary package manifest path is invalid: ${item.id}`);
      }
    }
    if (item.availability !== 'available' && item.manifest) {
      throw new Error(`Unpublished dictionary package cannot have a manifest: ${item.id}`);
    }
    return { ...item };
  });
  if (packages.filter((item) => item.required).length !== 1) {
    throw new Error('Dictionary package catalog must contain exactly one required package.');
  }
  return { ...catalog, packages };
}

export function validatePackageManifest(manifest, catalogItem) {
  if (manifest?.format !== PACKAGE_FORMAT || manifest.schemaVersion !== 1) {
    throw new Error('Unsupported dictionary offline package manifest.');
  }
  if (manifest.id !== catalogItem.id || manifest.packageId !== catalogItem.packageId
    || manifest.dictionaryVersion !== catalogItem.version || !Array.isArray(manifest.artifacts)
    || !manifest.artifacts.length) {
    throw new Error(`Dictionary offline package identity is invalid: ${catalogItem.id}`);
  }
  const paths = new Set();
  const packagePrefix = `packages/${catalogItem.version}/${catalogItem.id}/`;
  manifest.artifacts.forEach((descriptor) => {
    validateDescriptor(descriptor);
    if (!descriptor.path.startsWith(packagePrefix) || !descriptor.kind || paths.has(descriptor.path)) {
      throw new Error(`Dictionary offline package artifact is invalid: ${descriptor.path}`);
    }
    paths.add(descriptor.path);
  });
  const routeDescriptors = [
    manifest.routes?.entries,
    ...['written', 'reading', 'romaji', 'pt'].map((kind) => manifest.routes?.indexes?.[kind]),
  ];
  routeDescriptors.forEach((descriptor) => {
    validateDescriptor(descriptor);
    if (!paths.has(descriptor.path) || descriptor.kind !== 'route') {
      throw new Error(`Dictionary offline package route is invalid: ${descriptor.path}`);
    }
  });
  return manifest;
}

function validateDescriptor(descriptor) {
  const path = String(descriptor?.path || '').trim().replace(/\\/gu, '/');
  if (!path || path.startsWith('/') || /^[a-z]+:/iu.test(path) || path.split('/').includes('..')
    || !Number.isSafeInteger(descriptor.byteLength) || descriptor.byteLength < 1
    || !/^[a-f0-9]{64}$/u.test(String(descriptor.sha256 || ''))) {
    throw new Error(`Invalid dictionary package descriptor: ${descriptor?.path}`);
  }
  if (descriptor.encoding && descriptor.encoding !== 'gzip') {
    throw new Error(`Unsupported dictionary package encoding: ${descriptor.encoding}`);
  }
}

function packageView(item, state, matchingStates, cacheState, catalogSource) {
  const base = { ...item, catalogSource };
  if (item.required) {
    if (state?.status === 'ready' && cacheState.activeVersion === item.version) {
      return { ...base, installed: true, status: 'offline-ready', state };
    }
    if (state?.status === 'ready') return { ...base, installed: true, status: 'downloaded', state };
    if (['installing', 'interrupted'].includes(state?.status)) {
      return { ...base, installed: true, status: state.status, state };
    }
    if (cacheState.activeVersion && cacheState.activeVersion !== item.version) {
      return { ...base, installed: true, status: 'outdated' };
    }
    return { ...base, installed: true, status: 'online-only' };
  }
  if (state?.status === 'ready') return { ...base, installed: true, status: 'ready', state };
  if (state?.status === 'installing' || state?.status === 'interrupted') {
    return { ...base, installed: false, status: state.status, state };
  }
  const older = matchingStates.find((candidate) => candidate.status === 'ready');
  if (older) return { ...base, installed: true, status: 'outdated', state: older };
  return { ...base, installed: false, status: item.availability };
}

function parseJson(bytes, source, decoder) {
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    throw new Error(`Invalid JSON dictionary package artifact: ${source}`);
  }
}

async function mapWithConcurrency(items, limit, task) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      await task(item);
    }
  });
  await Promise.all(workers);
}

function normalizeConcurrency(value) {
  const concurrency = Number(value ?? 3);
  return Number.isSafeInteger(concurrency) && concurrency > 0 ? Math.min(concurrency, 3) : 3;
}
