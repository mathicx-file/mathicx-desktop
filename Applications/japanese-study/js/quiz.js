export const JapaneseQuiz = (() => {
  const DEFAULT_SESSION_LIMIT = 10;
  const SESSION_LIMIT_OPTIONS = [10, 15, 20];
  const CATEGORY_OPTIONS = ['gojuuon', 'dakuon', 'handakuon', 'youon', 'N5'];
  const REVIEW_DELAY_MIN = 2;
  const REVIEW_DELAY_MAX = 4;

  let characters = [];
  let currentQuestion = null;
  let reviewQueue = [];
  let stats = createEmptyStats();

  function setData(data) {
    characters = Array.isArray(data) ? data : [];
    resetStats();
  }

  function nextQuestion(settings = {}) {
    const limit = getSessionLimit(settings.limit);
    if (stats.limit !== limit) {
      resetStats(limit);
    }

    if (stats.asked >= stats.limit) {
      currentQuestion = buildCompleteQuestion();
      return currentQuestion;
    }

    const mode = settings.mode || 'recognition';
    const pool = getPool(settings.script || 'all', settings.categories);
    if (pool.length === 0) {
      currentQuestion = null;
      return null;
    }

    const nextIndex = stats.asked + 1;
    const includeMistakeReviews = settings.includeMistakeReviews !== false;
    const dueReview = includeMistakeReviews ? takeDueReview(nextIndex) : null;
    currentQuestion = dueReview
      ? prepareReviewQuestion(dueReview.question, pool)
      : buildQuestion(mode, pool, pick(pool));
    currentQuestion.includeMistakeReviews = includeMistakeReviews;

    stats.asked += 1;
    stats.reviewPending = reviewQueue.length;
    return currentQuestion;
  }

  function buildQuestion(mode, pool, target) {
    const isKanji = target.script === 'kanji';
    const resolvedMode = resolveMode(mode, isKanji);

    if (resolvedMode === 'kanji-meaning') {
      return {
        mode,
        type: 'choice',
        prompt: target.char,
        answer: getPrimaryMeaning(target),
        acceptedAnswers: getMeanings(target),
        target,
        options: buildKanjiOptions(pool, target, getPrimaryMeaning),
        answered: false,
        review: false,
        instruction: 'Escolha o significado correto.'
      };
    }

    if (resolvedMode === 'meaning-kanji') {
      return {
        mode,
        type: 'choice',
        prompt: getPrimaryMeaning(target),
        answer: target.char,
        target,
        options: buildOptions(pool, target, 'char'),
        answered: false,
        review: false,
        instruction: 'Escolha o kanji correspondente.'
      };
    }

    if (resolvedMode === 'kanji-reading') {
      const readings = getReadings(target);
      return {
        mode,
        type: 'choice',
        prompt: target.char,
        answer: readings[0] || '',
        acceptedAnswers: readings,
        target,
        options: buildKanjiOptions(pool, target, item => getReadings(item)[0] || ''),
        answered: false,
        review: false,
        instruction: 'Escolha uma leitura correta.'
      };
    }

    if (resolvedMode === 'kanji-vocabulary-reading') {
      const example = pick((target.examples || []).filter(item => item.reading)) || null;
      return {
        mode,
        type: 'choice',
        prompt: example?.word || target.char,
        answer: example?.reading || getReadings(target)[0] || '',
        acceptedAnswers: [example?.reading, example?.romaji].filter(Boolean),
        target,
        options: buildVocabularyOptions(pool, target, example),
        answered: false,
        review: false,
        instruction: 'Escolha a leitura do vocabul\u00e1rio.'
      };
    }

    if (resolvedMode === 'typing') {
      return {
        mode,
        type: 'typing',
        prompt: target.char,
        answer: target.romaji,
        target,
        answered: false,
        review: false,
        instruction: 'Digite o romaji correspondente.'
      };
    }

    if (resolvedMode === 'kana-typing') {
      return {
        mode,
        type: 'typing',
        prompt: target.romaji,
        answer: target.char,
        target,
        answered: false,
        review: false,
        instruction: 'Digite o kana correspondente.'
      };
    }

    if (resolvedMode === 'flashcards') {
      return {
        mode,
        type: 'flashcard',
        prompt: target.char,
        answer: target.romaji,
        target,
        answered: false,
        revealed: false,
        review: false,
        instruction: 'Tente lembrar a leitura antes de revelar.'
      };
    }

    if (resolvedMode === 'romaji') {
      return {
        mode,
        type: 'choice',
        prompt: target.romaji,
        answer: target.char,
        target,
        options: buildOptions(pool, target, 'char'),
        answered: false,
        review: false,
        instruction: 'Escolha o kana correspondente.'
      };
    }

    return {
      mode,
      type: 'choice',
      prompt: target.char,
      answer: target.romaji,
      target,
      options: buildOptions(pool, target, 'romaji'),
      answered: false,
      review: false,
      instruction: 'Escolha o romaji correto.'
    };
  }

  function prepareReviewQuestion(question, pool) {
    const copy = cloneQuestion(question);
    copy.review = true;
    copy.answered = false;
    copy.lastResult = null;
    copy.revealed = false;
    copy.instruction = 'Revis\u00e3o: tente novamente a pergunta que voc\u00ea errou.';

    if (copy.type === 'choice') {
      const answerField = copy.answer === copy.target.char ? 'char' : 'romaji';
      copy.options = copy.options && copy.options.includes(copy.answer)
        ? shuffle(copy.options)
        : buildOptions(pool, copy.target, answerField);
    }

    return copy;
  }

  function checkAnswer(value) {
    if (!currentQuestion || currentQuestion.type === 'flashcard' || currentQuestion.type === 'complete') {
      return { correct: false, expected: '', answered: value || '' };
    }

    const normalized = normalize(value);
    if (!normalized) {
      return {
        correct: false,
        expected: currentQuestion.answer,
        answered: value,
        empty: true,
        locked: currentQuestion.answered
      };
    }

    if (currentQuestion.answered) {
      return {
        correct: currentQuestion.lastResult?.correct || false,
        expected: currentQuestion.answer,
        answered: currentQuestion.lastResult?.answered || value,
        locked: true,
        review: currentQuestion.review
      };
    }

    const accepted = Array.isArray(currentQuestion.acceptedAnswers) && currentQuestion.acceptedAnswers.length
      ? currentQuestion.acceptedAnswers
      : [currentQuestion.answer];
    const correct = accepted.some(answer => normalize(value) === normalize(answer));
    stats.answered += 1;
    if (correct) stats.correct += 1;

    currentQuestion.answered = true;
    currentQuestion.lastResult = {
      correct,
      expected: currentQuestion.answer,
      answered: value,
      review: currentQuestion.review
    };

    if (!correct && !currentQuestion.review && currentQuestion.includeMistakeReviews !== false) {
      scheduleReviewQuestion(currentQuestion);
      stats.reviewPending = reviewQueue.length;
    }

    return currentQuestion.lastResult;
  }

  function revealFlashcard() {
    if (!currentQuestion || currentQuestion.type !== 'flashcard') return currentQuestion;
    if (!currentQuestion.revealed) {
      currentQuestion.revealed = true;
      currentQuestion.answered = true;
      stats.answered += 1;
      stats.correct += 1;
    }
    return currentQuestion;
  }

  function getStats() {
    const accuracy = stats.answered > 0 ? Math.round((stats.correct / stats.answered) * 100) : 0;
    return {
      ...stats,
      accuracy,
      remaining: Math.max(stats.limit - stats.asked, 0),
      completed: stats.asked >= stats.limit
    };
  }

  function resetStats(limit = DEFAULT_SESSION_LIMIT) {
    stats = createEmptyStats(limit);
    currentQuestion = null;
    reviewQueue = [];
  }

  function createEmptyStats(limit = DEFAULT_SESSION_LIMIT) {
    return {
      asked: 0,
      answered: 0,
      correct: 0,
      limit: getSessionLimit(limit),
      reviewPending: 0
    };
  }

  function buildCompleteQuestion() {
    return {
      type: 'complete',
      prompt: 'Sess\u00e3o conclu\u00edda',
      instruction: 'Voc\u00ea completou ' + stats.limit + ' perguntas nesta sess\u00e3o.',
      answered: true
    };
  }

  function scheduleReviewQuestion(question) {
    if (stats.asked + REVIEW_DELAY_MIN > stats.limit) return;

    reviewQueue.push({
      dueAt: Math.min(stats.asked + randomInt(REVIEW_DELAY_MIN, REVIEW_DELAY_MAX), stats.limit),
      question: cloneQuestion(question)
    });
    reviewQueue.sort((a, b) => a.dueAt - b.dueAt);
  }

  function takeDueReview(nextIndex) {
    const index = reviewQueue.findIndex(item => item.dueAt <= nextIndex);
    if (index === -1) return null;
    return reviewQueue.splice(index, 1)[0];
  }

  function cloneQuestion(question) {
    return {
      ...question,
      target: question.target ? { ...question.target } : question.target,
      options: Array.isArray(question.options) ? [...question.options] : question.options
    };
  }

  function getPool(script, categories) {
    const selectedCategories = getSelectedCategories(categories);

    return characters.filter(char => {
      const matchesScript = !script || script === 'all' || char.script === script;
      const matchesCategory = selectedCategories === null || selectedCategories.includes(char.category);
      return matchesScript && matchesCategory;
    });
  }

  function getSelectedCategories(categories) {
    if (!Array.isArray(categories)) return null;
    return categories.filter(category => CATEGORY_OPTIONS.includes(category));
  }

  function resolveMode(mode, isKanji) {
    if (!isKanji) return mode === 'multiple-choice' ? pick(['recognition', 'romaji']) : mode;
    if (mode === 'kanji-meaning' || mode === 'meaning-kanji' || mode === 'kanji-reading' || mode === 'kanji-vocabulary-reading') {
      return mode;
    }
    if (mode === 'multiple-choice') return pick(['kanji-meaning', 'meaning-kanji', 'kanji-reading']);
    if (mode === 'romaji') return 'meaning-kanji';
    return 'kanji-meaning';
  }

  function buildOptions(pool, target, field) {
    const options = [target[field]];
    const candidates = shuffle(pool.filter(char => char[field] !== target[field]));

    candidates.forEach(char => {
      if (options.length < 4 && !options.includes(char[field])) {
        options.push(char[field]);
      }
    });

    return shuffle(options);
  }

  function buildKanjiOptions(pool, target, getter) {
    const answer = getter(target);
    const options = [answer];
    const candidates = shuffle(pool.filter(char => getter(char) && getter(char) !== answer));

    candidates.forEach(char => {
      const value = getter(char);
      if (options.length < 4 && !options.includes(value)) {
        options.push(value);
      }
    });

    return shuffle(options);
  }

  function buildVocabularyOptions(pool, target, example) {
    const answer = example?.reading || getReadings(target)[0] || '';
    const options = [answer];
    const candidates = shuffle(pool.flatMap(char => char.examples || []).filter(item => item.reading && item.reading !== answer));

    candidates.forEach(item => {
      if (options.length < 4 && !options.includes(item.reading)) {
        options.push(item.reading);
      }
    });

    return shuffle(options);
  }

  function getMeanings(item) {
    return Array.isArray(item.meanings) ? item.meanings : [];
  }

  function getPrimaryMeaning(item) {
    return getMeanings(item)[0] || item.romaji || item.char;
  }

  function getReadings(item) {
    return [...(item.onyomi || []), ...(item.kunyomi || [])];
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function randomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function getSessionLimit(value) {
    const parsed = Number(value);
    return SESSION_LIMIT_OPTIONS.includes(parsed) ? parsed : DEFAULT_SESSION_LIMIT;
  }

  function normalize(value) {
    return String(value || '').toLowerCase().trim();
  }

  return {
    setData,
    nextQuestion,
    checkAnswer,
    revealFlashcard,
    getStats,
    resetStats
  };
})();
