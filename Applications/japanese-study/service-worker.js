const SHELL_CACHE_PREFIX = 'mathicx-japanese-shell-';
const SHELL_CACHE_NAME = `${SHELL_CACHE_PREFIX}v9`;
const SHELL_REPAIR_CACHE_NAME = `${SHELL_CACHE_NAME}-repair`;
const DICTIONARY_PATH_MARKER = '/data/dictionary/';
const SHELL_PATHS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/pwa-manager.js',
  './js/ui.js',
  './js/storage.js',
  './js/search.js',
  './js/dictionary.js',
  './js/gamification-engine.js',
  './js/kana-input.js',
  './js/kana-print-export.js',
  './js/learning-levels.js',
  './js/practice.js',
  './js/quiz.js',
  './js/recommendation-engine.js',
  './js/srs-engine.js',
  './js/stroke-player.js',
  './js/study-engine.js',
  './js/typing-content-provider.js',
  './js/typing-evaluator.js',
  './js/typing-session.js',
  './js/dictionary/dictionary-cache-installer.js',
  './js/dictionary/dictionary-cache-repository.js',
  './js/dictionary/dictionary-package-manager.js',
  './js/dictionary/dictionary-provider.js',
  './js/dictionary/dictionary-release-client.js',
  './js/dictionary/dictionary-runtime.js',
  './js/dictionary/dictionary-schema.js',
  './js/dictionary/dictionary-storage-manager.js',
  './js/dictionary/dictionary-update-manager.js',
  './js/dictionary/installed-dictionary-packages-source.js',
  './js/dictionary/kana-romanizer.js',
  './js/dictionary/lazy-dictionary-source.js',
  './js/dictionary/legacy-dictionary-source.js',
  './js/app-data-adapter.js',
  './js/vendor/wanakana.js',
  './data/hiragana.json',
  './data/katakana.json',
  './data/kanji.json',
  './data/typing-exercises.json',
  '../../src/firebase/feature-flags.js',
  '../../src/apps/integration/app-data-contract.js',
];

const SHELL_URLS = new Set(SHELL_PATHS.map((path) => canonicalUrl(new URL(path, self.registration.scope))));
const INDEX_URL = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await populateCache(SHELL_CACHE_NAME);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(SHELL_CACHE_PREFIX) && name !== SHELL_CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.includes(DICTIONARY_PATH_MARKER)) return;

  if (request.mode === 'navigate' && url.href.startsWith(self.registration.scope)) {
    event.respondWith(networkFirst(request, INDEX_URL));
    return;
  }

  if (SHELL_URLS.has(canonicalUrl(url))) {
    event.respondWith(networkFirst(request));
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'REBUILD_SHELL_CACHE') return;
  event.waitUntil((async () => {
    try {
      await rebuildShellCache();
      event.ports[0]?.postMessage({ ok: true });
    } catch (error) {
      event.ports[0]?.postMessage({ ok: false, error: error?.message || String(error) });
    }
  })());
});

async function networkFirst(request, fallbackUrl = '') {
  const cache = await caches.open(SHELL_CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl, { ignoreSearch: true });
      if (fallback) return fallback;
    }
    throw error;
  }
}

async function rebuildShellCache() {
  await caches.delete(SHELL_REPAIR_CACHE_NAME);
  const staging = await populateCache(SHELL_REPAIR_CACHE_NAME);
  const target = await caches.open(SHELL_CACHE_NAME);
  const [oldRequests, newRequests] = await Promise.all([target.keys(), staging.keys()]);
  await Promise.all(oldRequests.map((request) => target.delete(request)));
  for (const request of newRequests) {
    const response = await staging.match(request);
    if (response) await target.put(request, response);
  }
  await caches.delete(SHELL_REPAIR_CACHE_NAME);
}

async function populateCache(name) {
  const cache = await caches.open(name);
  await cache.addAll(SHELL_PATHS);
  return cache;
}

function canonicalUrl(url) {
  const canonical = new URL(url.href);
  canonical.search = '';
  canonical.hash = '';
  return canonical.href;
}
