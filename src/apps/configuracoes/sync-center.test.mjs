import assert from 'node:assert/strict';
import test from 'node:test';

import { APP_DATA_ACTIONS } from '../integration/app-data-contract.js';
import {
  loadSyncCenterState,
  summarizeSyncCenter,
  syncCenterApp,
} from './sync-center.js';

test('central reports closed lazy apps and a live desktop status', async () => {
  const host = createHost({
    desktop: {
      status: { state: 'synced', message: 'Desktop synced.', lastSyncedAt: '2026-07-14T12:00:00.000Z' },
    },
  });
  const apps = await loadSyncCenterState(host);

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
  const apps = await loadSyncCenterState(host);
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
        return { appId, actions: Object.values(APP_DATA_ACTIONS) };
      }
      if (action === APP_DATA_ACTIONS.syncStatus) return { state: 'synced' };
      if (action === APP_DATA_ACTIONS.syncNow) return { ok: true };
      throw new Error('unsupported');
    },
  };
  const apps = await loadSyncCenterState(host, {
    resolveIframe: (appId) => appId === 'japanese-study' ? iframe : null,
  });
  const japanese = apps.find((app) => app.appId === 'japanese-study');

  assert.equal(japanese.state, 'synced');
  assert.equal(japanese.connectedViaWindow, true);
  await syncCenterApp(host, 'japanese-study', { iframe });
  assert.equal(calls.at(-1).action, APP_DATA_ACTIONS.syncNow);
});

function createHost(definitions, calls = []) {
  return {
    isMounted: (appId) => Boolean(definitions[appId]),
    async request(appId, action) {
      calls.push({ appId, action });
      if (action === APP_DATA_ACTIONS.capabilities) {
        return { appId, actions: Object.values(APP_DATA_ACTIONS) };
      }
      if (action === APP_DATA_ACTIONS.syncStatus) return definitions[appId].status;
      if (action === APP_DATA_ACTIONS.syncNow) return { ok: true };
      throw new Error('unsupported');
    },
  };
}
