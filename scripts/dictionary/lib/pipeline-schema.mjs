export const PIPELINE_SCHEMA_VERSION = 1;
export const BOOTSTRAP_PACKAGE_ID = 'bootstrap-n5';
export const APPROVED_SOURCE_IDS = Object.freeze([
  'jmdict',
  'kanjidic2',
  'kanjivg',
  'mathicx-ptbr',
]);

const TRANSLATION_STATUSES = new Set(['draft', 'reviewed']);

export function createJmdictEntryId(sequence) {
  const value = cleanText(sequence);
  if (!/^\d+$/.test(value)) throw new TypeError('JMdict sequence must contain only digits.');
  return `jmdict-${value}`;
}

export function createKanjiEntryId(character) {
  const values = [...cleanText(character)];
  if (values.length !== 1) throw new TypeError('Kanji id requires exactly one Unicode character.');
  return `kanjidic2-U+${values[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
}

export function normalizeLexicalEntry(entry) {
  assertRecord(entry, 'Lexical entry');
  const sourceEntryId = cleanText(entry.sourceEntryId || entry.source?.entryId);
  const id = cleanText(entry.id || createJmdictEntryId(sourceEntryId));
  const writtenForms = uniqueTexts(entry.writtenForms);
  const readings = uniqueTexts(entry.readings);
  const senses = toArray(entry.senses).map((sense, index) => normalizeSense(sense, id, index));

  if (!sourceEntryId) throw new TypeError(`Lexical entry ${id || '<unknown>'} requires sourceEntryId.`);
  if (id !== createJmdictEntryId(sourceEntryId)) {
    throw new TypeError(`Lexical entry ${id} does not match its JMdict sequence.`);
  }
  if (!writtenForms.length && !readings.length) {
    throw new TypeError(`Lexical entry ${id} requires a written form or reading.`);
  }
  if (!senses.length) throw new TypeError(`Lexical entry ${id} requires at least one sense.`);

  return compact({
    schemaVersion: PIPELINE_SCHEMA_VERSION,
    id,
    source: normalizeSourceRef(entry.source, 'jmdict', sourceEntryId),
    writtenForms,
    readings,
    common: Boolean(entry.common),
    priorityTags: uniqueTexts(entry.priorityTags),
    tags: uniqueTexts(entry.tags),
    senses,
  });
}

export function normalizeKanjiEntry(entry) {
  assertRecord(entry, 'Kanji entry');
  const literal = cleanText(entry.literal);
  const id = cleanText(entry.id || createKanjiEntryId(literal));
  if (id !== createKanjiEntryId(literal)) {
    throw new TypeError(`Kanji entry ${id} does not match its Unicode literal.`);
  }

  const strokeCount = Number(entry.strokeCount);
  if (!Number.isSafeInteger(strokeCount) || strokeCount <= 0) {
    throw new TypeError(`Kanji entry ${id} requires a positive strokeCount.`);
  }

  return compact({
    schemaVersion: PIPELINE_SCHEMA_VERSION,
    id,
    literal,
    codePoint: id.slice('kanjidic2-'.length),
    source: normalizeSourceRef(entry.source, 'kanjidic2', literal),
    strokeCount,
    grade: optionalPositiveInteger(entry.grade, 'grade', id),
    frequency: optionalPositiveInteger(entry.frequency, 'frequency', id),
    readings: {
      on: uniqueTexts(entry.readings?.on),
      kun: uniqueTexts(entry.readings?.kun),
      nanori: uniqueTexts(entry.readings?.nanori),
    },
    meanings: {
      en: uniqueTexts(entry.meanings?.en),
    },
    tags: uniqueTexts(entry.tags),
  });
}

export function normalizeTranslation(translation) {
  assertRecord(translation, 'Translation');
  const entryId = cleanText(translation.entryId);
  const senseId = cleanText(translation.senseId);
  const status = cleanText(translation.status || 'draft');
  if (!entryId || !senseId) throw new TypeError('Translation requires entryId and senseId.');
  if (cleanText(translation.language) !== 'pt-BR') {
    throw new TypeError(`Translation ${entryId}/${senseId} must use pt-BR.`);
  }
  if (!TRANSLATION_STATUSES.has(status)) {
    throw new TypeError(`Translation ${entryId}/${senseId} has an invalid review status.`);
  }
  const glosses = uniqueTexts(translation.glosses);
  if (!glosses.length) throw new TypeError(`Translation ${entryId}/${senseId} requires glosses.`);

  return compact({
    schemaVersion: PIPELINE_SCHEMA_VERSION,
    id: cleanText(translation.id || `mathicx-ptbr:${entryId}:${senseId}`),
    entryId,
    senseId,
    language: 'pt-BR',
    glosses,
    status,
    source: normalizeSourceRef(translation.source, 'mathicx-ptbr', senseId),
    reviewedAt: cleanText(translation.reviewedAt),
  });
}

export function normalizeStrokeAsset(asset) {
  assertRecord(asset, 'Stroke asset');
  const literal = cleanText(asset.literal);
  const codePoint = createKanjiEntryId(literal).slice('kanjidic2-'.length);
  const path = cleanText(asset.path);
  if (!path.endsWith('.svg')) throw new TypeError(`Stroke asset ${literal} requires an SVG path.`);
  const sha256 = cleanText(asset.sha256).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new TypeError(`Stroke asset ${literal} requires a SHA-256 hash.`);
  return {
    schemaVersion: PIPELINE_SCHEMA_VERSION,
    id: cleanText(asset.id || `kanjivg-${codePoint}`),
    literal,
    codePoint,
    path,
    sha256,
    source: normalizeSourceRef(asset.source, 'kanjivg', codePoint),
  };
}

export function normalizeKanjiTranslation(translation) {
  assertRecord(translation, 'Kanji translation');
  const entryId = cleanText(translation.entryId);
  const status = cleanText(translation.status || 'draft');
  if (!entryId) throw new TypeError('Kanji translation requires entryId.');
  if (cleanText(translation.language) !== 'pt-BR') {
    throw new TypeError(`Kanji translation ${entryId} must use pt-BR.`);
  }
  if (!TRANSLATION_STATUSES.has(status)) {
    throw new TypeError(`Kanji translation ${entryId} has an invalid review status.`);
  }
  const meanings = uniqueTexts(translation.meanings);
  if (!meanings.length) throw new TypeError(`Kanji translation ${entryId} requires meanings.`);
  return compact({
    schemaVersion: PIPELINE_SCHEMA_VERSION,
    id: cleanText(translation.id || `mathicx-ptbr:${entryId}`),
    entryId,
    language: 'pt-BR',
    meanings,
    status,
    source: normalizeSourceRef(translation.source, 'mathicx-ptbr', entryId),
    reviewedAt: cleanText(translation.reviewedAt),
  });
}

export function normalizeBootstrapPackage(payload, options = {}) {
  assertRecord(payload, 'Dictionary package');
  const result = {
    schemaVersion: PIPELINE_SCHEMA_VERSION,
    id: cleanText(payload.id),
    version: cleanText(payload.version),
    sources: toArray(payload.sources).map(normalizePackageSource),
    entries: toArray(payload.entries).map(normalizeLexicalEntry),
    kanji: toArray(payload.kanji).map(normalizeKanjiEntry),
    translations: toArray(payload.translations).map(normalizeTranslation),
    kanjiTranslations: toArray(payload.kanjiTranslations).map(normalizeKanjiTranslation),
    strokeAssets: toArray(payload.strokeAssets).map(normalizeStrokeAsset),
  };

  if (![BOOTSTRAP_PACKAGE_ID, 'core-common', 'full-jmdict-kanjidic2'].includes(result.id)) {
    throw new TypeError(`Unsupported dictionary package id: ${result.id}.`);
  }
  if (!result.version) throw new TypeError('Dictionary package requires a version.');
  assertUniqueIds(result.sources, 'source');
  assertUniqueIds(result.entries, 'lexical entry');
  assertUniqueIds(result.kanji, 'kanji entry');
  assertUniqueIds(result.translations, 'translation');
  assertUniqueIds(result.kanjiTranslations, 'kanji translation');
  assertUniqueIds(result.strokeAssets, 'stroke asset');
  validateReferences(result);

  if (options.requireReviewedTranslations) {
    const draft = result.translations.find((translation) => translation.status !== 'reviewed');
    if (draft) throw new TypeError(`Translation ${draft.id} is not reviewed.`);
    const kanjiDraft = result.kanjiTranslations.find((translation) => translation.status !== 'reviewed');
    if (kanjiDraft) throw new TypeError(`Kanji translation ${kanjiDraft.id} is not reviewed.`);
  }
  return result;
}

function normalizeSense(sense, entryId, index) {
  assertRecord(sense, `Sense ${index + 1}`);
  const id = cleanText(sense.id || `${entryId}:sense:${index + 1}`);
  const englishGlosses = uniqueTexts(sense.glosses?.en || sense.englishGlosses);
  if (!englishGlosses.length) throw new TypeError(`Sense ${id} requires an English gloss.`);
  return compact({
    id,
    partOfSpeech: uniqueTexts(sense.partOfSpeech),
    fields: uniqueTexts(sense.fields),
    misc: uniqueTexts(sense.misc),
    restrictions: {
      writtenForms: uniqueTexts(sense.restrictions?.writtenForms),
      readings: uniqueTexts(sense.restrictions?.readings),
    },
    glosses: { en: englishGlosses },
  });
}

function normalizeSourceRef(source, fallbackId, fallbackEntryId) {
  const value = typeof source === 'string' ? { id: source } : (source || {});
  const id = cleanText(value.id || fallbackId);
  if (!APPROVED_SOURCE_IDS.includes(id)) throw new TypeError(`Unapproved dictionary source: ${id}`);
  return compact({
    id,
    version: cleanText(value.version),
    entryId: cleanText(value.entryId || fallbackEntryId),
  });
}

function normalizePackageSource(source) {
  assertRecord(source, 'Package source');
  const id = cleanText(source.id);
  if (!APPROVED_SOURCE_IDS.includes(id)) throw new TypeError(`Unapproved dictionary source: ${id}`);
  const version = cleanText(source.version);
  const sha256 = cleanText(source.sha256).toLowerCase();
  if (!version) throw new TypeError(`Package source ${id} requires a version.`);
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new TypeError(`Package source ${id} requires a SHA-256 hash.`);
  return { id, version, sha256 };
}

function validateReferences(payload) {
  const sourceIds = new Set(payload.sources.map((source) => source.id));
  const entries = new Map(payload.entries.map((entry) => [entry.id, entry]));
  const kanjiIds = new Set(payload.kanji.map((entry) => entry.id));
  const sourcedRecords = [
    ...payload.entries,
    ...payload.kanji,
    ...payload.translations,
    ...payload.kanjiTranslations,
    ...payload.strokeAssets,
  ];
  for (const record of sourcedRecords) {
    if (!sourceIds.has(record.source.id)) {
      throw new TypeError(`${record.id} references a source missing from package metadata.`);
    }
  }
  for (const translation of payload.translations) {
    const entry = entries.get(translation.entryId);
    if (!entry) throw new TypeError(`Translation ${translation.id} references a missing entry.`);
    if (!entry.senses.some((sense) => sense.id === translation.senseId)) {
      throw new TypeError(`Translation ${translation.id} references a missing sense.`);
    }
  }
  for (const translation of payload.kanjiTranslations) {
    if (!kanjiIds.has(translation.entryId)) {
      throw new TypeError(`Kanji translation ${translation.id} references a missing kanji entry.`);
    }
  }
  for (const asset of payload.strokeAssets) {
    if (!kanjiIds.has(`kanjidic2-${asset.codePoint}`)) {
      throw new TypeError(`Stroke asset ${asset.id} references a missing kanji entry.`);
    }
  }
}

function assertUniqueIds(values, label) {
  const ids = new Set();
  for (const value of values) {
    if (ids.has(value.id)) throw new TypeError(`Duplicate ${label} id: ${value.id}`);
    ids.add(value.id);
  }
}

function optionalPositiveInteger(value, field, id) {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new TypeError(`Kanji entry ${id} has an invalid ${field}.`);
  }
  return number;
}

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueTexts(value) {
  return [...new Set(toArray(value).map(cleanText).filter(Boolean))];
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function compact(value) {
  if (Array.isArray(value)) return value.map(compact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== '')
      .map(([key, item]) => [key, compact(item)]),
  );
}
