const INDEX_KINDS = ['written', 'reading', 'romaji', 'pt'];
const HASH_PATTERN = /^[a-f0-9]{64}$/;

export class DictionaryCacheInstaller {
  constructor(options = {}) {
    if (!options.repository) throw new Error('Dictionary cache repository is required.');
    if (typeof options.loadArtifact !== 'function') throw new Error('Dictionary artifact loader is required.');

    this.repository = options.repository;
    this.loadArtifact = options.loadArtifact;
    this.crypto = options.crypto || globalThis.crypto;
    this.textEncoder = options.textEncoder || new TextEncoder();
    this.textDecoder = options.textDecoder || new TextDecoder();
  }

  async installAndPromote(manifest) {
    const version = validateManifest(manifest);
    const cacheState = await this.repository.getCacheState();

    if (cacheState.activeVersion === version) {
      return { status: 'already-active', version, ...cacheState };
    }
    if (cacheState.previousVersion === version) {
      throw new Error(`Cannot overwrite the rollback dictionary cache version: ${version}`);
    }

    await this.repository.prepareVersion(version, {
      packageId: manifest.packageId,
      releaseStatus: manifest.releaseStatus,
    });

    let currentPath = '';
    try {
      const installed = new Map();
      const install = async (descriptor, kind) => {
        validateDescriptor(descriptor);
        currentPath = descriptor.path;
        const existing = installed.get(descriptor.path);
        if (existing) {
          if (existing.sha256 !== descriptor.sha256 || existing.byteLength !== descriptor.byteLength) {
            throw new Error(`Conflicting descriptors for dictionary artifact: ${descriptor.path}`);
          }
          return existing.bytes;
        }

        const bytes = toUint8Array(await this.loadArtifact(descriptor.path));
        await verifyArtifact(bytes, descriptor, this.crypto);
        await this.repository.putArtifact(version, descriptor, bytes, kind);
        installed.set(descriptor.path, { ...descriptor, bytes });
        return bytes;
      };

      await install(manifest.defaultPack, 'pack');
      await install(manifest.licenses, 'license');

      const routeDescriptors = getRouteDescriptors(manifest);
      const routes = [];
      for (const [kind, descriptor] of routeDescriptors) {
        const bytes = await install(descriptor, 'route');
        const route = parseJson(bytes, descriptor.path, this.textDecoder);
        validateRoute(route, version, kind);
        routes.push(route);
      }

      for (const route of routes) {
        for (const descriptor of Object.values(route.buckets)) {
          await install(descriptor, route.kind === 'dictionary-entry-routes' ? 'entry-shard' : 'index-shard');
        }
      }

      const manifestPath = `manifests/${version}.json`;
      const manifestBytes = this.textEncoder.encode(`${JSON.stringify(manifest, null, 2)}\n`);
      const manifestDescriptor = {
        path: manifestPath,
        byteLength: manifestBytes.byteLength,
        sha256: await sha256Hex(manifestBytes, this.crypto),
      };
      await this.repository.putArtifact(version, manifestDescriptor, manifestBytes, 'manifest');

      const artifactCount = installed.size + 1;
      const byteLength = [...installed.values()].reduce((total, item) => total + item.byteLength, 0)
        + manifestBytes.byteLength;
      await this.repository.setVersionState(version, {
        status: 'ready',
        completedAt: Date.now(),
        artifactCount,
        byteLength,
        manifestPath,
      });
      const promoted = await this.repository.promoteVersion(version);
      return { status: 'promoted', version, artifactCount, byteLength, ...promoted };
    } catch (error) {
      const failure = {
        version,
        path: currentPath,
        code: classifyFailure(error),
        message: error?.message || String(error),
      };
      await this.repository.deleteVersion(version).catch(() => {});
      await this.repository.recordFailure(failure).catch(() => {});
      throw error;
    }
  }

  rollback() {
    return this.repository.rollback();
  }
}

