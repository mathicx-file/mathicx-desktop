import { DictionaryProvider } from '../../Applications/japanese-study/js/dictionary/dictionary-provider.js';
import { LegacyDictionarySource } from '../../Applications/japanese-study/js/dictionary/legacy-dictionary-source.js';
import { toLegacyDictionaryEntry } from '../../Applications/japanese-study/js/dictionary/dictionary-schema.js';
import { norm } from '../core/utils.js';

const DEFAULT_LIMIT = 6;

export class LauncherDictionarySearch {
  constructor(options = {}) {
    this.providerEnabled = options.providerEnabled === true;
    this.provider = options.provider || new DictionaryProvider({
      source: options.source || new LegacyDictionarySource(),
    });
    this.loadLegacyWords = options.loadLegacyWords || createLegacyLoader(options);
    this.legacyPromise = null;
    this.providerFailed = false;
    this.fallbackError = null;
    this.cache = new Map();
    this.mode = this.providerEnabled ? 'provider-pending' : 'legacy';
  }

  async search(query, options = {}) {
    const normalizedQuery = norm(query).trim();
    if (normalizedQuery.length < 2) return [];
    const limit = normalizeLimit(options.limit);

    if (this.providerEnabled && !this.providerFailed) {
      try {
        const entries = await this.provider.search(normalizedQuery, { limit });
        const words = entries.map(toLegacyDictionaryEntry);
        this.mode = 'provider';
        this.remember(words);
        return words;
      } catch (error) {
        this.providerFailed = true;
        this.fallbackError = error;
        this.mode = 'legacy-fallback';
      }
    }

    const words = await this.loadLegacyDictionary();
    const matches = words
      .map((word) => ({ word, score: scoreLegacyWord(word, normalizedQuery) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || String(a.word.romaji || '').localeCompare(String(b.word.romaji || '')))
      .slice(0, limit)
      .map((item) => item.word);
    this.remember(matches);
    return matches;
  }

  getByResultId(resultId) {
    const prefix = 'japanese-study:dictionary:';
    const id = String(resultId || '').startsWith(prefix)
      ? String(resultId).slice(prefix.length)
      : String(resultId || '');
    return this.cache.get(id) || null;
  }

  getState() {
    return {
      mode: this.mode,
      providerRequested: this.providerEnabled,
      fallback: this.providerFailed,
      error: this.fallbackError?.message || '',
      cachedResults: this.cache.size,
    };
  }

  async loadLegacyDictionary() {
    if (!this.legacyPromise) {
      this.legacyPromise = Promise.resolve(this.loadLegacyWords())
        .then(normalizeLegacyPayload)
        .catch((error) => {
          this.legacyPromise = null;
          throw error;
        });
    }
    return this.legacyPromise;
  }

  remember(words) {
    words.forEach((word) => {
      if (word?.id) this.cache.set(word.id, word);
    });
  }
}

export function createLauncherDictionarySearch(options = {}) {
  return new LauncherDictionarySearch(options);
}

function createLegacyLoader(options) {
  const url = options.legacyUrl || new URL(
    '../../Applications/japanese-study/data/dictionary.json',
    import.meta.url,
  );
  const fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
  return async () => {
    if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable for launcher dictionary search.');
    const response = await fetchImpl(url);
    if (!response?.ok) throw new Error(`HTTP ${response?.status || 'unknown'}`);
    return response.json();
  };
}

function normalizeLegacyPayload(data) {
  const words = Array.isArray(data?.words) ? data.words : data;
  return Array.isArray(words)
    ? words.filter((word) => word?.id && (word.word || word.romaji || word.definition))
    : [];
}

function scoreLegacyWord(word, query) {
  const fields = {
    word: norm(word.word),
    reading: norm(word.reading),
    romaji: norm(word.romaji),
    definition: norm(word.definition),
    category: norm(word.category),
    script: norm(word.script),
  };

  if (fields.word === query || fields.romaji === query || fields.reading === query) return 100;
  if (fields.word.startsWith(query) || fields.romaji.startsWith(query) || fields.reading.startsWith(query)) return 80;
  if (fields.definition === query) return 70;
  if (fields.definition.startsWith(query)) return 55;
  if (Object.values(fields).some((value) => value.includes(query))) return 35;
  return 0;
}

function normalizeLimit(value) {
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit > 0 ? limit : DEFAULT_LIMIT;
}
