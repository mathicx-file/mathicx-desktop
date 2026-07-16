import assert from 'node:assert/strict';
import test from 'node:test';

import { APP_DATA_ACTIONS } from '../integration/app-data-contract.js';
import {
  getSyncCenterApps,
  loadSyncCenterState,
  summarizeSyncCenter,
  syncCenterApp,
} from './sync-center.js';

const TEST_APPS = Object.freeze([
  { appId: 'desktop', name: 'Mathicx Desktop', version: '1.0.0', shortName: 'M', canOpen: false, financial: false },
  { appId: 'japanese-study', name: 'Japanese Study', version: '2.0.0', shortName: 'JP', canOpen: true, financial: false },
  { appId: 'finances', name: 'Finances', version: '1.0.0', shortName: '$', canOpen: true, financial: true },
]);

test('central reports closed lazy apps and a live desktop status', async () => {
  const host = createHost({
    desktop: {
      status: { state: 'synced', message: 'Desktop synced.', lastSyncedAt: '2026-07-14T12:00:00.000Z' },
    },
  });
  const apps = await loadSyncCenterState(host, { apps: TEST_APPS });

  assert.equal(apps[0].state, 'synced');
  assert.equal(apps[0].canSync, true);
  assert.equal(apps[1].state, 'closed');
  assert.equal(apps[2].state, 'closed');
  assert.deepEqual(summarizeSyncCenter(apps), { synced: 1, attention: 0, closed: 2 });
});

test('central normalizes conflicts and requests manual sync', async () => {
  const calls = [];
  const host = createHost({
    desktop: { status: { state: 'synced' } },
    finances: { status: { state: 'conflict', message: 'Escolha uma versao.' } },
  }, calls);
  const apps = await loadSyncCenterState(host, { apps: TEST_APPS });
  const finances = apps.find((app) => app.appId === 'finances');

  assert.equal(finances.statusLabel, 'Conflito');
  assert.equal(finances.tone, 'warning');
  await syncCenterApp(host, 'finances');
  assert.equal(calls.at(-1).action, APP_DATA_ACTIONS.syncNow);
});

test('central falls back to an iframe discovered by the window manager', async () => {
  const calls = [];
  const iframe = { contentWindow: {} };
  const host = {
    isMounted: () => false,
    async requestFromIframe(appId, target, action) {
      calls.push({ appId, target, action });
      if (action === APP_DATA_ACTIONS.capabilities) {
        return { appId, appVersion: '2.0.0', protocolVersion: 1, actions: Object.values(APP_DATA_ACTIONS) };
      }
      if (action === APP_DATA_ACTIONS.syncStatus) return { state: 'synced' };
      if (action === APP_DATA_ACTIONS.syncNow) return { ok: true };
      throw new Error('unsupported');
    },
  };
  const apps = await loadSyncCenterState(host, {
    apps: TEST_APPS,
    resolveIframe: (appId) => appId === 'japanese-study' ? iframe : null,
  });
  const japanese = apps.find((app) => app.appId === 'japanese-study');

  assert.equal(japanese.state, 'synced');
  assert.equal(japanese.connectedViaWindow, true);
  await syncCenterApp(host, 'japanese-study', { iframe });
  assert.equal(calls.at(-1).action, APP_DATA_ACTIONS.syncNow);
});

test('central discovers a new integrated manifest without a hardcoded app list', () => {
  const registry = {
    list: () => [{
      id: 'sample-notes',
      name: 'Sample Notes',
      integration: {
        appData: true,
        version: '1.0.0',
        shortName: 'SN',
        canOpen: true,
        financial: false,
        userScoped: true,
        order: 50,
      },
    }],
  };

  assert.deepEqual(getSyncCenterApps(registry).map((app) => app.appId), ['desktop', 'sample-notes']);
});

test('central rejects capabilities that do not match the integrated manifest', async () => {
  const host = {
    isMounted: () => true,
    async request(_appId, action) {
      if (action === APP_DATA_ACTIONS.capabilities) {
        return { appId: 'different-app', appVersion: '1.0.0', protocolVersion: 1, actions: Object.values(APP_DATA_ACTIONS) };
      }
      return { state: 'synced' };
    },
  };
  const [app] = await loadSyncCenterState(host, { apps: [TEST_APPS[1]] });

  assert.equal(app.state, 'error');
  assert.match(app.message, /does not match/);
});

function createHost(definitions, calls = []) {
  return {
    isMounted: (appId) => Boolean(definitions[appId]),
    async request(appId, action) {
      calls.push({ appId, action });
      if (action === APP_DATA_ACTIONS.capabilities) {
        const appVersion = TEST_APPS.find((app) => app.appId === appId)?.version || '1.0.0';
        return { appId, appVersion, protocolVersion: 1, actions: Object.values(APP_DATA_ACTIONS) };
      }
      if (action === APP_DATA_ACTIONS.syncStatus) return definitions[appId].status;
      if (action === APP_DATA_ACTIONS.syncNow) return { ok: true };
      throw new Error('unsupported');
    },
  };
}
