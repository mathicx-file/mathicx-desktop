import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEditorialReview,
  summarizeEditorialReview,
  validateEditorialReview,
} from '../lib/editorial-review.mjs';

const jmdict = {
  entries: [
    entry('jmdict-1', 'jmdict-1:sense:1'),
    entry('jmdict-2', 'jmdict-2:sense:1'),
    entry('jmdict-3', 'jmdict-3:sense:1'),
  ],
  aliases: [
    { legacyId: 'water', entryIds: ['jmdict-1'] },
    { legacyId: 'hana', entryIds: ['jmdict-2', 'jmdict-3'] },
  ],
};
const kanjidic2 = {
  aliases: [{ legacyId: 'water-kanji', entryId: 'kanjidic2-U+6C34' }],
};
const options = {
  jmdict,
  kanjidic2,
  legacyDictionary: [
    { id: 'water', definition: 'agua' },
    { id: 'hana', definition: 'flor; nariz' },
  ],
  legacyKanji: { kanji: [{ id: 'water-kanji', meanings: ['agua'] }] },
  packageVersion: '2026.07.13-1',
  acceptedAt: '2026-07-13',
};

test('accepts unique baseline mappings and leaves ambiguities pending', () => {
  const review = createEditorialReview(options);
  assert.equal(review.lexical[0].status, 'accepted-baseline');
  assert.deepEqual(review.lexical[0].selections[0].glossesPtBR, ['agua']);
  assert.equal(review.lexical[1].status, 'pending');
  assert.deepEqual(review.lexical[1].selections, []);
  assert.equal(review.kanji[0].status, 'accepted-baseline');
  assert.deepEqual(summarizeEditorialReview(review), {
    lexical: { 'accepted-baseline': 1, pending: 1 },
    kanji: { 'accepted-baseline': 1 },
    complete: false,
  });
});

test('rejects pending selections and candidates outside the import', () => {
  const review = createEditorialReview(options);
  review.lexical[1].selections.push({
    entryId: 'jmdict-2', senseId: 'jmdict-2:sense:1', glossesPtBR: ['flor'],
  });
  assert.throws(() => validateEditorialReview(review, options), /Pending lexical review/);

  review.lexical[1].status = 'reviewed';
  review.lexical[1].selections[0].entryId = 'jmdict-999';
  assert.throws(() => validateEditorialReview(review, options), /invalid candidate/);
});

function entry(id, senseId) {
  return { id, senses: [{ id: senseId }] };
}
