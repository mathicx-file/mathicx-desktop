const ROMAJI_TO_HIRAGANA = {
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
  ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
  sa: 'さ', shi: 'し', si: 'し', su: 'す', se: 'せ', so: 'そ',
  za: 'ざ', ji: 'じ', zi: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
  ta: 'た', chi: 'ち', ti: 'ち', tsu: 'つ', tu: 'つ', te: 'て', to: 'と',
  da: 'だ', dji: 'ぢ', di: 'ぢ', dzu: 'づ', du: 'づ', de: 'で', do: 'ど',
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
  ha: 'は', hi: 'ひ', fu: 'ふ', hu: 'ふ', he: 'へ', ho: 'ほ',
  ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
  pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
  ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
  ya: 'や', yu: 'ゆ', yo: 'よ',
  ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
  wa: 'わ', wi: 'うぃ', we: 'うぇ', wo: 'を',
  kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ',
  gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
  sha: 'しゃ', shu: 'しゅ', sho: 'しょ',
  sya: 'しゃ', syu: 'しゅ', syo: 'しょ',
  ja: 'じゃ', ju: 'じゅ', jo: 'じょ',
  jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ',
  zya: 'じゃ', zyu: 'じゅ', zyo: 'じょ',
  cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ',
  tya: 'ちゃ', tyu: 'ちゅ', tyo: 'ちょ',
  dya: 'ぢゃ', dyu: 'ぢゅ', dyo: 'ぢょ',
  nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
  hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ',
  bya: 'びゃ', byu: 'びゅ', byo: 'びょ',
  pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
  mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
  rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ',
  fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ',
  va: 'ゔぁ', vi: 'ゔぃ', vu: 'ゔ', ve: 'ゔぇ', vo: 'ゔぉ',
  la: 'ぁ', li: 'ぃ', lu: 'ぅ', le: 'ぇ', lo: 'ぉ',
  xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ',
  lya: 'ゃ', lyu: 'ゅ', lyo: 'ょ',
  xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ',
  ltsu: 'っ', xtsu: 'っ', ltu: 'っ', xtu: 'っ'
};

const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);

export const JapaneseKanaInput = (() => {
  function convertRomajiToKana(value, script = 'hiragana', options = {}) {
    const hiragana = convertToHiragana(String(value || '').toLowerCase(), options);
    return script === 'katakana' ? hiraganaToKatakana(hiragana) : hiragana;
  }

  function convertToHiragana(value, options = {}) {
    let output = '';
    let index = 0;

    while (index < value.length) {
      const current = value[index];
      const next = value[index + 1];

      if (current === '-' || current === 'ー') {
        output += 'ー';
        index += 1;
        continue;
      }

      if (!isAsciiLetter(current)) {
        output += current;
        index += 1;
        continue;
      }

      if (current === 'n') {
        if (next === 'n') {
          output += 'ん';
          index += 2;
          continue;
        }
        if (next && !VOWELS.has(next) && next !== 'y') {
          output += 'ん';
          index += 1;
          continue;
        }
        if (!next && options.finalizeN) {
          output += 'ん';
          index += 1;
          continue;
        }
      }

      if (
        current === next &&
        current !== 'n' &&
        isAsciiConsonant(current)
      ) {
        output += 'っ';
        index += 1;
        continue;
      }

      const token =
        ROMAJI_TO_HIRAGANA[value.slice(index, index + 4)] ||
        ROMAJI_TO_HIRAGANA[value.slice(index, index + 3)] ||
        ROMAJI_TO_HIRAGANA[value.slice(index, index + 2)] ||
        ROMAJI_TO_HIRAGANA[current];

      if (token) {
        const length = getTokenLength(value, index);
        output += token;
        index += length;
      } else {
        output += current;
        index += 1;
      }
    }

    return output;
  }

  function getTokenLength(value, index) {
    for (const length of [4, 3, 2, 1]) {
      if (ROMAJI_TO_HIRAGANA[value.slice(index, index + length)]) return length;
    }
    return 1;
  }

  function hiraganaToKatakana(value) {
    return String(value || '').replace(/[\u3041-\u3096]/g, char =>
      String.fromCharCode(char.charCodeAt(0) + 0x60)
    );
  }

  function isAsciiLetter(char) {
    return /^[a-z]$/.test(char || '');
  }

  function isAsciiConsonant(char) {
    return isAsciiLetter(char) && !VOWELS.has(char);
  }

  return {
    convertRomajiToKana,
    hiraganaToKatakana
  };
})();
