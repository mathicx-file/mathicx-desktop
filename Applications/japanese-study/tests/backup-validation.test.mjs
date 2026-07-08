import test from 'node:test';
import assert from 'node:assert/strict';

import { JapaneseStorage } from '../js/storage.js';

test('backup validation rejects unknown formats', () => {
  const validation = JapaneseStorage.validateImportedBackup({
    format: 'unknown',
    schemaVersion: 1,
    data: {}
  });

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some(error => error.includes('Formato')));
});

test('backup validation summarizes valid backups', () => {
  const validation = JapaneseStorage.validateImportedBackup({
    format: 'japanese-study-backup',
    schemaVersion: 1,
    data: {
      favorites: ['a_あ'],
      dictionaryFavorites: ['word-neko'],
      progress: [{ id: 'view_a_あ_1', type: 'view', charId: 'a_あ', timestamp: 1 }],
      srs: { 'a_あ': { charId: 'a_あ' } },
      settings: {}
    }
  });

  assert.equal(validation.ok, true);
  assert.equal(validation.summary.favorites, 1);
  assert.equal(validation.summary.dictionaryFavorites, 1);
  assert.equal(validation.summary.progress, 1);
  assert.equal(validation.summary.srs, 1);
});

test('backup validation accepts typing session progress records', () => {
  const validation = JapaneseStorage.validateImportedBackup({
    format: 'japanese-study-backup',
    schemaVersion: 1,
    data: {
      favorites: [],
      dictionaryFavorites: [],
      progress: [
        {
          id: 'typing_session_1',
          type: 'typing_session',
          charId: 'typing_1',
          sessionId: 'typing_1',
          accuracy: 100,
          kanaTyped: 4,
          timestamp: 1
        },
        {
          id: 'typing_step_1',
          type: 'typing_step',
          charId: 'typing-hira-001',
          exerciseId: 'typing-hira-001',
          expected: 'おはよう',
          answered: 'おはよう',
          timestamp: 2
        }
      ],
      srs: {},
      settings: {}
    }
  });

  assert.equal(validation.ok, true);
  assert.equal(validation.summary.progress, 2);
});
