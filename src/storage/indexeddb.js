/**
 * mathicx-file · storage/indexeddb.js
 * Adapter genérico para IndexedDB (Promise-based).
 *
 * Stores:
 *  - fs       : filesystem virtual (pastas/documentos) — keyPath 'id'
 *  - widgets  : estado de widgets          — keyPath 'id'
 *  - windows  : estado de janelas salvas   — keyPath 'id'
 *  - kv       : chave/valor variado        — keyPath 'key'
 *
 * Cada store exposto via db.store('nome') devolvendo um CRUD simples.
 */

const DB_NAME = 'mathicx-file';
const DB_VERSION = 2;
const STORE_DEFS = [
  { name: 'fs',      keyPath: 'id',   indexes: [['parentId'], ['type'], ['starred'], ['updatedAt']] },
  { name: 'widgets', keyPath: 'id',   indexes: [['order']] },
  { name: 'windows',  keyPath: 'id',   indexes: [['appId']] },
  { name: 'kv',      keyPath: 'key' },
  // Auth — usuários, sessões e estatísticas de uso
  { name: 'users',    keyPath: 'id',   indexes: [['email'], ['username'], ['createdAt']] },
  { name: 'sessions', keyPath: 'key',  indexes: [['userId'], ['expiresAt']] },
  { name: 'stats',    keyPath: 'id',   indexes: [['userId'], ['app'], ['type'], ['ts']] },
];

class IndexedDBAdapter {
  constructor() {
    this._db = null;
    this._opening = null;
  }

  open() {
    if (this._db) return Promise.resolve(this._db);
    if (this._opening) return this._opening;

    this._opening = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB indisponível'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        for (const def of STORE_DEFS) {
          if (!db.objectStoreNames.contains(def.name)) {
            const store = db.createObjectStore(def.name, { keyPath: def.keyPath });
            (def.indexes || []).forEach(([name, opts]) =>
              store.createIndex(name, name, opts || {})
            );
          }
        }
      };

      req.onsuccess = () => { this._db = req.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
    return this._opening;
  }

  /** Retorna facade CRUD para um store. */
  store(name) {
    return new StoreFacade(this, name);
  }

  async _tx(storeName, mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let result;
      try {
        result = fn(store);
      } catch (err) {
        reject(err); return;
      }
      tx.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
}

class StoreFacade {
  constructor(adapter, name) {
    this.adapter = adapter;
    this.name = name;
  }

  /** Pega 1 registro por chave. */
  async get(key) {
    const db = await this.adapter.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.name, 'readonly');
      const req = tx.objectStore(this.name).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  /** Lista todos (com filtro opcional via index). */
  async all({ index, range, filter } = {}) {
    const db = await this.adapter.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.name, 'readonly');
      const source = index ? tx.objectStore(this.name).index(index) : tx.objectStore(this.name);
      const req = source.openCursor(range);
      const out = [];
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) {
          if (!filter || filter(cur.value)) out.push(cur.value);
          cur.continue();
        } else {
          resolve(out);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async put(record) {
    const db = await this.adapter.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.name, 'readwrite');
      tx.objectStore(this.name).put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);
    });
  }

  async putMany(records) {
    const db = await this.adapter.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.name, 'readwrite');
      const store = tx.objectStore(this.name);
      records.forEach((r) => store.put(r));
      tx.oncomplete = () => resolve(records);
      tx.onerror = () => reject(tx.error);
    });
  }

  async delete(key) {
    const db = await this.adapter.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.name, 'readwrite');
      tx.objectStore(this.name).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clear() {
    const db = await this.adapter.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.name, 'readwrite');
      tx.objectStore(this.name).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const db = new IndexedDBAdapter();
