/**
 * mathicx-file · apps/formularios/view.js
 * Central de Atalhos — lista todas as aplicações registradas e permite
 * abri-las direto daqui (age como um hub de lançamento de apps).
 *
 * Contrato: mount(host, { bus }) -> cleanup | undefined
 *   - Lê appRegistry para obter os apps registrados (ordem alfabética)
 *   - Event delegation: 1 listener no container → bus.emit(EVT.APP_LAUNCH, id)
 *   - Filtros por categoria com contador de apps (mesmo estilo do launcher)
 *   - Auto-exclui o próprio "formularios" para evitar recursão
 */

import { escapeHTML, norm } from '../../core/utils.js';
import { appRegistry, CATEGORIES } from '../registry.js';
import { EVT } from '../../core/event-bus.js';

/** Próprio id deste app — nunca aparece na lista (evita abrir a si mesmo). */
const SELF_ID = 'formularios';

/** Ordena apps alfabeticamente pelo nome (case/acentos insensitive). */
const sortByName = (apps) =>
  [...apps].sort((a, b) => norm(a.name).localeCompare(norm(b.name)));

/** Conta quantos apps (excluindo self) pertencem a cada categoria. */
const countByCategory = (apps) =>
  apps.reduce((acc, a) => {
    acc[a.category] = (acc[a.category] || 0) + 1;
    return acc;
  }, {});

const CSS = `
.mxc-forms { display:flex; flex-direction:column; height:100%; background:var(--surface); }

/* Header */
.mxc-forms .ff-head { padding:var(--sp-5) var(--sp-5) var(--sp-3); border-bottom:1px solid var(--border-soft); flex-shrink:0; }
.mxc-forms .ff-title { display:flex; align-items:center; gap:var(--sp-3); }
.mxc-forms .ff-title .ico {
  width:36px; height:36px; border-radius:var(--r-md);
  display:flex; align-items:center; justify-content:center; font-size:18px;
  background:var(--brand-grad-soft); border:1px solid var(--accent-soft); flex-shrink:0;
}
.mxc-forms .ff-title h2 { font-size:16px; font-weight:800; color:var(--text-strong); }
.mxc-forms .ff-title p { margin:2px 0 0; font-size:12px; color:var(--muted); }

/* Filtros de categoria */
.mxc-forms .ff-filters { display:flex; flex-wrap:wrap; gap:6px; margin-top:var(--sp-4); }
.mxc-forms .ff-filter {
  display:inline-flex; align-items:center; gap:6px;
  padding:7px 13px; border-radius:var(--r-sm);
  font-size:10.5px; font-weight:800; text-transform:uppercase; letter-spacing:.05em;
  border:1px solid var(--border); background:var(--surface-2);
  color:var(--muted); transition:all var(--t-fast);
}
.mxc-forms .ff-filter:hover { color:var(--text); }
.mxc-forms .ff-filter.is-active {
  background:var(--accent-soft); color:var(--accent); border-color:var(--accent);
}
.mxc-forms .ff-count {
  display:inline-flex; align-items:center; justify-content:center;
  min-width:18px; height:18px; padding:0 5px;
  border-radius:var(--r-full);
  font-size:10px; font-weight:800; line-height:1;
  background:var(--surface-3); color:var(--muted);
  transition:background var(--t-fast), color var(--t-fast);
}
.mxc-forms .ff-filter.is-active .ff-count {
  background:var(--accent); color:var(--accent-contrast);
}

/* Corpo rolável */
.mxc-forms .ff-body { flex:1; overflow-y:auto; padding:var(--sp-4) var(--sp-5) var(--sp-5); }

/* Grid de cards (mesma métrica do launcher) */
.mxc-forms .ff-grid {
  display:grid; grid-template-columns:repeat(auto-fill, minmax(210px, 1fr)); gap:var(--sp-3);
}

/* Card reutiliza a estética do launcher-card, porém isolado (escopo .ff-) */
.mxc-forms .ff-card {
  text-align:left; cursor:pointer;
  background:var(--surface); border:1px solid var(--border-soft);
  border-radius:var(--r-md); padding:var(--sp-4);
  display:flex; flex-direction:column; gap:6px;
  transition:transform var(--t-base) var(--ease-out), border-color var(--t-fast), background var(--t-fast);
  animation:tile-in .3s var(--ease-out) backwards;
}
.mxc-forms .ff-card:hover {
  transform:translateY(-3px); border-color:var(--accent); background:var(--surface-2);
}
.mxc-forms .ff-card-top { display:flex; align-items:center; gap:var(--sp-2); }
.mxc-forms .ff-card-icon {
  width:38px; height:38px; border-radius:var(--r-md);
  display:flex; align-items:center; justify-content:center; font-size:18px;
  background:var(--brand-grad-soft); border:1px solid var(--accent-soft); flex-shrink:0;
}
.mxc-forms .ff-card-title { font-size:13px; font-weight:700; color:var(--text-strong); line-height:1.3; }
.mxc-forms .ff-card-desc { font-size:11.5px; font-weight:500; color:var(--muted); line-height:1.5; }
.mxc-forms .ff-card.is-hidden { display:none; }

/* Estado vazio (sem apps na categoria ativa) */
.mxc-forms .ff-empty { text-align:center; padding:48px 0; color:var(--muted); }
.mxc-forms .ff-empty .ei { font-size:36px; opacity:.4; margin-bottom:var(--sp-3); }
.mxc-forms .ff-empty .et { font-weight:700; color:var(--text); }
`;

