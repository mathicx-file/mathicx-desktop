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
  }

  async init() {
    if (this.mode !== 'uninitialized') return this.getState();

    if (this.providerEnabled) {
      try {
        await this.provider.init();
        const entries = await this.provider.search('');
        this.legacyDictionary.setData(entries.map(toLegacyDictionaryEntry));
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
      const entries = await this.provider.search(query, {
        script: filters.script,
        category: filters.category,
      });
      return entries.map(toLegacyDictionaryEntry);
    }
    return this.legacyDictionary.search(query, filters);
  }

  async filterByIds(ids, filters = {}) {
    await this.init();
    if (this.mode === 'provider') {
      const entries = await this.provider.getMany(ids);
      return entries
        .filter((entry) => (
          !filters.script
          || filters.script === 'all'
          || entry.scripts.includes(filters.script)
        ))
        .map(toLegacyDictionaryEntry);
    }
    return this.legacyDictionary.filterByIds(ids, filters);
  }

  getState() {
    return {
      mode: this.mode,
      providerRequested: this.providerEnabled,
      fallback: Boolean(this.fallbackError),
      error: this.fallbackError?.message || '',
    };
  }
}

export function createDictionaryRuntime(options = {}) {
  return new DictionaryRuntime(options);
}
