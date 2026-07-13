import { JapaneseDictionary } from '../dictionary.js';
import { DictionaryProvider } from './dictionary-provider.js';
import { LegacyDictionarySource } from './legacy-dictionary-source.js';
import { toLegacyDictionaryEntry } from './dictionary-schema.js';

export class DictionaryRuntime {
  constructor(options = {}) {
    this.providerEnabled = options.providerEnabled === true;
    this.provider = options.provider || new DictionaryProvider({
      source: options.source || new LegacyDictionarySource(),
    });
    this.legacyDictionary = options.legacyDictionary || JapaneseDictionary;
    this.loadLegacyEntries = options.loadLegacyEntries;
    this.mode = 'uninitialized';
    this.fallbackError = null;
    this.metadata = null;
  }

  async init() {
    if (this.mode !== 'uninitialized') return this.getState();

    if (this.providerEnabled) {
      try {
        this.metadata = await this.provider.init();
        if (this.metadata.lazy) {
          await this.loadCompatibilityEntries();
        } else {
          const entries = await this.provider.search('');
          this.legacyDictionary.setData(entries.map(toLegacyDictionaryEntry));
        }
        this.mode = 'provider';
        return this.getState();
      } catch (error) {
        this.fallbackError = error;
      }
    }

    if (typeof this.loadLegacyEntries !== 'function') {
      throw this.fallbackError || new Error('Legacy dictionary loader is unavailable.');
    }
    const entries = await this.loadLegacyEntries();
    this.legacyDictionary.setData(entries);
    this.mode = 'legacy';
    return this.getState();
  }

  async search(query, filters = {}) {
    await this.init();
    if (this.mode === 'provider') {
      try {
        const entries = await this.provider.search(query, {
          script: filters.script,
          category: filters.category,
          limit: filters.limit,
          signal: filters.signal,
        });
        return entries.map(toLegacyDictionaryEntry);
      } catch (error) {
        if (isAbortError(error)) throw error;
        this.fallbackError = error;
      }
    }
    return this.legacyDictionary.search(query, filters);
  }

  async filterByIds(ids, filters = {}) {
    await this.init();
    if (this.mode === 'provider') {
      try {
        const entries = await this.provider.getMany(ids, { signal: filters.signal });
        const providerEntries = new Map(entries
          .filter((entry) => matchesScript(entry.scripts, filters.script))
          .map((entry) => [entry.id, toLegacyDictionaryEntry(entry)]));
        const legacyEntries = new Map(
          this.legacyDictionary.filterByIds(ids, filters).map((entry) => [entry.id, entry]),
        );
        return (Array.isArray(ids) ? ids : [])
          .map((id) => providerEntries.get(String(id)) || legacyEntries.get(String(id)))
          .filter(Boolean);
      } catch (error) {
        if (isAbortError(error)) throw error;
        this.fallbackError = error;
      }
    }
    return this.legacyDictionary.filterByIds(ids, filters);
  }

  getState() {
    return {
      mode: this.mode,
      providerRequested: this.providerEnabled,
      fallback: Boolean(this.fallbackError),
      error: this.fallbackError?.message || '',
      lazy: this.metadata?.lazy === true,
      sourceVersion: this.metadata?.sourceVersion || '',
      metrics: this.provider?.getMetrics?.() || null,
    };
  }

  getMetrics() {
    return this.provider?.getMetrics?.() || null;
  }

  async loadCompatibilityEntries() {
    if (typeof this.loadLegacyEntries !== 'function') return;
    try {
      const entries = await this.loadLegacyEntries();
      this.legacyDictionary.setData(entries);
    } catch (error) {
      console.warn('[dictionary-runtime] legacy compatibility data unavailable', error);
    }
  }
}

export function createDictionaryRuntime(options = {}) {
  return new DictionaryRuntime(options);
}

function matchesScript(scripts, script) {
  return !script || script === 'all' || scripts.includes(script);
}

function isAbortError(error) {
  return error?.name === 'AbortError';
}
