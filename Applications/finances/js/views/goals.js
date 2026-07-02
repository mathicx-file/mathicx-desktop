/* =====================================================================
   VIEW: GOALS — Metas financeiras com barra de progresso
   ===================================================================== */
(function (global) {
  'use strict';
  const { $, $$, el, money, pct, Utils, UI } = global;
  const App = global.App = global.App || {};

  function render() {
    const state = Store.getState();
    const root = $('#viewRoot');
    root.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Metas Financeiras</h1>
          <p>Acompanhe seus objetivos e progresso</p>
        </div>
        <div class="page-header__actions">
          <button class="btn btn--primary" data-action="new">＋ Nova meta</button>
        </div>
      </div>
      <div class="grid grid--2" id="goalsGrid"></div>
    `;
    $$('[data-action="new"]').forEach(b => b.addEventListener('click', () => openForm()));
    renderGrid();
  }

  function renderGrid() {
    const state = Store.getState();
    const perfilId = App.getActiveProfileId();
    const goals = perfilId ? state.goals.filter(g => g.perfilId === perfilId) : state.goals;
    const grid = $('#goalsGrid');
    if (!goals.length) {
      grid.innerHTML = UI.emptyState({
        icon: '🎯', title: 'Nenhuma meta ainda',
        message: 'Crie metas como reserva de emergência, viagem, casa...',
        action: `<button class="btn btn--primary" data-action="new">＋ Nova meta</button>`
      });
      $$('[data-action="new"]', grid).forEach(b => b.addEventListener('click', () => openForm()));
      return;
    }

    grid.innerHTML = goals.map(g => {
      const p = Math.min(100, (g.currentAmount / g.targetAmount) * 100);
      const remaining = Math.max(0, g.targetAmount - g.currentAmount);
      const done = p >= 100;
      const daysLeft = g.targetDate ? Utils.daysBetween(Utils.today(), g.targetDate) : null;

      return `
        <div class="card card--pad-lg" style="${done ? 'border-color:var(--c-income)' : ''}">
          <div class="flex items-center gap-1 mb-2">
            <div class="list__icon" style="background:${g.color}">${g.icon}</div>
            <div class="flex-1">
              <div class="fw-700">${escapeHtmlSafe(g.name)}</div>
              <small class="text-muted">
                ${g.targetDate ? `Meta: ${Utils.formatDate(g.targetDate, 'short')}` : 'Sem data prevista'}
                ${daysLeft != null && !done ? ` · ${daysLeft > 0 ? `faltam ${daysLeft}d` : `<span class="text-expense">vencida</span>`}` : ''}
              </small>
            </div>
            ${done ? '<span class="badge badge--paid">Concluída 🎉</span>' : ''}
          </div>

          <div class="flex justify-between mb-1">
            <strong>${money(g.currentAmount)}</strong>
            <span class="text-muted">de ${money(g.targetAmount)}</span>
          </div>
          ${UI.progressBar(g.currentAmount, g.targetAmount, { variant: done ? 'income' : 'primary' })}
          <div class="flex justify-between mt-1">
            <small class="text-muted">${pct(p)} concluído</small>
            <small class="text-muted">Faltam <strong>${money(remaining)}</strong></small>
          </div>

          <div class="flex gap-1 mt-2 flex-wrap">
            <button class="btn btn--sm btn--income" data-act="add" data-id="${g.id}">+ Valor</button>
            <button class="btn btn--sm btn--ghost" data-act="edit" data-id="${g.id}">Editar</button>
            <button class="btn btn--sm btn--ghost" data-act="del" data-id="${g.id}">🗑️</button>
          </div>
        </div>`;
    }).join('');

    $$('[data-act]', grid).forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.id;
      if (b.dataset.act === 'add') addValue(id);
      if (b.dataset.act === 'edit') openForm({ id });
      if (b.dataset.act === 'del') remove(id);
    }));
  }

  function addValue(id) {
    const state = Store.getState();
    const g = state.goals.find(x => x.id === id);
    const body = el('div', { class: 'form-grid' }, [
      el('div', { class: 'field span-2' }, [
        el('label', { text: 'Valor a adicionar (R$)' }),
        (() => { const i = el('div', { class: 'input-group' });
          i.innerHTML = `<span>R$</span><input type="number" step="0.01" min="0" id="goalAddValue" value="" autofocus />`;
          return i; })()
      ])
    ]);
    const footer = el('div', { style: 'display:flex;gap:10px;' }, [
      el('button', { class: 'btn btn--ghost', text: 'Cancelar', onclick: () => UI.closeModal() }),
      el('button', { class: 'btn btn--income', text: 'Adicionar', onclick: () => {
        const v = parseFloat(document.getElementById('goalAddValue').value) || 0;
        if (v <= 0) { UI.toast('Informe um valor válido.', { type: 'error' }); return; }
        g.currentAmount = Math.max(0, g.currentAmount + v);
        Store.emit({ type: 'goal:update' });
        UI.toast(`${money(v)} adicionados à meta.`, { type: 'success' });
        UI.closeModal();
      } })
    ]);
    UI.openModal({ title: `Adicionar a "${g.name}"`, body, footer, size: 'sm' });
  }

  function remove(id) {
    UI.confirmDialog({
      title: 'Excluir meta',
      message: 'Excluir esta meta? Esta ação não pode ser desfeita.',
      confirmText: 'Excluir', danger: true
    }).then(ok => {
      if (!ok) return;
      const state = Store.getState();
      state.goals = state.goals.filter(g => g.id !== id);
      Store.emit({ type: 'goal:delete' });
      UI.toast('Meta excluída.', { type: 'success' });
    });
  }

  function openForm({ id } = {}) {
    const state = Store.getState();
    const editing = id ? state.goals.find(g => g.id === id) : null;
    const color = editing?.color || '#10b981';
    const icon = editing?.icon || '🎯';

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-grid">
        <div class="field span-2">
          <label>Nome da meta *</label>
          <input type="text" name="name" required value="${editing?.name || ''}" placeholder="Ex: Reserva de emergência" />
        </div>
        <div class="field">
          <label>Valor desejado (R$) *</label>
          <div class="input-group"><span>R$</span>
            <input type="number" step="0.01" min="0" name="targetAmount" required value="${editing?.targetAmount || ''}" />
          </div>
        </div>
        <div class="field">
          <label>Já acumulado (R$)</label>
          <div class="input-group"><span>R$</span>
            <input type="number" step="0.01" min="0" name="currentAmount" value="${editing?.currentAmount || 0}" />
          </div>
        </div>
        <div class="field">
          <label>Data prevista</label>
          <input type="date" name="targetDate" value="${editing?.targetDate || ''}" />
        </div>
        <div class="field">
          <label>Ícone</label>
          <input type="text" name="icon" maxlength="2" value="${icon}" style="text-align:center;font-size:18px" />
        </div>
        <div class="field span-2">
          <label>Cor</label>
          <div class="swatch-grid">
            ${['#10b981', '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#06b6d4', '#14b8a6'].map(c =>
              `<div class="swatch ${c === color ? 'is-selected' : ''}" data-color="${c}" style="background:${c}"></div>`).join('')}
          </div>
        </div>
      </div>
    `;
    let selColor = color;
    body.querySelectorAll('.swatch').forEach(s => s.addEventListener('click', () => {
      body.querySelectorAll('.swatch').forEach(x => x.classList.remove('is-selected'));
      s.classList.add('is-selected'); selColor = s.dataset.color;
    }));

    const footer = el('div', { style: 'display:flex;gap:10px;width:100%;' }, [
      editing ? el('button', { class: 'btn btn--danger', text: '🗑️ Excluir', onclick: () => {
        UI.closeModal(); remove(editing.id);
      } }) : null,
      el('div', { style: 'flex:1' }),
      el('button', { class: 'btn btn--ghost', text: 'Cancelar', onclick: () => UI.closeModal() }),
      el('button', { class: 'btn btn--primary', text: editing ? 'Salvar' : 'Criar meta',
        onclick: () => {
          const d = UI.formValues(body);
          if (!d.name || !d.targetAmount) { UI.toast('Preencha nome e valor.', { type: 'error' }); return; }
          const payload = {
            name: d.name,
            targetAmount: parseFloat(d.targetAmount),
            currentAmount: parseFloat(d.currentAmount) || 0,
            targetDate: d.targetDate,
            icon: d.icon || '🎯',
            color: selColor
          };
          if (editing) {
            Object.assign(editing, payload);
            Store.emit({ type: 'goal:update' });
            UI.toast('Meta atualizada.', { type: 'success' });
          } else {
            const perfilId = App.getActiveProfileId();
            state.goals.push(Object.assign({ id: Store.uid('goal'), perfilId: perfilId || null, createdAt: Date.now() }, payload));
            Store.emit({ type: 'goal:create' });
            UI.toast('Meta criada.', { type: 'success' });
          }
          UI.closeModal();
        } })
    ]);

    UI.openModal({ title: editing ? 'Editar meta' : 'Nova meta', body, footer });
  }

  function escapeHtmlSafe(s) { return global.Utils.escapeHtml(s); }

  App.Goals = { render, openForm };
})(window);
