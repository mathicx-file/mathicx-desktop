import test from 'node:test';
import assert from 'node:assert/strict';
import { JapaneseKanaPrintExport } from '../js/kana-print-export.js';

const characters = [
  { script: 'hiragana', category: 'gojuuon', romaji: 'a', char: 'a' },
  { script: 'hiragana', category: 'dakuon', romaji: 'ga', char: 'ga' },
  { script: 'katakana', category: 'gojuuon', romaji: 'a', char: 'A' },
  { script: 'kanji', category: 'N5', romaji: '', char: 'one' }
];

test('filters kana export by script and category', () => {
  const result = JapaneseKanaPrintExport.getKanaCharacters(characters, {
    script: 'hiragana',
    categories: ['gojuuon']
  });

  assert.deepEqual(result.map(char => char.romaji), ['a']);
});

test('filters practice export by selected kana ids', () => {
  const result = JapaneseKanaPrintExport.getKanaCharacters(characters, {
    script: 'hiragana',
    categories: ['gojuuon', 'dakuon'],
    characterIds: ['ga_ga']
  });

  assert.deepEqual(result.map(char => char.romaji), ['ga']);
});
