import test from 'node:test';
import assert from 'node:assert/strict';

import { JapaneseQuiz } from '../js/quiz.js';

const chars = [
  { romaji: 'a', char: 'あ', script: 'hiragana', category: 'gojuuon' },
  { romaji: 'i', char: 'い', script: 'hiragana', category: 'gojuuon' },
  { romaji: 'u', char: 'う', script: 'hiragana', category: 'gojuuon' },
  { romaji: 'e', char: 'え', script: 'hiragana', category: 'gojuuon' }
];

test('quiz schedules mistake review when enabled', () => {
  JapaneseQuiz.setData(chars);
  const question = JapaneseQuiz.nextQuestion({
    mode: 'recognition',
    script: 'hiragana',
    categories: ['gojuuon'],
    limit: 10,
    includeMistakeReviews: true
  });
  const wrong = chars.find(char => char.romaji !== question.answer).romaji;

  JapaneseQuiz.checkAnswer(wrong);

  assert.equal(JapaneseQuiz.getStats().reviewPending, 1);
});

test('quiz does not schedule mistake review when disabled', () => {
  JapaneseQuiz.setData(chars);
  const question = JapaneseQuiz.nextQuestion({
    mode: 'recognition',
    script: 'hiragana',
    categories: ['gojuuon'],
    limit: 10,
    includeMistakeReviews: false
  });
  const wrong = chars.find(char => char.romaji !== question.answer).romaji;

  JapaneseQuiz.checkAnswer(wrong);

  assert.equal(JapaneseQuiz.getStats().reviewPending, 0);
});

test('kana typing mode asks for kana from romaji', () => {
  JapaneseQuiz.setData(chars);
  const question = JapaneseQuiz.nextQuestion({
    mode: 'kana-typing',
    script: 'hiragana',
    categories: ['gojuuon'],
    limit: 10,
    includeMistakeReviews: true
  });

  assert.equal(question.type, 'typing');
  assert.equal(question.prompt, question.target.romaji);
  assert.equal(question.answer, question.target.char);
});
