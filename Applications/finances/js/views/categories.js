/* =====================================================================
   VIEW: CATEGORIES — Categorias personalizadas (nome, cor, ícone, tipo)
   ===================================================================== */
(function (global) {
  'use strict';
  const { $, $$, el, money, Utils, UI } = global;
  const App = global.App = global.App || {};

  const PALETTE = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#10b981', '#14b8a6',
    '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e', '#64748b', '#78716c', '#0f172a', '#334155'
  ];
  const ICONS = [
    '🛒', '🍔', '🛍️', '💳', '❤️‍🩹', '🏥', '💊', '🚗', '⛽', '🏠',
    '🚰', '💡', '🌐', '🎮', '🎬', '📚', '💰', '💼', '📈', '🏠',
    '✈️', '🏖️', '🎨', '🎵', '⚽', '🏋️', '🐶', '👶', '🎁', '🪙',
    '🔧', '🚌', '📱', '💻', '🎓', '⛪', '🍷', '☕', '🧾', '✨',
    '❓', '🏷️', '📦', '🔔', '🚨'
  ];

  function render() {
    const state = Store.getState();
    const root = $('#viewRoot');
    root.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Categorias</h1>
          <p>Organize suas receitas e despesas</p>
        </div>
        <div class="page-header__actions">
          <button class="btn btn--primary" data-action="new">＋ Nova categoria</button>
        </div>
      </div>
      <div class="grid grid--3" id="catGrid"></div>
    `;
    $$('[data-action="new"]').forEach(b => b.addEventListener('click', () => openForm()));
    renderGrid();
  }

  function renderGrid() {
    const state = Store.getState();
    const perfilId = App.getActiveProfileId();
    const grid = $('#catGrid');
    // Show shared (perfilId: null) + exclusive to current profile
    const cats = perfilId
      ? state.categories.filter(c => !c.perfilId || c.perfilId === perfilId)
      : state.categories;
    const usage = countUsage(state);
    grid.innerHTML = cats.map(c => {
      const cnt = usage.get(c.id) || 0;
      return `
        <div class="card">
          <div class="flex items-center gap-1">
            <div class="list__icon" style="background:${c.color}">${c.icon}</div>
            <div class="flex-1">
              <div class="fw-700">${escapeHtmlSafe(c.name)}</div>
              <small class="text-muted">${c.type === 'income' ? 'Receita' : c.type === 'expense' ? 'Despesa' : 'Ambos'} · ${cnt} uso(s) ${c.perfilId ? '' : '· 🌐 Compartilhada'}</small>
            </div>
          </div>
          <div class="flex gap-1 mt-2">
            <button class="btn btn--sm btn--ghost flex-1" data-act="edit" data-id="${c.id}">Editar</button>
            <button class="btn btn--sm btn--ghost" data-act="del" data-id="${c.id}">🗑️</button>
          </div>
        </div>`;
    }).join('');
    $$('[data-act]', grid).forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.id;
      if (b.dataset.act === 'edit') openForm({ id });
      if (b.dataset.act === 'del') remove(id);
    }));
  }

  function countUsage(state) {
    const map = new Map();
    Utils.allEntries(state).forEach(e => map.set(e.categoryId, (map.get(e.categoryId) || 0) + 1));
    return map;
  }

  function remove(id) {
    const state = Store.getState();
    const c = state.categories.find(x => x.id === id);
    const cnt = countUsage(state).get(id) || 0;
    UI.confirmDialog({
      title: 'Excluir categoria',
      message: cnt
        ? `A categoria "${c.name}" está em uso em ${cnt} lançamento(s). Eles ficarão sem categoria. Excluir mesmo assim?`
        : `Excluir a categoria "${c.name}"?`,
      confirmText: 'Excluir', danger: true
    }).then(ok => {
      if (!ok) return;
      state.categories = state.categories.filter(x => x.id !== id);
      Store.emit({ type: 'category:delete' });
      UI.toast('Categoria excluída.', { type: 'success' });
    });
  }

  function openForm({ id } = {}) {
    const state = Store.getState();
    const editing = id ? state.categories.find(c => c.id === id) : null;
    const color = editing?.color || PALETTE[0];
    const icon = editing?.icon || ICONS[0];

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-grid">
        <div class="field">
          <label>Nome *</label>
          <input type="text" name="name" required value="${editing?.name || ''}" placeholder="Ex: Mercado" />
        </div>
        <div class="field">
          <label>Tipo</label>
          <select name="type">
            <option value="expense" ${(!editing || editing.type === 'expense') ? 'selected' : ''}>Despesa</option>
            <option value="income" ${editing?.type === 'income' ? 'selected' : ''}>Receita</option>
            <option value="both" ${editing?.type === 'both' ? 'selected' : ''}>Ambos</option>
          </select>
        </div>
        <div class="field span-2">
          <label>Cor</label>
          <div class="swatch-grid" id="swatches">
            ${PALETTE.map(c2 => `<div class="swatch ${c2 === color ? 'is-selected' : ''}" data-color="${c2}" style="background:${c2}"></div>`).join('')}
          </div>
        </div>
          <div class="field span-2">
            <label>Ícone</label>
            <div class="icon-grid" id="iconPicker">
              ${ICONS.map(i => `<div class="icon-opt ${i === icon ? 'is-selected' : ''}" data-icon="${i}">${i}</div>`).join('')}
            </div>
          </div>
          <div class="field field--inline span-2">
            <input type="checkbox" name="shared" id="catShared" ${!editing?.perfilId ? 'checked' : ''} />
            <label for="catShared">🌐 Compartilhar com todos os perfis</label>
          </div>
        </div>
      `;

    let selectedColor = color;
    let selectedIcon = icon;
    body.querySelectorAll('.swatch').forEach(s => s.addEventListener('click', () => {
      body.querySelectorAll('.swatch').forEach(x => x.classList.remove('is-selected'));
      s.classList.add('is-selected');
      selectedColor = s.dataset.color;
    }));
    body.querySelectorAll('.icon-opt').forEach(s => s.addEventListener('click', () => {
      body.querySelectorAll('.icon-opt').forEach(x => x.classList.remove('is-selected'));
      s.classList.add('is-selected');
      selectedIcon = s.dataset.icon;
    }));

    const footer = el('div', { style: 'display:flex;gap:10px;width:100%;' }, [
      editing ? el('button', { class: 'btn btn--danger', text: '🗑️ Excluir', onclick: () => {
        UI.closeModal(); remove(editing.id);
      } }) : null,
      el('div', { style: 'flex:1' }),
      el('button', { class: 'btn btn--ghost', text: 'Cancelar', onclick: () => UI.closeModal() }),
      el('button', { class: 'btn btn--primary', text: editing ? 'Salvar' : 'Criar',
        onclick: () => {
          const name = body.querySelector('[name="name"]').value.trim();
          const type = body.querySelector('[name="type"]').value;
          if (!name) { UI.toast('Informe o nome.', { type: 'error' }); return; }
          const shared = body.querySelector('#catShared').checked;
          if (editing) {
            Object.assign(editing, { name, type, color: selectedColor, icon: selectedIcon, perfilId: shared ? null : (editing.perfilId || App.getActiveProfileId()) });
            Store.emit({ type: 'category:update' });
            UI.toast('Categoria atualizada.', { type: 'success' });
          } else {
            const perfilId = shared ? null : (App.getActiveProfileId() || null);
            state.categories.push({ id: Store.uid('cat'), name, type, color: selectedColor, icon: selectedIcon, perfilId });
            Store.emit({ type: 'category:create' });
            UI.toast('Categoria criada.', { type: 'success' });
          }
          UI.closeModal();
        } })
    ]);

    UI.openModal({ title: editing ? 'Editar categoria' : 'Nova categoria', body, footer });
  }

  function escapeHtmlSafe(s) { return global.Utils.escapeHtml(s); }

  App.Categories = { render, openForm, PALETTE, ICONS };
})(window);
