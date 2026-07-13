import { LazyDictionarySource } from './lazy-dictionary-source.js?v=15.7';

const PACKAGE_FORMAT = 'mathicx-japanese-dictionary-offline-package';

export class InstalledDictionaryPackagesSource {
  constructor(options = {}) {
    if (!options.repository) throw new Error('Installed package source requires a repository.');
    this.repository = options.repository;
    this.crypto = options.crypto || globalThis.crypto;
    this.DecompressionStreamClass = options.DecompressionStreamClass || globalThis.DecompressionStream;
    this.sources = [];
    this.signature = '';
  }

  async load() {
    await this.refresh();
    return { entries: [], metadata: { sourceId: 'installed-packages', lazy: true, count: 0 } };
  }

  async refresh() {
    const states = (await this.repository.getPackageStates())
      .filter((state) => state.status === 'ready' && state.manifest)
      .sort((left, right) => left.packageId.localeCompare(right.packageId));
    const signature = states.map((state) => `${state.version}:${state.packageId}:${state.updatedAt || 0}`).join('|');
    if (signature === this.signature) return this.sources;

    const sources = [];
    for (const state of states) {
      try {
        const manifest = validateInstalledManifest(state.manifest, state);
        const source = new LazyDictionarySource({
          id: `installed-${state.packageId}`,
          repository: this.repository,
          crypto: this.crypto,
          manifest: toRuntimeManifest(manifest),
          decodeArtifact: (bytes, descriptor) => this.decodeArtifact(bytes, descriptor),
          fetchImpl: async () => { throw new Error(`Installed package artifact is missing: ${state.packageId}`); },
        });
        source.installedPackageId = state.packageId;
        await source.load();
        sources.push(source);
      } catch (error) {
        console.warn(`[dictionary-packages] unable to open ${state.packageId}`, error);
      }
    }
    this.sources = sources;
    this.signature = signature;
    return sources;
  }

  async search(query, options = {}) {
    await this.refresh();
    if (isShortLatinQuery(query)) return [];
    const sources = options.packageId
      ? this.sources.filter((source) => source.installedPackageId === options.packageId)
      : this.sources;
    const groups = await Promise.all(sources.map(async (source) => {
      try {
        return await source.search(query, options);
      } catch (error) {
        console.warn('[dictionary-packages] installed package search failed', error);
        return [];
      }
    }));
    return dedupeEntries(groups.flat());
  }

  async browse(packageId, options = {}) {
    await this.refresh();
    const source = this.sources.find((item) => item.installedPackageId === packageId);
    if (!source) throw new Error(`Dictionary package is not installed: ${packageId}`);
    return source.browse(options);
  }

  async getMany(ids, options = {}) {
    await this.refresh();
    const requested = [...new Set((ids || []).map(String))];
    const found = new Map();
    for (const source of this.sources) {
      const missing = requested.filter((id) => !found.has(id));
      if (!missing.length) break;
      try {
        (await source.getMany(missing, options)).forEach((entry) => found.set(entry.id, entry));
      } catch (error) {
        console.warn('[dictionary-packages] installed package lookup failed', error);
      }
    }
    return requested.map((id) => found.get(id)).filter(Boolean);
  }

  async decodeArtifact(bytes, descriptor) {
    if (!descriptor.encoding) return bytes;
    if (descriptor.encoding !== 'gzip' || typeof this.DecompressionStreamClass !== 'function') {
      throw new Error(`Unsupported dictionary artifact encoding: ${descriptor.encoding}`);
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new this.DecompressionStreamClass('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
}

export class LayeredDictionarySource {
  constructor(options = {}) {
    if (!options.baseSource || !options.installedSource) {
      throw new Error('Layered dictionary source requires base and installed sources.');
    }
    this.baseSource = options.baseSource;
    this.installedSource = options.installedSource;
  }

  async load() {
    const base = await this.baseSource.load();
    await this.installedSource.load();
    return base;
  }

  async search(query, options = {}) {
    if (options.packageId === 'essential') return this.baseSource.search(query, options);
    if (options.packageId) return this.installedSource.search(query, options);
    const [base, installed] = await Promise.all([
      this.baseSource.search(query, options),
      this.installedSource.search(query, options),
    ]);
    return dedupeEntries([...base, ...installed]).slice(0, normalizeLimit(options.limit));
  }

  browse(options = {}) {
    const packageId = options.packageId || 'essential';
    return packageId === 'essential'
      ? this.baseSource.browse(options)
      : this.installedSource.browse(packageId, options);
  }

  async getById(id, options = {}) {
    const [entry] = await this.getMany([id], options);
    return entry || null;
  }

  async getMany(ids, options = {}) {
    const requested = [...new Set((ids || []).map(String))];
    const base = await this.baseSource.getMany(requested, options);
    const found = new Map(base.map((entry) => [entry.id, entry]));
    const missing = requested.filter((id) => !found.has(id));
    if (missing.length) {
      (await this.installedSource.getMany(missing, options)).forEach((entry) => found.set(entry.id, entry));
    }
    return requested.map((id) => found.get(id)).filter(Boolean);
  }

  getMetrics() {
    return this.baseSource.getMetrics?.() || null;
  }
}

function validateInstalledManifest(manifest, state) {
  if (manifest?.format !== PACKAGE_FORMAT || manifest.schemaVersion !== 1
    || manifest.id !== state.packageId || manifest.dictionaryVersion !== state.version
    || !manifest.routes?.entries || !manifest.routes?.indexes) {
    throw new Error(`Installed dictionary package manifest is invalid: ${state.packageId}`);
  }
  return manifest;
}

function toRuntimeManifest(manifest) {
  return {
    format: 'mathicx-japanese-dictionary',
    schemaVersion: 1,
    packageId: manifest.packageId,
    dictionaryVersion: manifest.dictionaryVersion,
    defaultPack: manifest.routes.entries,
    routes: manifest.routes,
  };
}

function dedupeEntries(entries) {
  return [...new Map(entries.map((entry) => [entry.id, entry])).values()];
}

function isShortLatinQuery(value) {
  return /^[a-z0-9]$/iu.test(String(value || '').trim().normalize('NFKD'));
}

function normalizeLimit(value) {
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit > 0 ? limit : Number.MAX_SAFE_INTEGER;
}
