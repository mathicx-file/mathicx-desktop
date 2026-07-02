/**
 * mathicx-file · themes/theme-manager.js
 * Gestão de tema: claro / escuro / auto.
 *
 * "auto" resolve para um tema concreto (light|dark) segundo
 * prefers-color-scheme e reage a mudanças do SO em tempo real.
 * Persistência via store → LocalStorage (wired no kernel).
 */

import { store } from '../core/state.js';
import { bus, EVT } from '../core/event-bus.js';

const ORDER = ['dark', 'light', 'auto'];
const mq = () => window.matchMedia('(prefers-color-scheme: dark)');

class ThemeManager {
  constructor() {
    this._current = 'dark';
    this._resolved = 'dark';
    this._boundMq = null;
  }

  init() {
    const saved = store.get('theme', 'dark');
    this.set(saved);

    // Reage ao SO apenas quando em modo auto.
    this._boundMq = (e) => {
      if (this._current === 'auto') this._apply();
    };
    mq().addEventListener('change', this._boundMq);
  }

  /** Resolve o tema concreto a partir do preferido (auto → light/dark). */
  _resolve() {
    if (this._current === 'auto') return mq().matches ? 'dark' : 'light';
    return this._current;
  }

  _apply() {
    this._resolved = this._resolve();
    document.documentElement.setAttribute('data-theme', this._current);
    // meta theme-color dinâmica
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

  /** Cicla dark → light → auto → dark... */
  cycle() {
    const idx = ORDER.indexOf(this._current);
    this.set(ORDER[(idx + 1) % ORDER.length]);
    return this._current;
  }

  /** Ícone representativo para a UI. */
  get icon() {
    return {
      dark: '🌙',
      light: '☀️',
      auto: '🌗',
    }[this._current];
  }

  get label() {
    return {
      dark: 'Escuro',
      light: 'Claro',
      auto: 'Automático',
    }[this._current];
  }
}

export const themeManager = new ThemeManager();
