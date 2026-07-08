import {
  SRS_MAX_INTERVAL,
  createSrsRecord,
  calculateNextSrs,
  normalizeSrsRecord,
  pickSrsBase,
  clampInteger,
  clampNumber,
  isValidDayKey,
  getDayKey,
  calculateStreak
} from './srs-engine.js';
import { JapaneseGamificationEngine } from './gamification-engine.js';

export const JapaneseStorage = (() => {
  const DB_NAME = 'JapaneseStudyDB';
  const DB_VERSION = 2;
  const STORE_NAME = 'japanese_progress';
  const FAVORITES_KEY = 'japanese_favorites';
  const DICTIONARY_FAVORITES_KEY = 'japanese_dictionary_favorites';
  const SRS_KEY = 'japanese_srs';
  const SETTINGS_KEY = 'japanese_settings';
  const BACKUP_FORMAT = 'japanese-study-backup';
  const BACKUP_SCHEMA_VERSION = 1;

  let dbInstance = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      if (dbInstance) return resolve(dbInstance);
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const store = db.objectStoreNames.contains(STORE_NAME)
          ? event.target.transaction.objectStore(STORE_NAME)
          : db.createObjectStore(STORE_NAME, { keyPath: 'id' });

        ensureIndex(store, 'timestamp', 'timestamp');
        ensureIndex(store, 'type', 'type');
        ensureIndex(store, 'charId', 'charId');
        ensureIndex(store, 'schemaVersion', 'schemaVersion');
      };
      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        resolve(dbInstance);
      };
      request.onerror = () => reject(request.error);
    });
  }

  function ensureIndex(store, name, keyPath, options = { unique: false }) {
    if (!store.indexNames.contains(name)) {
      store.createIndex(name, keyPath, options);
    }
  }

  function getFavorites() {
    try {
      const data = localStorage.getItem(FAVORITES_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  function setFavorites(favs) {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
    } catch (e) {
      console.warn('Failed to save favorites:', e);
    }
  }

  function toggleFavorite(charId) {
    const favs = getFavorites();
    const idx = favs.indexOf(charId);
    if (idx === -1) {
      favs.push(charId);
      setFavorites(favs);
      return { added: true, favorites: favs };
    } else {
      favs.splice(idx, 1);
      setFavorites(favs);
      return { added: false, favorites: favs };
    }
  }

  function isFavorite(charId) {
    return getFavorites().includes(charId);
  }

  function getSrsMap() {
    try {
      const data = localStorage.getItem(SRS_KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  function setSrsMap(map) {
    try {
      localStorage.setItem(SRS_KEY, JSON.stringify(map));
    } catch (e) {
      console.warn('Failed to save SRS data:', e);
    }
  }

  function getSrsStatus(charId) {
    const map = getSrsMap();
    return normalizeSrsRecord(map[charId] || createSrsRecord(charId), charId);
  }

  function reviewSrs(charData, rating) {
    const charId = typeof charData === 'string' ? charData : buildStudyId(charData);
    const map = getSrsMap();
    const now = Date.now();
    const today = getDayKey(Date.now());
    const current = normalizeSrsRecord(map[charId] || createSrsRecord(charId), charId);
    const base = current.lastReviewedDay === today && current.reviewBase
      ? normalizeSrsRecord(current.reviewBase, charId)
      : current;
    const reviewed = calculateNextSrs(base, rating, now);

    map[charId] = {
      ...reviewed,
      schemaVersion: 1,
      entityType: 'srs-record',
      charId,
      char: charData.char || current.char,
      romaji: charData.romaji || current.romaji,
      script: charData.script || current.script,
      category: charData.category || current.category,
      meanings: charData.meanings || current.meanings,
      onyomi: charData.onyomi || current.onyomi,
      kunyomi: charData.kunyomi || current.kunyomi,
      level: charData.level || current.level,
      lastReviewed: new Date(now).toISOString(),
      lastReviewedDay: today,
      lastRating: rating,
      updatedAt: now,
      reviewBase: current.lastReviewedDay === today && current.reviewBase
        ? current.reviewBase
        : pickSrsBase(current)
    };
    setSrsMap(map);
    saveGamificationEvent(JapaneseGamificationEngine.buildSrsEvent(charData, rating, map[charId]))
      .then(() => emitChange('gamification-updated', { source: 'srs', charId }))
      .catch(() => {});
    return map[charId];
  }

  function isSrsDue(charId) {
    const status = getSrsStatus(charId);
    return !status.nextReview || status.nextReview <= getDayKey(Date.now());
  }

  function getSrsStats(characters = []) {
    const map = getSrsMap();
    const stats = {
      due: 0,
      new: 0,
      learning: 0,
      review: 0,
      mastered: 0,
      totalTracked: Object.keys(map).length
    };

    characters.forEach(char => {
      const id = buildStudyId(char);
      const status = normalizeSrsRecord(map[id] || createSrsRecord(id), id);
      if (status.state === 'new') stats.new++;
      if (status.state === 'learning') stats.learning++;
      if (status.state === 'review') stats.review++;
      if (status.state === 'mastered') stats.mastered++;
      if (!status.nextReview || status.nextReview <= getDayKey(Date.now())) stats.due++;
    });

    return stats;
  }

  async function saveProgress(data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const timestamp = Number(data.timestamp || Date.now());
      const record = {
        id: data.id || `${data.type}_${data.charId}_${timestamp}`,
        schemaVersion: data.schemaVersion || 1,
        entityType: data.entityType || 'progress-record',
        charId: data.charId,
        type: data.type,
        value: data.value,
        timestamp,
      char: data.char,
      romaji: data.romaji,
      script: data.script,
      category: data.category,
      meanings: data.meanings,
      onyomi: data.onyomi,
      kunyomi: data.kunyomi,
      level: data.level,
      word: data.word,
        definition: data.definition,
        prompt: data.prompt,
        expected: data.expected,
        answered: data.answered,
        mode: data.mode,
        review: data.review,
        sessionId: data.sessionId,
        exerciseId: data.exerciseId,
        promptPt: data.promptPt,
        referenceJapanese: data.referenceJapanese,
        correct: data.correct,
        accuracy: data.accuracy,
        durationMs: data.durationMs,
        kanaTyped: data.kanaTyped,
        kanaPerMinute: data.kanaPerMinute,
        errors: data.errors,
        total: data.total,
        completed: data.completed,
        settings: data.settings,
        eventType: data.eventType,
        source: data.source,
        action: data.action,
        xp: data.xp,
        skill: data.skill,
        itemId: data.itemId,
        details: data.details,
        syncStatus: data.syncStatus,
        createdAt: data.createdAt
      };
      const req = store.put(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveGamificationEvent(event) {
    if (!event) return null;
    return saveProgress({
      ...event,
      type: 'gamification_event',
      value: event.xp || event.value || 0
    });
  }

  async function getAllProgress() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []).map(normalizeProgressRecord));
      req.onerror = () => reject(req.error);
    });
  }

  async function getHistory(type, limit = 50) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('type');
      const req = index.getAll(IDBKeyRange.only(type), limit);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function getStats() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const records = req.result || [];
        const views = records
          .filter(r => r.type === 'view')
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        const studied = new Set(views.map(r => r.charId));
        const totalTime = records
          .filter(r => r.type === 'study_time')
          .reduce((sum, r) => sum + (r.value || 0), 0);
        resolve({
          totalStudied: studied.size,
          studyTime: totalTime,
          totalRecords: records.length,
          streak: calculateStreak(views),
          activity: buildActivityMap(views),
          recent: getRecentViews(views, 8),
          studiedIds: [...studied]
        });
      };
      req.onerror = () => reject(req.error);
    });
  }

  function buildActivityMap(views) {
    return views.reduce((map, record) => {
      const key = getDayKey(record.timestamp);
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {});
  }

  function getRecentViews(views, limit) {
    const seen = new Set();
    const recent = [];

    views.forEach(record => {
      if (seen.has(record.charId) || recent.length >= limit) return;
      seen.add(record.charId);
      recent.push(record);
    });

    return recent;
  }

  function getDictionaryFavorites() {
    try {
      const data = localStorage.getItem(DICTIONARY_FAVORITES_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  function setDictionaryFavorites(favs) {
    try {
      localStorage.setItem(DICTIONARY_FAVORITES_KEY, JSON.stringify(favs));
    } catch (e) {
      console.warn('Failed to save dictionary favorites:', e);
    }
  }

  function toggleDictionaryFavorite(wordId) {
    const favs = getDictionaryFavorites();
    const idx = favs.indexOf(wordId);
    if (idx === -1) {
      favs.push(wordId);
      setDictionaryFavorites(favs);
      return { added: true, favorites: favs };
    }

    favs.splice(idx, 1);
    setDictionaryFavorites(favs);
    return { added: false, favorites: favs };
  }

  function isDictionaryFavorite(wordId) {
    return getDictionaryFavorites().includes(wordId);
  }

  async function markDictionaryViewed(word) {
    return saveProgress({
      type: 'dictionary_view',
      charId: word.id,
      value: 1,
      word: word.word,
      romaji: word.romaji,
      script: word.script,
      category: word.category,
      definition: word.definition
    });
  }

  async function getDictionaryHistory(limit = 20) {
    const records = await getHistory('dictionary_view', 500);
    const sorted = records.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const seen = new Set();
    const history = [];

    sorted.forEach(record => {
      if (seen.has(record.charId) || history.length >= limit) return;
      seen.add(record.charId);
      history.push(record);
    });

    return history;
  }

  async function saveQuizAnswer(question, result) {
    if (!question || !question.target || !result || result.empty || result.locked) return null;

    const target = question.target;
    const answerRecord = await saveProgress({
      type: result.correct ? 'quiz_answer' : 'quiz_error',
      charId: buildStudyId(target),
      value: result.correct ? 1 : 0,
      char: target.char,
      romaji: target.romaji,
      script: target.script,
      category: target.category,
      meanings: target.meanings,
      onyomi: target.onyomi,
      kunyomi: target.kunyomi,
      level: target.level,
      prompt: question.prompt,
      expected: result.expected,
      answered: result.answered,
      mode: question.mode || question.type,
      review: Boolean(question.review)
    });
    await saveGamificationEvent(JapaneseGamificationEngine.buildQuizEvent(question, result));
    return answerRecord;
  }

  async function saveTypingSession(summary) {
    if (!summary || !summary.completed) return null;
    const sessionId = `typing_${summary.startedAt || Date.now()}`;
    const sessionRecord = await saveProgress({
      type: 'typing_session',
      charId: sessionId,
      sessionId,
      value: summary.correct || 0,
      mode: summary.settings?.mode || 'copy',
      script: summary.settings?.script || 'hiragana',
      category: summary.settings?.category,
      accuracy: summary.accuracy,
      durationMs: summary.durationMs,
      kanaTyped: summary.kanaTyped,
      kanaPerMinute: summary.kanaPerMinute,
      errors: summary.errors,
      total: summary.total,
      completed: summary.completed,
      settings: summary.settings
    });

    const steps = Array.isArray(summary.steps) ? summary.steps : [];
    await Promise.all(steps.map((step, index) => saveProgress({
      type: step.correct ? 'typing_step' : 'typing_error',
      charId: step.exerciseId || `${sessionId}_${index}`,
      sessionId,
      exerciseId: step.exerciseId,
      value: step.correct ? 1 : 0,
      promptPt: step.promptPt,
      expected: step.expected,
      answered: step.answered,
      correct: step.correct,
      accuracy: step.accuracy,
      mode: summary.settings?.mode || 'copy',
      script: summary.settings?.script || 'hiragana',
      category: summary.settings?.category
    })));

    await saveGamificationEvent(JapaneseGamificationEngine.buildTypingEvent({
      ...summary,
      sessionId
    }));

    return sessionRecord;
  }

  async function getTypingStats() {
    const records = await getAllProgress();
    const sessions = records.filter(record => record.type === 'typing_session');
    const errors = records.filter(record => record.type === 'typing_error');
    const totalKanaTyped = sessions.reduce((sum, record) => sum + Number(record.kanaTyped || 0), 0);
    const averageAccuracy = sessions.length
      ? Math.round(sessions.reduce((sum, record) => sum + Number(record.accuracy || 0), 0) / sessions.length)
      : 0;

    return {
      sessions: sessions.length,
      errors: errors.length,
      totalKanaTyped,
      averageAccuracy,
      recentErrors: errors.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 10)
    };
  }

  async function getGamificationEvents(limit = 1000) {
    const records = await getAllProgress();
    return records
      .filter(record => record.type === 'gamification_event' || record.entityType === 'gamification-event')
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, limit);
  }

  async function getGamificationStats(context = {}) {
    const events = await getGamificationEvents(1000);
    const settings = getSettings();
    return {
      ...JapaneseGamificationEngine.summarize({
        ...context,
        events,
        goals: getGamificationGoals(),
        persistedAchievements: settings.gamificationAchievements || {}
      }),
      events
    };
  }

  function getGamificationGoals() {
    const settings = getSettings();
    return JapaneseGamificationEngine.normalizeGoals(settings.gamificationGoals || {});
  }

  function setGamificationGoals(goals) {
    const settings = getSettings();
    const normalized = JapaneseGamificationEngine.normalizeGoals(goals || {});
    setSettings({
      ...settings,
      gamificationGoals: normalized
    });
    emitChange('gamification-updated', { source: 'goals', goals: normalized });
    return normalized;
  }

  function syncGamificationAchievements(achievements = []) {
    const settings = getSettings();
    const current = settings.gamificationAchievements && typeof settings.gamificationAchievements === 'object'
      ? { ...settings.gamificationAchievements }
      : {};
    const now = new Date().toISOString();
    const newlyUnlocked = [];

    achievements.forEach(item => {
      if (!item?.id || !item.unlocked) return;
      const previous = current[item.id] || {};
      if (!previous.unlocked) {
        newlyUnlocked.push(item.id);
      }
      current[item.id] = {
        ...previous,
        id: item.id,
        title: item.title,
        unlocked: true,
        unlockedAt: previous.unlockedAt || now,
        seenAt: previous.seenAt || now
      };
    });

    if (newlyUnlocked.length > 0) {
      setSettings({
        ...settings,
        gamificationAchievements: current
      });
    }

    return {
      achievements: current,
      newlyUnlocked
    };
  }

  async function getQuizStats() {
    const records = await getAllProgress();
    const answers = records.filter(record => record.type === 'quiz_answer' || record.type === 'quiz_error');
    const errors = answers.filter(record => record.type === 'quiz_error');
    const correct = answers.length - errors.length;

    return {
      answered: answers.length,
      correct,
      errors: errors.length,
      accuracy: answers.length ? Math.round((correct / answers.length) * 100) : 0,
      recentErrors: errors.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 20)
    };
  }

  async function getDifficultyMap(limit = 8) {
    const records = await getAllProgress();
    const quizRecords = records.filter(record => record.type === 'quiz_answer' || record.type === 'quiz_error');
    const grouped = new Map();

    quizRecords.forEach(record => {
      const key = record.charId;
      if (!key) return;
      const current = grouped.get(key) || {
        charId: key,
        char: record.char,
        romaji: record.romaji,
        script: record.script,
        category: record.category,
        correct: 0,
        errors: 0,
        total: 0,
        lastSeen: 0
      };
      current.total += 1;
      current.lastSeen = Math.max(current.lastSeen, record.timestamp || 0);
      if (record.type === 'quiz_error') current.errors += 1;
      if (record.type === 'quiz_answer') current.correct += 1;
      grouped.set(key, current);
    });

    return [...grouped.values()]
      .map(item => ({
        ...item,
        accuracy: item.total ? Math.round((item.correct / item.total) * 100) : 0,
        state: getDifficultyState(item)
      }))
      .sort((a, b) => (b.errors - a.errors) || (a.accuracy - b.accuracy) || (b.lastSeen - a.lastSeen))
      .slice(0, limit);
  }

  function getDifficultyState(item) {
    if ((item.errors || 0) >= 3 && (item.correct || 0) === 0) return 'Crítico';
    if ((item.accuracy || 0) < 50 && (item.total || 0) >= 2) return 'Reforçar';
    if ((item.accuracy || 0) < 75) return 'Atenção';
    return 'Estável';
  }

  async function saveStudyTime(minutes) {
    return saveProgress({
      type: 'study_time',
      charId: 'session',
      value: minutes
    });
  }

  async function markAsViewed(charData) {
    const charId = typeof charData === 'string' ? charData : charData.id;
    return saveProgress({
      type: 'view',
      charId,
      value: 1,
      char: charData.char,
      romaji: charData.romaji,
      script: charData.script,
      category: charData.category,
      meanings: charData.meanings,
      onyomi: charData.onyomi,
      kunyomi: charData.kunyomi,
      level: charData.level
    });
  }

  async function getLastViewed() {
    const views = await getHistory('view', 100);
    views.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return views.length > 0 ? views[0] : null;
  }

  function emitChange(type, data) {
    const event = new CustomEvent('japanese:storage', { detail: { type, data } });
    document.dispatchEvent(event);
  }

  async function exportBackup() {
    const progress = await getAllProgress();
    return {
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      appVersion: '2.0.0',
      exportedAt: new Date().toISOString(),
      data: {
        favorites: normalizeStringList(getFavorites()),
        dictionaryFavorites: normalizeStringList(getDictionaryFavorites()),
        progress,
        srs: normalizeSrsMap(getSrsMap()),
        settings: getSettings()
      }
    };
  }

  function validateImportedBackup(backup) {
    const errors = [];
    if (!backup || typeof backup !== 'object') {
      errors.push('O arquivo não possui um objeto JSON válido.');
    } else {
      if (backup.format !== BACKUP_FORMAT) errors.push('Formato de backup não reconhecido.');
      if (!Number.isInteger(Number(backup.schemaVersion))) errors.push('Versão de esquema ausente ou inválida.');
      if (Number(backup.schemaVersion) > BACKUP_SCHEMA_VERSION) {
        errors.push('Este backup usa uma versão mais nova do que o app atual suporta.');
      }
      if (!backup.data || typeof backup.data !== 'object') errors.push('Dados do backup ausentes.');
    }

    const data = backup?.data || {};
    const summary = {
      favorites: Array.isArray(data.favorites) ? data.favorites.length : 0,
      dictionaryFavorites: Array.isArray(data.dictionaryFavorites) ? data.dictionaryFavorites.length : 0,
      progress: Array.isArray(data.progress) ? data.progress.length : 0,
      srs: data.srs && typeof data.srs === 'object' ? Object.keys(data.srs).length : 0,
      settings: data.settings && typeof data.settings === 'object' ? 1 : 0
    };

    return {
      ok: errors.length === 0,
      errors,
      summary
    };
  }

  async function importBackup(backup, mode = 'merge') {
    const validation = validateImportedBackup(backup);
    if (!validation.ok) {
      throw new Error(validation.errors.join(' '));
    }

    const data = backup.data || {};
    const normalized = {
      favorites: normalizeStringList(data.favorites),
      dictionaryFavorites: normalizeStringList(data.dictionaryFavorites),
      progress: normalizeProgressList(data.progress),
      srs: normalizeSrsMap(data.srs),
      settings: normalizeSettings(data.settings)
    };

    if (mode === 'replace') {
      await replaceProgress(normalized.progress);
      setFavorites(normalized.favorites);
      setDictionaryFavorites(normalized.dictionaryFavorites);
      setSrsMap(normalized.srs);
      setSettings(normalized.settings);
      emitChange('backup-imported', { mode, summary: validation.summary });
      return validation.summary;
    }

    if (mode !== 'merge') {
      throw new Error('Modo de importação inválido.');
    }

    await mergeProgress(normalized.progress);
    setFavorites(mergeStringLists(getFavorites(), normalized.favorites));
    setDictionaryFavorites(mergeStringLists(getDictionaryFavorites(), normalized.dictionaryFavorites));
    setSrsMap(mergeSrsMaps(getSrsMap(), normalized.srs));
    setSettings({ ...getSettings(), ...normalized.settings });
    emitChange('backup-imported', { mode, summary: validation.summary });
    return validation.summary;
  }

  async function replaceProgress(records) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      records.forEach(record => store.put(record));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function mergeProgress(records) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      records.forEach(record => store.put(record));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function clearAllUserData() {
    await replaceProgress([]);
    try {
      localStorage.removeItem(FAVORITES_KEY);
      localStorage.removeItem(DICTIONARY_FAVORITES_KEY);
      localStorage.removeItem(SRS_KEY);
      localStorage.removeItem(SETTINGS_KEY);
    } catch (e) {
      console.warn('Failed to clear local storage:', e);
    }
    emitChange('data-cleared', {});
  }

  function normalizeProgressList(records) {
    return Array.isArray(records) ? records.map(normalizeProgressRecord).filter(Boolean) : [];
  }

  function normalizeProgressRecord(record) {
    if (!record || typeof record !== 'object') return null;
    const timestamp = clampInteger(record.timestamp || Date.now(), 0, Number.MAX_SAFE_INTEGER);
    const type = String(record.type || 'unknown').slice(0, 80);
    const charId = String(record.charId || record.id || 'unknown').slice(0, 160);
    const id = String(record.id || `${type}_${charId}_${timestamp}`).slice(0, 260);

    return {
      ...record,
      id,
      schemaVersion: clampInteger(record.schemaVersion || 1, 1, BACKUP_SCHEMA_VERSION),
      entityType: record.entityType || 'progress-record',
      charId,
      type,
      value: Number.isFinite(Number(record.value)) ? Number(record.value) : record.value,
      timestamp
    };
  }

  function normalizeSrsMap(map) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
    return Object.entries(map).reduce((acc, [charId, record]) => {
      const safeId = String(record?.charId || charId);
      acc[safeId] = normalizeSrsRecord(record, safeId);
      return acc;
    }, {});
  }

  function mergeSrsMaps(current, incoming) {
    const result = normalizeSrsMap(current);
    const next = normalizeSrsMap(incoming);

    Object.entries(next).forEach(([charId, record]) => {
      const existing = result[charId];
      const existingTime = getRecordTime(existing);
      const incomingTime = getRecordTime(record);
      result[charId] = incomingTime >= existingTime ? record : existing;
    });

    return result;
  }

  function getRecordTime(record) {
    const explicit = Number(record?.updatedAt);
    if (Number.isFinite(explicit)) return explicit;
    const reviewed = new Date(record?.lastReviewed || 0).getTime();
    return Number.isFinite(reviewed) ? reviewed : 0;
  }

  function normalizeStringList(values) {
    return Array.isArray(values)
      ? [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))]
      : [];
  }

  function mergeStringLists(a, b) {
    return normalizeStringList([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]);
  }

  function getSettings() {
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      return normalizeSettings(data ? JSON.parse(data) : {});
    } catch {
      return {};
    }
  }

  function setSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  }

  function getMnemonic(charId) {
    const settings = getSettings();
    const mnemonics = settings.mnemonics || {};
    return typeof mnemonics[charId] === 'string' ? mnemonics[charId] : '';
  }

  function setMnemonic(charId, value) {
    const id = String(charId || '').slice(0, 160);
    if (!id) return;

    const settings = getSettings();
    const mnemonics = settings.mnemonics && typeof settings.mnemonics === 'object'
      ? { ...settings.mnemonics }
      : {};
    const text = String(value || '').slice(0, 500).trim();

    if (text) {
      mnemonics[id] = text;
    } else {
      delete mnemonics[id];
    }

    setSettings({
      ...settings,
      mnemonics
    });
  }

  function normalizeSettings(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return {};
    return Object.fromEntries(Object.entries(settings).filter(([key]) => typeof key === 'string' && key.length < 80));
  }

  function buildStudyId(item) {
    if (item?.script === 'kanji') {
      return `kanji_${item.id || item.unicode || item.char}`;
    }
    return `${item?.romaji || ''}_${item?.char || ''}`;
  }

  return {
    getFavorites,
    toggleFavorite,
    isFavorite,
    getSrsStatus,
    reviewSrs,
    isSrsDue,
    getSrsStats,
    getDictionaryFavorites,
    toggleDictionaryFavorite,
    isDictionaryFavorite,
    saveProgress,
    getAllProgress,
    getHistory,
    getStats,
    saveStudyTime,
    markAsViewed,
    markDictionaryViewed,
    getDictionaryHistory,
    saveQuizAnswer,
    getQuizStats,
    saveTypingSession,
    getTypingStats,
    saveGamificationEvent,
    getGamificationEvents,
    getGamificationStats,
    getGamificationGoals,
    setGamificationGoals,
    syncGamificationAchievements,
    getDifficultyMap,
    getLastViewed,
    openDB,
    emitChange,
    exportBackup,
    importBackup,
    validateImportedBackup,
    clearAllUserData,
    getSettings,
    setSettings,
    getMnemonic,
    setMnemonic
  };
})();
