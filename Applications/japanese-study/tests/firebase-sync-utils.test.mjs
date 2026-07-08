import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAchievementEntries,
  buildGamificationEventEntries,
  buildRemoteBackup,
  buildSettingsPayload,
  buildSrsEntries,
  sanitizeFirestoreId,
} from '../js/firebase/sync-utils.js';

test('firebase sync sanitizes document ids', () => {
  assert.equal(sanitizeFirestoreId('kanji/day#1'), 'kanji_day_1');
  assert.equal(sanitizeFirestoreId('', 'fallback'), 'fallback');
});

test('firebase sync builds settings payload from backup', () => {
  const payload = buildSettingsPayload({
    appVersion: '2.0.0',
    data: {
      favorites: ['a', 'a', 'b'],
      dictionaryFavorites: ['neko'],
      settings: { quiz: { limit: '10' } },
    },
  });

  assert.equal(payload.source, 'japanese-study');
  assert.deepEqual(payload.favorites, ['a', 'b']);
  assert.deepEqual(payload.dictionaryFavorites, ['neko']);
  assert.equal(payload.settings.quiz.limit, '10');
});

test('firebase sync extracts srs and gamification events', () => {
  const srs = buildSrsEntries({
    'a/あ': { charId: 'a/あ', state: 'review', interval: 2 },
  });
  const events = buildGamificationEventEntries([
    { id: 'quiz/correct#1', type: 'gamification_event', eventType: 'quiz.correct', xp: 9 },
    { id: 'view_a', type: 'view' },
  ]);

  assert.equal(srs.length, 1);
  assert.equal(srs[0][0], 'a_あ');
  assert.equal(events.length, 1);
  assert.equal(events[0][0], 'quiz_correct_1');
  assert.equal(events[0][1].syncStatus, 'synced');
});

test('firebase sync extracts achievements and rebuilds remote backup', () => {
  const achievements = buildAchievementEntries({
    gamificationAchievements: {
      first: { title: 'Primeiros passos', unlocked: true },
    },
  });
  const backup = buildRemoteBackup({
    settingsDoc: {
      appVersion: '2.0.0',
      favorites: ['a'],
      settings: { gamificationGoals: { dailyReviewTarget: 10 } },
    },
    srsDocs: [{ id: 'a', charId: 'a', state: 'review' }],
  });

  assert.equal(achievements.length, 1);
  assert.equal(achievements[0][0], 'first');
  assert.equal(backup.format, 'japanese-study-backup');
  assert.deepEqual(backup.data.favorites, ['a']);
  assert.equal(backup.data.srs.a.state, 'review');
});
