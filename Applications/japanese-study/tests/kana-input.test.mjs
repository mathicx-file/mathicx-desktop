import test from 'node:test';
import assert from 'node:assert/strict';

import { JapaneseKanaInput } from '../js/kana-input.js';

test('romaji converts basic hiragana', () => {
  assert.equal(JapaneseKanaInput.convertRomajiToKana('ka', 'hiragana'), '\u304b');
  assert.equal(JapaneseKanaInput.convertRomajiToKana('shi', 'hiragana'), '\u3057');
});

test('romaji converts youon hiragana', () => {
  assert.equal(JapaneseKanaInput.convertRomajiToKana('kya', 'hiragana'), '\u304d\u3083');
});

test('romaji converts double consonants', () => {
  assert.equal(JapaneseKanaInput.convertRomajiToKana('gakkou', 'hiragana'), '\u304c\u3063\u3053\u3046');
});

test('romaji converts nn to syllabic n', () => {
  assert.equal(JapaneseKanaInput.convertRomajiToKana('nn', 'hiragana'), '\u3093');
});

test('single n remains partial while typing but finalizes on submit', () => {
  assert.equal(JapaneseKanaInput.convertRomajiToKana('n', 'hiragana'), 'n');
  assert.equal(JapaneseKanaInput.convertRomajiToKana('n', 'hiragana', { finalizeN: true }), '\u3093');
  assert.equal(JapaneseKanaInput.convertRomajiToKana('na', 'hiragana'), '\u306a');
  assert.equal(JapaneseKanaInput.convertRomajiToKana('hon', 'hiragana', { finalizeN: true }), '\u307b\u3093');
});

test('romaji converts katakana from target script', () => {
  assert.equal(JapaneseKanaInput.convertRomajiToKana('kya', 'katakana'), '\u30ad\u30e3');
});

test('kana and long vowel mark are preserved', () => {
  assert.equal(JapaneseKanaInput.convertRomajiToKana('\u304b-', 'hiragana'), '\u304b\u30fc');
});
