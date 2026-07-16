import assert from 'node:assert/strict';
import test from 'node:test';

import { IDBFactory, indexedDB } from 'fake-indexeddb';

import {
  ensureAppCheckDebugTokenStore,
  readStoredAppCheckDebugToken,
  resolveAppCheckRuntime,
} from './firebase-app-check.js';
import { firebaseConfig as productionConfig } from './firebase-config.prod.js';

const enabledConfig = {
  appCheck: {
    enabled: true,
    provider: 'recaptcha-enterprise',
    siteKey: 'public-site-key',
  },
};

test('App Check remains disabled until the public site key rollout is approved', () => {
  const runtime = resolveAppCheckRuntime({ appCheck: { enabled: false } });
  assert.deepEqual(runtime, {
    enabled: false,
    status: 'disabled',
    reason: 'configuration',
  });
});

test('Firebase emulators bypass App Check even when production config enables it', () => {
  const runtime = resolveAppCheckRuntime(enabledConfig, { emulatorsEnabled: true });
  assert.equal(runtime.enabled, false);
  assert.equal(runtime.reason, 'emulators');
});

test('Enterprise provider is prepared for production observation mode', () => {
  const runtime = resolveAppCheckRuntime(enabledConfig, {
    hostname: 'mathicx-file.github.io',
  });
  assert.equal(runtime.enabled, true);
  assert.equal(runtime.provider, 'recaptcha-enterprise');
  assert.equal(runtime.debug, false);
});

test('production config enables Enterprise observation without debug material', () => {
  const runtime = resolveAppCheckRuntime(productionConfig, {
    hostname: 'mathicx-file.github.io',
  });

  assert.equal(runtime.enabled, true);
  assert.equal(runtime.status, 'ready');
  assert.equal(runtime.provider, 'recaptcha-enterprise');
  assert.match(runtime.siteKey, /^6L[A-Za-z0-9_-]{38}$/u);
  assert.equal(runtime.debug, false);
});

test('missing site keys and unsupported providers are reported as misconfigured', () => {
  const missingKey = resolveAppCheckRuntime({
    appCheck: { enabled: true, provider: 'recaptcha-enterprise', siteKey: '' },
  });
  const unsupported = resolveAppCheckRuntime({
    appCheck: { enabled: true, provider: 'custom', siteKey: 'public-site-key' },
  });

  assert.equal(missingKey.status, 'misconfigured');
  assert.equal(missingKey.reason, 'missing-site-key');
  assert.equal(unsupported.reason, 'unsupported-provider');
});

test('debug mode is accepted only on localhost', () => {
  const config = {
    appCheck: { ...enabledConfig.appCheck, debug: true },
  };
  const local = resolveAppCheckRuntime(config, { hostname: 'localhost' });
  const production = resolveAppCheckRuntime(config, { hostname: 'mathicx-file.github.io' });

  assert.equal(local.enabled, true);
  assert.equal(local.debug, true);
  assert.equal(production.enabled, false);
  assert.equal(production.reason, 'debug-outside-localhost');
});

test('an explicit local token enables debug without affecting production hosts', () => {
  const config = {
    appCheck: {
      ...enabledConfig.appCheck,
      debug: false,
      debugToken: '123a4567-b89c-12d3-a456-426614174000',
    },
  };
  const local = resolveAppCheckRuntime(config, { hostname: '127.0.0.1' });
  const production = resolveAppCheckRuntime(config, { hostname: 'mathicx-file.github.io' });

  assert.equal(local.enabled, true);
  assert.equal(local.debug, true);
  assert.equal(production.enabled, false);
  assert.equal(production.reason, 'debug-outside-localhost');
});

test('reads the persisted local debug token without embedding it in source', async () => {
  await new Promise((resolve, reject) => {
    const request = indexedDB.open('firebase-app-check-database', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('firebase-app-check-store', { keyPath: 'compositeKey' });
    };
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('firebase-app-check-store', 'readwrite');
      transaction.objectStore('firebase-app-check-store').put({
        compositeKey: 'debug-token',
        value: 'generated-debug-token-for-test',
      });
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });

  assert.equal(
    await readStoredAppCheckDebugToken(indexedDB),
    'generated-debug-token-for-test',
  );
});

test('repairs an App Check debug database created without its object store', async () => {
  const malformedIndexedDB = new IDBFactory();
  await new Promise((resolve, reject) => {
    const request = malformedIndexedDB.open('firebase-app-check-database', 1);
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });

  assert.equal(await ensureAppCheckDebugTokenStore(malformedIndexedDB), true);
  assert.equal(await readStoredAppCheckDebugToken(malformedIndexedDB), null);
});
