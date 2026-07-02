/**
 * mathicx-file · desktop/desktop.js
 * Área de trabalho: render, relógio, grid de atalhos com drag-and-drop,
 * menu de contexto, widgets, e dashboard overlay.
 *
 * Orquestra: shortcuts.js (CRUD), widgets.js (widgets), e delega toda
 * a lógica de janelas ao WindowManager via bus.
 */

import { bus, EVT } from '../core/event-bus.js';
import { store } from '../core/state.js';
import { escapeHTML, debounce } from '../core/utils.js';
import { appRegistry } from '../apps/registry.js';
import * as SC from './shortcuts.js';
import { tickClock, WIDGET_DEFS } from './widgets.js';
import { showContextMenu } from '../ui/context-menu.js';
import { logoHTML } from '../ui/components.js';
import { themeManager } from '../themes/theme-manager.js';

export class Desktop {
  constructor({ bus: b = bus, store: s = store } = {}) {
    this.bus = b;
    this.store = s;
    this._root = null;
    this._clockInterval = null;
    this._dashboardOpen = false;
    this._widgetCleanups = [];
  }

  init() {
    const app = document.getElementById('app');
    this._root = document.createElement('div');
    this._root.className = 'desktop';
    this._root.id = 'desktop';
    this._root.innerHTML = `
      <div class="desktop-scroll" id="desktopScroll">
        <div class="brand-mark">${logoHTML()}<span class="name">mathicx-file</span></div>
        <div class="ambient" data-el="ambient">
          <div class="ambient-clock">
            <span class="h" data-el="h">--:--</span><span class="s" data-el="s">--</span>
          </div>
          <div class="ambient-date" data-el="date">&nbsp;</div>
        </div>
        <div class="desktop-actions">
          <button class="chip" data-act="dashboard">📊 Dashboard</button>
          <button class="chip" data-act="theme"><span class="dot"></span>${themeManager.icon} ${themeManager.label}</button>
        </div>
        <div class="widgets-row" data-el="widgets"></div>
        <div class="icon-grid" data-el="icons"></div>
      </div>`;
    app.insertBefore(this._root, app.firstChild);

    this._initClock();
    this._renderWidgets();
    this._renderShortcuts();
    this._attachEvents();

    // Re-render quando shortcuts mudam
    this.bus.on(EVT.DESKTOP_REFRESH, () => this._renderShortcuts());
    this.bus.on(EVT.THEME_CHANGE, () => this._updateThemeChip());
  }

  /* ---- Relógio ---- */
  _initClock() {
    const ambient = this._root.querySelector('[data-el="ambient"]');
    tickClock(ambient);
    this._clockInterval = setInterval(() => tickClock(ambient), 1000);
  }

  /* ---- Widgets ---- */
  _renderWidgets() {
    const container = this._root.querySelector('[data-el="widgets"]');
    const widgetOrder = this.store.get('widgetLayout') || WIDGET_DEFS.filter((w) => w.default).map((w) => w.id);
    const hidden = this.store.get('widgets') || {};

    container.innerHTML = '';
    this._widgetCleanups.forEach((fn) => fn?.());
    this._widgetCleanups = [];

    for (const wId of widgetOrder) {
      if (hidden[wId]) continue;
      const def = WIDGET_DEFS.find((d) => d.id === wId);
      if (!def) continue;

      const el = document.createElement('div');
      el.className = 'widget';
      el.dataset.widgetId = wId;
      el.style.animationDelay = `${WIDGET_DEFS.indexOf(def) * 0.04}s`;
      el.innerHTML = `
        <div class="widget-head">
          <span class="w-ico">${def.icon}</span>
          <span class="w-title">${def.title}</span>
          <div class="w-actions">
            <button class="w-btn w-close" data-act="hide" title="Ocultar">✕</button>
          </div>
        </div>
        <div data-el="wbody">${def.template || ''}</div>`;
      container.appendChild(el);

      // Init do widget
      if (def.body) {
        const cleanup = def.body(el);
        if (typeof cleanup === 'function') this._widgetCleanups.push(cleanup);
      }
    }

    // Event delegation para ocultar widgets
    container.addEventListener('click', (e) => {
      const hideBtn = e.target.closest('[data-act="hide"]');
      if (!hideBtn) return;
      const wEl = hideBtn.closest('.widget');
      if (!wEl) return;
      const wId = wEl.dataset.widgetId;
      const h = { ...(this.store.get('widgets') || {}) };
      h[wId] = true;
      this.store.set('widgets', h);
      wEl.remove();
    });
  }

