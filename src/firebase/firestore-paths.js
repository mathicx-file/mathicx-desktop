/**
 * Shared Firestore path helpers.
 */

export const USER_ACCESS_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

export const USER_ROLES = Object.freeze({
  USER: 'user',
  ADMIN: 'admin',
});

export const firestorePaths = Object.freeze({
  user: (uid) => `users/${uid}`,
  userDesktopSettings: (uid) => `users/${uid}/desktop/settings`,
  userDesktopPinned: (uid, appId) => `users/${uid}/desktop/pinned/items/${appId}`,
  userDesktopFavorite: (uid, appId) => `users/${uid}/desktop/favorites/items/${appId}`,
  userDesktopShortcut: (uid, shortcutId) => `users/${uid}/desktop/shortcuts/items/${shortcutId}`,
  userMigration: (uid, migrationId) => `users/${uid}/migrations/${migrationId}`,

  japaneseBase: (uid) => `users/${uid}/apps/japanese-study`,
  japaneseSettings: (uid) => `users/${uid}/apps/japanese-study/settings/main`,
  japaneseProgression: (uid) => `users/${uid}/apps/japanese-study/profile/progression`,
  japaneseStatsSummary: (uid) => `users/${uid}/apps/japanese-study/stats/summary`,
  japaneseEvent: (uid, eventId) => `users/${uid}/apps/japanese-study/events/${eventId}`,
  japaneseAchievement: (uid, achievementId) => `users/${uid}/apps/japanese-study/achievements/${achievementId}`,
  japaneseSrs: (uid, itemId) => `users/${uid}/apps/japanese-study/srs/${itemId}`,
  japaneseKanaProgress: (uid, kanaId) => `users/${uid}/apps/japanese-study/kanaProgress/${kanaId}`,
  japaneseKanjiProgress: (uid, kanjiId) => `users/${uid}/apps/japanese-study/kanjiProgress/${kanjiId}`,
  japaneseFavorite: (uid, entryId) => `users/${uid}/apps/japanese-study/favorites/${entryId}`,
  japaneseDictionaryFavorite: (uid, entryId) => (
    `users/${uid}/apps/japanese-study/dictionaryFavorites/${entryId}`
  ),
  japaneseReview: (uid, reviewId) => `users/${uid}/apps/japanese-study/reviews/${reviewId}`,
  japaneseCustomList: (uid, listId) => `users/${uid}/apps/japanese-study/customLists/${listId}`,
  japaneseCustomListItem: (uid, listId, entryId) => (
    `users/${uid}/apps/japanese-study/customLists/${listId}/items/${entryId}`
  ),

  publicDictionary: () => 'publicData/dictionary',
  publicAppCatalog: (appId) => `publicAppCatalog/${appId}`,
  publicAppConfig: (configId) => `publicAppConfig/${configId}`,
});
