import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FIRESTORE_DOCUMENT_LIMIT_BYTES,
  assessSyncArchitecture,
} from '../lib/sync-architecture-assessment.mjs';

test('keeps current architecture while no evidence trigger is present', () => {
  const report = assessSyncArchitecture();

  assert.equal(report.decision, 'keep-current-and-measure');
  assert.equal(report.firestoreDocumentLimitBytes, 1_048_576);
  assert.equal(report.modules.length, 3);
  assert.equal(report.modules.find((item) => item.appId === 'japanese-study').recommendation, 'keep-domain-documents');
});

test('reopens Finances granularization before the Firestore document limit', () => {
  const report = assessSyncArchitecture({
    metrics: {
      finances: {
        payloadBytes: 524_288,
        recordCount: 200,
        conflicts30d: 0,
        syncP95Ms: 300,
        collaborators: 1,
      },
    },
  });
  const finances = report.modules.find((item) => item.appId === 'finances');

  assert.equal(report.decision, 'review-triggered');
  assert.ok(finances.triggers.includes('snapshot-review-size'));
  assert.equal(finances.recommendation, 'review-finances-granularization');
  assert.ok(finances.metrics.payloadBytes < FIRESTORE_DOCUMENT_LIMIT_BYTES);
});

test('reopens realtime design only when collaboration demand exists', () => {
  const report = assessSyncArchitecture({
    metrics: {
      'japanese-study': { collaborators: 2 },
    },
  });
  const japanese = report.modules.find((item) => item.appId === 'japanese-study');

  assert.ok(japanese.triggers.includes('collaboration-demand'));
  assert.equal(japanese.recommendation, 'review-realtime-and-collaboration');
});
