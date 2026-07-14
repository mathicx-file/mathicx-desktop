import { toRomaji } from '../vendor/wanakana.js';

export function romanizeDictionaryReadings(readings = []) {
  return [...new Set((Array.isArray(readings) ? readings : [readings])
    .map((reading) => normalizeRomaji(toRomaji(
      String(reading || '').normalize('NFKC'),
      { upcaseKatakana: false },
    )))
    .filter(Boolean))];
}

function normalizeRomaji(value) {
  return String(value || '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase();
}
