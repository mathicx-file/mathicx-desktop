export const JapaneseGamificationEngine = (() => {
  const SCHEMA_VERSION = 1;

  const LEVELS = [
    { level: 1, title: 'Aprendiz de Kana', minXp: 0 },
    { level: 2, title: 'Explorador de Hiragana', minXp: 120 },
    { level: 3, title: 'Leitor de Kana', minXp: 280 },
    { level: 4, title: 'Praticante Constante', minXp: 520 },
    { level: 5, title: 'Guardiao do Ritmo', minXp: 850 },
    { level: 6, title: 'Construtor de Memoria', minXp: 1280 },
    { level: 7, title: 'Especialista em Kana', minXp: 1820 },
    { level: 8, title: 'Iniciante em Kanji', minXp: 2480 },
    { level: 9, title: 'Estrategista de Estudos', minXp: 3260 },
    { level: 10, title: 'Mestre em Progresso Inicial', minXp: 4200 }
  ];

  const XP_RULES = {
    'quiz.correct': 6,
    'quiz.incorrect': 1,
    'quiz.review-correct': 8,
    'quiz.review-incorrect': 1,
    'srs.difficult': 3,
    'srs.good': 6,
    'srs.easy': 8,
    'typing.session': 8
  };

  const DEFAULT_GOALS = {
    dailyReviewTarget: 10,
    quizAnswerTarget: 10,
    weeklyStreakTarget: 7,
    typingSessionTarget: 1
  };

  function buildQuizEvent(question, result, now = Date.now()) {
    if (!question || !question.target || !result || result.empty || result.locked) return null;

    const correct = Boolean(result.correct);
    const type = question.review
      ? (correct ? 'quiz.review-correct' : 'quiz.review-incorrect')
      : (correct ? 'quiz.correct' : 'quiz.incorrect');
    const mode = question.mode || question.type || 'quiz';
    const item = question.target;
    const baseXp = XP_RULES[type] || 0;
    const modeBonus = correct ? getQuizModeBonus(mode, item.script) : 0;

    return createEvent({
      type,
      source: 'quiz',
      action: correct ? 'correct-answer' : 'incorrect-answer',
      xp: baseXp + modeBonus,
      item,
      skill: resolveQuizSkill(mode, item.script),
      details: {
        mode,
        review: Boolean(question.review),
        prompt: question.prompt,
        expected: result.expected,
        answered: result.answered,
        correct
      }
    }, now);
  }

  function buildSrsEvent(charData, rating, srsRecord, now = Date.now()) {
    const normalized = normalizeRating(rating);
    if (!normalized) return null;

    const item = typeof charData === 'string'
      ? { id: charData, charId: charData }
      : (charData || {});

    return createEvent({
      type: `srs.${normalized}`,
      source: 'srs',
      action: 'review',
      xp: XP_RULES[`srs.${normalized}`] || 0,
      item,
      skill: 'retention',
      details: {
        rating: normalized,
        state: srsRecord?.state || '',
        interval: srsRecord?.interval || 0,
        repetitions: srsRecord?.repetitions || 0
      }
    }, now);
  }

  function buildTypingEvent(summary, now = Date.now()) {
    if (!summary || !summary.completed) return null;

    const accuracy = clampNumber(summary.accuracy || 0, 0, 100);
    const volumeBonus = Math.min(Math.floor(Number(summary.kanaTyped || 0) / 12), 8);
    const accuracyBonus = accuracy >= 95 ? 8 : accuracy >= 85 ? 5 : accuracy >= 70 ? 2 : 0;
    const xp = (XP_RULES['typing.session'] || 0) + volumeBonus + accuracyBonus;

    return createEvent({
      type: 'typing.session',
      source: 'typing',
      action: 'complete-session',
      xp,
      item: { id: summary.sessionId || `typing_${summary.startedAt || now}` },
      skill: 'production',
      details: {
        mode: summary.settings?.mode || 'copy',
        script: summary.settings?.script || 'hiragana',
        accuracy,
        kanaTyped: Number(summary.kanaTyped || 0),
        total: Number(summary.total || 0),
        errors: Number(summary.errors || 0)
      }
    }, now);
  }

  function createEvent(data, now = Date.now()) {
    const item = data.item || {};
    const eventId = [
      data.type || 'event',
      buildItemId(item),
      now,
      Math.random().toString(36).slice(2, 8)
    ].join('_');

    return {
      id: `gamification_${eventId}`,
      schemaVersion: SCHEMA_VERSION,
      entityType: 'gamification-event',
      type: 'gamification_event',
      eventType: data.type || 'unknown',
      source: data.source || 'unknown',
      action: data.action || '',
      value: clampInteger(data.xp || 0, 0, 100),
      xp: clampInteger(data.xp || 0, 0, 100),
      skill: data.skill || 'general',
      itemId: buildItemId(item),
      charId: buildItemId(item),
      char: item.char,
      romaji: item.romaji,
      script: item.script,
      category: item.category,
      level: item.level,
      details: data.details || {},
      syncStatus: 'local',
      createdAt: new Date(now).toISOString(),
      timestamp: now
    };
  }

  function summarize(context = {}) {
    const events = normalizeEvents(context.events || context.gamificationEvents || []);
    const stats = context.stats || {};
    const completion = context.completion || {};
    const srsStats = context.srsStats || {};
    const quizStats = context.quizStats || {};
    const typingStats = context.typingStats || {};

    const eventXp = sum(events.map(event => Number(event.xp || event.value || 0)));
    const habitXp = calculateHabitXp(stats);
    const masteryXp = calculateMasteryXp({ completion, srsStats, quizStats, typingStats });
    const legacyXp = events.length ? 0 : calculateLegacyBridgeXp({ stats, completion, srsStats, quizStats, typingStats });
    const xp = eventXp + habitXp + masteryXp + legacyXp;
    const current = [...LEVELS].reverse().find(level => xp >= level.minXp) || LEVELS[0];
    const next = LEVELS.find(level => level.minXp > current.minXp) || null;
    const progress = next
      ? Math.round(((xp - current.minXp) / (next.minXp - current.minXp)) * 100)
      : 100;

    return {
      ...current,
      xp,
      next,
      progress: clampInteger(progress, 0, 100),
      dimensions: {
        habit: habitXp,
        mastery: masteryXp,
        practice: eventXp + legacyXp
      },
      stats: {
        events: events.length,
        quizEvents: events.filter(event => event.source === 'quiz').length,
        srsEvents: events.filter(event => event.source === 'srs').length,
        typingEvents: events.filter(event => event.source === 'typing').length
      },
      goals: normalizeGoals(context.goals || context.settings?.gamificationGoals),
      achievements: buildAchievements({
        xp,
        stats,
        completion,
        srsStats,
        quizStats,
        typingStats,
        events,
        persisted: context.persistedAchievements || context.settings?.gamificationAchievements
      }),
      quests: buildQuests({
        stats,
        srsStats,
        quizStats,
        typingStats,
        goals: normalizeGoals(context.goals || context.settings?.gamificationGoals)
      }),
      errorNotebook: buildErrorNotebook(context.difficulty || [], context.quizStats || {}),
      hint: getHint({ current, completion, srsStats, quizStats, typingStats })
    };
  }

  function normalizeEvents(events) {
    return Array.isArray(events)
      ? events.filter(event => event && (event.type === 'gamification_event' || event.entityType === 'gamification-event'))
      : [];
  }

  function calculateHabitXp(stats = {}) {
    const streak = clampInteger(stats.streak || 0, 0, 365);
    const studyTime = clampInteger(stats.studyTime || 0, 0, 100000);
    const activeDays = Object.values(stats.activity || {}).filter(count => Number(count || 0) > 0).length;

    return Math.min(streak, 30) * 8 +
      Math.min(activeDays, 30) * 6 +
      Math.min(Math.floor(studyTime / 5), 120);
  }

  function calculateMasteryXp({ completion = {}, srsStats = {}, quizStats = {}, typingStats = {} }) {
    const completionXp =
      getPercent(completion.hiragana) * 2 +
      getPercent(completion.katakana) * 2 +
      getPercent(completion.kanji) * 3;
    const srsXp = clampInteger(srsStats.mastered || 0, 0, 1000) * 10;
    const quizVolume = Math.min(clampInteger(quizStats.answered || 0, 0, 10000), 250);
    const quizAccuracyBonus = quizStats.answered >= 10 ? Math.round(clampNumber(quizStats.accuracy || 0, 0, 100) * 1.2) : 0;
    const typingAccuracyBonus = typingStats.sessions >= 1 ? Math.round(clampNumber(typingStats.averageAccuracy || 0, 0, 100) * 0.8) : 0;

    return Math.round(completionXp + srsXp + quizVolume + quizAccuracyBonus + typingAccuracyBonus);
  }

  function calculateLegacyBridgeXp(data) {
    const stats = data.stats || {};
    const quizStats = data.quizStats || {};
    const typingStats = data.typingStats || {};

    return Math.min(clampInteger(stats.totalStudied || 0, 0, 1000) * 3, 300) +
      Math.min(clampInteger(quizStats.correct || 0, 0, 10000) * 2, 300) +
      Math.min(clampInteger(typingStats.sessions || 0, 0, 1000) * 12, 180);
  }

  function buildAchievements({ xp, stats = {}, completion = {}, srsStats = {}, quizStats = {}, typingStats = {}, events = [], persisted = {} }) {
    const stored = persisted && typeof persisted === 'object' ? persisted : {};
    const definitions = [
      { id: 'first-steps', title: 'Primeiros passos', unlocked: xp > 0 },
      { id: 'steady-week', title: 'Semana constante', unlocked: (stats.streak || 0) >= 7 },
      { id: 'hiragana-reader', title: 'Leitor de Hiragana', unlocked: getPercent(completion.hiragana) >= 80 },
      { id: 'katakana-reader', title: 'Leitor de Katakana', unlocked: getPercent(completion.katakana) >= 80 },
      { id: 'memory-builder', title: 'Memoria em dia', unlocked: (srsStats.mastered || 0) >= 20 },
      { id: 'quiz-sharp', title: 'Quiz afiado', unlocked: (quizStats.answered || 0) >= 30 && (quizStats.accuracy || 0) >= 85 },
      { id: 'typing-rhythm', title: 'Ritmo de digitacao', unlocked: (typingStats.sessions || 0) >= 3 },
      { id: 'event-ledger', title: 'Trilha registrada', unlocked: events.length >= 25 }
    ];

    return definitions.map(item => {
      const saved = stored[item.id] || {};
      const unlocked = Boolean(item.unlocked || saved.unlocked);
      return {
        ...item,
        unlocked,
        unlockedAt: saved.unlockedAt || null,
        seenAt: saved.seenAt || null,
        isNew: unlocked && !saved.seenAt
      };
    });
  }

  function buildQuests({ stats = {}, srsStats = {}, quizStats = {}, typingStats = {}, goals = DEFAULT_GOALS }) {
    const normalizedGoals = normalizeGoals(goals);
    return [
      {
        id: 'daily-review',
        title: 'Revisao do dia',
        progress: Math.max(0, Math.min((srsStats.totalTracked || 0) - (srsStats.due || 0), normalizedGoals.dailyReviewTarget)),
        target: normalizedGoals.dailyReviewTarget
      },
      {
        id: 'quiz-focus',
        title: normalizedGoals.quizAnswerTarget + ' respostas no quiz',
        progress: Math.min(quizStats.answered || 0, normalizedGoals.quizAnswerTarget),
        target: normalizedGoals.quizAnswerTarget
      },
      {
        id: 'study-habit',
        title: 'Manter ritmo',
        progress: Math.min(stats.streak || 0, normalizedGoals.weeklyStreakTarget),
        target: normalizedGoals.weeklyStreakTarget
      },
      {
        id: 'typing-practice',
        title: 'Sessao de digitacao',
        progress: Math.min(typingStats.sessions || 0, normalizedGoals.typingSessionTarget),
        target: normalizedGoals.typingSessionTarget
      }
    ];
  }

  function buildErrorNotebook(difficulty = [], quizStats = {}) {
    const recentErrors = Array.isArray(quizStats.recentErrors) ? quizStats.recentErrors : [];
    const recentById = recentErrors.reduce((map, item) => {
      if (item.charId && !map[item.charId]) map[item.charId] = item;
      return map;
    }, {});

    return (Array.isArray(difficulty) ? difficulty : [])
      .filter(item => (item.errors || 0) > 0 || (item.accuracy || 100) < 75)
      .slice(0, 6)
      .map(item => {
        const recent = recentById[item.charId] || {};
        return {
          charId: item.charId,
          char: item.char || recent.char || '?',
          romaji: item.romaji || recent.romaji || '',
          script: item.script || recent.script || 'all',
          category: item.category || recent.category || '',
          accuracy: item.accuracy || 0,
          errors: item.errors || 0,
          total: item.total || 0,
          state: item.state || 'Atencao',
          lastExpected: recent.expected || '',
          lastAnswered: recent.answered || '',
          recommendation: getErrorRecommendation(item)
        };
      });
  }

  function getErrorRecommendation(item = {}) {
    if ((item.errors || 0) >= 3 && (item.accuracy || 0) < 50) return 'Faca uma rodada curta antes de estudar conteudo novo.';
    if ((item.accuracy || 0) < 70) return 'Compare com caracteres parecidos e responda devagar.';
    return 'Inclua em uma revisao leve para estabilizar.';
  }

  function normalizeGoals(goals = {}) {
    return {
      dailyReviewTarget: clampInteger(goals.dailyReviewTarget || DEFAULT_GOALS.dailyReviewTarget, 1, 50),
      quizAnswerTarget: clampInteger(goals.quizAnswerTarget || DEFAULT_GOALS.quizAnswerTarget, 5, 50),
      weeklyStreakTarget: clampInteger(goals.weeklyStreakTarget || DEFAULT_GOALS.weeklyStreakTarget, 1, 14),
      typingSessionTarget: clampInteger(goals.typingSessionTarget || DEFAULT_GOALS.typingSessionTarget, 1, 10)
    };
  }

  function getHint({ current, completion = {}, srsStats = {}, quizStats = {}, typingStats = {} }) {
    if ((srsStats.due || 0) > 0) return 'Revisoes vencidas rendem progresso real de memoria.';
    if (getPercent(completion.hiragana) < 70) return 'Avance em Hiragana e misture quiz curto com revisao.';
    if (getPercent(completion.katakana) < 50) return 'Inclua Katakana para equilibrar reconhecimento visual.';
    if ((quizStats.accuracy || 0) < 75 && (quizStats.answered || 0) >= 10) return 'Reforce erros recentes antes de buscar XP rapido.';
    if ((typingStats.sessions || 0) === 0 && current.level >= 3) return 'Adicione producao ativa com digitacao guiada.';
    return 'Mantenha o ritmo e varie entre quiz, SRS e escrita.';
  }

  function getQuizModeBonus(mode, script) {
    if (mode === 'kana-typing' || mode === 'typing') return 3;
    if (String(mode || '').includes('kanji')) return 3;
    if (script === 'kanji') return 2;
    if (mode === 'multiple-choice') return 1;
    return 0;
  }

  function resolveQuizSkill(mode, script) {
    if (mode === 'kana-typing' || mode === 'typing') return 'production';
    if (String(mode || '').includes('reading')) return 'reading';
    if (String(mode || '').includes('meaning') || script === 'kanji') return 'meaning';
    return 'recognition';
  }

  function normalizeRating(rating) {
    const value = String(rating || '').toLowerCase();
    if (value === 'again' || value === 'hard' || value === 'difficult' || value === 'dificil') return 'difficult';
    if (value === 'good' || value === 'bom') return 'good';
    if (value === 'easy' || value === 'facil') return 'easy';
    return '';
  }

  function buildItemId(item = {}) {
    if (item.itemId || item.charId) return String(item.itemId || item.charId);
    if (item.script === 'kanji') return `kanji_${item.id || item.unicode || item.char || 'unknown'}`;
    if (item.id) return String(item.id);
    return `${item.romaji || ''}_${item.char || ''}` || 'unknown';
  }

  function getPercent(group = {}) {
    const total = Number(group.total || 0);
    if (total <= 0) return 0;
    return Math.round((Number(group.studied || 0) / total) * 100);
  }

  function sum(values) {
    return values.reduce((total, value) => total + (Number(value) || 0), 0);
  }

  function clampInteger(value, min, max) {
    return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
  }

  function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  return {
    LEVELS,
    SCHEMA_VERSION,
    DEFAULT_GOALS,
    buildQuizEvent,
    buildSrsEvent,
    buildTypingEvent,
    createEvent,
    summarize,
    normalizeGoals
  };
})();
