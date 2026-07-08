import test from 'node:test';
import assert from 'node:assert/strict';

test('clearAllUserData clears localStorage keys and progress store', async () => {
  const storage = new Map([
    ['japanese_favorites', '["a_あ"]'],
    ['japanese_dictionary_favorites', '["word-neko"]'],
    ['japanese_srs', '{"a_あ":{"state":"review"}}'],
    ['japanese_settings', '{"dailyGoal":10}']
  ]);
  const store = new Map([['view_a_あ_1', { id: 'view_a_あ_1' }]]);

  globalThis.localStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  };
  globalThis.document = {
    dispatchEvent() {}
  };
  globalThis.CustomEvent = class {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  globalThis.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          objectStoreNames: { contains: () => true },
          transaction() {
            return {
              objectStore() {
                return {
                  clear() {
                    store.clear();
                  },
                  put(record) {
                    store.set(record.id, record);
                  }
                };
              },
              set oncomplete(handler) {
                queueMicrotask(handler);
              },
              set onerror(handler) {
                this._onerror = handler;
              }
            };
          }
        };
        request.onsuccess?.({ target: request });
      });
      return request;
    }
  };

  const moduleUrl = new URL(`../js/storage.js?clear-test=${Date.now()}`, import.meta.url);
  const { JapaneseStorage } = await import(moduleUrl.href);

  await JapaneseStorage.clearAllUserData();

  assert.equal(store.size, 0);
  assert.equal(storage.has('japanese_favorites'), false);
  assert.equal(storage.has('japanese_dictionary_favorites'), false);
  assert.equal(storage.has('japanese_srs'), false);
  assert.equal(storage.has('japanese_settings'), false);
});

test('setUserScope isolates localStorage keys per Firebase user', async () => {
  const storage = new Map();

  globalThis.localStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  };
  globalThis.document = {
    dispatchEvent() {}
  };
  globalThis.CustomEvent = class {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };

  const moduleUrl = new URL(`../js/storage.js?scope-test=${Date.now()}-${Math.random()}`, import.meta.url);
  const { JapaneseStorage } = await import(moduleUrl.href);

  JapaneseStorage.setUserScope('firebase-user-a');
  JapaneseStorage.toggleFavorite('kana-a');

  JapaneseStorage.setUserScope('firebase-user-b');
  assert.deepEqual(JapaneseStorage.getFavorites(), []);
  JapaneseStorage.toggleFavorite('kana-b');

  JapaneseStorage.setUserScope('firebase-user-a');
  assert.deepEqual(JapaneseStorage.getFavorites(), ['kana-a']);

  JapaneseStorage.setUserScope('firebase-user-b');
  assert.deepEqual(JapaneseStorage.getFavorites(), ['kana-b']);
});
