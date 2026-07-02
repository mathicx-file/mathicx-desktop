(function (global) {
  'use strict';
  const { $, $$, el, money, Utils, UI } = global;
  const App = global.App = global.App || {};

  const PROFILE_ICONS = ['👤', '👩', '👨', '👪', '🏠', '💼', '📈', '🪙', '🏖️', '🎓', '👶', '🐶', '🚗', '✈️'];
  const PROFILE_COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316'];

  function render() {
    const state = Store.getState();
    const root = $('#viewRoot');
    root.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Meus Perfis Financeiros</h1>
          <p>Crie perfis separados para organizar diferentes áreas da sua vida financeira</p>
        </div>
        <div class="page-header__actions">
          <button class="btn btn--primary" data-action="new">＋ Novo perfil</button>
        </div>
      </div>
      <div class="grid grid--2" id="profilesGrid"></div>
    `;
    $$('[data-action="new"]').forEach(b => b.addEventListener('click', () => openForm()));
    renderGrid();
  }

  function renderGrid() {
    const state = Store.getState();
    const grid = $('#profilesGrid');
    if (!state.profiles.length) {
      grid.innerHTML = UI.emptyState({
        icon: '👥', title: 'Nenhum perfil',
        message: 'Crie seu primeiro perfil financeiro.',
        action: '<button class="btn btn--primary" data-action="new">＋ Novo perfil</button>'
      });
      $$('[data-action="new"]', grid).forEach(b => b.addEventListener('click', () => openForm()));
      return;
    }

    grid.innerHTML = state.profiles.map(p => {
      const stats = profileStats(state, p.id);
      return `
        <div class="card card--pad-lg" style="border-left:4px solid ${p.color}">
          <div class="flex items-center gap-1 mb-2">
            <div class="list__icon" style="background:${p.color};font-size:20px">${p.icon}</div>
            <div class="flex-1">
              <div class="fw-700 fs-lg">${escapeHtmlSafe(p.name)}</div>
              <div class="text-muted fs-12">${p.description ? escapeHtmlSafe(p.description) : 'Sem descrição'} · ${p.active ? '<span class="text-income">Ativo</span>' : '<span class="text-muted">Inativo</span>'}</div>
            </div>
          </div>
          <div class="stat-grid mb-2" style="grid-template-columns:repeat(2,1fr)">
            ${UI.statCard({ label: 'Saldo', value: money(stats.balance), icon: '💰', variant: stats.balance >= 0 ? 'income' : 'expense' })}
            ${UI.statCard({ label: 'Receitas', value: money(stats.income), icon: '📈', variant: 'income' })}
            ${UI.statCard({ label: 'Despesas', value: money(stats.expense), icon: '📉', variant: 'expense' })}
            ${UI.statCard({ label: 'Lançamentos', value: stats.count, icon: '📋', variant: 'primary' })}
          </div>
          <div class="flex gap-1">
            <button class="btn btn--sm btn--ghost flex-1" data-act="select" data-id="${p.id}">Selecionar</button>
            <button class="btn btn--sm btn--ghost" data-act="edit" data-id="${p.id}">Editar</button>
            ${state.profiles.length > 1 ? `<button class="btn btn--sm btn--ghost" data-act="del" data-id="${p.id}">🗑️</button>` : ''}
          </div>
        </div>`;
    }).join('');

    $$('[data-act]', grid).forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.id;
      if (b.dataset.act === 'select') {
        Store.getState().settings.activeProfileId = id;
        Store.emit({ type: 'settings:update' });
        App.navigate('dashboard');
      }
      if (b.dataset.act === 'edit') openForm({ id });
      if (b.dataset.act === 'del') remove(id);
    }));
  }

  function profileStats(state, profileId) {
    const ctx = App.getContext();
    const summ = Utils.monthSummary(state, ctx.year, ctx.month, profileId);
    const count = Utils.allEntries(state, profileId).length;
    return { balance: summ.balance, income: summ.income, expense: summ.expense, count };
  }

  function remove(id) {
    const state = Store.getState();
    const p = state.profiles.find(x => x.id === id);
    if (!p) return;
    UI.confirmDialog({
      title: 'Excluir perfil',
      message: `Excluir o perfil "${p.name}"? Os lançamentos deste perfil serão transferidos para o primeiro perfil.`,
      confirmText: 'Excluir', danger: true
    }).then(ok => {
      if (!ok) return;
      Store.removeProfile(id);
      UI.toast(`Perfil "${p.name}" excluído.`, { type: 'success' });
    });
  }

  function openForm({ id } = {}) {
    const state = Store.getState();
    const editing = id ? state.profiles.find(p => p.id === id) : null;
    const icon = editing?.icon || PROFILE_ICONS[0];
    const color = editing?.color || PROFILE_COLORS[0];

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-grid">
        <div class="field span-2">
          <label>Nome do perfil *</label>
          <input type="text" name="name" required value="${editing?.name || ''}" placeholder="Ex: Pessoal, Casa, Empresa..." />
        </div>
        <div class="field span-2">
          <label>Descrição</label>
          <textarea name="description" placeholder="Descrição opcional...">${editing?.description || ''}</textarea>
        </div>
        <div class="field span-2">
          <label>Ícone</label>
          <div class="icon-grid" id="profIconPicker">
            ${PROFILE_ICONS.map(i => `<div class="icon-opt ${i === icon ? 'is-selected' : ''}" data-icon="${i}">${i}</div>`).join('')}
          </div>
        </div>
        <div class="field span-2">
          <label>Cor</label>
          <div class="swatch-grid">
            ${PROFILE_COLORS.map(c => `<div class="swatch ${c === color ? 'is-selected' : ''}" data-color="${c}" style="background:${c}"></div>`).join('')}
          </div>
        </div>
        <div class="field field--inline span-2">
          <input type="checkbox" name="active" id="profActive" ${(!editing || editing.active) ? 'checked' : ''} />
          <label for="profActive">Perfil ativo</label>
        </div>
      </div>
    `;

    let selIcon = icon;
    let selColor = color;
    body.querySelectorAll('#profIconPicker .icon-opt').forEach(s => s.addEventListener('click', () => {
      body.querySelectorAll('#profIconPicker .icon-opt').forEach(x => x.classList.remove('is-selected'));
      s.classList.add('is-selected'); selIcon = s.dataset.icon;
    }));
    body.querySelectorAll('.swatch').forEach(s => s.addEventListener('click', () => {
      body.querySelectorAll('.swatch').forEach(x => x.classList.remove('is-selected'));
      s.classList.add('is-selected'); selColor = s.dataset.color;
    }));

    const footer = el('div', { style: 'display:flex;gap:10px;width:100%;' }, [
      el('div', { style: 'flex:1' }),
      el('button', { class: 'btn btn--ghost', text: 'Cancelar', onclick: () => UI.closeModal() }),
      el('button', { class: 'btn btn--primary', text: editing ? 'Salvar' : 'Criar perfil',
        onclick: () => {
          const name = body.querySelector('[name="name"]').value.trim();
          const description = body.querySelector('[name="description"]').value.trim();
          const active = body.querySelector('[name="active"]').checked;
          if (!name) { UI.toast('Informe o nome.', { type: 'error' }); return; }
          if (editing) {
            Store.updateProfile(id, { name, description, icon: selIcon, color: selColor, active });
            UI.toast('Perfil atualizado.', { type: 'success' });
          } else {
            Store.addProfile({
              id: Store.uid('prof'), name, description, icon: selIcon,
              color: selColor, active, createdAt: Date.now()
            });
            UI.toast('Perfil criado!', { type: 'success' });
          }
          UI.closeModal();
        } })
    ]);

    UI.openModal({ title: editing ? 'Editar perfil' : 'Novo perfil financeiro', body, footer, size: 'sm' });
  }

  function escapeHtmlSafe(s) { return global.Utils.escapeHtml(s); }

  App.Profiles = { render, openForm };
})(window);