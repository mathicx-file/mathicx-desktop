import {
  BOOTSTRAP_PACKAGE_ID,
  PIPELINE_SCHEMA_VERSION,
  normalizeBootstrapPackage,
} from './pipeline-schema.mjs';
import { validateImportArtifacts } from './import-pipeline.mjs';
import { summarizeEditorialReview, validateEditorialReview } from './editorial-review.mjs';

export function generateBootstrapPackage(options) {
  validateImportArtifacts(options.jmdict, options.kanjidic2, options.selection);
  validatePackageVersion(options.version);
  const lexicalById = new Map(options.jmdict.entries.map((entry) => [entry.id, entry]));
  const kanjiById = new Map(options.kanjidic2.entries.map((entry) => [entry.id, entry]));
  const legacyDictionary = new Map(options.legacyDictionary.map((entry) => [entry.id, entry]));
  const legacyKanji = new Map(options.legacyKanji.kanji.map((entry) => [entry.id, entry]));
  const translationMap = new Map();
  const reviewQueue = [];
  const editorialReview = options.editorialReview || null;

  if (editorialReview) {
    validateEditorialReview(editorialReview, {
      jmdict: options.jmdict,
      kanjidic2: options.kanjidic2,
      packageVersion: options.version,
    });
    if (!summarizeEditorialReview(editorialReview).complete) {
      throw new TypeError('Editorial review must be complete before generating a reviewed package.');
    }
  }
  const lexicalAliases = editorialReview
    ? editorialReview.lexical.map((item) => ({
        legacyId: item.legacyId,
        entryIds: unique(item.selections.map((selection) => selection.entryId)),
      }))
    : options.jmdict.aliases;
  const reviewedEntryIds = new Set(lexicalAliases.flatMap((alias) => alias.entryIds));

  for (const alias of options.jmdict.aliases) {
    const legacy = legacyDictionary.get(alias.legacyId);
    if (!legacy) throw new TypeError(`Missing legacy dictionary entry ${alias.legacyId}.`);
    if (alias.entryIds.length !== 1) {
      reviewQueue.push(createAmbiguityReview(alias, legacy, lexicalById));
    }
    if (editorialReview) {
      const reviewed = editorialReview.lexical.find((item) => item.legacyId === alias.legacyId);
      for (const selection of reviewed.selections) {
        addTranslation(translationMap, selection, alias.legacyId, options, 'reviewed', editorialReview.policy.acceptedAt);
      }
    } else if (alias.entryIds.length === 1) {
      const entry = lexicalById.get(alias.entryIds[0]);
      if (!entry) throw new TypeError(`Alias ${alias.legacyId} references a missing lexical entry.`);
      addTranslation(translationMap, {
        entryId: entry.id,
        senseId: entry.senses[0].id,
        glossesPtBR: splitGlosses(legacy.definition),
      }, alias.legacyId, options, 'draft');
    }
  }

  const kanjiTranslations = options.kanjidic2.aliases.map((alias) => {
    const legacy = legacyKanji.get(alias.legacyId);
    if (!legacy) throw new TypeError(`Missing legacy kanji entry ${alias.legacyId}.`);
    if (!kanjiById.has(alias.entryId)) throw new TypeError(`Kanji alias ${alias.legacyId} references a missing entry.`);
    const reviewed = editorialReview?.kanji.find((item) => item.legacyId === alias.legacyId);
    return {
      entryId: alias.entryId,
      language: 'pt-BR',
      meanings: reviewed?.meaningsPtBR || unique(legacy.meanings),
      status: editorialReview ? 'reviewed' : 'draft',
      source: { id: 'mathicx-ptbr', version: options.projectVersion, entryId: alias.legacyId },
      ...(editorialReview ? { reviewedAt: editorialReview.policy.acceptedAt } : {}),
    };
  });

  const normalized = normalizeBootstrapPackage({
    id: BOOTSTRAP_PACKAGE_ID,
    version: options.version,
    sources: [
      options.jmdict.metadata.source,
      options.kanjidic2.metadata.source,
      { id: 'kanjivg', version: options.kanjivgVersion, sha256: options.kanjivgSha256 },
      { id: 'mathicx-ptbr', version: options.projectVersion, sha256: options.projectSha256 },
    ],
    entries: editorialReview
      ? options.jmdict.entries.filter((entry) => reviewedEntryIds.has(entry.id))
      : options.jmdict.entries,
    kanji: options.kanjidic2.entries,
    translations: [...translationMap.values()].sort(byId),
    kanjiTranslations,
    strokeAssets: options.strokeAssets,
  });

  const packageData = {
    ...normalized,
    licensesPath: '../licenses.json',
    aliases: {
      lexical: lexicalAliases,
      kanji: options.kanjidic2.aliases,
    },
    editorial: {
      status: editorialReview ? 'reviewed' : 'review-required',
      reviewedTranslations: editorialReview ? normalized.translations.length + normalized.kanjiTranslations.length : 0,
      draftTranslations: editorialReview ? 0 : normalized.translations.length + normalized.kanjiTranslations.length,
      ambiguousLexicalEntries: editorialReview ? 0 : reviewQueue.length,
    },
  };

  return {
    packageData,
    report: createCoverageReport(packageData, options, reviewQueue, Boolean(editorialReview)),
  };
}

