import test from 'node:test';
import assert from 'node:assert/strict';

import { JapaneseGamificationEngine } from '../js/gamification-engine.js';
import { JapaneseLearningLevels } from '../js/learning-levels.js';

const kana = { romaji: 'a', char: '\u3042', script: 'hiragana', category: 'gojuuon' };

test('quiz answers create sync-ready gamification events', () => {
  const event = JapaneseGamificationEngine.buildQuizEvent({
    mode: 'kana-typing',
    type: 'typing',
    prompt: 'a',
    answer: '\u3042',
    target: kana,
    review: false
  }, {
    correct: true,
    expected: '\u3042',
    answered: '\u3042'
  }, 1000);

  assert.equal(event.type, 'gamification_event');
  assert.equal(event.entityType, 'gamification-event');
  assert.equal(event.eventType, 'quiz.correct');
  assert.equal(event.source, 'quiz');
  assert.equal(event.skill, 'production');
  assert.equal(event.syncStatus, 'local');
  assert.ok(event.xp > 6);
});

test('progression balances habit, mastery and practice dimensions', () => {
  const events = [
    JapaneseGamificationEngine.createEvent({
      type: 'quiz.correct',
      source: 'quiz',
      action: 'correct-answer',
      xp: 9,
      item: kana,
      skill: 'recognition'
    }, 1000),
    JapaneseGamificationEngine.createEvent({
      type: 'srs.good',
      source: 'srs',
      action: 'review',
      xp: 6,
      item: kana,
      skill: 'retention'
    }, 2000)
  ];

  const level = JapaneseLearningLevels.calculate({
    events,
    stats: {
      streak: 7,
      studyTime: 50,
      activity: {
        '2026-07-01': 2,
        '2026-07-02': 1
      }
    },
    completion: {
      hiragana: { studied: 30, total: 46 },
      katakana: { studied: 10, total: 46 },
      kanji: { studied: 1, total: 10 }
    },
    srsStats: { mastered: 8 },
    quizStats: { answered: 30, correct: 25, accuracy: 83 },
    typingStats: { sessions: 2, averageAccuracy: 88 }
  });

  assert.ok(level.xp > 0);
  assert.ok(level.dimensions.habit > 0);
  assert.ok(level.dimensions.mastery > 0);
  assert.ok(level.dimensions.practice > 0);
  assert.ok(level.achievements.some(item => item.id === 'first-steps' && item.unlocked));
  assert.ok(level.quests.length >= 3);
});

test('custom goals shape quest targets', () => {
  const level = JapaneseGamificationEngine.summarize({
    goals: {
      dailyReviewTarget: 5,
      quizAnswerTarget: 20,
      weeklyStreakTarget: 4,
      typingSessionTarget: 2
    },
    stats: { streak: 3 },
    srsStats: { totalTracked: 6, due: 2 },
    quizStats: { answered: 12 },
    typingStats: { sessions: 1 }
  });

  const quizQuest = level.quests.find(item => item.id === 'quiz-focus');
  const streakQuest = level.quests.find(item => item.id === 'study-habit');

  assert.equal(quizQuest.target, 20);
  assert.equal(quizQuest.progress, 12);
  assert.equal(streakQuest.target, 4);
});

test('error notebook summarizes recurring quiz errors', () => {
  const level = JapaneseGamificationEngine.summarize({
    difficulty: [
      {
        charId: 'shi_\u30b7',
        char: '\u30b7',
        romaji: 'shi',
        script: 'katakana',
        category: 'gojuuon',
        accuracy: 40,
        errors: 3,
        total: 5,
        state: 'Reforcar'
      }
    ],
    quizStats: {
      recentErrors: [
        {
          charId: 'shi_\u30b7',
          expected: 'shi',
          answered: 'tsu'
        }
      ]
    }
  });

  assert.equal(level.errorNotebook.length, 1);
  assert.equal(level.errorNotebook[0].script, 'katakana');
  assert.equal(level.errorNotebook[0].lastAnswered, 'tsu');
  assert.ok(level.errorNotebook[0].recommendation.includes('rodada curta'));
});
