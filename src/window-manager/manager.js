/**
 * mathicx-file · window-manager/manager.js
 * Gerenciador de janelas. Cria/remove/foca/minimiza/maximiza janelas,
 * controla z-index, cascata, e orquestra o carregamento lazy dos apps.
 *
 * Injeta dependências (bus, store) — sem acoplamento a singletons globais.
 */

import { bus, EVT } from '../core/event-bus.js';
import { store } from '../core/state.js';
import { appRegistry } from '../apps/registry.js';
import { AppWindow } from './window.js';
import { SnapManager } from './snap.js';
import { attachInteractions } from './interactions.js';
import { clamp } from '../core/utils.js';
import { spinnerHTML } from '../ui/components.js';
import { toast } from '../ui/toast.js';
import { logActivity } from '../ui/activity-log.js';

const TASKBAR = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-h')) || 56;

export class WindowManager {
  constructor({ bus: b = bus, store: s = store } = {}) {
    this.bus = b;
    this.store = s;
    /** id(AppWindow) -> AppWindow */
    this._windows = new Map();
    /** appId -> winId (para focar janelas existentes ao reabrir) */
    this._byApp = new Map();
    this._z = 100;
    this._cascade = 0;
    this._focusedId = null;
    this._layer = null;
    this.snap = null;
  }

  init() {
    this._layer = document.createElement('div');
    this._layer.id = 'windowsLayer';
    document.getElementById('app').appendChild(this._layer);
    this.snap = new SnapManager(this);

    // Recoloca janelas dentro da viewport ao redimensionar
    window.addEventListener('resize', () => this._constrainAll());
  }

  /** Abre (ou foca) uma janela para o app. */
  open(appId, opts = {}) {
    const manifest = appRegistry.get(appId);
    if (!manifest) { toast.error(`App desconhecido: ${appId}`); return null; }

    // Já aberta? Foca/restaura.
    const existing = this._byApp.get(appId);
    if (existing) {
      const win = this._windows.get(existing);
      if (win.minimized) this.restore(win.id);
      this.focus(win.id);
      if (opts.action || opts.payload) {
        this.bus.emit(EVT.APP_ACTION, {
          appId,
          winId: win.id,
          action: opts.action || 'open',
          payload: opts.payload || {},
        });
      }
      return win;
    }

    const rect = this._computeRect(manifest, opts);
    const win = new AppWindow({ appId, manifest, rect, layer: this._layer });
    win.launchOptions = {
      action: opts.action || '',
      payload: opts.payload || {},
    };
    this._windows.set(win.id, win);
    this._byApp.set(appId, win.id);

    attachInteractions(win, this, this.snap);
    this.snap.attachTo(win);
    this.focus(win.id);

    // Stats: uso + recentes
    this._trackLaunch(appId);
    logActivity(manifest.icon, `Abriu ${manifest.name}`);

    // Carregamento lazy do conteúdo
    this._mountApp(win);

    this.bus.emit(EVT.WINDOW_OPEN, { id: win.id, appId });
    return win;
  }

  async _mountApp(win) {
    const host = win.contentEl;
    host.innerHTML = spinnerHTML('Carregando app...');
    try {
      const mod = await win.manifest.loader();
      if (typeof mod.default === 'function') {
        win._cleanup = await mod.default(host, { win, wm: this, bus: this.bus });
      } else if (typeof mod.mount === 'function') {
        win._cleanup = await mod.mount(host, { win, wm: this, bus: this.bus });
      }
    } catch (err) {
      console.error(`[wm] erro ao montar app ${win.appId}:`, err);
      host.innerHTML = `<div style="padding:24px;color:var(--danger);font-size:13px;">Falha ao carregar o app: ${err.message}</div>`;
    }
  }

  _computeRect(manifest, opts) {
    const isSmall = window.innerWidth < 760;
    const def = manifest.defaultSize || { width: 640, height: 480 };
    if (isSmall) {
      return { width: window.innerWidth, height: window.innerHeight - TASKBAR(), left: 0, top: 0, z: ++this._z };
    }
    const w = opts.width ?? Math.min(def.width, window.innerWidth - 40);
    const h = opts.height ?? Math.min(def.height, window.innerHeight - TASKBAR() - 40);
    const offset = (this._cascade % 6) * 28;
    this._cascade++;
    const left = clamp(60 + offset, 0, window.innerWidth - w - 20);
    const top = clamp(40 + offset, 0, window.innerHeight - h - TASKBAR() - 20);
    return { width: w, height: h, left, top, z: ++this._z };
  }

