export const JapaneseDictionary = (() => {
  let words = [];

  function setData(data) {
    words = Array.isArray(data) ? data : [];
  }

  function getAll() {
    return [...words];
  }

  function getById(id) {
    return words.find(word => word.id === id) || null;
  }

  function search(query, filters = {}) {
    const q = normalize(query);
    let results = words;

    if (filters.script && filters.script !== 'all') {
      results = results.filter(word => word.script === filters.script);
    }

    if (q) {
      results = results.filter(word =>
        normalize(word.word).includes(q) ||
        normalize(word.reading).includes(q) ||
        normalize(word.romaji).includes(q) ||
        normalize(word.definition).includes(q) ||
        normalize(word.category).includes(q)
      );
    }

    return results;
  }

  function filterByIds(ids, filters = {}) {
    const wanted = new Set(ids || []);
    const ordered = (ids || [])
      .map(getById)
      .filter(Boolean)
      .filter(word => wanted.has(word.id));

    if (!filters.script || filters.script === 'all') return ordered;
    return ordered.filter(word => word.script === filters.script);
  }

  function normalize(value) {
    return String(value || '').toLowerCase().trim();
  }

  return {
    setData,
    getAll,
    getById,
    search,
    filterByIds
  };
})();
