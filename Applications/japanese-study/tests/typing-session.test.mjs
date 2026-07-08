import test from 'node:test';
import assert from 'node:assert/strict';

import { JapaneseTypingContentProvider } from '../js/typing-content-provider.js';
import { JapaneseTypingEvaluator } from '../js/typing-evaluator.js';
import { createTypingSession } from '../js/typing-session.js';
import { JapaneseKanaInput } from '../js/kana-input.js';

const fixtures = {
  exercises: [
    {
      id: 'small-1',
      level: 'beginner',
      size: 'small',
      category: 'greetings',
      script: 'hiragana',
      mode: 'copy',
      promptPt: 'Bom dia.',
      referenceJapanese: 'おはよう',
      answer: 'おはよう',
      acceptedAnswers: ['おはよう。'],
      romaji: 'ohayou'
    },
    {
      id: 'small-2',
      level: 'beginner',
      size: 'small',
      category: 'places',
      script: 'hiragana',
      mode: 'copy',
      promptPt: 'Escola.',
      referenceJapanese: 'がっこう',
      answer: 'がっこう',
      romaji: 'gakkou'
    },
    {
      id: 'medium-1',
      level: 'beginner',
      size: 'medium',
      category: 'phrases',
      script: 'hiragana',
      mode: 'copy',
      promptPt: 'Eu sou estudante.',
      referenceJapanese: 'わたしはがくせいです',
      answer: 'わたしはがくせいです',
      romaji: 'watashihagakuseidesu'
    }
  ]
};

test('typing content provider filters local exercises and applies limit', () => {
  JapaneseTypingContentProvider.setData(fixtures);
  const session = JapaneseTypingContentProvider.buildSession({
    script: 'hiragana',
    size: 'small',
    mode: 'copy',
    category: 'all',
    limit: 3
  });

  assert.equal(session.available, 2);
  assert.equal(session.exercises.length, 2);
  assert.deepEqual(new Set(session.exercises.map(exercise => exercise.id)), new Set(['small-1', 'small-2']));
});

test('typing content provider shuffles exercises for each session', () => {
  JapaneseTypingContentProvider.setData(fixtures);
  const session = JapaneseTypingContentProvider.buildSession({
    script: 'hiragana',
    size: 'small',
    mode: 'copy',
    category: 'all',
    limit: 3
  }, {
    random: () => 0
  });

  assert.deepEqual(session.exercises.map(exercise => exercise.id), ['small-2', 'small-1']);
});

test('typing evaluator normalizes punctuation and finds first error', () => {
  const exercise = fixtures.exercises[0];
  assert.equal(JapaneseTypingEvaluator.evaluateAnswer('おはよう。', exercise).correct, true);

  const result = JapaneseTypingEvaluator.evaluateAnswer('おはよ', exercise);
  assert.equal(result.correct, false);
  assert.equal(result.incomplete, true);
  assert.equal(result.firstErrorIndex, 3);
});

test('typing session tracks summary, accuracy and errors', () => {
  const session = createTypingSession(fixtures.exercises.slice(0, 2), {
    script: 'hiragana',
    size: 'small',
    mode: 'copy',
    limit: 2
  });

  session.submit('おはよう');
  session.submit('がこう');
  const summary = session.getSummary(session.getSummary().startedAt + 60000);

  assert.equal(summary.completed, true);
  assert.equal(summary.answered, 2);
  assert.equal(summary.correct, 1);
  assert.equal(summary.errors, 1);
  assert.equal(summary.accuracy, 50);
  assert.equal(summary.kanaTyped, 7);
  assert.equal(summary.kanaPerMinute, 7);
});

test('typing integration uses kana input for small tsu, n, youon and finalizeN', () => {
  assert.equal(JapaneseKanaInput.convertRomajiToKana('gakkou', 'hiragana'), 'がっこう');
  assert.equal(JapaneseKanaInput.convertRomajiToKana('ryokou', 'hiragana'), 'りょこう');
  assert.equal(JapaneseKanaInput.convertRomajiToKana('hon', 'hiragana', { finalizeN: true }), 'ほん');
});