  focus(id) {
    const win = this._windows.get(id);
    if (!win) return;
    this._windows.forEach((w) => { w.focused = false; w.el.classList.remove('focused'); });
    win.focused = true;
    win.el.classList.add('focused');
    win.el.style.zIndex = ++this._z;
    this._focusedId = id;
    this.bus.emit(EVT.WINDOW_FOCUS, { id });
  }

  getFocused() {
    return this._focusedId ? this._windows.get(this._focusedId) : null;
  }

  getById(id) { return this._windows.get(id); }
  list() { return [...this._windows.values()]; }
  isOpen(appId) { return this._byApp.has(appId); }

  minimize(id) {
    const win = this._windows.get(id);
    if (!win) return;
    win.minimized = true;
    win.el.classList.add('minimized', );
    win.el.classList.remove('focused');
    if (this._focusedId === id) {
      // foca a próxima visível
      const next = this.list().filter((w) => !w.minimized).sort((a, b) => b.el.style.zIndex - a.el.style.zIndex)[0];
      this._focusedId = null;
      if (next) this.focus(next.id);
    }
    this.bus.emit(EVT.WINDOW_MINIMIZE, { id });
  }

  restore(id) {
    const win = this._windows.get(id);
    if (!win) return;
    win.minimized = false;
    win.el.classList.remove('minimized');
    this.focus(id);
    this.bus.emit(EVT.WINDOW_RESTORE, { id });
  }

  toggleMinimize(id) {
    const win = this._windows.get(id);
    if (!win) return;
    win.minimized ? this.restore(id) : this.minimize(id);
  }

  toggleMaximize(id, { restoreOnly = false } = {}) {
    const win = this._windows.get(id);
    if (!win) return;
    if (win.snapped) { win.snapped = null; win.el.classList.remove('snapped'); }

    if (!win.maximized) {
      win.snapshot();
      win.el.classList.add('maximized');
      win.maximized = true;
      win.setMaxIcon(true);
      this.focus(id);
      this.bus.emit(EVT.WINDOW_MAXIMIZE, { id, maximized: true });
    } else if (!restoreOnly) {
      win.el.classList.remove('maximized');
      win.maximized = false;
      win.restoreSnapshot();
      win.setMaxIcon(false);
      this.focus(id);
      this.bus.emit(EVT.WINDOW_MAXIMIZE, { id, maximized: false });
    }
  }

  async close(id) {
    const win = this._windows.get(id);
    if (!win) return;
    this.bus.emit(EVT.WINDOW_CLOSE, { id, appId: win.appId });
    await win.destroy();
    this._windows.delete(id);
    this._byApp.delete(win.appId);
    if (this._focusedId === id) {
      const next = this.list().filter((w) => !w.minimized).sort((a, b) => b.el.style.zIndex - a.el.style.zIndex)[0];
      this._focusedId = null;
      if (next) this.focus(next.id);
    }
  }

  /** Minimiza todas. */
  minimizeAll() {
    this._windows.forEach((w) => { if (!w.minimized) this.minimize(w.id); });
  }

  _constrainAll() {
    this._windows.forEach((w) => {
      if (w.maximized) return;
      const r = w.getRect();
      const maxLeft = window.innerWidth - 80;
      const maxTop = window.innerHeight - TASKBAR() - 40;
      if (r.left > maxLeft || r.top > maxTop) {
        w.setRect({ left: Math.min(r.left, maxLeft), top: Math.min(r.top, maxTop) });
      }
    });
  }

  /** Atualiza estatísticas de uso e recentes no store. */
  _trackLaunch(appId) {
    const usage = { ...this.store.get('usage', {}) };
    usage[appId] = (usage[appId] || 0) + 1;
    this.store.set('usage', usage);

    const recents = [appId, ...(this.store.get('recents', [])).filter((id) => id !== appId)].slice(0, 6);
    this.store.set('recents', recents);
  }
}