/** Injeta o CSS no <head> uma única vez (guarda por id). */
function injectStyle() {
  if (document.getElementById('mxc-forms-style')) return;
  const s = document.createElement('style');
  s.id = 'mxc-forms-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/** Monta o HTML de um card de app. */
function cardHTML(app, index) {
  return `
    <button type="button" class="ff-card" data-launch="${escapeHTML(app.id)}" data-cat="${escapeHTML(app.category)}"
            style="animation-delay:${(index * 0.03).toFixed(2)}s">
      <div class="ff-card-top">
        <span class="ff-card-icon">${app.icon}</span>
        <span class="badge-cat cat-${escapeHTML(app.category)}">${escapeHTML(app.category)}</span>
      </div>
      <span class="ff-card-title">${escapeHTML(app.name)}</span>
      <span class="ff-card-desc">${escapeHTML(app.description || '')}</span>
    </button>`;
}

/**
 * @param {HTMLElement} host - elemento hospedeiro (corpo da janela)
 * @param {{ bus?: import('../../core/event-bus.js').EventBus }} [opts]
 * @returns {() => void} cleanup que remove o listener
 */
export function mount(host, { bus } = {}) {
  injectStyle();

  // Apps registrados, excluindo o próprio Formulários e ordenados alfabeticamente.
  const apps = sortByName(appRegistry.list().filter((a) => a.id !== SELF_ID));

  // Contador de apps por categoria (para os badges dos filtros).
  const counts = countByCategory(apps);

  host.innerHTML = `
    <div class="mxc-forms">
      <div class="ff-head">
        <div class="ff-title">
          <span class="ico">🗂️</span>
          <div>
            <h2>Central de Atalhos</h2>
            <p>Acesse rapidamente todas as aplicações do sistema.</p>
          </div>
        </div>
        <div class="ff-filters" data-el="filters">
          <button class="ff-filter is-active" data-cat="todas">Todas <span class="ff-count">${apps.length}</span></button>
          ${CATEGORIES.map((c) => {
            const n = counts[c.id] || 0;
            return `<button class="ff-filter" data-cat="${c.id}">${c.label} <span class="ff-count">${n}</span></button>`;
          }).join('')}
        </div>
      </div>
      <div class="ff-body">
        <div class="ff-grid" data-el="grid">${apps.map((a, i) => cardHTML(a, i)).join('')}</div>
        <div class="ff-empty is-hidden" data-el="empty">
          <div class="ei">🔍</div>
          <div class="et">Nenhum app nesta categoria</div>
        </div>
      </div>
    </div>`;

  const grid = host.querySelector('[data-el="grid"]');
  const emptyEl = host.querySelector('[data-el="empty"]');
  const filtersEl = host.querySelector('[data-el="filters"]');

  /** Atualiza quais cards aparecem conforme a categoria selecionada. */
  const applyFilter = (cat) => {
    let visible = 0;
    grid.querySelectorAll('.ff-card').forEach((card) => {
      const show = cat === 'todas' || card.dataset.cat === cat;
      card.classList.toggle('is-hidden', !show);
      if (show) visible++;
    });
    emptyEl.classList.toggle('is-hidden', visible > 0);
  };

  /** Event delegation: 1 único listener cobre filtros + cards. */
  const onClick = (e) => {
    // Filtro de categoria
    const filterBtn = e.target.closest('.ff-filter');
    if (filterBtn) {
      filtersEl.querySelectorAll('.ff-filter').forEach((b) =>
        b.classList.toggle('is-active', b === filterBtn));
      applyFilter(filterBtn.dataset.cat);
      return;
    }
    // Card de app → lança
    const card = e.target.closest('[data-launch]');
    if (card) {
      bus?.emit(EVT.APP_LAUNCH, card.dataset.launch);
    }
  };

  host.addEventListener('click', onClick);

  // Cleanup: remove o listener ao fechar a janela (evita memory leak).
  return () => host.removeEventListener('click', onClick);
}
