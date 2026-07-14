import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APP_DATA_ACTIONS,
  createAppDataResponder,
  createAppDataRequest,
  isAppDataRequest,
} from './app-data-contract.js';
import { AppDataHostRegistry } from './app-data-host.js';
import { createJapaneseAppDataHandlers } from '../../../Applications/japanese-study/js/app-data-adapter.js';
import {
  createFinancesAppDataHandlers,
  validateFinancesBackup,
} from '../../../Applications/finances/js/app-data-adapter.js';
import {
  createDesktopAppDataHandlers,
  validateDesktopBackup,
} from '../../data/desktop/desktop-app-data.js';

test('round-trips correlated requests through a same-origin iframe MessageChannel', async () => {
  const parent = {};
  const target = createMessageTarget(parent);
  const dispose = createAppDataResponder({
    target,
    source: parent,
    appId: 'sample-app',
    handlers: {
      [APP_DATA_ACTIONS.capabilities]: async () => ({ appId: 'sample-app', ready: true }),
    },
  });
  const iframe = {
    contentWindow: {
      postMessage(data, _origin, ports) {
        target.emit({ data, origin: target.location.origin, source: parent, ports });
      },
    },
  };
  const registry = new AppDataHostRegistry();
  registry.register('sample-app', iframe);

  assert.deepEqual(await registry.request('sample-app', APP_DATA_ACTIONS.capabilities), {
    appId: 'sample-app',
    ready: true,
  });
  await assert.rejects(
    registry.request('sample-app', APP_DATA_ACTIONS.syncNow),
    { code: 'unsupported-action' },
  );
  dispose();
});

test('validates protocol identity and isolates local host adapters', async () => {
  const request = createAppDataRequest({
    requestId: 'request-1',
    appId: 'desktop',
    action: APP_DATA_ACTIONS.syncStatus,
  });
  assert.equal(isAppDataRequest(request, 'desktop'), true);
  assert.equal(isAppDataRequest({ ...request, protocolVersion: 2 }, 'desktop'), false);

  const registry = new AppDataHostRegistry();
  const events = [];
  const unsubscribe = registry.subscribe((event) => events.push(event));
  const unregister = registry.registerLocal('desktop', {
    [APP_DATA_ACTIONS.syncStatus]: async () => ({ state: 'synced' }),
  });
  assert.deepEqual(registry.listAvailable(), ['desktop']);
  assert.deepEqual(await registry.request('desktop', APP_DATA_ACTIONS.syncStatus), { state: 'synced' });
  unregister();
  unsubscribe();
  assert.deepEqual(events.map((event) => event.type), ['registered', 'unregistered']);
});

test('announces iframe availability before and after its load signal', () => {
  const registry = new AppDataHostRegistry();
  const iframe = { contentWindow: {} };
  const events = [];
  registry.subscribe((event) => events.push(event.type));
  const unregister = registry.register('japanese-study', iframe);

  assert.equal(registry.isMounted('japanese-study'), true);
  assert.equal(registry.announceReady('japanese-study', iframe), true);
  unregister();
  assert.deepEqual(events, ['registered', 'ready', 'unregistered']);
});

test('Japanese Study adapter exports, validates and requires confirmed imports', async () => {
  const imports = [];
  const completed = [];
  const backup = { format: 'japanese-study-backup', schemaVersion: 1, data: {} };
  const storage = {
    async exportBackup() { return backup; },
    validateImportedBackup(value) {
      return { ok: value?.format === backup.format, errors: value?.format === backup.format ? [] : ['invalid'], summary: {} };
    },
    async importBackup(value, mode) { imports.push({ value, mode }); return { progress: 0 }; },
  };
  const handlers = createJapaneseAppDataHandlers({
    storage,
    getSyncStatus: () => ({ state: 'synced' }),
    syncNow: async () => ({ ok: true }),
    afterImport: async (mode) => completed.push(mode),
  });

  assert.equal((await handlers[APP_DATA_ACTIONS.capabilities]()).backup.containsFinancialData, false);
  assert.deepEqual(await handlers[APP_DATA_ACTIONS.backupExport](), backup);
  await assert.rejects(
    handlers[APP_DATA_ACTIONS.backupImport]({ backup, mode: 'replace' }),
    { code: 'confirmation-required' },
  );
  assert.equal((await handlers[APP_DATA_ACTIONS.backupImport]({ backup, mode: 'merge', confirmed: true })).imported, true);
  assert.equal(imports.length, 1);
  assert.deepEqual(completed, ['merge']);
});

