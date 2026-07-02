/**
 * mathicx-file · core/state.js
 * Store reativo minimalista (sem dependências).
 *
 * Princípios:
 *  - Estado único fonte de verdade (slice por chave).
 *  - Subscribers recebem ({value, prev}, key).
 *  - Mutação apenas via set() → rastreável.
 *  - Persistência opcional via storage adapter (plugável).
 */

export class Store {
  constructor(initial = {}) {
    this._state = { ...initial };
    this._subs = new Map(); // chave -> Set<handler>
    this._persistor = null; // função (state) => void
  }

  /** Registra um persistor (ex.: salvar em LocalStorage). */
  attachPersistor(fn, { auto = true } = {}) {
    this._persistor = fn;
    if (auto) this._persistor(this._state);
    return this;
  }

  get(key, fallback = undefined) {
    return key === undefined
      ? { ...this._state }
      : (key in this._state ? this._state[key] : fallback);
  }

  /** Define uma chave e notifica apenas os subscribers dela. */
  set(key, value) {
    if (typeof key === 'object' && key !== null) {
      // set({ a: 1, b: 2 })
      const changed = [];
      for (const k in key) {
        if (this._state[k] !== key[k]) {
          const prev = this._state[k];
          this._state[k] = key[k];
          changed.push([k, key[k], prev]);
        }
      }
      changed.forEach(([k, v, p]) => this._notify(k, v, p));
    } else {
      const prev = this._state[key];
      if (prev === value) return;
      this._state[key] = value;
      this._notify(key, value, prev);
    }
    this._persistor?.(this._state);
  }

  /** Atualiza parcial (merge raso) de uma chave-objeto. */
  patch(key, partial) {
    const current = this._state[key] ?? {};
    this.set(key, { ...current, ...partial });
  }

  subscribe(key, handler) {
    if (!this._subs.has(key)) this._subs.set(key, new Set());
    this._subs.get(key).add(handler);
    return () => this._subs.get(key)?.delete(handler);
  }

  _notify(key, value, prev) {
    this._subs.get(key)?.forEach((fn) => fn({ value, prev }, key));
  }
}

/** Store global da aplicação. */
export const store = new Store();
