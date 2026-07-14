import test from 'node:test';
import assert from 'node:assert/strict';

import { romanizeDictionaryReadings } from '../js/dictionary/kana-romanizer.js';

test('romanizes dictionary readings with the same Hepburn conventions as the indexes', () => {
  assert.deepEqual(romanizeDictionaryReadings([
    'みず',
    'きょう',
    'がっこう',
    'コーヒー',
  ]), [
    'mizu',
    'kyou',
    'gakkou',
    'koohii',
  ]);
});

test('normalizes, removes duplicates and ignores empty readings', () => {
  assert.deepEqual(romanizeDictionaryReadings(['イヌ', 'いぬ', '', null]), ['inu']);
  assert.deepEqual(romanizeDictionaryReadings(), []);
});
