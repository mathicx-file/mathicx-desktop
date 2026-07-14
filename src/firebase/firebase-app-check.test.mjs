import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveAppCheckRuntime } from './firebase-app-check.js';
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
