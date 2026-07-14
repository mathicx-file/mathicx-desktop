import { gzipSync } from 'node:zlib';

import { normalizeBootstrapPackage } from './pipeline-schema.mjs';
import { romanizeReading } from './search-indexes.mjs';

export const BROWSE_PAGE_SCHEMA_VERSION = 1;
export const BROWSE_PAGE_KIND = 'dictionary-browse-page';
export const BROWSE_ROUTE_KIND = 'dictionary-browse-routes';
export const BROWSE_SCRIPTS = Object.freeze(['all', 'hiragana', 'katakana', 'kanji']);

export function createBrowsePages(packageData, config) {
  const normalizedConfig = validateBrowseConfig(config);
  const normalizedPackage = normalizeBootstrapPackage(packageData, { requireReviewedTranslations: true });
  const translations = groupBy(normalizedPackage.translations, (item) => item.entryId);
  const rows = normalizedPackage.entries
    .map((entry) => createBrowseRow(entry, translations.get(entry.id) || []))
    .sort(compareBrowseRows);
  const width = Math.max(4, String(Math.max(0, Math.ceil(rows.length / normalizedConfig.pageSize) - 1)).length);
  const pages = [];
  for (let offset = 0; offset < rows.length; offset += normalizedConfig.pageSize) {
    const pageRows = rows.slice(offset, offset + normalizedConfig.pageSize);
    pages.push({
      schemaVersion: BROWSE_PAGE_SCHEMA_VERSION,
      kind: BROWSE_PAGE_KIND,
      packageId: normalizedPackage.id,
      dictionaryVersion: normalizedPackage.version,
      order: normalizedConfig.strategy,
      pageId: String(pages.length).padStart(width, '0'),
      rows: pageRows,
      counts: countScripts(pageRows),
    });
  }
  return validateBrowsePages(packageData, pages, normalizedConfig);
}

export function validateBrowsePages(packageData, pages, config) {
  const normalizedConfig = validateBrowseConfig(config);
  const normalizedPackage = normalizeBootstrapPackage(packageData, { requireReviewedTranslations: true });
  if (!Array.isArray(pages) || (!pages.length && normalizedPackage.entries.length)) {
    throw new TypeError('Dictionary browse pages must cover every entry.');
  }
  const rows = [];
  const metrics = [];
  const pageIds = new Set();
  for (const page of pages) {
    validatePageHeader(page, normalizedPackage, normalizedConfig);
    if (pageIds.has(page.pageId)) throw new TypeError(`Duplicate dictionary browse page: ${page.pageId}.`);
    pageIds.add(page.pageId);
    if (!page.rows.length || page.rows.length > normalizedConfig.pageSize) {
      throw new TypeError(`Dictionary browse page has an invalid size: ${page.pageId}.`);
    }
    page.rows.forEach(validateBrowseRow);
    if (!sameJson(page.rows, [...page.rows].sort(compareBrowseRows))) {
      throw new TypeError(`Dictionary browse page is not sorted: ${page.pageId}.`);
    }
    if (!sameJson(page.counts, countScripts(page.rows))) {
      throw new TypeError(`Dictionary browse page counts are inconsistent: ${page.pageId}.`);
    }
    rows.push(...page.rows);
    const bytes = Buffer.from(`${JSON.stringify(page, null, 2)}\n`, 'utf8');
    metrics.push({
      pageId: page.pageId,
      entries: page.rows.length,
      rawBytes: bytes.byteLength,
      compressedBytes: gzipSync(bytes, { level: 9, mtime: 0 }).byteLength,
      counts: page.counts,
    });
  }
  if (!sameJson(rows, [...rows].sort(compareBrowseRows))) {
    throw new TypeError('Dictionary browse pages are not globally sorted.');
  }
  const ids = rows.map((row) => row[0]);
  if (new Set(ids).size !== ids.length || ids.length !== normalizedPackage.entries.length) {
    throw new TypeError('Dictionary browse pages contain duplicate or missing entries.');
  }
  const expectedIds = new Set(normalizedPackage.entries.map((entry) => entry.id));
  if (ids.some((id) => !expectedIds.has(id))) {
    throw new TypeError('Dictionary browse pages contain an unknown entry.');
  }
  return {
    pages,
    report: {
      schemaVersion: BROWSE_PAGE_SCHEMA_VERSION,
      kind: 'dictionary-browse-pages-report',
      packageId: normalizedPackage.id,
      dictionaryVersion: normalizedPackage.version,
      strategy: normalizedConfig.strategy,
      pageSize: normalizedConfig.pageSize,
      coverage: countScripts(rows),
      pages: metrics,
      compressedBytes: sum(metrics.map((item) => item.compressedBytes)),
    },
  };
}

