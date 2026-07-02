/**
 * mathicx-file · storage/local-storage.js
 * Adapter seguro para LocalStorage.
 *
 * Uso: configurações leves, preferências, arrays pequenos.
 * Dados estruturados/volume maior vão para IndexedDB.
 *
 * Tratamento defensivo: quota excedida, JSON inválido e modo privado
 * (onde localStorage pode lançar).
 */

const PREFIX = 'mathicx:';

class LocalStorageAdapter {
  constructor() {
    this._available = this._check();
  }

  _check() {
    try {
      const k = '__mx_test__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }

  _key(name) { return PREFIX + name; }

  get(name, fallback = null) {
    if (!this._available) return fallback;
    try {
      const raw = window.localStorage.getItem(this._key(name));
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  set(name, value) {
    if (!this._available) return false;
    try {
      window.localStorage.setItem(this._key(name), JSON.stringify(value));
      return true;
    } catch (err) {
      // Geralmente QuotaExceededError — avisa e descarta silenciosamente.
      console.warn('[localStorage] falha ao salvar', name, err);
      return false;
    }
  }

  remove(name) {
    if (!this._available) return;
    window.localStorage.removeItem(this._key(name));
  }

  clear() {
    if (!this._available) return;
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => window.localStorage.removeItem(k));
  }

  get available() { return this._available; }
}

export const ls = new LocalStorageAdapter();