export function validateBootstrapOutput(packageData, report, licenses, options = {}) {
  const normalized = normalizeBootstrapPackage(packageData);
  if (report.packageId !== normalized.id || report.packageVersion !== normalized.version) {
    throw new TypeError('Bootstrap report does not match package identity.');
  }
  const expectedCounts = {
    lexicalEntries: normalized.entries.length,
    baselineKanji: normalized.kanji.length,
    strokeAssets: normalized.strokeAssets.length,
    draftLexicalTranslations: normalized.translations.filter((item) => item.status === 'draft').length,
    draftKanjiTranslations: normalized.kanjiTranslations.filter((item) => item.status === 'draft').length,
    reviewedTranslations: normalized.translations.filter((item) => item.status === 'reviewed').length
      + normalized.kanjiTranslations.filter((item) => item.status === 'reviewed').length,
  };
  for (const [field, expected] of Object.entries(expectedCounts)) {
    if (report.coverage?.[field] !== expected) {
      throw new TypeError(`Bootstrap report count mismatch: ${field}.`);
    }
  }
  const licensedSources = new Set((licenses?.sources || []).map((source) => source.id));
  for (const source of normalized.sources) {
    if (!licensedSources.has(source.id)) throw new TypeError(`Missing runtime license for source ${source.id}.`);
  }
  const maxBytes = Number(options.maxBytes || 250 * 1024);
  if (Number(options.byteLength) > maxBytes) {
    throw new TypeError(`Bootstrap package exceeds ${maxBytes} bytes.`);
  }
  const drafts = normalized.translations.some((item) => item.status === 'draft')
    || normalized.kanjiTranslations.some((item) => item.status === 'draft');
  if (drafts && report.publication?.ready !== false) {
    throw new TypeError('Bootstrap with draft translations cannot be publication-ready.');
  }
  if (report.publication?.ready) {
    normalizeBootstrapPackage(packageData, { requireReviewedTranslations: true });
    if (packageData.editorial?.status !== 'reviewed' || packageData.editorial?.draftTranslations !== 0) {
      throw new TypeError('Publication-ready bootstrap requires reviewed editorial metadata.');
    }
  }
  return {
    valid: true,
    packageId: normalized.id,
    packageVersion: normalized.version,
    byteLength: Number(options.byteLength),
    maxBytes,
    counts: expectedCounts,
    publicationReady: report.publication.ready,
  };
}

function createAmbiguityReview(alias, legacy, entries) {
  return {
    legacyId: alias.legacyId,
    word: legacy.word,
    reading: legacy.reading || '',
    currentPtBR: splitGlosses(legacy.definition),
    candidates: alias.entryIds.map((entryId) => {
      const entry = entries.get(entryId);
      if (!entry) throw new TypeError(`Ambiguous alias ${alias.legacyId} references a missing entry.`);
      return {
        entryId,
        writtenForms: entry.writtenForms,
        readings: entry.readings,
        englishGlosses: unique(entry.senses.flatMap((sense) => sense.glosses.en)),
      };
    }),
  };
}

function createCoverageReport(packageData, options, reviewQueue, reviewed) {
  const baselineWords = options.legacyDictionary.length;
  const uniqueWords = baselineWords - reviewQueue.length;
  return {
    schemaVersion: PIPELINE_SCHEMA_VERSION,
    packageId: packageData.id,
    packageVersion: packageData.version,
    sourceVersions: Object.fromEntries(packageData.sources.map((source) => [source.id, source.version])),
    coverage: {
      baselineWords,
      matchedWords: baselineWords,
      uniqueWords,
      ambiguousWords: reviewQueue.length,
      lexicalEntries: packageData.entries.length,
      baselineKanji: options.legacyKanji.kanji.length,
      matchedKanji: packageData.kanji.length,
      strokeAssets: packageData.strokeAssets.length,
      draftLexicalTranslations: packageData.translations.filter((item) => item.status === 'draft').length,
      draftKanjiTranslations: packageData.kanjiTranslations.filter((item) => item.status === 'draft').length,
      reviewedTranslations: reviewed ? packageData.translations.length + packageData.kanjiTranslations.length : 0,
    },
    publication: {
      ready: reviewed,
      blockers: reviewed ? [] : [
          'lexical-translations-require-review',
          'kanji-translations-require-review',
          ...(reviewQueue.length ? ['ambiguous-lexical-aliases-require-review'] : []),
        ],
    },
    reviewQueue: reviewed ? [] : reviewQueue,
  };
}

function addTranslation(map, selection, legacyId, options, status, reviewedAt) {
  const translationId = `mathicx-ptbr:${selection.entryId}:${selection.senseId}`;
  const existing = map.get(translationId);
  map.set(translationId, {
    id: translationId,
    entryId: selection.entryId,
    senseId: selection.senseId,
    language: 'pt-BR',
    glosses: unique([...(existing?.glosses || []), ...selection.glossesPtBR]),
    status,
    source: { id: 'mathicx-ptbr', version: options.projectVersion, entryId: legacyId },
    ...(reviewedAt ? { reviewedAt } : {}),
  });
}

function validatePackageVersion(version) {
  if (!/^\d{4}\.\d{2}\.\d{2}-\d+$/.test(String(version || ''))) {
    throw new TypeError('Bootstrap package version must use YYYY.MM.DD-N.');
  }
}

function splitGlosses(value) {
  return unique(String(value || '').split(';').map((item) => item.trim()).filter(Boolean));
}

function unique(values) {
  return [...new Set(values)];
}

function byId(left, right) {
  return left.id.localeCompare(right.id);
}
