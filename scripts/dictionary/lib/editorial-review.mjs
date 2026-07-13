export const EDITORIAL_REVIEW_SCHEMA_VERSION = 1;
export const EDITORIAL_ACCEPTED_STATUSES = Object.freeze(['accepted-baseline', 'reviewed']);

export function createEditorialReview(options) {
  const lexicalBaseline = new Map(options.legacyDictionary.map((entry) => [entry.id, entry]));
  const kanjiBaseline = new Map(options.legacyKanji.kanji.map((entry) => [entry.id, entry]));
  const lexicalEntries = new Map(options.jmdict.entries.map((entry) => [entry.id, entry]));

  const review = {
    schemaVersion: EDITORIAL_REVIEW_SCHEMA_VERSION,
    packageId: 'bootstrap-n5',
    packageVersion: options.packageVersion,
    policy: {
      mode: 'hybrid-ptbr-optional',
      fallbackLanguage: 'en',
      futurePtBRRequired: false,
      acceptedAt: options.acceptedAt,
    },
    lexical: options.jmdict.aliases.map((alias) => {
      const legacy = lexicalBaseline.get(alias.legacyId);
      if (!legacy) throw new TypeError(`Missing lexical baseline ${alias.legacyId}.`);
      const candidateEntryIds = [...alias.entryIds];
      const uniqueMatch = candidateEntryIds.length === 1;
      const selections = uniqueMatch
        ? [createLexicalSelection(candidateEntryIds[0], legacy, lexicalEntries)]
        : [];
      return {
        legacyId: alias.legacyId,
        status: uniqueMatch ? 'accepted-baseline' : 'pending',
        currentPtBR: splitGlosses(legacy.definition),
        candidateEntryIds,
        selections,
      };
    }),
    kanji: options.kanjidic2.aliases.map((alias) => {
      const legacy = kanjiBaseline.get(alias.legacyId);
      if (!legacy) throw new TypeError(`Missing kanji baseline ${alias.legacyId}.`);
      return {
        legacyId: alias.legacyId,
        status: 'accepted-baseline',
        entryId: alias.entryId,
        meaningsPtBR: unique(legacy.meanings),
      };
    }),
  };
  validateEditorialReview(review, options);
  return review;
}

export function validateEditorialReview(review, options = {}) {
  if (!review || review.schemaVersion !== EDITORIAL_REVIEW_SCHEMA_VERSION) {
    throw new TypeError('Unsupported editorial review schema.');
  }
  if (review.packageId !== 'bootstrap-n5') throw new TypeError('Editorial review must target bootstrap-n5.');
  if (review.policy?.mode !== 'hybrid-ptbr-optional' || review.policy?.fallbackLanguage !== 'en') {
    throw new TypeError('Editorial review must preserve the approved hybrid policy.');
  }
  if (options.packageVersion && review.packageVersion !== options.packageVersion) {
    throw new TypeError('Editorial review does not match the requested package version.');
  }
  assertUnique(review.lexical, 'legacyId', 'lexical review');
  assertUnique(review.kanji, 'legacyId', 'kanji review');

  const aliases = new Map((options.jmdict?.aliases || []).map((alias) => [alias.legacyId, alias.entryIds]));
  const lexicalEntries = new Map((options.jmdict?.entries || []).map((entry) => [entry.id, entry]));
  if (aliases.size && (review.lexical.length !== aliases.size || review.lexical.some((item) => !aliases.has(item.legacyId)))) {
    throw new TypeError('Editorial lexical review does not match the imported aliases.');
  }
  for (const item of review.lexical) {
    if (!['pending', ...EDITORIAL_ACCEPTED_STATUSES].includes(item.status)) {
      throw new TypeError(`Invalid lexical review status for ${item.legacyId}.`);
    }
    const candidates = new Set(item.candidateEntryIds || []);
    if (!candidates.size) throw new TypeError(`Lexical review ${item.legacyId} has no candidates.`);
    if (aliases.has(item.legacyId) && !sameValues([...candidates], aliases.get(item.legacyId))) {
      throw new TypeError(`Lexical candidates changed for ${item.legacyId}.`);
    }
    if (item.status === 'pending' && item.selections.length) {
      throw new TypeError(`Pending lexical review ${item.legacyId} cannot have selections.`);
    }
    if (EDITORIAL_ACCEPTED_STATUSES.includes(item.status) && !item.selections.length) {
      throw new TypeError(`Accepted lexical review ${item.legacyId} requires selections.`);
    }
    for (const selection of item.selections) {
      if (!candidates.has(selection.entryId)) {
        throw new TypeError(`Lexical review ${item.legacyId} selected an invalid candidate.`);
      }
      if (!selection.senseId || !selection.glossesPtBR?.length) {
        throw new TypeError(`Lexical selection ${item.legacyId}/${selection.entryId} is incomplete.`);
      }
      const entry = lexicalEntries.get(selection.entryId);
      if (lexicalEntries.size && !entry?.senses.some((sense) => sense.id === selection.senseId)) {
        throw new TypeError(`Lexical review ${item.legacyId} selected a missing sense.`);
      }
    }
  }

  const kanjiAliases = new Map((options.kanjidic2?.aliases || []).map((alias) => [alias.legacyId, alias.entryId]));
  const kanjiEntries = new Set((options.kanjidic2?.entries || []).map((entry) => entry.id));
  if (kanjiAliases.size && (review.kanji.length !== kanjiAliases.size || review.kanji.some((item) => !kanjiAliases.has(item.legacyId)))) {
    throw new TypeError('Editorial kanji review does not match the imported aliases.');
  }
  for (const item of review.kanji) {
    if (!EDITORIAL_ACCEPTED_STATUSES.includes(item.status)) {
      throw new TypeError(`Invalid kanji review status for ${item.legacyId}.`);
    }
    if (kanjiAliases.has(item.legacyId) && kanjiAliases.get(item.legacyId) !== item.entryId) {
      throw new TypeError(`Kanji candidate changed for ${item.legacyId}.`);
    }
    if (kanjiEntries.size && !kanjiEntries.has(item.entryId)) {
      throw new TypeError(`Kanji review ${item.legacyId} selected a missing entry.`);
    }
    if (!item.meaningsPtBR?.length) throw new TypeError(`Kanji review ${item.legacyId} requires pt-BR meanings.`);
  }
  return review;
}

export function summarizeEditorialReview(review) {
  const lexical = countStatuses(review.lexical);
  const kanji = countStatuses(review.kanji);
  return {
    lexical,
    kanji,
    complete: (lexical.pending || 0) === 0 && (kanji.pending || 0) === 0,
  };
}

function createLexicalSelection(entryId, legacy, entries) {
  const entry = entries.get(entryId);
  if (!entry?.senses?.length) throw new TypeError(`Missing lexical entry or sense ${entryId}.`);
  return {
    entryId,
    senseId: entry.senses[0].id,
    glossesPtBR: splitGlosses(legacy.definition),
  };
}

function splitGlosses(value) {
  return unique(String(value || '').split(';').map((item) => item.trim()).filter(Boolean));
}

function countStatuses(items) {
  return items.reduce((counts, item) => ({ ...counts, [item.status]: (counts[item.status] || 0) + 1 }), {});
}

function assertUnique(items, field, label) {
  const values = new Set();
  for (const item of items || []) {
    if (!item?.[field] || values.has(item[field])) throw new TypeError(`Duplicate or missing ${label} ${field}.`);
    values.add(item[field]);
  }
}

function sameValues(left, right) {
  return [...left].sort().join('\0') === [...right].sort().join('\0');
}

function unique(values) {
  return [...new Set(values)];
}
