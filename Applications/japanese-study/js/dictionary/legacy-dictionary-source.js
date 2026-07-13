const DEFAULT_DICTIONARY_URL = new URL('../../data/dictionary.json', import.meta.url);

export class LegacyDictionarySource {
  constructor(options = {}) {
    this.id = options.id || 'legacy-local-json';
    this.url = options.url || DEFAULT_DICTIONARY_URL;
    this.fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
  }

  async load() {
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('Fetch is unavailable for the legacy dictionary source.');
    }

    const response = await this.fetchImpl(this.url);
    if (!response?.ok) {
      throw new Error(`Unable to load legacy dictionary: HTTP ${response?.status || 'unknown'}.`);
    }

    const payload = await response.json();
    const entries = payload?.words || payload;
    if (!Array.isArray(entries)) {
      throw new TypeError('Legacy dictionary payload must contain an array of entries.');
    }

    return {
      entries,
      metadata: {
        sourceId: this.id,
        format: 'legacy-json',
        version: String(payload?.version || 'unversioned'),
        url: String(this.url),
      },
    };
  }
}

export function createLegacyDictionarySource(options = {}) {
  return new LegacyDictionarySource(options);
}
