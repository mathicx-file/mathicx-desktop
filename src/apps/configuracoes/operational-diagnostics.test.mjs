import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOperationalDiagnostics,
  resolveRuntimeChannel,
  updateDiagnosticHistory,
} from './operational-diagnostics.js';

const NOW = new Date('2026-07-16T12:00:00.000Z');

test('creates a useful report without personal or free-form sync data', () => {
  const report = createOperationalDiagnostics({
    now: () => NOW,
    runtime: { channel: 'local', online: true, secureContext: true },
    auth: {
      mode: 'firebase', authenticated: true, approved: true, admin: false,
      uid: 'private-uid', email: 'private@example.com',
    },
    firebase: {
      config: { projectId: 'mathicx-file-desktop', apiKey: 'private-api-key' },
      appCheck: { enabled: true, status: 'debug', provider: 'recaptcha-enterprise', debug: true },
    },
    apps: [{
      appId: 'japanese-study',
      name: 'Japanese Study',
      state: 'error',
      message: 'private@example.com could not sync private lesson data',
      connectedViaWindow: true,
      capabilities: {
        appVersion: '2.0.0',
        protocolVersion: 1,
        actions: ['sync-now', 'sync-status'],
        sync: { status: true, manual: true },
      },
    }],
  });

  assert.equal(report.firebase.projectId, 'mathicx-file-desktop');
  assert.equal(report.firebase.appCheck.status, 'debug');
  assert.equal(report.apps[0].appVersion, '2.0.0');
  assert.equal(report.apps[0].name, 'Japanese Study');
  assert.equal(report.summary.failures, 1);
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /private-uid|private@example\.com|private-api-key|lesson data/u);
});

test('records only transitions into error and conflict with a bounded history', () => {
  const errorReport = createOperationalDiagnostics({
    now: () => NOW,
    apps: [{ appId: 'finances', state: 'error' }],
  });
  const first = updateDiagnosticHistory(errorReport);
  assert.deepEqual(first.entries, [{
    occurredAt: NOW.toISOString(), appId: 'finances', state: 'error',
  }]);
  const repeated = updateDiagnosticHistory(errorReport, first);
  assert.equal(repeated.entries.length, 1);

  const recovered = updateDiagnosticHistory(createOperationalDiagnostics({
    now: () => NOW,
    apps: [{ appId: 'finances', state: 'synced' }],
  }), repeated);
  const conflict = updateDiagnosticHistory(createOperationalDiagnostics({
    now: () => new Date('2026-07-16T12:05:00.000Z'),
    apps: [{ appId: 'finances', state: 'conflict' }],
  }), recovered);
  assert.equal(conflict.entries.length, 2);
  assert.equal(conflict.entries[0].state, 'conflict');
});

test('classifies local, Pages and generic web runtimes', () => {
  assert.equal(resolveRuntimeChannel('127.0.0.1'), 'local');
  assert.equal(resolveRuntimeChannel('mathicx-file.github.io'), 'github-pages');
  assert.equal(resolveRuntimeChannel('desktop.example.com'), 'web');
});
