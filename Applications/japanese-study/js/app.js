import { JapaneseStorage } from './storage.js';
import { JapaneseSearch } from './search.js';
import { JapaneseStrokePlayer } from './stroke-player.js';
import { JapanesePractice } from './practice.js';
import { JapaneseUI } from './ui.js';
import { JapaneseDictionary } from './dictionary.js';
import { JapaneseQuiz } from './quiz.js';
import { JapaneseStudyEngine } from './study-engine.js';
import { JapaneseLearningLevels } from './learning-levels.js';
import { JapaneseRecommendationEngine } from './recommendation-engine.js';
import { JapaneseTypingContentProvider } from './typing-content-provider.js';
import { JapaneseTypingEvaluator } from './typing-evaluator.js';
import { createTypingSession } from './typing-session.js';
import { JapaneseKanaPrintExport } from './kana-print-export.js';

const JapaneseApp = (() => {
  let allData = [];
  let hiraganaData = [];
  let katakanaData = [];
  let kanjiData = [];
  let dictionaryData = [];
  let initialized = false;
  let sessionStartedAt = Date.now();
  let lastSavedMinute = 0;
  let dictionarySearchTimer = null;
  let selectedBackup = null;
  let activeQuizContext = null;
  let activeTypingSession = null;
  let currentTypingValue = '';
  let currentTypingResult = null;

  function init() {
    if (initialized) return;
    initialized = true;

    JapaneseUI.init();

    const loadingEl = document.getElementById('loading-state');
    const gridEl = document.getElementById('character-grid');

    Promise.all([
      loadJSON('data/hiragana.json'),
      loadJSON('data/katakana.json'),
      loadJSON('data/kanji.json'),
      loadJSON('data/dictionary.json'),
      loadJSON('data/typing-exercises.json')
    ]).then(([hira, kata, kanji, dictionary, typingExercises]) => {
      hiraganaData = (hira.characters || hira).map(c => ({ ...c, script: 'hiragana' }));
      katakanaData = (kata.characters || kata).map(c => ({ ...c, script: 'katakana' }));
      kanjiData = (kanji.kanji || kanji.characters || kanji).map(c => ({ ...c, script: 'kanji', category: c.level || 'N5' }));
      dictionaryData = dictionary.words || dictionary;

      allData = [...hiraganaData, ...katakanaData, ...kanjiData];

      if (loadingEl) loadingEl.style.display = 'none';
      gridEl.style.display = '';

      JapaneseSearch.setData(allData);
      JapaneseDictionary.setData(dictionaryData);
      JapaneseQuiz.setData(allData);
      JapaneseTypingContentProvider.setData(typingExercises);
      JapaneseUI.setCharacters(allData);
      JapaneseUI.applyQuizSettings(getSavedQuizSettings());
      JapaneseUI.applyTypingSettings(getSavedTypingSettings());

      const categories = [...new Set(allData.map(c => c.category))];
      JapaneseUI.renderFilters(categories, '');

      const initialChars = allData.filter(c => c.script === 'hiragana');
      JapaneseUI.renderGrid(initialChars);
      renderDictionary();
      renderTyping();

      JapaneseSearch.onResults((results) => {
        JapaneseUI.renderGrid(results);
      });

      JapaneseUI.onFilterChangeCallback(() => {
        applyFilters();
      });

      JapaneseUI.onViewChangeCallback(() => {
        applyFilters();
      });

      JapaneseUI.onDictionaryFilterChangeCallback(() => {
        renderDictionary();
      });

      JapaneseUI.onQuizSettingsChangeCallback(() => {
        activeQuizContext = null;
        persistQuizSettings();
        JapaneseQuiz.resetStats();
        renderQuiz();
      });

      JapaneseUI.onQuizAnswerCallback((answer) => {
        const result = JapaneseQuiz.checkAnswer(answer);
        JapaneseStorage.saveQuizAnswer(currentQuizQuestion, result).then(() => {
          if (!result.empty && !result.locked) JapaneseStorage.emitChange('quiz-updated', result);
        }).catch(() => {});
        JapaneseUI.renderQuiz(currentQuizQuestion, JapaneseQuiz.getStats(), result, activeQuizContext);
      });

      JapaneseUI.onQuizNextCallback(() => {
        renderQuiz();
      });

      JapaneseUI.onQuizRevealCallback(() => {
        currentQuizQuestion = JapaneseQuiz.revealFlashcard();
        JapaneseUI.renderQuiz(currentQuizQuestion, JapaneseQuiz.getStats(), undefined, activeQuizContext);
      });

      JapaneseUI.onQuizResetCallback(() => {
        activeQuizContext = null;
        JapaneseQuiz.resetStats();
        renderQuiz();
      });

      JapaneseUI.onTypingSettingsChangeCallback(() => {
        persistTypingSettings();
        resetTypingSession();
      });

      JapaneseUI.onTypingStartCallback((settings) => {
        startTypingSession(settings);
      });

      JapaneseUI.onTypingInputCallback((value) => {
        currentTypingValue = value;
        currentTypingResult = null;
        renderTyping();
      });

      JapaneseUI.onTypingSubmitCallback((value) => {
        submitTypingAnswer(value);
      });

      JapaneseUI.onTypingResetCallback(() => {
        resetTypingSession();
      });

      JapaneseUI.onBackupExportCallback(() => {
        exportBackup();
      });

      JapaneseUI.onBackupFileSelectedCallback((file) => {
        previewBackupFile(file);
      });

      JapaneseUI.onBackupImportCallback((mode) => {
        importSelectedBackup(mode);
      });

      JapaneseUI.onClearDataCallback(() => {
        clearLocalData();
      });

      JapaneseUI.onKanaExportCallback((settings) => {
        exportKanaPrint(settings);
      });

      JapaneseUI.onStudyNowCallback(() => {
        startRecommendedSession();
      });

      JapaneseUI.onDiagnosticCallback(() => {
        startDiagnosticSession();
      });

      JapaneseUI.onGuidedTrailCallback((trailId) => {
        startGuidedTrail(trailId);
      });

      JapaneseUI.onQuickSessionCallback((sessionId) => {
        startQuickSession(sessionId);
      });

      JapaneseUI.onGamificationGoalsChangeCallback((goals) => {
        JapaneseStorage.setGamificationGoals(goals);
      });

      JapaneseUI.onErrorPracticeCallback((payload) => {
        startErrorPractice(payload);
      });

      setupSearch();
      setupHostListener();
      setupStudyTimeTracking();
      setupStorageListener();
      setupFirebaseSync();
      loadStats();
    }).catch(err => {
      console.error('Failed to load character data:', err);
      if (loadingEl) {
        loadingEl.innerHTML = '<div class="empty-state"><p>Erro ao carregar dados. Tente novamente.</p></div>';
      }
    });
  }

  let currentQuizQuestion = null;

  function loadJSON(path) {
    return fetch(path).then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function applyFilters() {
    if (JapaneseUI.getCurrentView() === 'dictionary') {
      renderDictionary();
      return;
    }
    if (JapaneseUI.getCurrentView() === 'quiz') {
      renderQuiz();
      return;
    }
    if (JapaneseUI.getCurrentView() === 'typing') {
      renderTyping();
      return;
    }
    if (JapaneseUI.getCurrentView() === 'data' || JapaneseUI.getCurrentView() === 'home') return;

    const query = document.getElementById('search-input').value;
    const filters = JapaneseUI.getFilters();
    const results = JapaneseSearch.search(query, filters);
    JapaneseUI.renderGrid(results);
  }

  function setupSearch() {
    const input = document.getElementById('search-input');
    const dictionaryInput = document.getElementById('dictionary-search-input');

    if (input) {
      input.addEventListener('input', () => {
        if (JapaneseUI.getCurrentView() !== 'characters') return;
        const filters = JapaneseUI.getFilters();
        JapaneseSearch.debouncedSearch(input.value, filters);
      });
    }

    if (dictionaryInput) {
      dictionaryInput.addEventListener('input', () => {
        clearTimeout(dictionarySearchTimer);
        dictionarySearchTimer = setTimeout(renderDictionary, 150);
      });
    }
  }

  function setupHostListener() {
    window.addEventListener('message', (event) => {
      if (!isAllowedHostMessage(event)) return;

      const data = event.data || {};
      switch (data.type) {
        case 'theme':
          document.documentElement.dataset.theme = normalizeTheme(data.value || data.payload || '');
          break;
        case 'refresh':
          location.reload();
          break;
        case 'focus':
          window.focus();
          break;
      }
    });
  }

  function isAllowedHostMessage(event) {
    if (!isTrustedHostSource(event.source)) return false;
    if (!isAllowedOrigin(event.origin)) return false;
    return isValidHostMessage(event.data);
  }

  function isTrustedHostSource(source) {
    return source === window.parent || source === window.opener || source === window;
  }

  function isAllowedOrigin(origin) {
    if (origin === window.location.origin) return true;
    if (origin === 'null' && window.location.protocol === 'file:') return true;
    return false;
  }

  function isValidHostMessage(data) {
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') return false;
    return ['theme', 'refresh', 'focus'].includes(data.type);
  }

  function normalizeTheme(theme) {
    const value = String(theme || '').toLowerCase();
    if (['dark', 'escuro', 'night'].includes(value)) return 'dark';
    if (['light', 'claro', 'day'].includes(value)) return 'light';
    return '';
  }

  function setupStorageListener() {
    document.addEventListener('japanese:storage', (e) => {
      const { type, data } = e.detail;
      if (type === 'favorite-added' || type === 'favorite-removed') {
        if (JapaneseUI.getFilters().onlyFavorites) {
          applyFilters();
        } else {
          JapaneseUI.updateCardFavoriteState(data.charId);
        }
        loadStats();
      } else if (
        type === 'progress-updated' ||
        type === 'study-time-updated' ||
        type === 'quiz-updated' ||
        type === 'typing-updated' ||
        type === 'gamification-updated'
      ) {
        loadStats();
      } else if (type === 'srs-updated') {
        if (JapaneseUI.getFilters().dueReview) applyFilters();
        loadStats();
      } else if (
        type === 'dictionary-favorite-added' ||
        type === 'dictionary-favorite-removed' ||
        type === 'dictionary-history-updated'
      ) {
        if (JapaneseUI.getCurrentView() === 'dictionary') renderDictionary();
      } else if (type === 'backup-imported') {
        applyFilters();
        renderDictionary();
        JapaneseQuiz.resetStats();
        loadStats();
      } else if (type === 'data-cleared') {
        JapaneseUI.setFilters({ script: 'hiragana', category: '', onlyFavorites: false, dueReview: false });
        applyFilters();
        renderDictionary();
        JapaneseQuiz.resetStats();
        loadStats();
      }
    });
  }

  async function setupFirebaseSync() {
    try {
      const module = await import('./firebase/japanese-firebase-sync.js');
      const result = await module.japaneseFirebaseSync.init({ storage: JapaneseStorage });
      if (result?.enabled) {
        console.info('[japanese-firebase-sync] enabled for current user');
      }
    } catch (error) {
      console.info('[japanese-firebase-sync] unavailable in this runtime', error?.message || error);
    }
  }

  async function exportBackup() {
    try {
      const backup = await JapaneseStorage.exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `japanese-study-backup-${date}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      JapaneseUI.showBackupStatus('Backup exportado com sucesso.', 'success');
    } catch (error) {
      console.error('Failed to export backup:', error);
      JapaneseUI.showBackupStatus('Não foi possível exportar o backup.', 'error');
    }
  }

  async function previewBackupFile(file) {
    selectedBackup = null;

    if (!file) {
      JapaneseUI.updateBackupPreview(null);
      return;
    }

    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      const validation = JapaneseStorage.validateImportedBackup(backup);
      selectedBackup = validation.ok ? backup : null;
      JapaneseUI.updateBackupPreview(validation, file.name);
    } catch {
      JapaneseUI.updateBackupPreview({
        ok: false,
        errors: ['Não foi possível ler o arquivo JSON selecionado.'],
        summary: {}
      }, file.name);
    }
  }

  async function importSelectedBackup(mode) {
    if (!selectedBackup) {
      JapaneseUI.showBackupStatus('Selecione um backup válido antes de importar.', 'error');
      return;
    }

    if (mode === 'replace') {
      const confirmed = window.confirm('Substituir os dados atuais pelo backup selecionado? Esta ação remove progresso, favoritos e SRS atuais antes da importação.');
      if (!confirmed) return;
    }

    try {
      await JapaneseStorage.importBackup(selectedBackup, mode);
      selectedBackup = null;
      JapaneseUI.showBackupStatus(mode === 'replace'
        ? 'Backup importado substituindo os dados atuais.'
        : 'Backup importado e mesclado com os dados atuais.', 'success');
      applyFilters();
      renderDictionary();
      JapaneseQuiz.resetStats();
      loadStats();
    } catch (error) {
      console.error('Failed to import backup:', error);
      JapaneseUI.showBackupStatus(error.message || 'Não foi possível importar o backup.', 'error');
    }
  }

  async function clearLocalData() {
    const confirmed = window.confirm('Excluir todos os dados locais de estudo deste navegador? Esta ação remove histórico, progresso, SRS, favoritos e preferências. Exporte um backup antes se quiser preservar algo.');
    if (!confirmed) return;

    try {
      await JapaneseStorage.clearAllUserData();
      selectedBackup = null;
      JapaneseUI.updateBackupPreview(null);
      JapaneseUI.resetClearDataConfirmation();
      JapaneseUI.showClearDataStatus('Dados locais excluídos com sucesso.', 'success');
      applyFilters();
      renderDictionary();
      JapaneseQuiz.resetStats();
      loadStats();
    } catch (error) {
      console.error('Failed to clear local data:', error);
      JapaneseUI.showClearDataStatus('Não foi possível excluir os dados locais.', 'error');
    }
  }

  async function exportKanaPrint(settings = {}) {
    await JapaneseKanaPrintExport.print({
      ...settings,
      characters: allData
    });
  }

  async function renderDictionary() {
    const dictionaryInput = document.getElementById('dictionary-search-input');
    const query = dictionaryInput ? dictionaryInput.value : '';
    const filters = JapaneseUI.getDictionaryFilters();
    let results = [];

    if (filters.tab === 'history') {
      const history = await JapaneseStorage.getDictionaryHistory(50);
      const ids = history.map(item => item.charId);
      results = JapaneseDictionary.filterByIds(ids, filters);
      results = filterDictionaryWords(results, query);
    } else if (filters.tab === 'favorites') {
      const ids = JapaneseStorage.getDictionaryFavorites();
      results = JapaneseDictionary.filterByIds(ids, filters);
      results = filterDictionaryWords(results, query);
    } else {
      results = JapaneseDictionary.search(query, filters);
    }

    JapaneseUI.renderDictionary(results);
  }

  function renderQuiz() {
    currentQuizQuestion = JapaneseQuiz.nextQuestion(JapaneseUI.getQuizSettings());
    JapaneseUI.renderQuiz(currentQuizQuestion, JapaneseQuiz.getStats(), undefined, activeQuizContext);
    completeDiagnosticIfNeeded(currentQuizQuestion, JapaneseQuiz.getStats());
  }

  function renderTyping(extra = {}) {
    const exercise = activeTypingSession?.getCurrentExercise() || null;
    const summary = activeTypingSession?.getSummary() || null;
    JapaneseUI.renderTyping({
      started: Boolean(activeTypingSession),
      complete: Boolean(summary?.completed),
      exercise,
      summary,
      currentValue: currentTypingValue,
      feedback: exercise ? JapaneseTypingEvaluator.getLiveFeedback(currentTypingValue, exercise) : null,
      result: currentTypingResult,
      ...extra
    });
  }

  function startTypingSession(settings = JapaneseUI.getTypingSettings()) {
    const session = JapaneseTypingContentProvider.buildSession(settings);
    if (!session.exercises.length) {
      JapaneseUI.renderTyping({
        started: false,
        error: 'Nenhum exercicio local encontrado para estes filtros.'
      });
      return;
    }

    activeTypingSession = createTypingSession(session.exercises, session.settings);
    currentTypingValue = '';
    currentTypingResult = null;
    persistTypingSettings();
    renderTyping();
  }

  function submitTypingAnswer(value) {
    if (!activeTypingSession) {
      startTypingSession();
      return;
    }

    const exercise = activeTypingSession.getCurrentExercise();
    const preview = JapaneseTypingEvaluator.evaluateAnswer(value, exercise);
    if (preview.empty) {
      currentTypingResult = preview;
      currentTypingValue = value;
      renderTyping();
      return;
    }

    const submitted = activeTypingSession.submit(value);
    currentTypingResult = submitted.result;
    currentTypingValue = '';

    const summary = activeTypingSession.getSummary();
    if (summary.completed) {
      JapaneseStorage.saveTypingSession(summary).then(() => {
        JapaneseStorage.emitChange('typing-updated', summary);
      }).catch(() => {});
    }

    renderTyping();
  }

  function resetTypingSession() {
    activeTypingSession = null;
    currentTypingValue = '';
    currentTypingResult = null;
    renderTyping();
  }

  async function startRecommendedSession() {
    const context = await buildAdaptiveContext();
    const session = JapaneseStudyEngine.buildSession(context);
    activeQuizContext = {
      type: 'recommended',
      title: session.title || 'Sess\u00e3o recomendada',
      description: session.description || 'Sess\u00e3o montada com base no seu progresso atual.',
      assistant: session.assistant || null
    };
    JapaneseUI.applyQuizSettings(session.quiz);
    persistQuizSettings();
    JapaneseQuiz.resetStats(Number(session.quiz.limit || 10));
    JapaneseUI.setCurrentView('quiz');
    renderQuiz();
  }

  function startDiagnosticSession() {
    const settings = {
      mode: 'multiple-choice',
      script: 'all',
      categories: ['gojuuon'],
      limit: '10',
      includeMistakeReviews: false
    };
    activeQuizContext = {
      type: 'diagnostic',
      title: 'Diagn\u00f3stico inicial',
      description: 'Responda 10 perguntas de Gojuuon em hiragana e katakana. As revis\u00f5es de erro ficam desativadas nesta sess\u00e3o.'
    };
    JapaneseUI.applyQuizSettings(settings);
    persistDiagnostic({ skipped: false, startedAt: new Date().toISOString(), weakScript: null });
    JapaneseQuiz.resetStats(10);
    JapaneseUI.setCurrentView('quiz');
    renderQuiz();
  }

  function startGuidedTrail(trailId) {
    const trail = JapaneseRecommendationEngine.getGuidedTrail(trailId);
    if (!trail) return;
    startPresetSession(trail, 'guided');
  }

  function startQuickSession(sessionId) {
    const session = JapaneseRecommendationEngine.getQuickSession(sessionId);
    if (!session) return;
    startPresetSession(session, 'quick');
  }

  function startErrorPractice(payload = {}) {
    const script = ['hiragana', 'katakana', 'kanji'].includes(payload.script) ? payload.script : 'all';
    const categories = payload.category ? [payload.category] : ['gojuuon', 'dakuon', 'handakuon', 'youon', 'N5'];
    const settings = {
      mode: script === 'kanji' ? 'multiple-choice' : 'kana-typing',
      script,
      categories,
      limit: '10',
      includeMistakeReviews: true
    };

    activeQuizContext = {
      type: 'recommended',
      title: 'Treino focado em erros',
      description: payload.char
        ? 'Rodada curta para estabilizar ' + payload.char + ' e itens parecidos.'
        : 'Rodada curta montada a partir do caderno de erros.'
    };
    JapaneseUI.applyQuizSettings(settings);
    persistQuizSettings();
    JapaneseQuiz.resetStats(10);
    JapaneseUI.setCurrentView('quiz');
    renderQuiz();
  }

  function startPresetSession(preset, type) {
    const settings = {
      mode: preset.quiz?.mode || 'multiple-choice',
      script: preset.quiz?.script || 'all',
      categories: Array.isArray(preset.quiz?.categories) ? preset.quiz.categories : ['gojuuon'],
      limit: String(preset.quiz?.limit || 10),
      includeMistakeReviews: preset.quiz?.includeMistakeReviews !== false
    };

    activeQuizContext = {
      type: 'recommended',
      title: preset.title || 'Sess\u00e3o de estudo',
      description: type === 'guided'
        ? (preset.description || 'Trilha guiada de estudo.')
        : 'Sess\u00e3o r\u00e1pida configurada para estudar agora.'
    };
    JapaneseUI.applyQuizSettings(settings);
    persistQuizSettings();
    JapaneseQuiz.resetStats(Number(settings.limit || 10));
    JapaneseUI.setCurrentView('quiz');
    renderQuiz();
  }

  function filterDictionaryWords(words, query) {
    const q = String(query || '').toLowerCase().trim();
    if (!q) return words;

    return words.filter(word =>
      String(word.word || '').toLowerCase().includes(q) ||
      String(word.reading || '').toLowerCase().includes(q) ||
      String(word.romaji || '').toLowerCase().includes(q) ||
      String(word.definition || '').toLowerCase().includes(q) ||
      String(word.category || '').toLowerCase().includes(q)
    );
  }

  async function loadStats() {
    try {
      const favs = JapaneseStorage.getFavorites();
      const stats = await JapaneseStorage.getStats();
      const srsStats = JapaneseStorage.getSrsStats(allData);
      const quizStats = await JapaneseStorage.getQuizStats();
      const typingStats = await JapaneseStorage.getTypingStats();
      const difficulty = await JapaneseStorage.getDifficultyMap(8);
      const completion = getCompletion(stats.studiedIds || []);
      const settings = JapaneseStorage.getSettings();
      const gamificationGoals = JapaneseStorage.getGamificationGoals();
      const context = {
        characters: allData,
        stats,
        srsStats,
        quizStats,
        typingStats,
        completion,
        difficulty,
        studiedIds: stats.studiedIds || [],
        diagnostic: settings.diagnostic || {},
        goals: gamificationGoals,
        persistedAchievements: settings.gamificationAchievements || {}
      };
      const gamificationStats = await JapaneseStorage.getGamificationStats(context);
      const achievementSync = JapaneseStorage.syncGamificationAchievements(gamificationStats.achievements);
      if (achievementSync.newlyUnlocked.length > 0) {
        const unlocked = new Set(achievementSync.newlyUnlocked);
        gamificationStats.achievements = gamificationStats.achievements.map(item => ({
          ...item,
          isNew: unlocked.has(item.id)
        }));
      }
      context.gamificationStats = gamificationStats;
      context.gamificationEvents = gamificationStats.events;
      const level = JapaneseLearningLevels.calculate(context);
      const recommendation = JapaneseRecommendationEngine.recommend(context);
      JapaneseUI.updateStats({
        totalChars: allData.length,
        favorites: favs.length,
        studied: stats.totalStudied || 0
      });
      JapaneseUI.updateDashboard({
        stats,
        srsStats,
        quizStats,
        typingStats,
        gamificationStats,
        completion,
        favorites: favs.length,
        level,
        recommendation,
        difficulty,
        syllabus: JapaneseRecommendationEngine.SYLLABUS,
        guidedTrails: JapaneseRecommendationEngine.GUIDED_TRAILS,
        quickSessions: JapaneseRecommendationEngine.QUICK_SESSIONS
      });
    } catch {
      JapaneseUI.updateStats({
        totalChars: allData.length,
        favorites: JapaneseStorage.getFavorites().length,
        studied: 0
      });
      JapaneseUI.updateDashboard({
        stats: {},
        srsStats: JapaneseStorage.getSrsStats(allData),
        typingStats: { sessions: 0, errors: 0, totalKanaTyped: 0, averageAccuracy: 0, recentErrors: [] },
        gamificationStats: JapaneseLearningLevels.calculate({}),
        completion: getCompletion([]),
        favorites: JapaneseStorage.getFavorites().length,
        level: JapaneseLearningLevels.calculate({}),
        recommendation: JapaneseRecommendationEngine.recommend({ characters: allData }),
        difficulty: [],
        syllabus: JapaneseRecommendationEngine.SYLLABUS,
        guidedTrails: JapaneseRecommendationEngine.GUIDED_TRAILS,
        quickSessions: JapaneseRecommendationEngine.QUICK_SESSIONS
      });
    }
  }

  async function buildAdaptiveContext() {
    const stats = await JapaneseStorage.getStats();
    const srsStats = JapaneseStorage.getSrsStats(allData);
    const quizStats = await JapaneseStorage.getQuizStats();
    const typingStats = await JapaneseStorage.getTypingStats();
    const difficulty = await JapaneseStorage.getDifficultyMap(8);
    const completion = getCompletion(stats.studiedIds || []);
    const settings = JapaneseStorage.getSettings();
    const gamificationGoals = JapaneseStorage.getGamificationGoals();
    const context = {
      characters: allData,
      stats,
      srsStats,
      quizStats,
      typingStats,
      completion,
      difficulty,
      studiedIds: stats.studiedIds || [],
      diagnostic: settings.diagnostic || {},
      goals: gamificationGoals,
      persistedAchievements: settings.gamificationAchievements || {}
    };
    const gamificationStats = await JapaneseStorage.getGamificationStats(context);
    return {
      ...context,
      gamificationStats,
      gamificationEvents: gamificationStats.events
    };
  }

  function getSavedQuizSettings() {
    const settings = JapaneseStorage.getSettings();
    return {
      mode: settings.quiz?.mode || 'recognition',
      script: settings.quiz?.script || 'all',
      categories: Array.isArray(settings.quiz?.categories) ? settings.quiz.categories : ['gojuuon', 'dakuon', 'handakuon', 'youon'],
      limit: settings.quiz?.limit || '10',
      includeMistakeReviews: settings.quiz?.includeMistakeReviews !== false
    };
  }

  function getSavedTypingSettings() {
    const settings = JapaneseStorage.getSettings();
    return {
      script: settings.typing?.script || 'hiragana',
      size: settings.typing?.size || 'small',
      mode: settings.typing?.mode || 'copy',
      level: settings.typing?.level || 'beginner',
      category: settings.typing?.category || 'all',
      limit: settings.typing?.limit || '5'
    };
  }

  function persistQuizSettings() {
    const settings = JapaneseStorage.getSettings();
    JapaneseStorage.setSettings({
      ...settings,
      quiz: JapaneseUI.getQuizSettings()
    });
  }

  function persistTypingSettings() {
    const settings = JapaneseStorage.getSettings();
    JapaneseStorage.setSettings({
      ...settings,
      typing: JapaneseUI.getTypingSettings()
    });
  }

  function persistDiagnostic(diagnostic) {
    const settings = JapaneseStorage.getSettings();
    JapaneseStorage.setSettings({
      ...settings,
      diagnostic: {
        ...(settings.diagnostic || {}),
        ...diagnostic
      }
    });
  }

  function completeDiagnosticIfNeeded(question, stats) {
    if (!question || question.type !== 'complete') return;
    const settings = JapaneseStorage.getSettings();
    const diagnostic = settings.diagnostic || {};
    if (!diagnostic.startedAt || diagnostic.completedAt) return;

    const accuracy = stats.accuracy || 0;
    persistDiagnostic({
      completedAt: new Date().toISOString(),
      answered: stats.answered || 0,
      accuracy,
      level: accuracy >= 80 ? 'intermediario' : accuracy >= 50 ? 'iniciante-plus' : 'iniciante',
      weakScript: accuracy < 70 ? 'hiragana' : null
    });
    loadStats();
  }

  function getCompletion(studiedIds) {
    const studied = new Set(studiedIds);
    const countStudied = (items) => items.filter(c => studied.has(JapaneseSearch.buildId(c))).length;

    return {
      hiragana: {
        total: hiraganaData.length,
        studied: countStudied(hiraganaData)
      },
      katakana: {
        total: katakanaData.length,
        studied: countStudied(katakanaData)
      },
      kanji: {
        total: kanjiData.length,
        studied: countStudied(kanjiData)
      }
    };
  }

  function setupStudyTimeTracking() {
    setInterval(saveStudyTimeSnapshot, 60000);
    window.addEventListener('pagehide', saveStudyTimeSnapshot);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveStudyTimeSnapshot();
    });
  }

  function saveStudyTimeSnapshot() {
    const elapsedMinutes = Math.floor((Date.now() - sessionStartedAt) / 60000);
    const unsavedMinutes = elapsedMinutes - lastSavedMinute;
    if (unsavedMinutes <= 0) return;

    lastSavedMinute = elapsedMinutes;
    JapaneseStorage.saveStudyTime(unsavedMinutes).then(() => {
      JapaneseStorage.emitChange('study-time-updated', { minutes: unsavedMinutes });
    }).catch(() => {});
  }

  document.addEventListener('DOMContentLoaded', init);

  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    init();
  }

  return { init, applyFilters };
})();
