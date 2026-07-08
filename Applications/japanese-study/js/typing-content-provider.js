export const JapaneseTypingContentProvider = (() => {
  const DEFAULT_FILTERS = {
    script: 'hiragana',
    size: 'small',
    mode: 'copy',
    level: 'beginner',
    category: 'all',
    limit: 5
  };

  let exercises = [];

  function setData(data) {
    const list = Array.isArray(data?.exercises) ? data.exercises : Array.isArray(data) ? data : [];
    exercises = list.map(normalizeExercise).filter(Boolean);
    return exercises;
  }

  function getAll() {
    return [...exercises];
  }

  function getCategories(filters = {}) {
    return [...new Set(filterExercises({ ...filters, category: 'all' }).map(item => item.category).filter(Boolean))].sort();
  }

  function filterExercises(filters = {}) {
    const settings = { ...DEFAULT_FILTERS, ...filters };
    return exercises.filter(exercise =>
      matches(exercise.script, settings.script) &&
      matches(exercise.size, settings.size) &&
      matches(exercise.mode, settings.mode) &&
      matches(exercise.level, settings.level) &&
      matches(exercise.category, settings.category)
    );
  }

  function buildSession(filters = {}, options = {}) {
    const settings = { ...DEFAULT_FILTERS, ...filters };
    const limit = getLimit(settings.limit);
    const pool = filterExercises(settings);
    const random = typeof options.random === 'function' ? options.random : Math.random;

    return {
      settings: { ...settings, limit },
      exercises: shuffle(pool, random).slice(0, limit),
      available: pool.length
    };
  }

  function shuffle(list, random = Math.random) {
    const result = [...list];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  function normalizeExercise(exercise) {
    if (!exercise || typeof exercise !== 'object') return null;
    const id = String(exercise.id || '').trim();
    const answer = String(exercise.answer || '').trim();
    const promptPt = String(exercise.promptPt || '').trim();
    if (!id || !answer || !promptPt) return null;

    return {
      id,
      level: String(exercise.level || 'beginner'),
      size: String(exercise.size || 'small'),
      category: String(exercise.category || 'general'),
      script: String(exercise.script || 'hiragana'),
      mode: String(exercise.mode || 'copy'),
      promptPt,
      referenceJapanese: String(exercise.referenceJapanese || answer),
      answer,
      acceptedAnswers: Array.isArray(exercise.acceptedAnswers) ? exercise.acceptedAnswers.map(String) : [],
      romaji: String(exercise.romaji || ''),
      notes: String(exercise.notes || ''),
      tokens: Array.isArray(exercise.tokens) ? exercise.tokens : []
    };
  }

  function matches(value, filter) {
    return !filter || filter === 'all' || value === filter;
  }

  function getLimit(value) {
    const parsed = Number(value);
    return [3, 5, 8].includes(parsed) ? parsed : DEFAULT_FILTERS.limit;
  }

  return {
    DEFAULT_FILTERS,
    setData,
    getAll,
    getCategories,
    filterExercises,
    buildSession,
    shuffle
  };
})();