test('Japanese Study adapter does not confirm a restore when its Firebase commit fails', async () => {
  const backup = { format: 'japanese-study-backup', schemaVersion: 1, data: {} };
  const handlers = createJapaneseAppDataHandlers({
    storage: {
      async exportBackup() { return backup; },
      validateImportedBackup() { return { ok: true, errors: [], summary: {} }; },
      async importBackup() { return {}; },
    },
    afterImport: async () => { throw new Error('firebase-write-failed'); },
  });

  await assert.rejects(
    handlers[APP_DATA_ACTIONS.backupImport]({ backup, mode: 'replace', confirmed: true }),
    /firebase-write-failed/,
  );
});

test('Finances adapter wraps raw state in a versioned financial backup', async () => {
  const imported = [];
  const state = { profiles: [{ id: 'p1' }], transactions: [{ id: 't1' }], settings: {} };
  const handlers = createFinancesAppDataHandlers({
    storage: {
      exportSnapshot: () => state,
      importSnapshot: (data, options) => imported.push({ data, options }),
    },
    now: () => new Date('2026-07-14T12:00:00.000Z'),
  });
  const backup = await handlers[APP_DATA_ACTIONS.backupExport]();
  assert.equal(backup.format, 'finances-backup');
  assert.equal((await handlers[APP_DATA_ACTIONS.capabilities]()).backup.containsFinancialData, true);
  assert.deepEqual(validateFinancesBackup(backup).summary, {
    profiles: 1,
    transactions: 1,
    cards: 0,
    goals: 0,
  });
  await handlers[APP_DATA_ACTIONS.backupImport]({ backup, mode: 'replace', confirmed: true });
  assert.equal(imported[0].options.replace, true);
});

test('desktop adapter exports only synchronized preference keys', async () => {
  let state = {
    theme: 'dark',
    widgets: ['clock'],
    favorites: ['finances'],
    sessionToken: 'must-not-export',
  };
  const stateStore = {
    get: () => structuredClone(state),
    set: (value) => { state = { ...state, ...value }; },
  };
  const handlers = createDesktopAppDataHandlers({
    store: stateStore,
    sync: { getStatus: () => ({ state: 'synced' }), syncNow: async () => ({ ok: true }) },
    now: () => new Date('2026-07-14T12:00:00.000Z'),
  });
  const backup = await handlers[APP_DATA_ACTIONS.backupExport]();
  assert.equal(backup.data.sessionToken, undefined);
  assert.deepEqual(validateDesktopBackup(backup).summary.keys, ['theme', 'widgets', 'favorites']);
  await handlers[APP_DATA_ACTIONS.backupImport]({
    backup: { ...backup, data: { theme: 'light' } },
    mode: 'merge',
    confirmed: true,
  });
  assert.equal(state.theme, 'light');
  assert.equal(state.sessionToken, 'must-not-export');
});

function createMessageTarget(parent) {
  const listeners = new Set();
  return {
    parent,
    location: { origin: 'https://desktop.test' },
    addEventListener(type, listener) { if (type === 'message') listeners.add(listener); },
    removeEventListener(type, listener) { if (type === 'message') listeners.delete(listener); },
    emit(event) { listeners.forEach((listener) => listener(event)); },
  };
}
