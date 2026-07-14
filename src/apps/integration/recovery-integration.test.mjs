import assert from 'node:assert/strict';
import test from 'node:test';

import { createFinancesAppDataHandlers } from '../../../Applications/finances/js/app-data-adapter.js';
import { createJapaneseAppDataHandlers } from '../../../Applications/japanese-study/js/app-data-adapter.js';
import { createDesktopAppDataHandlers } from '../../data/desktop/desktop-app-data.js';
import { AppDataHostRegistry } from './app-data-host.js';
import { collectEncryptedBackup, decryptUnifiedBackup } from './encrypted-backup.js';
import { restoreBackupPackage } from './restore-backup.js';
import { collectUnifiedBackup } from './unified-backup.js';

const PASSWORD = 'senha integrada de recuperacao';

test('round-trips a protected backup through all three real adapters', async () => {
  const harness = await createHarness();
  const apps = await harness.capabilities(['desktop', 'japanese-study', 'finances']);
  const envelope = await collectEncryptedBackup(harness.host, apps, PASSWORD);
  const unified = await decryptUnifiedBackup(envelope, PASSWORD);

  harness.mutateAll();
  const stateBeforeRestore = harness.snapshot();
  let recoveryEnvelope = null;
  const result = await restoreBackupPackage(harness.host, unified, apps.map((app) => ({
    appId: app.appId,
    mode: 'replace',
    capabilities: app.capabilities,
  })), {
    forceEncryptedRecovery: true,
    recoveryPassword: PASSWORD,
    saveRecoveryBackup: async (recovery) => { recoveryEnvelope = recovery.backup; },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(harness.snapshot(), harness.original);
  const recovery = await decryptUnifiedBackup(recoveryEnvelope, PASSWORD);
  assert.deepEqual(readPackageState(recovery), stateBeforeRestore);
  assert.deepEqual(harness.syncEvents.filter((event) => event.type === 'end')
    .map((event) => [event.appId, event.commit]), [
    ['finances', true],
    ['japanese-study', true],
    ['desktop', true],
  ]);
});

test('restores pre-transaction state when Japanese Firebase commit fails', async () => {
  let commits = 0;
  const harness = await createHarness({
    japaneseAfterImport: async () => {
      commits += 1;
      if (commits === 1) throw new Error('network unavailable');
    },
  });
  const apps = await harness.capabilities(['desktop', 'japanese-study']);
  const unified = await collectUnifiedBackup(harness.host, apps);

  harness.mutateAll();
  const stateBeforeRestore = harness.snapshot();
  await assert.rejects(restoreBackupPackage(harness.host, unified, apps.map((app) => ({
    appId: app.appId,
    mode: 'replace',
    capabilities: app.capabilities,
  })), {
    saveRecoveryBackup: async () => {},
  }), { code: 'restore-failed-rolled-back' });

  assert.deepEqual(harness.snapshot(), stateBeforeRestore);
  assert.deepEqual(harness.syncEvents.filter((event) => event.type === 'end')
    .map((event) => event.commit), [false, false]);
});

async function createHarness(options = {}) {
  let desktop = clone(ORIGINAL.desktop);
  let japanese = clone(ORIGINAL['japanese-study']);
  let finances = clone(ORIGINAL.finances);
  const syncEvents = [];
  const host = new AppDataHostRegistry();
  const sync = (appId) => ({
    getStatus: () => ({ state: 'synced' }),
    syncNow: async () => ({ ok: true }),
    beginRestore: () => { syncEvents.push({ type: 'begin', appId }); return { ok: true }; },
    endRestore: ({ commit }) => { syncEvents.push({ type: 'end', appId, commit }); return { ok: true }; },
  });

  host.registerLocal('desktop', createDesktopAppDataHandlers({
    store: {
      get: () => clone(desktop),
      set: (value) => { desktop = { ...desktop, ...clone(value) }; },
    },
    sync: sync('desktop'),
  }));
  host.registerLocal('japanese-study', createJapaneseAppDataHandlers({
    storage: {
      exportBackup: async () => clone(japanese),
      validateImportedBackup: validateJapanese,
      importBackup: async (backup, mode) => {
        japanese = mode === 'replace'
          ? clone(backup)
          : mergeJapanese(japanese, backup);
        return validateJapanese(backup).summary;
      },
    },
    beginRestore: sync('japanese-study').beginRestore,
    endRestore: sync('japanese-study').endRestore,
    afterImport: options.japaneseAfterImport,
  }));
  host.registerLocal('finances', createFinancesAppDataHandlers({
    storage: {
      exportSnapshot: () => clone(finances),
      importSnapshot: (value, { replace }) => {
        finances = replace ? clone(value) : { ...finances, ...clone(value) };
      },
    },
    beginRestore: sync('finances').beginRestore,
    endRestore: sync('finances').endRestore,
  }));

  return {
    host,
    syncEvents,
    original: clone(ORIGINAL),
    async capabilities(appIds) {
      return Promise.all(appIds.map(async (appId) => ({
        appId,
        capabilities: await host.request(appId, 'capabilities'),
      })));
    },
    mutateAll() {
      desktop = clone(MUTATED.desktop);
      japanese = clone(MUTATED['japanese-study']);
      finances = clone(MUTATED.finances);
    },
    snapshot: () => ({
      desktop: clone(desktop),
      'japanese-study': clone(japanese),
      finances: clone(finances),
    }),
  };
}

function validateJapanese(backup) {
  const ok = backup?.format === 'japanese-study-backup'
    && backup.schemaVersion === 1
    && backup.data && typeof backup.data === 'object';
  return {
    ok,
    errors: ok ? [] : ['invalid Japanese backup'],
    summary: {
      favorites: backup?.data?.favorites?.length || 0,
      progress: backup?.data?.progress?.length || 0,
    },
  };
}

function mergeJapanese(current, incoming) {
  return {
    ...clone(current),
    data: {
      ...clone(current.data),
      ...clone(incoming.data),
      favorites: [...new Set([...(current.data.favorites || []), ...(incoming.data.favorites || [])])],
    },
  };
}

function readPackageState(unified) {
  return Object.fromEntries(unified.apps.map((entry) => [
    entry.appId,
    entry.appId === 'japanese-study' ? clone(entry.backup) : clone(entry.backup.data),
  ]));
}

function clone(value) {
  return structuredClone(value);
}

const ORIGINAL = {
  desktop: {
    theme: 'dark',
    widgets: ['clock'],
    widgetLayout: { clock: { x: 1, y: 1 } },
    shortcuts: ['japanese-study'],
    favorites: ['finances'],
    pinned: ['configuracoes'],
  },
  'japanese-study': {
    format: 'japanese-study-backup',
    schemaVersion: 1,
    appVersion: '2.0.0',
    exportedAt: '2026-07-14T12:00:00.000Z',
    data: {
      favorites: ['kana-a'],
      dictionaryFavorites: ['mizu'],
      progress: [{ id: 'progress-1', type: 'quiz', value: 1, timestamp: 1 }],
      srs: { 'kana-a': { charId: 'kana-a', dueAt: 10 } },
      settings: { dailyGoal: 10 },
    },
  },
  finances: {
    profiles: [{ id: 'profile-1', name: 'Principal' }],
    transactions: [{ id: 'transaction-1', amount: 25 }],
    cards: [],
    goals: [{ id: 'goal-1', target: 500 }],
    settings: { currency: 'BRL' },
  },
};

const MUTATED = {
  desktop: {
    theme: 'light',
    widgets: [],
    widgetLayout: {},
    shortcuts: [],
    favorites: [],
    pinned: [],
  },
  'japanese-study': {
    format: 'japanese-study-backup',
    schemaVersion: 1,
    appVersion: '2.0.0',
    exportedAt: '2026-07-14T13:00:00.000Z',
    data: {
      favorites: ['kana-i'],
      dictionaryFavorites: [],
      progress: [{ id: 'progress-2', type: 'quiz', value: 2, timestamp: 2 }],
      srs: {},
      settings: { dailyGoal: 20 },
    },
  },
  finances: {
    profiles: [{ id: 'profile-2', name: 'Teste' }],
    transactions: [],
    cards: [{ id: 'card-1' }],
    goals: [],
    settings: { currency: 'USD' },
  },
};
