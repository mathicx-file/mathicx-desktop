import { DictionaryCacheInstaller } from './dictionary-cache-installer.js';
import { DictionaryReleaseClient } from './dictionary-release-client.js';

const DEFAULT_DATA_URL = new URL('../../data/dictionary/', import.meta.url);

export class DictionaryUpdateManager {
  constructor(options = {}) {
    if (!options.repository) throw new Error('Dictionary update repository is required.');
    this.repository = options.repository;
    this.dataUrl = options.dataUrl || DEFAULT_DATA_URL;
    this.fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
    this.storageManager = options.storageManager || null;
    this.releaseClient = options.releaseClient || new DictionaryReleaseClient({
      dataUrl: this.dataUrl,
      fetchImpl: this.fetchImpl,
    });
    this.installer = options.installer || new DictionaryCacheInstaller({
      repository: this.repository,
      loadArtifact: (path) => this.loadArtifact(path),
    });
  }

  async check(activeVersion, options = {}) {
    const release = await this.releaseClient.check({ activeVersion, signal: options.signal });
    const cacheState = await this.repository.getCacheState();
    const candidateState = release.remoteVersion
      ? await this.repository.getVersionState(release.remoteVersion)
      : null;
    return { ...release, cacheState, candidateState };
  }

  async downloadCandidate(releaseCheck, options = {}) {
    if (!releaseCheck?.manifest || !['update-available', 'current', 'ready'].includes(releaseCheck.status)) {
      throw new Error('A compatible dictionary release must be checked before download.');
    }
    const estimatedBytes = Number(releaseCheck.release?.artifacts?.byteLength || 0);
    if (estimatedBytes > 0) {
      await this.storageManager?.assertCapacity(estimatedBytes, {
        version: releaseCheck.remoteVersion || releaseCheck.manifest.dictionaryVersion,
      });
    }
    return this.installer.downloadCandidate(releaseCheck.manifest, options);
  }

  async prepareOffline(releaseCheck, options = {}) {
    const candidate = await this.downloadCandidate(releaseCheck, {
      ...options,
      revalidate: true,
    });
    const promoted = await this.installer.promoteCandidate(candidate.version, candidate);
    const cleanup = await this.repository.cleanupUnprotectedVersions();
    return { ...promoted, cleanup };
  }

  async activateCandidate(version) {
    const promoted = await this.installer.promoteCandidate(version);
    const cleanup = await this.repository.cleanupUnprotectedVersions();
    return { ...promoted, cleanup };
  }

  rollback() {
    return this.installer.rollback();
  }

  getCacheState() {
    return this.repository.getCacheState();
  }

  async loadArtifact(path) {
    const response = await this.fetchImpl(new URL(path, this.dataUrl), { cache: 'no-cache' });
    if (!response?.ok) {
      throw new Error(`Unable to download dictionary artifact: HTTP ${response?.status || 'unknown'}.`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
}
