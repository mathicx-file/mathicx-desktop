/**
 * mathicx-file · launcher/launcher.js
 * Menu Iniciar — estilo Windows 10 (lateral, 2 colunas).
 *
 * Layout:
 *   ┌─ Topo ────────────────────────────┐
 *   │ 🔍 Buscar + [abas de categoria]    │
 *   ├─ Corpo (2 colunas) ────────────────┤
 *   │ Coluna esquerda: apps              │
 *   │   · Fixados ⭐                      │
 *   │   · Todos os apps (A→Z)            │
 *   │ Coluna direita: painel lateral     │
 *   │   · Resumo por categoria + usuário │
 *   ├─ Rodapé ───────────────────────────┤
 *   │ ⏻ mathicx                          │
 *   └────────────────────────────────────┘
 *
 * Comportamento de filtros: as abas filtram a coluna de apps inteira
 * (Fixados e Todos). Busca sobrepõe tudo com resultados globais.
 */

import { bus, EVT } from '../core/event-bus.js';
import { store } from '../core/state.js';
import { escapeHTML, debounce, norm } from '../core/utils.js';
import { appRegistry, CATEGORIES } from '../apps/registry.js';
import { authProvider } from '../auth/provider.js';
import * as search from './search.js';
import * as reg from './registry.js';
import { logoHTML, ICONS } from '../ui/components.js';

/** Ordena apps alfabeticamente pelo nome (case/acentos insensitive). */
const sortByName = (apps) =>
  [...apps].sort((a, b) => norm(a.name).localeCompare(norm(b.name)));

/** Conta apps por categoria. */
const countByCategory = (apps) =>
  apps.reduce((acc, a) => {
    acc[a.category] = (acc[a.category] || 0) + 1;
    return acc;
  }, {});

/** Categoria filtrada por appid (safe lookup). */
const catOf = (appId) => appRegistry.get(appId)?.category;

export class Launcher {
  constructor({ bus: b = bus, store: s = store, wm } = {}) {
    this.bus = b;
    this.store = s;
    this.wm = wm;
    this._el = null;
    this._open = false;
    this._activeCategory = 'todas';
    this._query = '';
  }

  init() {
    const app = document.getElementById('app');
    this._el = document.createElement('div');
    this._el.className = 'launcher is-hidden';
    this._el.id = 'launcher';
    this._el.innerHTML = this._buildHTML();
    app.appendChild(this._el);
    this._attachEvents();

    // Abre apps via evento do bus
    this.bus.on(EVT.APP_LAUNCH, (payload) => {
      const request = normalizeLaunchPayload(payload);
      if (!request.appId) return;
      this.wm?.open(request.appId, request.options);
      this.close();
    });
  }

  _buildHTML() {
    return `
      <div class="launcher-top">
        <div class="search-wrap">
          ${ICONS.search}
          <input type="search" class="launcher-search" data-el="search"
                 placeholder="Buscar apps, pastas, documentos..." autocomplete="off" />
        </div>
        <div class="launcher-filters" data-el="filters">
          <button class="launcher-filter is-active" data-cat="todas">Todas</button>
          ${CATEGORIES.map((c) => `<button class="launcher-filter" data-cat="${c.id}">${c.label}</button>`).join('')}
        </div>
      </div>

      <div class="launcher-main">
        <div class="launcher-col launcher-col-apps" data-el="body">
          <div class="launcher-section" data-el="sec-fav">
            <div class="launcher-section-head"><span class="sh-title">⭐ Fixados</span><span class="sh-line"></span></div>
            <div class="launcher-grid" data-el="fav-grid"></div>
          </div>
          <div class="launcher-section" data-el="sec-all">
            <div class="launcher-section-head"><span class="sh-title">📦 Todos os apps</span><span class="sh-line"></span></div>
            <div class="launcher-grid" data-el="all-grid"></div>
          </div>
          <div class="launcher-results is-hidden" data-el="results"></div>
          <div class="launcher-empty is-hidden" data-el="empty">
            <div class="le-ico">🔍</div><div class="le-title">Nenhum resultado</div>
          </div>
        </div>

        <aside class="launcher-col launcher-col-side">
          <div class="side-block side-stats" data-el="side-stats"></div>
          <div class="side-block side-tip">
            <div class="tip-ico">💡</div>
            <div class="tip-text">Pressione <kbd>Win</kbd>+<kbd>E</kbd> para abrir este menu a qualquer momento.</div>
          </div>
        </aside>
      </div>

      <div class="launcher-footer">
        <span class="lf-user">${logoHTML()}<span>mathicx-file</span></span>
        <span class="lf-copy">Portal pessoal · 2026</span>
      </div>`;
  }

