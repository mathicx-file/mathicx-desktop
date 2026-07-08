import test from 'node:test';
import assert from 'node:assert/strict';

import { JapaneseLearningLevels } from '../js/learning-levels.js';
import { JapaneseRecommendationEngine } from '../js/recommendation-engine.js';
import { JapaneseStudyEngine } from '../js/study-engine.js';

const characters = [
  { romaji: 'a', char: '\u3042', script: 'hiragana', category: 'gojuuon' },
  { romaji: 'ka', char: '\u304b', script: 'hiragana', category: 'gojuuon' },
  { romaji: 'a', char: '\u30a2', script: 'katakana', category: 'gojuuon' },
  { romaji: 'ka', char: '\u30ab', script: 'katakana', category: 'gojuuon' },
  { id: 'day-sun', char: '\u65e5', script: 'kanji', category: 'N5', meanings: ['dia'], onyomi: ['\u30cb\u30c1'], kunyomi: ['\u3072'] }
];

test('learning levels start at level 1 for empty progress', () => {
  const level = JapaneseLearningLevels.calculate({});

  assert.equal(level.level, 1);
  assert.equal(level.title, 'Aprendiz de Kana');
});

test('learning levels progress with study data', () => {
  const level = JapaneseLearningLevels.calculate({
    stats: { totalStudied: 40, streak: 12 },
    completion: {
      hiragana: { studied: 35, total: 46 },
      katakana: { studied: 20, total: 46 }
    },
    srsStats: { mastered: 15 },
    quizStats: { answered: 80 }
  });

  assert.ok(level.level >= 3);
  assert.ok(level.progress >= 0);
});

test('recommendation prioritizes SRS due reviews', () => {
  const recommendation = JapaneseRecommendationEngine.recommend({
    characters,
    srsStats: { due: 3, totalTracked: 3 },
    completion: {},
    studiedIds: []
  });

  assert.equal(recommendation.type, 'review');
  assert.equal(recommendation.session.reason, 'review-due');
  assert.equal(recommendation.schemaVersion, 1);
  assert.ok(recommendation.reason.includes('SRS'));
  assert.ok(recommendation.evidence.length >= 1);
});

test('recommendation explains recurring error reinforcement', () => {
  const recommendation = JapaneseRecommendationEngine.recommend({
    characters,
    srsStats: { due: 0, totalTracked: 3 },
    difficulty: [
      { char: '\u30b7', errors: 2, accuracy: 50 },
      { char: '\u30c4', errors: 3, accuracy: 40 }
    ],
    completion: {},
    studiedIds: []
  });

  assert.equal(recommendation.type, 'reinforcement');
  assert.equal(recommendation.session.reason, 'recent-errors');
  assert.ok(recommendation.evidence.some(item => item.includes('2 caractere')));
});

test('recommendation introduces kanji when kana completion is strong', () => {
  const recommendation = JapaneseRecommendationEngine.recommend({
    characters,
    srsStats: { due: 0, totalTracked: 0 },
    completion: {
      hiragana: { studied: 2, total: 2 },
      katakana: { studied: 2, total: 2 },
      kanji: { studied: 0, total: 1 }
    },
    studiedIds: ['a_\u3042', 'ka_\u304b', 'a_\u30a2', 'ka_\u30ab']
  });

  assert.equal(recommendation.type, 'syllabus');
  assert.equal(recommendation.session.script, 'kanji');
  assert.equal(recommendation.session.reason, 'kanji-n5-initial');
  assert.ok(recommendation.evidence.some(item => item.includes('Kanji N5')));
});

test('study engine returns a valid default session without history', () => {
  const session = JapaneseStudyEngine.buildSession({
    characters,
    srsStats: { due: 0 },
    completion: {
      hiragana: { studied: 0, total: 2 },
      katakana: { studied: 0, total: 2 }
    },
    studiedIds: []
  });

  assert.equal(session.quiz.mode, 'multiple-choice');
  assert.equal(session.quiz.script, 'hiragana');
  assert.deepEqual(session.quiz.categories, ['gojuuon']);
  assert.equal(session.quiz.limit, '10');
  assert.equal(session.assistant.schemaVersion, 1);
});

test('study engine keeps review sessions broad across scripts', () => {
  const session = JapaneseStudyEngine.buildSession({
    characters,
    srsStats: { due: 2, totalTracked: 2 },
    completion: {
      hiragana: { studied: 0, total: 2 },
      katakana: { studied: 0, total: 2 },
      kanji: { studied: 0, total: 1 }
    },
    studiedIds: []
  });

  assert.equal(session.reason, 'review-due');
  assert.equal(session.quiz.script, 'all');
  assert.ok(session.assistant.evidence.length >= 1);
});

test('adaptive presets expose guided trails and quick sessions', () => {
  const trail = JapaneseRecommendationEngine.getGuidedTrail('active-production');
  const quick = JapaneseRecommendationEngine.getQuickSession('active-kana');

  assert.equal(trail.quiz.mode, 'kana-typing');
  assert.equal(quick.quiz.mode, 'kana-typing');
  assert.ok(JapaneseRecommendationEngine.GUIDED_TRAILS.length >= 4);
  assert.ok(JapaneseRecommendationEngine.QUICK_SESSIONS.length >= 5);
});
