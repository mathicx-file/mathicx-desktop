export const DICTIONARY_CACHE_DB_NAME = 'MathicxJapaneseDictionaryCache';
export const DICTIONARY_CACHE_DB_VERSION = 1;

export const DICTIONARY_CACHE_STORES = Object.freeze({
  meta: 'dictionary_meta',
  chunks: 'dictionary_chunks',
  entries: 'dictionary_entries',
  packs: 'dictionary_packs',
  failures: 'dictionary_failures',
});

const ACTIVE_VERSION_KEY = 'active-cache-version';
const PREVIOUS_VERSION_KEY = 'previous-cache-version';
const VERSION_KEY_PREFIX = 'version:';
const PACKAGE_KEY_PREFIX = 'package:';
const PACKAGE_CATALOG_KEY = 'package-catalog';

export class DictionaryCacheRepository {
  constructor(options = {}) {
    this.indexedDB = options.indexedDB || globalThis.indexedDB;
    this.dbName = options.dbName || DICTIONARY_CACHE_DB_NAME;
    this.now = options.now || (() => Date.now());
    this.dbPromise = null;
    this.failureSequence = 0;

    if (!this.indexedDB) {
      throw new Error('IndexedDB is unavailable for the dictionary cache.');
    }
  }

  async open() {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = this.indexedDB.open(this.dbName, DICTIONARY_CACHE_DB_VERSION);
        request.onupgradeneeded = () => upgradeSchema(request.result, request.transaction);
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            this.dbPromise = null;
          };
          resolve(db);
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error(`Dictionary cache database is blocked: ${this.dbName}`));
      });
    }
    return this.dbPromise;
  }

  async close() {
    if (!this.dbPromise) return;
    const db = await this.dbPromise;
    db.close();
    this.dbPromise = null;
  }

  async prepareVersion(version, details = {}) {
    assertVersion(version);
    await this.deleteVersion(version);
    await this.setVersionState(version, {
      status: 'installing',
      startedAt: this.now(),
      ...details,
    });
  }

  async putArtifact(version, descriptor, bytes, kind = 'chunk', packageId = null) {
    assertVersion(version);
    assertDescriptor(descriptor);
    const payload = toArrayBuffer(bytes);
    const db = await this.open();
    const tx = db.transaction(DICTIONARY_CACHE_STORES.chunks, 'readwrite');
    tx.objectStore(DICTIONARY_CACHE_STORES.chunks).put({
      key: artifactKey(version, descriptor.path),
      version,
      path: descriptor.path,
      kind,
      byteLength: descriptor.byteLength,
      sha256: descriptor.sha256,
      packageId: packageId || null,
      bytes: payload,
      storedAt: this.now(),
      lastAccessedAt: this.now(),
    });
    await transactionDone(tx);
  }

  async getArtifact(version, path) {
    const db = await this.open();
    const tx = db.transaction(DICTIONARY_CACHE_STORES.chunks, 'readwrite');
    const store = tx.objectStore(DICTIONARY_CACHE_STORES.chunks);
    const record = await requestResult(
      store.get(artifactKey(version, path)),
    );
    if (record) {
      record.lastAccessedAt = this.now();
      store.put(record);
    }
    await transactionDone(tx);
    return record || null;
  }

  async deleteArtifact(version, path) {
    const db = await this.open();
    const tx = db.transaction(DICTIONARY_CACHE_STORES.chunks, 'readwrite');
    tx.objectStore(DICTIONARY_CACHE_STORES.chunks).delete(artifactKey(version, path));
    await transactionDone(tx);
  }

  async getVersionArtifacts(version) {
    const db = await this.open();
    const tx = db.transaction(DICTIONARY_CACHE_STORES.chunks, 'readonly');
    const records = await requestResult(
      tx.objectStore(DICTIONARY_CACHE_STORES.chunks).index('version').getAll(version),
    );
    await transactionDone(tx);
    return records;
  }

  async getAllArtifacts() {
    const db = await this.open();
    const tx = db.transaction(DICTIONARY_CACHE_STORES.chunks, 'readonly');
    const records = await requestResult(tx.objectStore(DICTIONARY_CACHE_STORES.chunks).getAll());
    await transactionDone(tx);
    return records;
  }

  async getCacheUsage(version) {
    const records = await this.getVersionArtifacts(version);
    return { version, ...summarizeArtifacts(records) };
  }

  async getTotalCacheUsage() {
    return summarizeArtifacts(await this.getAllArtifacts());
  }

  async getPackageUsage(version, packageId) {
    assertVersion(version);
    assertPackageId(packageId);
    const records = (await this.getVersionArtifacts(version))
      .filter((record) => record.packageId === packageId);
    return { version, packageId, ...summarizeArtifacts(records) };
  }

  async clearOptionalArtifacts(version, options = {}) {
    assertVersion(version);
    const protectedKinds = new Set(options.protectedKinds || ['manifest', 'pack', 'license', 'route']);
    const db = await this.open();
    const tx = db.transaction(DICTIONARY_CACHE_STORES.chunks, 'readwrite');
    const request = tx.objectStore(DICTIONARY_CACHE_STORES.chunks).index('version').openCursor(version);
    const result = { version, removedArtifacts: 0, removedBytes: 0, preservedArtifacts: 0 };

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const record = cursor.value;
      if (protectedKinds.has(record.kind)) {
        result.preservedArtifacts += 1;
      } else {
        result.removedArtifacts += 1;
        result.removedBytes += Number(record.byteLength || record.bytes?.byteLength || 0);
        cursor.delete();
      }
      cursor.continue();
    };
    await transactionDone(tx);
    return result;
  }

  async deletePackageArtifacts(version, packageId) {
    assertVersion(version);
    assertPackageId(packageId);
    const db = await this.open();
    const tx = db.transaction(DICTIONARY_CACHE_STORES.chunks, 'readwrite');
    const request = tx.objectStore(DICTIONARY_CACHE_STORES.chunks).index('version').openCursor(version);
    const result = { version, packageId, removedArtifacts: 0, removedBytes: 0 };

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const record = cursor.value;
      if (record.packageId === packageId) {
        result.removedArtifacts += 1;
        result.removedBytes += Number(record.byteLength || record.bytes?.byteLength || 0);
        cursor.delete();
      }
      cursor.continue();
    };
    await transactionDone(tx);
    return result;
  }

  async deleteVersion(version) {
    assertVersion(version);
    const db = await this.open();
    const stores = [DICTIONARY_CACHE_STORES.chunks, DICTIONARY_CACHE_STORES.meta];
    const tx = db.transaction(stores, 'readwrite');
    const chunks = tx.objectStore(DICTIONARY_CACHE_STORES.chunks);
    const cursorRequest = chunks.index('version').openCursor(version);
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
    const meta = tx.objectStore(DICTIONARY_CACHE_STORES.meta);
    meta.delete(versionStateKey(version));
    const metaCursor = meta.openCursor();
    const packagePrefix = `${PACKAGE_KEY_PREFIX}${version}:`;
    metaCursor.onsuccess = () => {
      const cursor = metaCursor.result;
      if (!cursor) return;
      if (String(cursor.key).startsWith(packagePrefix)) cursor.delete();
      cursor.continue();
    };
    await transactionDone(tx);
  }

  async setVersionState(version, state) {
    assertVersion(version);
    const current = await this.getVersionState(version);
    await this.setMeta(versionStateKey(version), {
      ...(current || {}),
      ...state,
      version,
      updatedAt: this.now(),
    });
  }

  async getVersionState(version) {
    return this.getMeta(versionStateKey(version));
  }

  async getVersionStates() {
    const db = await this.open();
    const tx = db.transaction(DICTIONARY_CACHE_STORES.meta, 'readonly');
    const records = await requestResult(tx.objectStore(DICTIONARY_CACHE_STORES.meta).getAll());
    await transactionDone(tx);
    return records
      .filter((record) => record.name.startsWith(VERSION_KEY_PREFIX))
      .map((record) => record.value)
      .filter(Boolean);
  }

  async setPackageState(version, packageId, state) {
    assertVersion(version);
    assertPackageId(packageId);
    const current = await this.getPackageState(version, packageId);
    await this.setMeta(packageStateKey(version, packageId), {
      ...(current || {}),
      ...state,
      version,
      packageId,
      updatedAt: this.now(),
    });
  }

  async getPackageState(version, packageId) {
    assertVersion(version);
    assertPackageId(packageId);
    return this.getMeta(packageStateKey(version, packageId));
  }

  async getPackageStates(packageId = '') {
    if (packageId) assertPackageId(packageId);
    const db = await this.open();
    const tx = db.transaction(DICTIONARY_CACHE_STORES.meta, 'readonly');
    const records = await requestResult(tx.objectStore(DICTIONARY_CACHE_STORES.meta).getAll());
    await transactionDone(tx);
    return records
      .filter((record) => record.name.startsWith(PACKAGE_KEY_PREFIX))
      .map((record) => record.value)
      .filter((state) => state && (!packageId || state.packageId === packageId));
  }

  async setPackageCatalog(catalog) {
    await this.setMeta(PACKAGE_CATALOG_KEY, catalog);
  }

  async getPackageCatalog() {
    return this.getMeta(PACKAGE_CATALOG_KEY);
  }

  async deletePackageState(version, packageId) {
    assertVersion(version);
    assertPackageId(packageId);
    await this.deleteMeta(packageStateKey(version, packageId));
  }

  async getCacheState() {
    const [activeVersion, previousVersion] = await Promise.all([
      this.getMeta(ACTIVE_VERSION_KEY),
      this.getMeta(PREVIOUS_VERSION_KEY),
    ]);
    return {
      activeVersion: activeVersion || null,
      previousVersion: previousVersion || null,
    };
  }

  async promoteVersion(version) {
    assertVersion(version);
    const db = await this.open();
    const tx = db.transaction(DICTIONARY_CACHE_STORES.meta, 'readwrite');
    const store = tx.objectStore(DICTIONARY_CACHE_STORES.meta);

    const candidate = await requestResult(store.get(versionStateKey(version)));
    if (candidate?.value?.status !== 'ready') {
      tx.abort();
      throw new Error(`Dictionary cache version is not ready: ${version}`);
    }

    const active = await requestResult(store.get(ACTIVE_VERSION_KEY));
    const activeVersion = active?.value || null;
    if (activeVersion && activeVersion !== version) {
      store.put({ name: PREVIOUS_VERSION_KEY, value: activeVersion });
    }
    store.put({ name: ACTIVE_VERSION_KEY, value: version });
    await transactionDone(tx);
    return this.getCacheState();
  }

  async rollback() {
    const db = await this.open();
    const tx = db.transaction(DICTIONARY_CACHE_STORES.meta, 'readwrite');
    const store = tx.objectStore(DICTIONARY_CACHE_STORES.meta);
    const active = await requestResult(store.get(ACTIVE_VERSION_KEY));
    const previous = await requestResult(store.get(PREVIOUS_VERSION_KEY));
    const previousVersion = previous?.value || null;

    if (!previousVersion) {
      tx.abort();
      throw new Error('No previous dictionary cache version is available for rollback.');
    }

    const previousState = await requestResult(store.get(versionStateKey(previousVersion)));
    if (previousState?.value?.status !== 'ready') {
      tx.abort();
      throw new Error(`Previous dictionary cache version is not ready: ${previousVersion}`);
    }

    store.put({ name: ACTIVE_VERSION_KEY, value: previousVersion });
    if (active?.value) {
      store.put({ name: PREVIOUS_VERSION_KEY, value: active.value });
    } else {
      store.delete(PREVIOUS_VERSION_KEY);
    }
    await transactionDone(tx);
    return this.getCacheState();
  }

  async cleanupUnprotectedVersions(options = {}) {
    const [cacheState, versions] = await Promise.all([
      this.getCacheState(),
      this.getVersionStates(),
    ]);
    const protectedVersions = new Set([
      cacheState.activeVersion,
      cacheState.previousVersion,
      ...(options.keepVersions || []),
    ].filter(Boolean));
    const result = { removedVersions: [], preservedVersions: [...protectedVersions] };
    for (const versionState of versions) {
      if (protectedVersions.has(versionState.version) || versionState.status === 'installing') continue;
      await this.deleteVersion(versionState.version);
      result.removedVersions.push(versionState.version);
    }
    return result;
  }

  async recordFailure(failure) {
    const db = await this.open();
    const tx = db.transaction(DICTIONARY_CACHE_STORES.failures, 'readwrite');
    const timestamp = this.now();
    const record = {
      id: `${timestamp}:${this.failureSequence++}`,
      timestamp,
      ...failure,
    };
    tx.objectStore(DICTIONARY_CACHE_STORES.failures).put(record);
    await transactionDone(tx);
    return record;
  }

  async getFailures(version) {
    const db = await this.open();
    const tx = db.transaction(DICTIONARY_CACHE_STORES.failures, 'readonly');
    const records = await requestResult(
      tx.objectStore(DICTIONARY_CACHE_STORES.failures).index('version').getAll(version),
    );
    await transactionDone(tx);
    return records;
  }

  async getMeta(name) {
    const db = await this.open();
    const tx = db.transaction(DICTIONARY_CACHE_STORES.meta, 'readonly');
    const record = await requestResult(tx.objectStore(DICTIONARY_CACHE_STORES.meta).get(name));
    await transactionDone(tx);
    return record?.value ?? null;
  }

  async setMeta(name, value) {
    const db = await this.open();
    const tx = db.transaction(DICTIONARY_CACHE_STORES.meta, 'readwrite');
    tx.objectStore(DICTIONARY_CACHE_STORES.meta).put({ name, value });
    await transactionDone(tx);
  }

  async deleteMeta(name) {
    const db = await this.open();
    const tx = db.transaction(DICTIONARY_CACHE_STORES.meta, 'readwrite');
    tx.objectStore(DICTIONARY_CACHE_STORES.meta).delete(name);
    await transactionDone(tx);
  }
}