  _attachEvents() {
    const searchEl = this._el.querySelector('[data-el="search"]');
    const filtersEl = this._el.querySelector('[data-el="filters"]');

    // Busca com debounce
    searchEl.addEventListener('input', debounce(() => {
      this._query = searchEl.value.trim();
      this._render();
    }, 150));

    // Filtros de categoria
    filtersEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.launcher-filter');
      if (!btn) return;
      this._activeCategory = btn.dataset.cat;
      filtersEl.querySelectorAll('.launcher-filter').forEach((b) =>
        b.classList.toggle('is-active', b === btn));
      this._render();
    });

    // Delegação de clicks nos cards de app (coluna esquerda)
    this._el.querySelector('[data-el="body"]').addEventListener('click', (e) => {
      const card = e.target.closest('[data-launch]');
      const favBtn = e.target.closest('[data-fav]');
      if (favBtn) {
        e.stopPropagation();
        reg.toggleFavorite(favBtn.dataset.fav);
        this._render();
        return;
      }
      if (card) {
        this.bus.emit(EVT.APP_LAUNCH, card.dataset.launch);
      }
    });

    // Click numa categoria do painel lateral → ativa o mesmo filtro do topo
    this._el.querySelector('[data-el="side-stats"]').addEventListener('click', (e) => {
      const item = e.target.closest('[data-statcat]');
      if (!item) return;
      this._activeCategory = item.dataset.statcat;
      filtersEl.querySelectorAll('.launcher-filter').forEach((b) =>
        b.classList.toggle('is-active', b.dataset.cat === this._activeCategory));
      this._render();
    });
  }

  async _render() {
    const body = this._el.querySelector('[data-el="body"]');
    const resultsEl = this._el.querySelector('[data-el="results"]');
    const emptyEl = this._el.querySelector('[data-el="empty"]');
    const cat = this._activeCategory;

    // Painel lateral atualiza sempre
    this._renderSide();

    // Se há query → busca global (sobrepõe seções)
    if (this._query) {
      body.querySelectorAll('.launcher-section').forEach((s) => s.style.display = 'none');
      resultsEl.classList.remove('is-hidden');

      const items = await search.globalSearch(this._query);
      const filtered = cat === 'todas'
        ? items
        : items.filter((i) => (i.type === 'app' ? catOf(i.id) === cat : true));

      if (!filtered.length) {
        resultsEl.innerHTML = '';
        emptyEl.classList.remove('is-hidden');
        return;
      }

      emptyEl.classList.add('is-hidden');
      resultsEl.innerHTML = `
        <div class="result-group">
          ${filtered.map((i) => `
            <button class="result-item" data-launch="${i.type === 'app' ? i.id : ''}" data-type="${i.type}" data-resid="${i.id}">
              <span class="ri-ico">${i.icon}</span>
              <span class="ri-name">${escapeHTML(i.name)}</span>
              <span class="ri-type">${search.SEARCH_TYPES[i.type]?.label || i.type}</span>
            </button>`).join('')}
        </div>`;

      // Clicks em resultados não-app (pastas/docs) abrem o explorer
      resultsEl.querySelectorAll('.result-item').forEach((el) => {
        if (!el.dataset.launch) {
          el.addEventListener('click', () => this._openSearchResult(el));
        }
      });
      return;
    }

    // Sem query → seções normais
    body.querySelectorAll('.launcher-section').forEach((s) => s.style.display = '');
    resultsEl.classList.add('is-hidden');
    emptyEl.classList.add('is-hidden');

    const favorites = reg.getFavorites();
    const catFilter = (a) => cat === 'todas' || a.category === cat;

    // Fixados: apps favoritos, filtrados pela categoria ativa
    const favApps = sortByName(favorites.map((id) => appRegistry.get(id)).filter(Boolean)).filter(catFilter);

    // Todos: lista completa filtrada pela categoria ativa, em ordem alfabética
    let allApps = sortByName(appRegistry.byCategory(cat));
    // Oculta app "admin" para não-administradores
    if (!authProvider.isAdmin()) {
      allApps = allApps.filter((a) => a.id !== 'admin');
    }

    this._renderGrid('fav-grid', favApps, favorites);
    this._renderGrid('all-grid', allApps, favorites);

    this._toggleSection('sec-fav', 'fav-grid');
    this._toggleSection('sec-all', 'all-grid');
  }

  /** Renderiza o painel lateral direito (resumo por categoria + dica). */
  _renderSide() {
    const side = this._el.querySelector('[data-el="side-stats"]');
    if (!side) return;

    const all = authProvider.isAdmin() ? appRegistry.list() : appRegistry.list().filter((a) => a.id !== 'admin');
    const counts = countByCategory(all);
    const cat = this._activeCategory;

    side.innerHTML = `
      <div class="stats-head">
        <span class="stats-label">Categorias</span>
        <span class="stats-total">${all.length} apps</span>
      </div>
      <ul class="stats-list">
        ${CATEGORIES.map((c) => {
          const n = counts[c.id] || 0;
          const isActive = c.id === cat;
          return `<li class="stats-item ${isActive ? 'is-active' : ''}" data-statcat="${c.id}">
            <span class="stats-dot" style="background:${c.color}"></span>
            <span class="stats-name">${c.label}</span>
            <span class="stats-count">${n}</span>
          </li>`;
        }).join('')}
      </ul>`;
  }

  _renderGrid(slotId, apps, favorites) {
    const grid = this._el.querySelector(`[data-el="${slotId}"]`);
    if (!grid) return;
    grid.innerHTML = apps.map((app, i) => this._cardHTML(app, favorites, i)).join('');
  }

  _cardHTML(app, favorites, index) {
    const isFav = favorites.includes(app.id);
    return `
      <button type="button" class="launcher-card" data-launch="${app.id}" data-cat="${app.category}"
              style="animation-delay:${(index * 0.02).toFixed(2)}s">
        <span class="fav-btn ${isFav ? 'is-fav' : ''}" data-fav="${app.id}" title="${isFav ? 'Remover favorito' : 'Favoritar'}" role="button" tabindex="0">${isFav ? '⭐' : '☆'}</span>
        <div class="launcher-card-top">
          <span class="launcher-card-icon">${app.icon}</span>
          <span class="badge-cat cat-${app.category}">${app.category}</span>
        </div>
        <span class="launcher-card-title">${escapeHTML(app.name)}</span>
        <span class="launcher-card-desc">${escapeHTML(app.description || '')}</span>
      </button>`;
  }

  _toggleSection(secId, gridId) {
    const grid = this._el.querySelector(`[data-el="${gridId}"]`);
    const sec = this._el.querySelector(`[data-el="${secId}"]`);
    if (!grid || !sec) return;
    sec.style.display = grid.children.length ? '' : 'none';
  }

  _openSearchResult(el) {
    if (el.dataset.launch) {
      this.bus.emit(EVT.APP_LAUNCH, el.dataset.launch);
      return;
    }

    if (el.dataset.type === 'action') {
      const action = search.resolveAction(el.dataset.resid);
      if (action) {
        this.wm?.open(action.appId, {
          action: action.action,
          payload: action.payload,
        });
        this.close();
      }
      return;
    }

    this.bus.emit(EVT.APP_LAUNCH, 'arquivos');
    this.close();
  }

  toggle() { this._open ? this.close() : this.open(); }
  open() {
    this._open = true;
    this._el.classList.remove('is-hidden');
    this._query = '';
    this._el.querySelector('[data-el="search"]').value = '';
    this._render();
    setTimeout(() => this._el.querySelector('[data-el="search"]')?.focus(), 50);
  }
  close() {
    this._open = false;
    this._el.classList.add('is-hidden');
    this.bus.emit(EVT.LAUNCHER_CLOSE);
  }
}

function normalizeLaunchPayload(payload) {
  if (typeof payload === 'string') return { appId: payload, options: {} };
  if (!payload || typeof payload !== 'object') return { appId: '', options: {} };
  return {
    appId: payload.appId || payload.id || '',
    options: {
      action: payload.action || '',
      payload: payload.payload || {},
    },
  };
}
