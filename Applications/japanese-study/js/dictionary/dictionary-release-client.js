import { verifyArtifact } from './dictionary-cache-installer.js';

export const JAPANESE_STUDY_VERSION = '2.0.0';

const DEFAULT_DATA_URL = new URL('../../data/dictionary/', import.meta.url);
const DEFAULT_RELEASE_URL = new URL('releases/current.json', DEFAULT_DATA_URL);
const DICTIONARY_VERSION_PATTERN = /^(\d{4})\.(\d{2})\.(\d{2})-(\d+)$/u;
const APP_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/u;

export class DictionaryReleaseClient {
  constructor(options = {}) {
    this.dataUrl = options.dataUrl || DEFAULT_DATA_URL;
    this.releaseUrl = options.releaseUrl || DEFAULT_RELEASE_URL;
    this.appVersion = options.appVersion || JAPANESE_STUDY_VERSION;
    this.fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
    this.crypto = options.crypto || globalThis.crypto;
    this.decoder = options.textDecoder || new TextDecoder();

    parseAppVersion(this.appVersion);
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('Fetch is unavailable for dictionary release checks.');
    }
  }

  async check(options = {}) {
    const release = parseJson(
      await this.fetchBytes(this.releaseUrl, options.signal),
      String(this.releaseUrl),
      this.decoder,
    );
    validateRelease(release);

    if (compareAppVersions(this.appVersion, release.minimumAppVersion) < 0) {
      return createResult('incompatible', release, options.activeVersion, this.appVersion);
    }

    const manifestBytes = await this.fetchBytes(
      new URL(release.manifest.path, this.dataUrl),
      options.signal,
    );
    await verifyArtifact(manifestBytes, release.manifest, this.crypto);
    const manifest = parseJson(manifestBytes, release.manifest.path, this.decoder);
    validateManifestIdentity(manifest, release);

    const comparison = options.activeVersion
      ? compareDictionaryVersions(release.dictionaryVersion, options.activeVersion)
      : 1;
    const status = comparison > 0
      ? 'update-available'
      : comparison < 0 ? 'remote-older' : 'current';
    return { ...createResult(status, release, options.activeVersion, this.appVersion), manifest };
  }

  async fetchBytes(url, signal) {
    const response = await this.fetchImpl(url, {
      signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response?.ok) {
      throw new Error(`Unable to check dictionary release: HTTP ${response?.status || 'unknown'}.`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
}

export function compareAppVersions(left, right) {
  return compareNumericParts(parseAppVersion(left), parseAppVersion(right));
}

export function compareDictionaryVersions(left, right) {
  return compareNumericParts(parseDictionaryVersion(left), parseDictionaryVersion(right));
}

function validateRelease(release) {
  if (release?.format !== 'mathicx-japanese-dictionary-pages-release' || release.schemaVersion !== 1) {
    throw new Error('Unsupported dictionary release descriptor.');
  }
  if (release.channel !== 'stable') throw new Error(`Unsupported dictionary release channel: ${release.channel}.`);
  parseAppVersion(release.minimumAppVersion);
  parseDictionaryVersion(release.dictionaryVersion);
  if (!release.packageId || !release.manifest || !release.artifacts) {
    throw new Error('Dictionary release descriptor is incomplete.');
  }
  if (!Number.isInteger(release.artifacts.distribution) || release.artifacts.distribution < 1) {
    throw new Error('Dictionary release artifact count is invalid.');
  }
}

function validateManifestIdentity(manifest, release) {
  if (manifest?.format !== 'mathicx-japanese-dictionary' || manifest.schemaVersion !== 1) {
    throw new Error('Unsupported dictionary manifest from remote release.');
  }
  if (manifest.dictionaryVersion !== release.dictionaryVersion || manifest.packageId !== release.packageId) {
    throw new Error('Dictionary release and manifest identities differ.');
  }
}

function createResult(status, release, activeVersion, appVersion) {
  return {
    status,
    checkedAt: Date.now(),
    appVersion,
    minimumAppVersion: release.minimumAppVersion,
    activeVersion: String(activeVersion || ''),
    remoteVersion: release.dictionaryVersion,
    channel: release.channel,
    release,
  };
}

function parseAppVersion(value) {
  const match = APP_VERSION_PATTERN.exec(String(value || '').trim());
  if (!match) throw new Error(`Invalid Japanese Study version: ${value}.`);
  return match.slice(1).map(Number);
}

function parseDictionaryVersion(value) {
  const match = DICTIONARY_VERSION_PATTERN.exec(String(value || '').trim());
  if (!match) throw new Error(`Invalid dictionary version: ${value}.`);
  return match.slice(1).map(Number);
}

function compareNumericParts(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

function parseJson(bytes, source, decoder) {
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    throw new Error(`Invalid JSON dictionary release: ${source}.`);
  }
}
