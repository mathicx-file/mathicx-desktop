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
const SCOPED_PREFIX = `${PREFIX}scope/`;

class LocalStorageAdapter {
  constructor() {
    this._available = this._check();
    this._scope = '';
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

  _key(name) {
    return this._scope
      ? `${SCOPED_PREFIX}${this._scope}:${name}`
      : PREFIX + name;
  }

  setScope(scope = '') {
    this._scope = String(scope || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96);
    return this._scope;
  }

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
    const currentPrefix = this._scope
      ? `${SCOPED_PREFIX}${this._scope}:`
      : PREFIX;
    Object.keys(window.localStorage)
      .filter((key) => {
        if (!key.startsWith(currentPrefix)) return false;
        return this._scope || !key.startsWith(SCOPED_PREFIX);
      })
      .forEach((k) => window.localStorage.removeItem(k));
  }

  get available() { return this._available; }
  get scope() { return this._scope; }
}

export const ls = new LocalStorageAdapter();
