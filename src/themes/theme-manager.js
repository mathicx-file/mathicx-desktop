/**
 * mathicx-file - themes/theme-manager.js
 * Gestao de tema: claro / escuro.
 *
 * Persistencia via store -> LocalStorage (wired no kernel).
 */

import { store } from '../core/state.js';
import { bus, EVT } from '../core/event-bus.js';

const ORDER = ['dark', 'light'];

class ThemeManager {
  constructor() {
    this._current = 'dark';
    this._resolved = 'dark';
  }

  init() {
    const saved = store.get('theme', 'dark');
    this.set(saved);
  }

  _resolve() {
    return this._current;
  }

  _apply() {
    this._resolved = this._resolve();
    document.documentElement.setAttribute('data-theme', this._current);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = this._resolved === 'dark' ? '#0a0c14' : '#eef1f7';
    bus.emit(EVT.THEME_CHANGE, { theme: this._current, resolved: this._resolved });
  }

  get current() { return this._current; }
  get resolved() { return this._resolved; }

  set(theme) {
    if (!ORDER.includes(theme)) theme = 'dark';
    this._current = theme;
    store.set('theme', theme);
    this._apply();
  }

  cycle() {
    const idx = ORDER.indexOf(this._current);
    this.set(ORDER[(idx + 1) % ORDER.length]);
    return this._current;
  }

  get icon() {
    return {
      dark: '🌙',
      light: '☀️',
    }[this._current] || '🌙';
  }

  get label() {
    return {
      dark: 'Escuro',
      light: 'Claro',
    }[this._current] || 'Escuro';
  }
}

export const themeManager = new ThemeManager();
