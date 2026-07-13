export const DICTIONARY_SCHEMA_VERSION = 1;
export const DEFAULT_DICTIONARY_LANGUAGE = 'pt-BR';

export function normalizeDictionaryEntry(entry, options = {}) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new TypeError('Dictionary entry must be an object.');
  }

  const id = cleanText(entry.id);
  const headword = cleanText(entry.headword || entry.word);
  if (!id) throw new TypeError('Dictionary entry requires a stable id.');
  if (!headword) throw new TypeError(`Dictionary entry ${id} requires a headword.`);

  const language = cleanText(options.language || DEFAULT_DICTIONARY_LANGUAGE);
  const meanings = normalizeMeanings(entry.meanings, entry.definition, language);
  const tags = uniqueTexts([
    ...toArray(entry.tags),
    entry.category,
  ]);

  return cleanObject({
    schemaVersion: DICTIONARY_SCHEMA_VERSION,
    id,
    headword,
    readings: uniqueTexts([
      ...toArray(entry.readings),
      entry.reading,
    ]),
    romaji: uniqueTexts([
      ...toArray(entry.romaji),
    ]),
    meanings,
    scripts: uniqueTexts([
      ...toArray(entry.scripts),
      entry.script,
    ]),
    tags,
    level: cleanText(entry.level),
    source: normalizeSource(entry.source, options.sourceId),
  });
}

export function normalizeDictionaryEntries(entries, options = {}) {
  if (!Array.isArray(entries)) {
    throw new TypeError('Dictionary source must provide an array of entries.');
  }

  const normalized = entries.map((entry) => normalizeDictionaryEntry(entry, options));
  const ids = new Set();
  normalized.forEach((entry) => {
    if (ids.has(entry.id)) throw new TypeError(`Duplicate dictionary id: ${entry.id}`);
    ids.add(entry.id);
  });
  return normalized;
}

export function toLegacyDictionaryEntry(entry) {
  const normalized = normalizeDictionaryEntry(entry);
  return cleanObject({
    id: normalized.id,
    word: normalized.headword,
    reading: normalized.readings[0] || '',
    romaji: normalized.romaji[0] || '',
    definition: normalized.meanings.map((meaning) => meaning.text).join('; '),
    script: normalized.scripts[0] || '',
    category: normalized.tags[0] || '',
    level: normalized.level || '',
  });
}

export function normalizeDictionaryQuery(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeMeanings(meanings, legacyDefinition, fallbackLanguage) {
  const source = Array.isArray(meanings) ? meanings : [];
  const normalized = source.map((meaning) => {
    if (typeof meaning === 'string') {
      return { language: fallbackLanguage, text: cleanText(meaning) };
    }
    return {
      language: cleanText(meaning?.language || fallbackLanguage),
      text: cleanText(meaning?.text),
    };
  }).filter((meaning) => meaning.text);

  if (!normalized.length && cleanText(legacyDefinition)) {
    normalized.push({ language: fallbackLanguage, text: cleanText(legacyDefinition) });
  }
  return normalized;
}

function normalizeSource(source, fallbackId) {
  if (typeof source === 'string') return { id: cleanText(source) };
  return cleanObject({
    id: cleanText(source?.id || fallbackId || 'unknown'),
    version: cleanText(source?.version),
    entryId: cleanText(source?.entryId),
  });
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null || value === '' ? [] : [value];
}

function uniqueTexts(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function cleanObject(value) {
  if (Array.isArray(value)) return value.map(cleanObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== '')
      .map(([key, item]) => [key, cleanObject(item)]),
  );
}
