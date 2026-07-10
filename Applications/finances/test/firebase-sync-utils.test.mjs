import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRemoteState,
  buildRemoteSnapshot,
  buildSnapshotPayload,
  countStateRecords,
  hasMeaningfulRemoteState,
  normalizeRevision,
  sanitizeFirestoreId,
} from '../js/firebase/sync-utils.js';

const sampleState = {
  meta: { schema: 1 },
  settings: { theme: 'dark', currency: 'BRL' },
  profiles: [{ id: 'prof_1', name: 'Pessoal' }],
  categories: [{ id: 'cat_1', name: 'Mercado' }],
  transactions: [{ id: 'tx/1', amount: 150, description: 'Compra' }],
  installments: [],
  recurring: [],
  cards: [{ id: 'card_1', name: 'Nubank' }],
  goals: [],
  budgets: [{ categoryId: 'cat_1', limit: 800 }],
  transfers: [],
};

test('firebase sync sanitizes document ids', () => {
  assert.equal(sanitizeFirestoreId('tx/day#1'), 'tx_day_1');
  assert.equal(sanitizeFirestoreId('', 'fallback'), 'fallback');
});

test('firebase sync builds snapshot payload', () => {
  const payload = buildSnapshotPayload(sampleState, {
    exportedAt: '2026-07-09T00:00:00.000Z',
    source: 'test',
  });

  assert.equal(payload.appId, 'finances');
  assert.equal(payload.format, 'finances-backup');
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.exportedAt, '2026-07-09T00:00:00.000Z');
  assert.equal(payload.source, 'test');
  assert.equal(payload.state.settings.theme, 'dark');
  assert.equal(payload.counts.transactions, 1);
  assert.equal(payload.counts.cards, 1);
});

test('firebase sync rebuilds remote state safely', () => {
  const payload = buildSnapshotPayload(sampleState);
  const remoteState = buildRemoteState(payload);

  assert.equal(remoteState.transactions.length, 1);
  assert.equal(remoteState.categories[0].name, 'Mercado');
  assert.equal(remoteState.recurring.length, 0);
  assert.equal(buildRemoteState(null), null);
});

test('firebase sync rebuilds revision metadata', () => {
  const payload = {
    ...buildSnapshotPayload(sampleState),
    revision: 4,
    updatedAt: '2026-07-10T10:00:00.000Z',
  };
  const remote = buildRemoteSnapshot(payload);

  assert.equal(remote.revision, 4);
  assert.equal(remote.updatedAt, '2026-07-10T10:00:00.000Z');
  assert.equal(remote.counts.transactions, 1);
  assert.equal(normalizeRevision(-1), 0);
  assert.equal(normalizeRevision('5'), 5);
});

test('firebase sync counts meaningful financial records', () => {
  const counts = countStateRecords(sampleState);

  assert.equal(counts.settings, 1);
  assert.equal(counts.profiles, 1);
  assert.equal(counts.transactions, 1);
  assert.equal(counts.goals, 0);
  assert.equal(hasMeaningfulRemoteState(sampleState), true);
  assert.equal(hasMeaningfulRemoteState({ settings: {}, transactions: [] }), false);
});