function upgradeSchema(db, transaction) {
  const meta = ensureStore(db, transaction, DICTIONARY_CACHE_STORES.meta, { keyPath: 'name' });
  const chunks = ensureStore(db, transaction, DICTIONARY_CACHE_STORES.chunks, { keyPath: 'key' });
  const entries = ensureStore(db, transaction, DICTIONARY_CACHE_STORES.entries, { keyPath: 'key' });
  const packs = ensureStore(db, transaction, DICTIONARY_CACHE_STORES.packs, { keyPath: 'key' });
  const failures = ensureStore(db, transaction, DICTIONARY_CACHE_STORES.failures, { keyPath: 'id' });

  ensureIndex(chunks, 'version', 'version');
  ensureIndex(chunks, 'kind', 'kind');
  ensureIndex(chunks, 'lastAccessedAt', 'lastAccessedAt');
  ensureIndex(entries, 'version', 'version');
  ensureIndex(entries, 'shard', 'shard');
  ensureIndex(packs, 'version', 'version');
  ensureIndex(failures, 'version', 'version');
  ensureIndex(failures, 'timestamp', 'timestamp');
  void meta;
}

function ensureStore(db, transaction, name, options) {
  return db.objectStoreNames.contains(name)
    ? transaction.objectStore(name)
    : db.createObjectStore(name, options);
}