  /* ---- Shortcuts (grid de ícones) ---- */
  _renderShortcuts() {
    const grid = this._root.querySelector('[data-el="icons"]');
    const shortcuts = SC.getShortcuts();

    grid.innerHTML = shortcuts.map((sc, idx) => `
      <button type="button" class="icon-tile" data-sc-id="${sc.id}" title="${escapeHTML(sc.name)}"
              style="animation-delay:${(idx * 0.025).toFixed(3)}s">
        <span class="icon-glyph cat-${sc.category}">${sc.icon}</span>
        <span class="icon-label">${escapeHTML(sc.name)}</span>
      </button>`).join('');
  }

  /* ---- Eventos ---- */
  _attachEvents() {
    const grid = this._root.querySelector('[data-el="icons"]');

    // --- Clique duplo em atalho = abrir app ---
    grid.addEventListener('dblclick', (e) => {
      const tile = e.target.closest('.icon-tile');
      if (!tile) return;
      const id = tile.dataset.scId;
      const sc = SC.getShortcutById(id);
      if (sc?.appId) this.bus.emit(EVT.APP_LAUNCH, sc.appId);
    });

    // --- Clique simples = selecionar ---
    grid.addEventListener('click', (e) => {
      grid.querySelectorAll('.icon-tile.selected').forEach((t) => t.classList.remove('selected'));
      const tile = e.target.closest('.icon-tile');
      if (tile) tile.classList.add('selected');
    });

    // --- Menu de contexto ---
    grid.addEventListener('contextmenu', (e) => {
      const tile = e.target.closest('.icon-tile');
      e.preventDefault();

      if (tile) {
        // Menu do atalho
        const id = tile.dataset.scId;
        showContextMenu(e, [
          { icon: '📂', label: 'Abrir', kbd: 'Enter', onSelect: () => this._launchShortcut(id) },
          { icon: '✏️', label: 'Renomear', onSelect: () => SC.renameShortcut(id) },
          { icon: '🔧', label: 'Editar', onSelect: () => SC.editShortcut(id) },
          { type: 'separator' },
          { icon: '🗑️', label: 'Excluir', danger: true, onSelect: () => SC.deleteShortcut(id) },
        ]);
      } else {
        // Menu do fundo
        showContextMenu(e, [
          { icon: '➕', label: 'Novo atalho', onSelect: () => SC.createShortcut() },
          { type: 'separator' },
          { icon: '🔄', label: 'Restaurar padrão', onSelect: () => this._resetShortcuts() },
          { icon: '📊', label: 'Abrir dashboard', onSelect: () => this.toggleDashboard() },
        ]);
      }
    });

    // --- Drag-and-drop de ícones ---
    this._initIconDrag(grid);

    // --- Ações (chips) ---
    this._root.querySelector('[data-act="dashboard"]').addEventListener('click', () => this.toggleDashboard());
    this._root.querySelector('[data-act="theme"]').addEventListener('click', () => themeManager.cycle());

    // --- Clique fora do grid = deselecionar ---
    this._root.querySelector('.desktop-scroll').addEventListener('click', (e) => {
      if (!e.target.closest('.icon-tile')) {
        grid.querySelectorAll('.icon-tile.selected').forEach((t) => t.classList.remove('selected'));
      }
    });
  }

  _launchShortcut(id) {
    const sc = SC.getShortcutById(id);
    if (sc?.appId) this.bus.emit(EVT.APP_LAUNCH, sc.appId);
  }

  async _resetShortcuts() {
    this.store.set('shortcuts', null);
    SC.getShortcuts(); // força default
    this.bus.emit(EVT.DESKTOP_REFRESH);
  }

