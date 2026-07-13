export function selectLexicalBootstrap(entries, legacyEntries) {
  const selected = new Map();
  const aliases = [];
  const unmatched = [];
  const ambiguous = [];

  for (const legacy of legacyEntries) {
    const word = cleanText(legacy.word);
    const reading = cleanText(legacy.reading || (/^[\p{Script=Hiragana}\p{Script=Katakana}\u30fc]+$/u.test(word) ? word : ''));
    const matches = entries.filter((entry) => matchesLexical(entry, word, reading));
    if (!matches.length) unmatched.push(legacy.id);
    if (matches.length > 1) ambiguous.push({ legacyId: legacy.id, entryIds: matches.map((entry) => entry.id) });
    matches.forEach((entry) => selected.set(entry.id, entry));
    aliases.push({ legacyId: legacy.id, entryIds: matches.map((entry) => entry.id) });
  }

  return {
    entries: [...selected.values()].sort(byId),
    aliases,
    report: { requested: legacyEntries.length, selected: selected.size, unmatched, ambiguous },
  };
}

export function selectKanjiBootstrap(entries, legacyPayload) {
  const requested = Array.isArray(legacyPayload) ? legacyPayload : legacyPayload?.kanji;
  if (!Array.isArray(requested)) throw new TypeError('Kanji baseline requires a kanji array.');
  const byLiteral = new Map(entries.map((entry) => [entry.literal, entry]));
  const selected = [];
  const aliases = [];
  const unmatched = [];

  for (const legacy of requested) {
    const entry = byLiteral.get(cleanText(legacy.char));
    if (!entry) unmatched.push(legacy.id);
    else selected.push(entry);
    aliases.push({ legacyId: legacy.id, entryId: entry?.id || null });
  }
  return {
    entries: selected.sort(byId),
    aliases,
    report: { requested: requested.length, selected: selected.length, unmatched },
  };
}

function matchesLexical(entry, word, reading) {
  if (word && (entry.writtenForms.includes(word) || entry.readings.includes(word))) return true;
  return Boolean(reading && entry.readings.includes(reading));
}

function cleanText(value) {
  return String(value || '').normalize('NFC').trim();
}

function byId(left, right) {
  return left.id.localeCompare(right.id);
}
