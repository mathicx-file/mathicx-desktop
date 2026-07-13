import {
  DICTIONARY_SCHEMA_VERSION,
  normalizeDictionaryEntries,
  normalizeDictionaryQuery,
} from './dictionary-schema.js';

export class DictionaryProvider {
  constructor({ source } = {}) {
    if (!source || typeof source.load !== 'function') {
      throw new TypeError('DictionaryProvider requires a source with load().');
    }
    this.source = source;
    this.entries = [];
    this.entriesById = new Map();
    this.metadata = null;
    this.initPromise = null;
  }

  async init() {
    if (!this.initPromise) this.initPromise = this.loadSource();
    return this.initPromise;
  }

  async loadSource() {
    const result = await this.source.load();
    const rawEntries = Array.isArray(result) ? result : result?.entries;
    const sourceMetadata = Array.isArray(result) ? {} : (result?.metadata || {});
    const sourceId = sourceMetadata.sourceId || this.source.id || 'unknown';

    this.entries = normalizeDictionaryEntries(rawEntries, { sourceId });
    this.entriesById = new Map(this.entries.map((entry) => [entry.id, entry]));
    this.metadata = Object.freeze({
      schemaVersion: DICTIONARY_SCHEMA_VERSION,
      sourceId,
      sourceVersion: sourceMetadata.version || 'unversioned',
      sourceFormat: sourceMetadata.format || 'unknown',
      count: Number.isSafeInteger(sourceMetadata.count) ? sourceMetadata.count : this.entries.length,
      lazy: sourceMetadata.lazy === true,
    });
    return this.getMetadata();
  }

  async search(query, options = {}) {
    await this.init();
    if (typeof this.source.search === 'function') {
      const entries = normalizeDictionaryEntries(await this.source.search(query, options), {
        sourceId: this.metadata.sourceId,
      });
      return filterDelegatedEntries(entries, options).slice(0, normalizeLimit(options.limit));
    }
    const normalizedQuery = normalizeDictionaryQuery(query);
    const script = normalizeFilter(options.script);
    const tag = normalizeFilter(options.tag || options.category);
    const limit = normalizeLimit(options.limit);

    return this.entries
      .map((entry) => ({ entry, score: scoreEntry(entry, normalizedQuery, { script, tag }) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.entry.headword.localeCompare(b.entry.headword))
      .slice(0, limit)
      .map((item) => item.entry);
  }

  async getById(id, options = {}) {
    await this.init();
    if (typeof this.source.getById === 'function') {
      const entry = await this.source.getById(String(id || ''), options);
      return entry ? normalizeDictionaryEntries([entry], { sourceId: this.metadata.sourceId })[0] : null;
    }
    return this.entriesById.get(String(id || '')) || null;
  }

  async getMany(ids, options = {}) {
    await this.init();
    if (typeof this.source.getMany === 'function') {
      return normalizeDictionaryEntries(await this.source.getMany(ids, options), {
        sourceId: this.metadata.sourceId,
      });
    }
    return (Array.isArray(ids) ? ids : [])
      .map((id) => this.entriesById.get(String(id || '')))
      .filter(Boolean);
  }

  async getMetadata() {
    if (!this.metadata) await this.init();
    return { ...this.metadata };
  }

  getMetrics() {
    return typeof this.source.getMetrics === 'function' ? this.source.getMetrics() : null;
  }
}

function filterDelegatedEntries(entries, options) {
  const script = normalizeFilter(options.script);
  const tag = normalizeFilter(options.tag || options.category);
  return entries.filter((entry) => {
    if (script && !entry.scripts.some((value) => normalizeDictionaryQuery(value) === script)) return false;
    if (tag && !entry.tags.some((value) => normalizeDictionaryQuery(value) === tag)) return false;
    return true;
  });
}

export function createDictionaryProvider(source) {
  return new DictionaryProvider({ source });
}

function scoreEntry(entry, query, filters) {
  if (filters.script && !entry.scripts.some((value) => normalizeDictionaryQuery(value) === filters.script)) {
    return 0;
  }
  if (filters.tag && !entry.tags.some((value) => normalizeDictionaryQuery(value) === filters.tag)) {
    return 0;
  }
  if (!query) return 1;

  const groups = [
    { values: [entry.headword], exact: 120, prefix: 100, includes: 80 },
    { values: entry.readings, exact: 110, prefix: 90, includes: 70 },
    { values: entry.romaji, exact: 105, prefix: 85, includes: 65 },
    { values: entry.meanings.map((meaning) => meaning.text), exact: 95, prefix: 75, includes: 55 },
    { values: entry.tags, exact: 45, prefix: 35, includes: 25 },
  ];

  return groups.reduce((best, group) => {
    const score = group.values.reduce((valueBest, value) => {
      const normalized = normalizeDictionaryQuery(value);
      if (normalized === query) return Math.max(valueBest, group.exact);
      if (normalized.startsWith(query)) return Math.max(valueBest, group.prefix);
      if (normalized.includes(query)) return Math.max(valueBest, group.includes);
      return valueBest;
    }, 0);
    return Math.max(best, score);
  }, 0);
}

function normalizeLimit(value) {
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit > 0 ? limit : Number.MAX_SAFE_INTEGER;
}

function normalizeFilter(value) {
  const normalized = normalizeDictionaryQuery(value);
  return normalized === 'all' || normalized === 'todas' ? '' : normalized;
}