export async function verifyArtifact(bytes, descriptor, cryptoImpl = globalThis.crypto) {
  validateDescriptor(descriptor);
  const payload = toUint8Array(bytes);
  if (payload.byteLength !== descriptor.byteLength) {
    throw new Error(`Dictionary artifact size mismatch: ${descriptor.path}`);
  }
  const digest = await sha256Hex(payload, cryptoImpl);
  if (digest !== descriptor.sha256) {
    throw new Error(`Dictionary artifact hash mismatch: ${descriptor.path}`);
  }
}

export async function sha256Hex(bytes, cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl?.subtle) throw new Error('Web Crypto is unavailable for dictionary integrity checks.');
  const payload = toUint8Array(bytes);
  const digest = await cryptoImpl.subtle.digest('SHA-256', payload);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function validateManifest(manifest) {
  if (manifest?.format !== 'mathicx-japanese-dictionary' || manifest.schemaVersion !== 1) {
    throw new Error('Unsupported dictionary distribution manifest.');
  }
  if (manifest.releaseStatus !== 'staged') {
    throw new Error(`Dictionary manifest must be staged before installation: ${manifest.releaseStatus}`);
  }
  const version = String(manifest.dictionaryVersion || '').trim();
  if (!version || !manifest.packageId) throw new Error('Dictionary manifest identity is incomplete.');
  if (manifest.runtime?.active !== false || manifest.runtime?.activeSource !== 'legacy-json') {
    throw new Error('Phase 12.4 requires the legacy dictionary runtime to remain active.');
  }
  validateDescriptor(manifest.defaultPack);
  validateDescriptor(manifest.licenses);
  getRouteDescriptors(manifest).forEach(([, descriptor]) => validateDescriptor(descriptor));
  return version;
}

function getRouteDescriptors(manifest) {
  const entries = manifest.routes?.entries;
  const indexes = manifest.routes?.indexes;
  if (!entries || !indexes) throw new Error('Dictionary manifest routes are incomplete.');
  return [
    ['entries', entries],
    ...INDEX_KINDS.map((kind) => [kind, indexes[kind]]),
  ];
}

function validateRoute(route, version, expectedKind) {
  if (!route || route.schemaVersion !== 1 || route.dictionaryVersion !== version) {
    throw new Error(`Invalid dictionary route for ${expectedKind}.`);
  }
  const entryRoute = expectedKind === 'entries';
  if (entryRoute && route.kind !== 'dictionary-entry-routes') {
    throw new Error('Invalid dictionary entry route kind.');
  }
  if (!entryRoute && (route.kind !== 'dictionary-search-routes' || route.indexKind !== expectedKind)) {
    throw new Error(`Invalid dictionary search route kind: ${expectedKind}`);
  }
  if (!route.buckets || typeof route.buckets !== 'object' || Array.isArray(route.buckets)) {
    throw new Error(`Dictionary route has no buckets: ${expectedKind}`);
  }
  Object.values(route.buckets).forEach(validateDescriptor);
}

function validateDescriptor(descriptor) {
  if (!descriptor || typeof descriptor.path !== 'string') {
    throw new Error('Invalid dictionary artifact descriptor.');
  }
  const path = descriptor.path.trim().replace(/\\/g, '/');
  if (!path || path.startsWith('/') || /^[a-z]+:/i.test(path) || path.split('/').includes('..')) {
    throw new Error(`Unsafe dictionary artifact path: ${descriptor.path}`);
  }
  if (!Number.isInteger(descriptor.byteLength) || descriptor.byteLength < 0) {
    throw new Error(`Invalid dictionary artifact size: ${descriptor.path}`);
  }
  if (!HASH_PATTERN.test(descriptor.sha256 || '')) {
    throw new Error(`Invalid dictionary artifact hash: ${descriptor.path}`);
  }
}

function parseJson(bytes, path, decoder) {
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    throw new Error(`Invalid JSON dictionary artifact: ${path}`);
  }
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error('Dictionary artifact loader must return binary data.');
}

function classifyFailure(error) {
  if (error?.name === 'QuotaExceededError') return 'quota-exceeded';
  if (/hash mismatch/i.test(error?.message || '')) return 'integrity-hash';
  if (/size mismatch/i.test(error?.message || '')) return 'integrity-size';
  if (/unsafe.*path/i.test(error?.message || '')) return 'unsafe-path';
  return 'installation-failed';
}
