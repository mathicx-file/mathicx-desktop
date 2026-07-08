import test from 'node:test';
import assert from 'node:assert/strict';

import { JapaneseSearch } from '../js/search.js';
import { JapaneseQuiz } from '../js/quiz.js';
import { JapaneseStorage } from '../js/storage.js';

const kanji = [
  {
    id: 'day-sun',
    char: '日',
    unicode: '65E5',
    script: 'kanji',
    category: 'N5',
    level: 'N5',
    strokes: 4,
    meanings: ['dia', 'sol'],
    onyomi: ['ニチ', 'ジツ'],
    kunyomi: ['ひ', 'か'],
    radical: '日',
    components: ['日'],
    examples: [{ word: '日本', reading: 'にほん', romaji: 'nihon', meaning: 'Japão' }],
    tags: ['tempo', 'natureza']
  },
  {
    id: 'moon-month',
    char: '月',
    unicode: '6708',
    script: 'kanji',
    category: 'N5',
    level: 'N5',
    strokes: 4,
    meanings: ['lua', 'mês'],
    onyomi: ['ゲツ', 'ガツ'],
    kunyomi: ['つき'],
    radical: '月',
    components: ['月'],
    examples: [{ word: '月曜日', reading: 'げつようび', romaji: 'getsuyoubi', meaning: 'segunda-feira' }],
    tags: ['tempo']
  },
  {
    id: 'water',
    char: '水',
    unicode: '6C34',
    script: 'kanji',
    category: 'N5',
    level: 'N5',
    strokes: 4,
    meanings: ['água'],
    onyomi: ['スイ'],
    kunyomi: ['みず'],
    radical: '水',
    components: ['水'],
    examples: [{ word: '水曜日', reading: 'すいようび', romaji: 'suiyoubi', meaning: 'quarta-feira' }],
    tags: ['natureza', 'elemento']
  },
  {
    id: 'big',
    char: '大',
    unicode: '5927',
    script: 'kanji',
    category: 'N5',
    level: 'N5',
    strokes: 3,
    meanings: ['grande'],
    onyomi: ['ダイ'],
    kunyomi: ['おお'],
    radical: '大',
    components: ['大'],
    examples: [{ word: '大学', reading: 'だいがく', romaji: 'daigaku', meaning: 'universidade' }],
    tags: ['tamanho']
  }
];

test('search finds kanji by character, meaning, readings, radical, tag and vocabulary', () => {
  JapaneseSearch.setData(kanji);

  assert.equal(JapaneseSearch.search('日', { script: 'kanji' })[0].id, 'day-sun');
  assert.equal(JapaneseSearch.search('água', { script: 'kanji' })[0].id, 'water');
  assert.equal(JapaneseSearch.search('ゲツ', { script: 'kanji' })[0].id, 'moon-month');
  assert.equal(JapaneseSearch.search('みず', { script: 'kanji' })[0].id, 'water');
  assert.equal(JapaneseSearch.search('月', { script: 'kanji' })[0].id, 'moon-month');
  assert.equal(JapaneseSearch.search('elemento', { script: 'kanji' })[0].id, 'water');
  assert.equal(JapaneseSearch.search('nihon', { script: 'kanji' })[0].id, 'day-sun');
});

test('buildId keeps kana ids compatible and gives kanji stable ids', () => {
  assert.equal(JapaneseSearch.buildId({ romaji: 'a', char: 'あ', script: 'hiragana' }), 'a_あ');
  assert.equal(JapaneseSearch.buildId(kanji[0]), 'kanji_day-sun');
});

test('SRS stores kanji metadata under a stable id', () => {
  installLocalStorage();

  const reviewed = JapaneseStorage.reviewSrs(kanji[0], 'good');

  assert.equal(reviewed.charId, 'kanji_day-sun');
  assert.equal(reviewed.script, 'kanji');
  assert.deepEqual(reviewed.meanings, ['dia', 'sol']);
  assert.equal(JapaneseStorage.getSrsStats(kanji).review, 1);
});

test('quiz supports kanji meaning, reverse lookup, reading and vocabulary reading', () => {
  JapaneseQuiz.setData(kanji);

  const meaning = JapaneseQuiz.nextQuestion({ mode: 'kanji-meaning', script: 'kanji', categories: ['N5'], limit: 10 });
  assert.equal(meaning.instruction, 'Escolha o significado correto.');
  assert.ok(meaning.options.includes(meaning.answer));

  JapaneseQuiz.resetStats();
  const reverse = JapaneseQuiz.nextQuestion({ mode: 'meaning-kanji', script: 'kanji', categories: ['N5'], limit: 10 });
  assert.equal(reverse.answer, reverse.target.char);

  JapaneseQuiz.resetStats();
  const reading = JapaneseQuiz.nextQuestion({ mode: 'kanji-reading', script: 'kanji', categories: ['N5'], limit: 10 });
  assert.ok(reading.acceptedAnswers.length > 0);

  JapaneseQuiz.resetStats();
  const vocab = JapaneseQuiz.nextQuestion({ mode: 'kanji-vocabulary-reading', script: 'kanji', categories: ['N5'], limit: 10 });
  assert.ok(vocab.answer);
});

test('backup validation accepts kanji progress, SRS and mnemonics', () => {
  const validation = JapaneseStorage.validateImportedBackup({
    format: 'japanese-study-backup',
    schemaVersion: 1,
    appVersion: '2.0.0',
    data: {
      favorites: ['kanji_day-sun'],
      dictionaryFavorites: ['kanji_nihon'],
      progress: [{ id: 'view_kanji_day-sun_1', type: 'view', charId: 'kanji_day-sun', script: 'kanji', timestamp: 1 }],
      srs: { 'kanji_day-sun': { charId: 'kanji_day-sun', script: 'kanji', meanings: ['dia', 'sol'] } },
      settings: { mnemonics: { 'kanji_day-sun': 'sol do dia' } }
    }
  });

  assert.equal(validation.ok, true);
  assert.equal(validation.summary.favorites, 1);
  assert.equal(validation.summary.dictionaryFavorites, 1);
  assert.equal(validation.summary.progress, 1);
  assert.equal(validation.summary.srs, 1);
});

function installLocalStorage() {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear()
  };
}
