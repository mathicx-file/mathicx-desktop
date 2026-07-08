export const JAPANESE_STUDY_APP_ID = 'japanese-study';
export const JAPANESE_SYNC_SCHEMA_VERSION = 1;

export function sanitizeFirestoreId(value, fallback = 'item') {
  const text = String(value || fallback)
    .trim()
    .replace(/[/.#[\]$]/g, '_')
    .slice(0, 260);
  return text || fallback;
}

export function isGamificationEvent(record) {
  return Boolean(record)
    && (record.type === 'gamification_event' || record.entityType === 'gamification-event');
}

export function buildSettingsPayload(backup) {
  const data = backup?.data || {};
  return cleanObject({
    schemaVersion: JAPANESE_SYNC_SCHEMA_VERSION,
    appVersion: backup?.appVersion || 'unknown',
    settings: data.settings || {},
    favorites: normalizeList(data.favorites),
    dictionaryFavorites: normalizeList(data.dictionaryFavorites),
    source: JAPANESE_STUDY_APP_ID,
  });
}

export function buildSrsEntries(srsMap) {
  if (!srsMap || typeof srsMap !== 'object' || Array.isArray(srsMap)) return [];
  return Object.entries(srsMap)
    .filter(([, record]) => record && typeof record === 'object')
    .map(([itemId, record]) => [
      sanitizeFirestoreId(record.charId || itemId),
      cleanObject({
        ...record,
        charId: String(record.charId || itemId),
        schemaVersion: record.schemaVersion || JAPANESE_SYNC_SCHEMA_VERSION,
      }),
    ]);
}

export function buildGamificationEventEntries(progress) {
  return (Array.isArray(progress) ? progress : [])
    .filter(isGamificationEvent)
    .map((record) => [
      sanitizeFirestoreId(record.id || `${record.eventType || 'event'}_${record.timestamp || Date.now()}`),
      cleanObject({
        ...record,
        schemaVersion: record.schemaVersion || JAPANESE_SYNC_SCHEMA_VERSION,
        syncStatus: 'synced',
      }),
    ]);
}

export function buildAchievementEntries(settings = {}) {
  const achievements = settings.gamificationAchievements;
  if (!achievements || typeof achievements !== 'object' || Array.isArray(achievements)) return [];

  return Object.entries(achievements)
    .filter(([, achievement]) => achievement && typeof achievement === 'object')
    .map(([achievementId, achievement]) => [
      sanitizeFirestoreId(achievement.id || achievementId),
      cleanObject({
        ...achievement,
        id: String(achievement.id || achievementId),
        schemaVersion: JAPANESE_SYNC_SCHEMA_VERSION,
      }),
    ]);
}

export function buildRemoteBackup({ settingsDoc = null, srsDocs = [] } = {}) {
  const settings = settingsDoc?.settings && typeof settingsDoc.settings === 'object'
    ? settingsDoc.settings
    : {};
  const srs = {};

  srsDocs.forEach((record) => {
    if (!record || typeof record !== 'object') return;
    const id = String(record.charId || record.id || '').trim();
    if (!id) return;
    srs[id] = record;
  });

  return {
    format: 'japanese-study-backup',
    schemaVersion: JAPANESE_SYNC_SCHEMA_VERSION,
    appVersion: settingsDoc?.appVersion || 'remote',
    exportedAt: new Date().toISOString(),
    data: {
      favorites: normalizeList(settingsDoc?.favorites),
      dictionaryFavorites: normalizeList(settingsDoc?.dictionaryFavorites),
      progress: [],
      srs,
      settings,
    },
  };
}

export function buildProgressionSummary(backup) {
  const data = backup?.data || {};
  const progress = Array.isArray(data.progress) ? data.progress : [];
  const events = progress.filter(isGamificationEvent);
  return cleanObject({
    schemaVersion: JAPANESE_SYNC_SCHEMA_VERSION,
    progressRecords: progress.length,
    gamificationEvents: events.length,
    srsItems: data.srs && typeof data.srs === 'object' ? Object.keys(data.srs).length : 0,
    favorites: Array.isArray(data.favorites) ? data.favorites.length : 0,
    dictionaryFavorites: Array.isArray(data.dictionaryFavorites) ? data.dictionaryFavorites.length : 0,
  });
}

export function cleanObject(value) {
  if (Array.isArray(value)) return value.map(cleanObject).filter((item) => item !== undefined);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, cleanObject(item)]),
  );
}

function normalizeList(values) {
  return Array.isArray(values)
    ? [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
    : [];
}