function ensureIndex(store, name, keyPath) {
  if (!store.indexNames.contains(name)) {
    store.createIndex(name, keyPath, { unique: false });
  }
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted.'));
  });
}

function artifactKey(version, path) {
  return `${version}\u0000${path}`;
}

function versionStateKey(version) {
  return `${VERSION_KEY_PREFIX}${version}`;
}

function packageStateKey(version, packageId) {
  return `${PACKAGE_KEY_PREFIX}${version}:${packageId}`;
}

function toArrayBuffer(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
}

function assertVersion(version) {
  if (!String(version || '').trim()) throw new Error('Dictionary cache version is required.');
}

function assertPackageId(packageId) {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(String(packageId || ''))) {
    throw new Error(`Invalid dictionary package id: ${packageId}`);
  }
}

function assertDescriptor(descriptor) {
  if (!descriptor?.path || !Number.isInteger(descriptor.byteLength) || !descriptor.sha256) {
    throw new Error('Invalid dictionary artifact descriptor.');
  }
}

function summarizeArtifacts(records) {
  const byKind = {};
  const byVersion = {};
  const byPackage = {};
  let byteLength = 0;
  for (const record of records) {
    const bytes = Number(record.byteLength || record.bytes?.byteLength || 0);
    byteLength += bytes;
    addUsage(byKind, record.kind || 'chunk', bytes);
    addUsage(byVersion, record.version || 'unknown', bytes);
    if (record.packageId) addUsage(byPackage, record.packageId, bytes);
  }
  return { artifacts: records.length, byteLength, byKind, byVersion, byPackage };
}

function addUsage(target, key, byteLength) {
  const current = target[key] || { artifacts: 0, byteLength: 0 };
  current.artifacts += 1;
  current.byteLength += byteLength;
  target[key] = current;
}
