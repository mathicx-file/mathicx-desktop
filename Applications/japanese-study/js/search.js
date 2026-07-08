import { JapaneseStorage } from './storage.js';

export const JapaneseSearch = (() => {
  let characters = [];
  let onResultsCallback = null;
  let debounceTimer = null;

  function setData(data) {
    characters = data;
  }

  function search(query, filters = {}) {
    const q = query.toLowerCase().trim();
    let results = characters;

    if (q) {
      results = results.filter(c => getSearchText(c).includes(q));
    }

    if (filters.category) {
      results = results.filter(c => c.category === filters.category);
    }

    if (filters.script) {
      results = results.filter(c => c.script === filters.script);
    }

    if (filters.onlyFavorites) {
      results = results.filter(c => JapaneseStorage.isFavorite(c.romaji + '_' + c.char));
    }

    if (filters.dueReview) {
      results = results.filter(c => JapaneseStorage.isSrsDue(c.romaji + '_' + c.char));
    }

    return results;
  }

  function debouncedSearch(query, filters = {}, delay = 150) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const results = search(query, filters);
      if (onResultsCallback) onResultsCallback(results);
    }, delay);
  }

  function onResults(callback) {
    onResultsCallback = callback;
  }

  function buildId(char) {
    if (char?.script === 'kanji') {
      return `kanji_${char.id || char.unicode || char.char}`;
    }
    return `${char.romaji}_${char.char}`;
  }

  function getSearchText(char) {
    const examples = Array.isArray(char.examples)
      ? char.examples.flatMap(ex => [ex.word, ex.reading, ex.romaji, ex.meaning])
      : [];
    return [
      char.romaji,
      char.char,
      char.category,
      char.level,
      char.radical,
      ...(char.meanings || []),
      ...(char.onyomi || []),
      ...(char.kunyomi || []),
      ...(char.components || []),
      ...(char.tags || []),
      ...examples
    ].map(value => String(value || '').toLowerCase()).join(' ');
  }

  return {
    setData,
    search,
    debouncedSearch,
    onResults,
    buildId
  };
})();