  /* ---- Drag-and-drop de ícones ---- */
  _initIconDrag(grid) {
    let dragging = null;
    let ghost = null;
    let overTile = null;

    grid.addEventListener('pointerdown', (e) => {
      const tile = e.target.closest('.icon-tile');
      if (!tile || e.button !== 0) return;

      // Inicia drag após 6px de movimento
      const startX = e.clientX, startY = e.clientY;
      let started = false;

      const onMove = (ev) => {
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (!started && (dx * dx + dy * dy) > 36) {
          started = true;
          dragging = tile;
          tile.classList.add('dragging');
          // Cria fantasma
          ghost = tile.cloneNode(true);
          ghost.className = 'icon-ghost';
          ghost.style.left = ev.clientX + 'px';
          ghost.style.top = ev.clientY + 'px';
          document.body.appendChild(ghost);
        }
        if (started && ghost) {
          ghost.style.left = ev.clientX + 'px';
          ghost.style.top = ev.clientY + 'px';

          // Destaca target
          if (overTile && overTile !== tile) overTile.classList.remove('drop-target');
          const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.icon-tile');
          if (target && target !== tile) {
            target.classList.add('drop-target');
            overTile = target;
          } else if (overTile) {
            overTile.classList.remove('drop-target');
            overTile = null;
          }
        }
      };

      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        if (ghost) ghost.remove();
        ghost = null;
        if (dragging) {
          dragging.classList.remove('dragging');
          if (overTile) overTile.classList.remove('drop-target');
          // Reordena
          if (overTile && overTile !== dragging) {
            SC.reorderShortcut(dragging.dataset.scId,
              SC.getShortcuts().findIndex((s) => s.id === overTile.dataset.scId));
          }
          dragging = null;
          overTile = null;
        }
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    });
  }

  /* ---- Dashboard overlay ---- */
  toggleDashboard() {
    let dash = document.querySelector('.dashboard');
    if (dash) {
      dash.remove();
      this._dashboardOpen = false;
      return;
    }

    const favorites = this.store.get('favorites', []);
    const recents = this.store.get('recents', []);
    const allApps = appRegistry.list();

    dash = document.createElement('div');
    dash.className = 'dashboard';
    dash.innerHTML = `
      <div class="dash-grid">
        <div class="dash-card dash-hero">
          <h4>Painel</h4>
          <div class="dash-time" data-el="dtime">--:--</div>
          <div class="dash-date" data-el="ddate"></div>
        </div>
        <div class="dash-card">
          <h4>⭐ Favoritos</h4>
          <div class="dash-list" data-el="fav-list">
            ${favorites.length ? favorites.map((id) => {
              const app = allApps.find((a) => a.id === id);
              return app ? `<div class="dash-list-item" data-app="${id}"><span class="dli-ico">${app.icon}</span><span class="dli-name">${escapeHTML(app.name)}</span></div>` : '';
            }).join('') : '<div style="color:var(--muted);font-size:12px;padding:8px 0;">Nenhum favorito.</div>'}
          </div>
        </div>
        <div class="dash-card">
          <h4>🕒 Recentes</h4>
          <div class="dash-list" data-el="rec-list">
            ${recents.map((id) => {
              const app = allApps.find((a) => a.id === id);
              return app ? `<div class="dash-list-item" data-app="${id}"><span class="dli-ico">${app.icon}</span><span class="dli-name">${escapeHTML(app.name)}</span></div>` : '';
            }).join('') || '<div style="color:var(--muted);font-size:12px;padding:8px 0;">Nenhum recente.</div>'}
          </div>
        </div>
        <div class="dash-card">
          <h4>📈 Atividades</h4>
          <div class="dash-list" data-el="act-list">
            ${(this.store.get('activity') || []).slice(0, 6).map((a) =>
              `<div class="dash-list-item"><span class="dli-ico">${a.icon}</span><span class="dli-name">${escapeHTML(a.label)}</span></div>`
            ).join('') || '<div style="color:var(--muted);font-size:12px;padding:8px 0;">Nenhuma atividade.</div>'}
          </div>
        </div>
      </div>`;

    // Click em item de app = abre
    dash.querySelectorAll('[data-app]').forEach((el) => {
      el.addEventListener('click', () => {
        this.bus.emit(EVT.APP_LAUNCH, el.dataset.app);
        dash.remove();
        this._dashboardOpen = false;
      });
    });

    // Click fora do grid fecha
    dash.addEventListener('click', (e) => {
      if (e.target === dash) { dash.remove(); this._dashboardOpen = false; }
    });

    document.getElementById('app').appendChild(dash);
    this._dashboardOpen = true;

    // Clock no dashboard
    const dtime = dash.querySelector('[data-el="dtime"]');
    const ddate = dash.querySelector('[data-el="ddate"]');
    const now = new Date();
    if (dtime) dtime.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (ddate) ddate.textContent = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  _updateThemeChip() {
    const chip = this._root?.querySelector('[data-act="theme"]');
    if (chip) chip.innerHTML = `<span class="dot"></span>${themeManager.icon} ${themeManager.label}`;
  }
}
