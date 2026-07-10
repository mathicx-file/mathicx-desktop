/* =====================================================================
   UI — Componentes de interface reutilizáveis
   Toast, Modal, Cards, Tabelas, Forms, Chart helpers, Badge, Progress
   ===================================================================== */
(function (global) {
  'use strict';
  const { $, $$, el, money, escapeHtml, formatDate, STATUS_LABEL, Utils } = global.Utils;

  /* ---------- Toast ---------- */
  function toast(message, { type = 'info', title, duration = 3500 } = {}) {
    const icons = { success: '✅', error: '❌', warn: '⚠️', info: 'ℹ️' };
    const root = $('#toastRoot');
    const node = el('div', { class: `toast toast--${type}` }, [
      el('span', { class: 'toast__icon', text: icons[type] || 'ℹ️' }),
      el('div', { class: 'toast__body' }, [
        title ? el('div', { class: 'toast__title', text: title }) : null,
        el('div', { class: 'toast__msg', text: message })
      ])
    ]);
    root.appendChild(node);
    const remove = () => {
      node.classList.add('out');
      setTimeout(() => node.remove(), 250);
    };
    node.addEventListener('click', remove);
    if (duration) setTimeout(remove, duration);
  }

  /* ---------- Modal ---------- */
  let lastFocus = null;
  function openModal({ title, body, footer, size = '', onClose, static: isStatic } = {}) {
    const tmpl = $('#tmpl-modal');
    const clone = tmpl.content.firstElementChild.cloneNode(true);
    const panel = $('.modal__panel', clone);
    if (size) clone.classList.add(`modal--${size}`);
    $('[data-title]', clone).textContent = title || '';
    const bodyEl = $('[data-body]', clone);
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body instanceof Node) bodyEl.appendChild(body);
    const footerEl = $('[data-footer]', clone);
    if (footer === undefined) footerEl.remove();
    else if (typeof footer === 'string') footerEl.innerHTML = footer;
    else if (footer instanceof Node) footerEl.appendChild(footer);

    const root = $('#modalRoot');
    root.innerHTML = '';
    root.appendChild(clone);
    root.classList.add('is-open');
    root.setAttribute('aria-hidden', 'false');
    lastFocus = document.activeElement;

    const close = () => {
      root.classList.remove('is-open');
      root.setAttribute('aria-hidden', 'true');
      root.innerHTML = '';
      document.removeEventListener('keydown', onKey);
      if (typeof onClose === 'function') onClose();
      if (lastFocus && lastFocus.focus) lastFocus.focus();
      global.UI._currentModal = null;
    };
    const onKey = (e) => {
      if (e.key === 'Escape' && !isStatic) close();
    };
    clone.querySelectorAll('[data-close]').forEach(b => {
      if (isStatic) b.remove();
      else b.addEventListener('click', close);
    });
    document.addEventListener('keydown', onKey);
    global.UI._currentModal = { close, panel, bodyEl, footerEl };
    // foco inicial
    setTimeout(() => {
      const focusable = panel.querySelector('input, select, textarea, button');
      if (focusable) focusable.focus();
    }, 50);
    return global.UI._currentModal;
  }
  function closeModal() {
    if (global.UI._currentModal) global.UI._currentModal.close();
  }

  /* ---------- Confirm ---------- */
  function confirmDialog({ title = 'Confirmar', message, confirmText = 'Confirmar',
    cancelText = 'Cancelar', danger = false } = {}) {
    return new Promise(resolve => {
      const footer = el('div', { style: 'display:flex;gap:10px;' }, [
        el('button', { class: 'btn btn--ghost', text: cancelText, onclick: () => { closeModal(); resolve(false); } }),
        el('button', { class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`, text: confirmText,
          onclick: () => { closeModal(); resolve(true); } })
      ]);
      openModal({
        title, size: 'sm', footer,
        body: el('p', { text: message, style: 'color:var(--text-muted);line-height:1.6;' })
      });
    });
  }

  /* ---------- Componentes pequenos ---------- */
  function statCard({ label, value, icon, variant = '', hint, sub }) {
    return `
      <div class="stat-card stat-card--${variant}">
        <div class="stat-card__icon">${icon}</div>
        <div class="stat-card__label">${label}</div>
        <div class="stat-card__value">${value}</div>
        ${hint ? `<div class="stat-card__hint">${hint}</div>` : ''}
      </div>`;
  }

  function statusBadge(status) {
    const map = { paid: 'badge--paid', pending: 'badge--pending', overdue: 'badge--overdue', cancelled: 'badge--soft' };
    const cls = map[status] || 'badge--soft';
    return `<span class="badge ${cls}">${STATUS_LABEL[status] || status}</span>`;
  }

  function categoryTag(cat) {
    const c = cat || { name: 'Sem categoria', color: '#6b7280', icon: '❓' };
    return `<span class="cat-tag" style="background:${c.color}22;color:${c.color}">
      <span>${c.icon}</span>${escapeHtml(c.name)}</span>`;
  }

  function progressBar(value, max, { variant = '', label } = {}) {
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return `
      <div class="progress progress--${variant}">
        <div class="progress__bar" style="width:${pct}%"></div>
      </div>${label ? `<small class="text-muted">${label}</small>` : ''}`;
  }

  /* ---------- Form helpers ---------- */
  // Gera um <select> de categorias
  function categorySelect(state, { name = 'categoryId', type = '', value = '', includeBlank = true } = {}) {
    const opts = [];
    if (includeBlank) opts.push(`<option value="">Selecione...</option>`);
    const perfilId = (Store.getState && Store.getState().settings.activeProfileId) || null;
    state.categories
      .filter(c => (!type || c.type === type || c.type === 'both') && (!perfilId || !c.perfilId || c.perfilId === perfilId))
      .forEach(c => opts.push(`<option value="${c.id}" ${value === c.id ? 'selected' : ''}>${c.icon} ${escapeHtml(c.name)}</option>`));
    return `<select name="${name}" id="${name}">${opts.join('')}</select>`;
  }

  function cardSelect(state, { name = 'cardId', value = '' } = {}) {
    const opts = [`<option value="">Nenhum</option>`];
    const perfilId = (Store.getState && Store.getState().settings.activeProfileId) || null;
    const cards = perfilId ? state.cards.filter(c => !c.perfilId || c.perfilId === perfilId) : state.cards;
    cards.forEach(c => opts.push(`<option value="${c.id}" ${value === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`));
    return `<select name="${name}">${opts.join('')}</select>`;
  }

  // Coleta valores de um formulário (por [name])
  function formValues(form) {
    const data = {};
    $$('[name]', form).forEach(input => {
      const name = input.name;
      if (input.type === 'checkbox') data[name] = input.checked;
      else if (input.type === 'number') data[name] = input.value === '' ? 0 : parseFloat(input.value);
      else data[name] = input.value;
    });
    return data;
  }

  /* ---------- Chart helpers ---------- */
  const _charts = new Map();
  function chart(canvasId, config) {
    if (!global.Chart) return null;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    if (_charts.has(canvasId)) { _charts.get(canvasId).destroy(); _charts.delete(canvasId); }
    const merged = Object.assign({
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: cssVar('--text-muted'), font: { family: 'Inter', size: 12 } } },
          tooltip: {
            backgroundColor: cssVar('--surface'), titleColor: cssVar('--text'),
            bodyColor: cssVar('--text-muted'), borderColor: cssVar('--border'),
            borderWidth: 1, padding: 12, cornerRadius: 8, usePointStyle: true,
            callbacks: { label: (ctx) => {
              const lbl = ctx.dataset.label || ctx.label;
              return ` ${lbl}: ${money(ctx.parsed.y ?? ctx.parsed)}`;
            } }
          }
        },
        scales: {
          x: { ticks: { color: cssVar('--text-muted') }, grid: { color: cssVar('--border') } },
          y: { ticks: { color: cssVar('--text-muted'), callback: (v) => moneyShort(v) }, grid: { color: cssVar('--border') } }
        }
      }
    }, config);
    // Aplica cores das escalas a todos os eixos
    if (merged.options && merged.options.scales) {
      Object.values(merged.options.scales).forEach(axis => {
        if (axis.ticks && !axis.ticks.color) axis.ticks.color = cssVar('--text-muted');
        if (axis.grid && !axis.grid.color) axis.grid.color = cssVar('--border');
      });
    }
    const c = new Chart(canvas, merged);
    _charts.set(canvasId, c);
    return c;
  }
  function destroyCharts() {
    _charts.forEach(c => c.destroy());
    _charts.clear();
  }
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#666';
  }
  // Re-renderiza gráficos após troca de tema
  function refreshChartColors() { _charts.forEach(c => { try { c.update(); } catch (e) {} }); }

  /* ---------- Tabela genérica ---------- */
  function table({ columns, rows, emptyText = 'Nenhum registro encontrado.' }) {
    if (!rows.length) {
      return `<div class="empty"><div class="empty__icon">🗂️</div>
        <div class="empty__title">Nada por aqui</div><div>${emptyText}</div></div>`;
    }
    const head = columns.map(c => `<th${c.align ? ` style="text-align:${c.align}"` : ''}>${c.label}</th>`).join('');
    const body = rows.map(r => {
      const cells = columns.map(c => {
        const v = typeof c.render === 'function' ? c.render(r) : (r[c.key] ?? '');
        return `<td${c.align ? ` style="text-align:${c.align}"` : ''}>${v}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<div class="table-wrap"><table class="data-table">
      <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  /* ---------- Empty state ---------- */
  function emptyState({ icon = '🗂️', title = 'Nada por aqui', message = '', action = '' }) {
    return `<div class="empty"><div class="empty__icon">${icon}</div>
      <div class="empty__title">${title}</div>
      ${message ? `<div>${message}</div>` : ''}
      ${action ? `<div class="mt-2">${action}</div>` : ''}</div>`;
  }

  /* ---------- Export ---------- */
  global.UI = {
    toast, openModal, closeModal, confirmDialog,
    statCard, statusBadge, categoryTag, progressBar,
    categorySelect, cardSelect, formValues,
    chart, destroyCharts, refreshChartColors, cssVar,
    table, emptyState,
    _charts
  };
})(window);
