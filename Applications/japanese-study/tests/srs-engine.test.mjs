import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateNextSrs,
  calculateStreak,
  createSrsRecord,
  getDayKey,
  normalizeSrsRecord
} from '../js/srs-engine.js';

const NOW = new Date('2026-06-29T12:00:00Z').getTime();

test('new SRS records start due today', () => {
  const record = createSrsRecord('a_あ', NOW);

  assert.equal(record.state, 'new');
  assert.equal(record.nextReview, getDayKey(NOW));
  assert.equal(record.interval, 0);
  assert.equal(record.schemaVersion, 1);
});

test('good review schedules the first review for tomorrow', () => {
  const next = calculateNextSrs(createSrsRecord('ka_か', NOW), 'good', NOW);

  assert.equal(next.state, 'review');
  assert.equal(next.interval, 1);
  assert.equal(next.nextReview, '2026-06-30');
  assert.equal(next.repetitions, 1);
});

test('hard review keeps the card in learning and records a lapse', () => {
  const next = calculateNextSrs({ interval: 10, easeFactor: 2.5, repetitions: 4, lapses: 0 }, 'hard', NOW);

  assert.equal(next.state, 'learning');
  assert.equal(next.interval, 1);
  assert.equal(next.repetitions, 0);
  assert.equal(next.lapses, 1);
  assert.ok(next.easeFactor < 2.5);
});

test('normalization clamps corrupted SRS records', () => {
  const normalized = normalizeSrsRecord({
    state: 'oops',
    interval: 999,
    easeFactor: 99,
    repetitions: 999,
    lapses: 999,
    nextReview: 'not-a-date'
  }, 'nu_ぬ', NOW);

  assert.equal(normalized.state, 'new');
  assert.equal(normalized.interval, 90);
  assert.equal(normalized.easeFactor, 3);
  assert.equal(normalized.repetitions, 100);
  assert.equal(normalized.lapses, 100);
  assert.match(normalized.nextReview, /^\d{4}-\d{2}-\d{2}$/);
});

test('streak counts consecutive study days ending today', () => {
  const records = [
    { timestamp: new Date('2026-06-29T08:00:00Z').getTime() },
    { timestamp: new Date('2026-06-28T08:00:00Z').getTime() },
    { timestamp: new Date('2026-06-27T08:00:00Z').getTime() },
    { timestamp: new Date('2026-06-25T08:00:00Z').getTime() }
  ];

  assert.equal(calculateStreak(records, NOW), 3);
});