export function createBrowseRoute(packageData, pageArtifacts, config) {
  const normalizedConfig = validateBrowseConfig(config);
  const normalizedPackage = normalizeBootstrapPackage(packageData, { requireReviewedTranslations: true });
  const items = [...pageArtifacts].sort((left, right) => left.payload.pageId.localeCompare(right.payload.pageId));
  validateBrowsePages(packageData, items.map((item) => item.payload), normalizedConfig);
  return {
    schemaVersion: BROWSE_PAGE_SCHEMA_VERSION,
    kind: BROWSE_ROUTE_KIND,
    packageId: normalizedPackage.id,
    dictionaryVersion: normalizedPackage.version,
    order: normalizedConfig.strategy,
    pageSize: normalizedConfig.pageSize,
    coverage: countScripts(items.flatMap((item) => item.payload.rows)),
    pages: Object.fromEntries(items.map((item) => [item.payload.pageId, {
      artifact: item.descriptor,
      counts: item.payload.counts,
    }])),
  };
}

export function validateBrowseConfig(config) {
  if (!config || config.schemaVersion !== BROWSE_PAGE_SCHEMA_VERSION
    || config.strategy !== 'romaji-asc-pages' || config.definitionMode !== 'first-gloss') {
    throw new TypeError('Unsupported dictionary browse page config.');
  }
  const pageSize = Number(config.pageSize);
  if (!Number.isSafeInteger(pageSize) || pageSize < 100 || pageSize > 5000) {
    throw new TypeError('Dictionary browse pageSize must be between 100 and 5000.');
  }
  return {
    schemaVersion: BROWSE_PAGE_SCHEMA_VERSION,
    strategy: config.strategy,
    pageSize,
    definitionMode: config.definitionMode,
  };
}

function createBrowseRow(entry, entryTranslations) {
  const translationsBySense = groupBy(entryTranslations, (item) => item.senseId);
  let definition = '';
  for (const sense of entry.senses || []) {
    const reviewed = (translationsBySense.get(sense.id) || []).filter((item) => item.status === 'reviewed');
    definition = reviewed.flatMap((item) => item.glosses || []).find(Boolean)
      || (sense.glosses?.en || []).find(Boolean)
      || '';
    if (definition) break;
  }
  const headword = entry.writtenForms?.[0] || entry.readings?.[0] || '';
  const reading = entry.readings?.[0] || '';
  const tags = [...new Set([...(entry.tags || []), ...(entry.senses?.[0]?.partOfSpeech || [])])];
  return [entry.id, headword, reading, romanizeReading(reading), definition, detectScript(headword || reading), tags[0] || ''];
}

function validatePageHeader(page, packageData, config) {
  if (!page || page.schemaVersion !== BROWSE_PAGE_SCHEMA_VERSION || page.kind !== BROWSE_PAGE_KIND
    || page.packageId !== packageData.id || page.dictionaryVersion !== packageData.version
    || page.order !== config.strategy || !/^\d{4,}$/u.test(String(page.pageId || ''))
    || !Array.isArray(page.rows)) {
    throw new TypeError('Invalid dictionary browse page header.');
  }
}

function validateBrowseRow(row) {
  if (!Array.isArray(row) || row.length !== 7 || row.some((value) => typeof value !== 'string')
    || !row[0] || !row[1] || !row[2] || !row[3] || !BROWSE_SCRIPTS.slice(1).includes(row[5])) {
    throw new TypeError(`Invalid dictionary browse row: ${row?.[0] || '<unknown>'}.`);
  }
}

function compareBrowseRows(left, right) {
  return compareText(left[3], right[3]) || compareText(left[2], right[2])
    || compareText(left[1], right[1]) || compareText(left[0], right[0]);
}

function detectScript(value = '') {
  if (/[\u3400-\u9fff\uf900-\ufaff]/u.test(value)) return 'kanji';
  if (/[\u30a0-\u30ff]/u.test(value)) return 'katakana';
  return 'hiragana';
}

function countScripts(rows) {
  const counts = { all: rows.length, hiragana: 0, katakana: 0, kanji: 0 };
  rows.forEach((row) => { counts[row[5]] += 1; });
  return counts;
}

function compareText(left, right) {
  return left === right ? 0 : left < right ? -1 : 1;
}

function groupBy(values, keyFor) {
  const result = new Map();
  for (const value of values) {
    const key = keyFor(value);
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(value);
  }
  return result;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}
