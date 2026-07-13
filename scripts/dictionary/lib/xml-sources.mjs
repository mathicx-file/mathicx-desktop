import { XMLParser, XMLValidator } from 'fast-xml-parser';

import {
  normalizeKanjiEntry,
  normalizeLexicalEntry,
} from './pipeline-schema.mjs';

const ARRAY_PATHS = new Set([
  'JMdict.entry',
  'JMdict.entry.k_ele',
  'JMdict.entry.k_ele.ke_inf',
  'JMdict.entry.k_ele.ke_pri',
  'JMdict.entry.r_ele',
  'JMdict.entry.r_ele.re_restr',
  'JMdict.entry.r_ele.re_inf',
  'JMdict.entry.r_ele.re_pri',
  'JMdict.entry.sense',
  'JMdict.entry.sense.stagk',
  'JMdict.entry.sense.stagr',
  'JMdict.entry.sense.pos',
  'JMdict.entry.sense.field',
  'JMdict.entry.sense.misc',
  'JMdict.entry.sense.dial',
  'JMdict.entry.sense.gloss',
  'kanjidic2.character',
  'kanjidic2.character.misc.stroke_count',
  'kanjidic2.character.misc.rad_name',
  'kanjidic2.character.reading_meaning.rmgroup',
  'kanjidic2.character.reading_meaning.rmgroup.reading',
  'kanjidic2.character.reading_meaning.rmgroup.meaning',
  'kanjidic2.character.reading_meaning.nanori',
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  processEntities: {
    enabled: true,
    maxEntitySize: 4096,
    maxExpansionDepth: 16,
    maxTotalExpansions: 1_000_000,
    maxExpandedLength: 50_000_000,
    maxEntityCount: 1000,
    appliesTo: 'external',
  },
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (_name, jPath) => ARRAY_PATHS.has(jPath),
});

export function parseJmdictXml(xml, source) {
  const document = parseXml(xml, 'JMdict');
  const entries = asArray(document.JMdict?.entry).map((entry) => normalizeLexicalEntry({
    sourceEntryId: scalar(entry.ent_seq),
    source: { id: 'jmdict', version: source.version, entryId: scalar(entry.ent_seq) },
    writtenForms: asArray(entry.k_ele).map((form) => scalar(form.keb)).filter(Boolean),
    readings: asArray(entry.r_ele).map((reading) => scalar(reading.reb)).filter(Boolean),
    common: hasPriority(entry),
    tags: unique([
      ...asArray(entry.k_ele).flatMap((form) => asArray(form.ke_inf).map(scalar)),
      ...asArray(entry.r_ele).flatMap((reading) => asArray(reading.re_inf).map(scalar)),
    ]),
    senses: asArray(entry.sense).map((sense) => ({
      partOfSpeech: asArray(sense.pos).map(scalar),
      fields: asArray(sense.field).map(scalar),
      misc: unique([...asArray(sense.misc).map(scalar), ...asArray(sense.dial).map(scalar)]),
      restrictions: {
        writtenForms: asArray(sense.stagk).map(scalar),
        readings: asArray(sense.stagr).map(scalar),
      },
      englishGlosses: asArray(sense.gloss)
        .filter((gloss) => !attribute(gloss, 'xml:lang') || attribute(gloss, 'xml:lang') === 'eng')
        .map(scalar),
    })),
  }));
  assertUnique(entries, 'JMdict');
  return entries;
}

export function parseKanjidic2Xml(xml, source) {
  const document = parseXml(xml, 'kanjidic2');
  const entries = asArray(document.kanjidic2?.character).map((character) => {
    const groups = asArray(character.reading_meaning?.rmgroup);
    const readings = groups.flatMap((group) => asArray(group.reading));
    const meanings = groups.flatMap((group) => asArray(group.meaning));
    return normalizeKanjiEntry({
      literal: scalar(character.literal),
      source: { id: 'kanjidic2', version: source.version, entryId: scalar(character.literal) },
      strokeCount: scalar(asArray(character.misc?.stroke_count)[0]),
      grade: scalar(character.misc?.grade),
      frequency: scalar(character.misc?.freq),
      readings: {
        on: readings.filter((value) => attribute(value, 'r_type') === 'ja_on').map(scalar),
        kun: readings.filter((value) => attribute(value, 'r_type') === 'ja_kun').map(scalar),
        nanori: asArray(character.reading_meaning?.nanori).map(scalar),
      },
      meanings: {
        en: meanings
          .filter((value) => !attribute(value, 'm_lang') || attribute(value, 'm_lang') === 'en')
          .map(scalar),
      },
      tags: asArray(character.misc?.rad_name).map(scalar),
    });
  });
  assertUnique(entries, 'KANJIDIC2');
  return entries;
}

function parseXml(xml, expectedRoot) {
  const validation = XMLValidator.validate(escapeCustomEntitiesForValidation(xml));
  if (validation !== true) {
    const line = validation.err?.line ? ` at line ${validation.err.line}` : '';
    throw new TypeError(`Invalid ${expectedRoot} XML${line}: ${validation.err?.msg || 'unknown error'}`);
  }
  const document = parser.parse(xml);
  if (!document?.[expectedRoot]) throw new TypeError(`Expected <${expectedRoot}> as XML root.`);
  return document;
}

function escapeCustomEntitiesForValidation(xml) {
  const predefined = new Set(['amp', 'apos', 'gt', 'lt', 'quot']);
  return xml.replace(/&([A-Za-z_:][\w:.-]*);/g, (reference, name) => (
    predefined.has(name) ? reference : `&amp;${name};`
  ));
}

function hasPriority(entry) {
  return asArray(entry.k_ele).some((form) => asArray(form.ke_pri).length > 0)
    || asArray(entry.r_ele).some((reading) => asArray(reading.re_pri).length > 0);
}

function scalar(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return String(value['#text'] ?? '').trim();
  return String(value).trim();
}

function attribute(value, name) {
  return value && typeof value === 'object' ? String(value[`@_${name}`] || '').trim() : '';
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function assertUnique(entries, label) {
  const ids = new Set();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new TypeError(`${label} contains duplicate id ${entry.id}.`);
    ids.add(entry.id);
  }
}
