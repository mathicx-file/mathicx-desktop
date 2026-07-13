import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

import {
  JAPANESE_SHELL_CACHE_PREFIX,
  JAPANESE_SHELL_PREFERENCE_KEY,
  JapaneseAppShellManager,
} from '../js/pwa-manager.js';

test('reports unsupported environments without changing storage', async () => {
  const storage = createStorage();
  const manager = new JapaneseAppShellManager({
    serviceWorker: null,
    cacheStorage: null,
    storage,
    scriptUrl: 'https://example.test/app/service-worker.js',
    scopeUrl: 'https://example.test/app/',
  });

  assert.deepEqual(await manager.initialize(), {
    supported: false,
    enabled: false,
    state: 'unsupported',
  });
  assert.equal(storage.getItem(JAPANESE_SHELL_PREFERENCE_KEY), null);
});

test('enables and fully removes the optional shell cache', async () => {
  const registration = createRegistration('https://example.test/app/');
  const serviceWorker = createServiceWorker(registration);
  const cacheStorage = createCacheStorage(['unrelated-cache']);
  const storage = createStorage();
  const manager = new JapaneseAppShellManager({
    serviceWorker,
    cacheStorage,
    storage,
    scriptUrl: 'https://example.test/app/service-worker.js',
    scopeUrl: registration.scope,
  });

  cacheStorage.names.push(`${JAPANESE_SHELL_CACHE_PREFIX}v1`);
  const enabled = await manager.enable();
  assert.equal(enabled.enabled, true);
  assert.equal(storage.getItem(JAPANESE_SHELL_PREFERENCE_KEY), '1');
  assert.deepEqual(serviceWorker.lastRegister, {
    scriptUrl: 'https://example.test/app/service-worker.js',
    options: { scope: registration.scope, updateViaCache: 'none' },
  });

  const disabled = await manager.disable();
  assert.equal(disabled.enabled, false);
  assert.equal(registration.unregistered, true);
  assert.deepEqual(cacheStorage.names, ['unrelated-cache']);
  assert.equal(storage.getItem(JAPANESE_SHELL_PREFERENCE_KEY), null);
});

test('cleans orphaned registrations when the user preference is disabled', async () => {
  const registration = createRegistration('https://example.test/app/');
  const cacheStorage = createCacheStorage([`${JAPANESE_SHELL_CACHE_PREFIX}old`]);
  const manager = new JapaneseAppShellManager({
    serviceWorker: createServiceWorker(registration),
    cacheStorage,
    storage: createStorage(),
    scriptUrl: 'https://example.test/app/service-worker.js',
    scopeUrl: registration.scope,
  });

  const state = await manager.initialize();
  assert.equal(state.state, 'disabled');
  assert.equal(registration.unregistered, true);
  assert.deepEqual(cacheStorage.names, []);
});

test('repairs the active cache through the service worker without unregistering it', async () => {
  const registration = createRegistration('https://example.test/app/');
  const cacheStorage = createCacheStorage([`${JAPANESE_SHELL_CACHE_PREFIX}v1`]);
  const storage = createStorage();
  const manager = new JapaneseAppShellManager({
    serviceWorker: createServiceWorker(registration),
    cacheStorage,
    storage,
    MessageChannelClass: createMessageChannelClass(),
    scriptUrl: 'https://example.test/app/service-worker.js',
    scopeUrl: registration.scope,
  });

  const state = await manager.repair();
  assert.equal(state.enabled, true);
  assert.equal(registration.unregistered, false);
  assert.equal(registration.active.lastMessage.type, 'REBUILD_SHELL_CACHE');
  assert.equal(storage.getItem(JAPANESE_SHELL_PREFERENCE_KEY), '1');
});

test('service worker keeps dictionary artifacts outside Cache Storage', async () => {
  const source = await fs.readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
  const shellList = source.slice(source.indexOf('const SHELL_PATHS'), source.indexOf('const SHELL_URLS'));

  assert.equal(shellList.includes('/data/dictionary/'), false);
  assert.match(source, /url\.pathname\.includes\(DICTIONARY_PATH_MARKER\)/u);
  assert.match(source, /request\.mode === 'navigate'/u);
  assert.match(source, /networkFirst\(request, INDEX_URL\)/u);
  assert.match(source, /REBUILD_SHELL_CACHE/u);
  assert.match(source, /SHELL_REPAIR_CACHE_NAME/u);
  assert.match(source, /installed-dictionary-packages-source\.js/u);
});

function createRegistration(scope) {
  const active = {
    state: 'activated',
    lastMessage: null,
    postMessage(message, ports) {
      this.lastMessage = message;
      ports[0].postMessage({ ok: true });
    },
  };
  return {
    scope,
    active,
    unregistered: false,
    async unregister() {
      this.unregistered = true;
      return true;
    },
  };
}

function createMessageChannelClass() {
  return class FakeMessageChannel {
    constructor() {
      this.port1 = { onmessage: null, close() {} };
      this.port2 = {
        postMessage: (data) => queueMicrotask(() => this.port1.onmessage?.({ data })),
      };
    }
  };
}

function createServiceWorker(registration) {
  return {
    lastRegister: null,
    async register(scriptUrl, options) {
      this.lastRegister = { scriptUrl, options };
      registration.unregistered = false;
      return registration;
    },
    async getRegistration(scope) {
      return registration.unregistered || registration.scope !== scope ? undefined : registration;
    },
    async getRegistrations() {
      return registration.unregistered ? [] : [registration];
    },
  };
}

function createCacheStorage(initial = []) {
  return {
    names: [...initial],
    async keys() {
      return [...this.names];
    },
    async delete(name) {
      this.names = this.names.filter((item) => item !== name);
      return true;
    },
  };
}

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}
