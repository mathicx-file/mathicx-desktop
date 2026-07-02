/**
 * mathicx-file · core/shortcuts.js
 * Gestor de atalhos de teclado. Um único listener global (event delegation),
 * emite EVT.HOTKEY para combinações registradas.
 *
 * Combinações suportadas: Mod (Ctrl no Win/Linux, Cmd no Mac) + Shift + Alt + tecla.
 */

import { bus, EVT } from './event-bus.js';

const isMac = () => navigator.platform.toLowerCase().includes('mac');
const MOD = isMac() ? 'Meta' : 'Control';

/** Normaliza um evento de teclado em uma assinatura curta. */
const signature = (e) => {
  const parts = [];
  if (e.ctrlKey || (MOD === 'Meta' && e.metaKey)) parts.push('mod');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  const key = e.key.toLowerCase();
  // ignora modificadores puros
  if (['control', 'shift', 'alt', 'meta'].includes(key)) return null;
  parts.push(key === ' ' ? 'space' : key);
  return parts.join('+');
};

class ShortcutManager {
  constructor() {
    this._map = new Map(); // signature -> { id, handler, allowInInput }
    this._bound = false;
  }

  /** Registra um atalho. Retorna função de cancelamento. */
  register(combo, handler, { id, allowInInput = false } = {}) {
    const sig = this._normalize(combo);
    this._map.set(sig, { id: id ?? sig, handler, allowInInput });
    this._ensureBound();
    return () => this._map.delete(sig);
  }

  unregister(combo) {
    this._map.delete(this._normalize(combo));
  }

  _normalize(combo) {
    return combo.toLowerCase()
      .split('+')
      .map((p) => p.trim())
      .sort((a, b) => {
        const mods = ['mod', 'ctrl', 'cmd', 'meta', 'shift', 'alt'];
        const ai = mods.includes(a) ? 0 : 1;
        const bi = mods.includes(b) ? 0 : 1;
        return ai - bi;
      })
      .map((p) => (p === 'mod' || p === 'ctrl' || p === 'cmd' || p === 'meta' ? 'mod' : p))
      .join('+');
  }

  _ensureBound() {
    if (this._bound) return;
    this._bound = true;
    document.addEventListener('keydown', (e) => this._onKey(e));
  }

  _onKey(e) {
    const sig = signature(e);
    if (!sig) return;
    const entry = this._map.get(sig);
    if (!entry) return;

    // Ignora quando digitando em campos, salvo se explicitamente permitido.
    const tag = (e.target.tagName || '').toLowerCase();
    const inField = ['input', 'textarea', 'select'].includes(tag) || e.target.isContentEditable;
    if (inField && !entry.allowInInput) return;

    // Atalhos do navegador essenciais (ex.: devtools) ficam intactos.
    if (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(e.key.toLowerCase())) return;

    entry.handler(e);
    bus.emit(EVT.HOTKEY, { combo: sig, id: entry.id });
  }
}

export const shortcuts = new ShortcutManager();
