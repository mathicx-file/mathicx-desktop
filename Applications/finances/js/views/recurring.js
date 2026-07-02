/* =====================================================================
   VIEW: RECURRING — Contas recorrentes
   - Mensal, quinzenal, semanal, anual
   - Gera lançamentos futuros sob demanda
   ===================================================================== */
(function (global) {
  'use strict';
  const { $, $$, el, money, Utils, UI } = global;
  const App = global.App = global.App || {};

  const FREQ_LABELS = {
    weekly: 'Semanal', biweekly: 'Quinzenal', monthly: 'Mensal', yearly: 'Anual'
  };

  function render() {
    const state = Store.getState();
    const root = $('#viewRoot');
    root.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Contas Recorrentes</h1>
          <p>Aluguel, assinaturas, contas fixas — geradas automaticamente</p>
        </div>
        <div class="page-header__actions">
          <button class="btn btn--ghost" data-action="generate">⚡ Gerar próximas</button>
          <button class="btn btn--primary" data-action="new">＋ Nova conta recorrente</button>
        </div>
      </div>

      <div id="recurringList"></div>
    `;
    $$('[data-action="new"]').forEach(b => b.addEventListener('click', () => openForm()));
    $$('[data-action="generate"]').forEach(b => b.addEventListener('click', () => generateUpcoming()));
    renderList();
  }

  function renderList() {
    const state = Store.getState();
    const perfilId = App.getActiveProfileId();
    const recs = perfilId ? state.recurring.filter(r => r.perfilId === perfilId) : state.recurring;
    const list = $('#recurringList');
    if (!recs.length) {
      list.innerHTML = UI.emptyState({
        icon: '🔁', title: 'Nenhuma conta recorrente',
        message: 'Cadastre contas que se repetem para gerar lançamentos automaticamente.',
        action: `<button class="btn btn--primary" data-action="new">＋ Nova conta</button>`
      });
      $$('[data-action="new"]', list).forEach(b => b.addEventListener('click', () => openForm()));
      return;
    }

    list.innerHTML = `
      <div class="list">
        ${recs.map(r => {
          const cat = Utils.categoryById(state, r.categoryId);
          return `<div class="list__item">
            <div class="list__icon" style="background:${cat.color}">${cat.icon}</div>
            <div class="list__body">
              <div class="list__title">${escapeHtmlSafe(r.description)}</div>
              <div class="list__sub">
                ${FREQ_LABELS[r.frequency]} · ${r.type === 'income' ? 'Receita' : 'Despesa'} ·
                Próx.: ${Utils.formatDate(r.nextDueDate, 'short')} · ${r.paymentMethod}
              </div>
            </div>
            <div class="list__right">
              <div class="fw-700 ${r.type === 'income' ? 'text-income' : 'text-expense'}">
                ${r.type === 'income' ? '+' : '−'} ${money(r.amount)}
              </div>
              <small class="text-muted">${r.active ? 'Ativa' : 'Pausada'}</small>
            </div>
            <div class="flex gap-1">
              <button class="btn btn--sm btn--ghost" data-act="edit" data-id="${r.id}">✏️</button>
              <button class="btn btn--sm btn--ghost" data-act="toggle" data-id="${r.id}">${r.active ? '⏸' : '▶'}</button>
              <button class="btn btn--sm btn--ghost" data-act="del" data-id="${r.id}">🗑️</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    $$('[data-act]', list).forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.id;
      if (b.dataset.act === 'edit') openForm({ id });
      if (b.dataset.act === 'toggle') toggleActive(id);
      if (b.dataset.act === 'del') remove(id);
    }));
  }

  /* ---------- Gerar próximos lançamentos ---------- */
  // Gera transações para os próximos N meses para todas as contas ativas
  function generateUpcoming() {
    const state = Store.getState();
    const monthsAhead = 3;
    let created = 0;
    const now = Utils.today();

    state.recurring.filter(r => r.active).forEach(r => {
      // Gera de hoje até N meses à frente
      const endDate = Utils.isoDate(Utils.addMonths(now, monthsAhead));
      let cur = Utils.parseDate(r.nextDueDate);
      // Se o próximo vencimento já passou, começa a contar do atual
      if (Utils.isoDate(cur) < now) cur = Utils.parseDate(now);
      let guard = 0;
      while (Utils.isoDate(cur) <= endDate && guard < 200) {
        const due = Utils.isoDate(cur);
        // Evita duplicar: procura tx com mesmo description+dueDate
        const exists = state.transactions.some(t =>
          t.description === r.description && t.dueDate === due &&
          t.amount === r.amount && t.type === r.type);
        if (!exists) {
          state.transactions.push({
            id: Store.uid('tx'), type: r.type,
            description: r.description, amount: r.amount,
            categoryId: r.categoryId, dueDate: due, paidDate: '',
            paymentMethod: r.paymentMethod, status: 'pending',
            notes: `Gerada de conta recorrente`, recurringId: r.id,
            perfilId: r.perfilId || null,
            createdAt: Date.now()
          });
          created++;
        }
        cur = nextDue(cur, r.frequency);
        guard++;
      }
      // Atualiza o nextDueDate para além do gerado
      r.nextDueDate = Utils.isoDate(nextDue(Utils.parseDate(r.nextDueDate), r.frequency, monthsAhead));
    });
    Store.emit({ type: 'recurring:generate' });
    UI.toast(created ? `${created} lançamentos gerados para os próximos ${monthsAhead} meses.` : 'Nenhum lançamento novo para gerar.', { type: 'success' });
  }

  function nextDue(from, freq, times = 1) {
    const d = new Date(from);
    if (freq === 'weekly') d.setDate(d.getDate() + 7 * times);
    else if (freq === 'biweekly') d.setDate(d.getDate() + 15 * times);
    else if (freq === 'monthly') d.setMonth(d.getMonth() + times);
    else if (freq === 'yearly') d.setFullYear(d.getFullYear() + times);
    return d;
  }

  function toggleActive(id) {
    const state = Store.getState();
    const r = state.recurring.find(x => x.id === id);
    r.active = !r.active;
    Store.emit({ type: 'recurring:update' });
    UI.toast(`Conta ${r.active ? 'ativada' : 'pausada'}.`, { type: 'success' });
  }

  function remove(id) {
    UI.confirmDialog({
      title: 'Remover conta recorrente',
      message: 'Isso não exclui lançamentos já gerados. Continuar?',
      confirmText: 'Remover', danger: true
    }).then(ok => {
      if (!ok) return;
      const state = Store.getState();
      state.recurring = state.recurring.filter(r => r.id !== id);
      Store.emit({ type: 'recurring:delete' });
      UI.toast('Conta recorrente removida.', { type: 'success' });
    });
  }

  /* ---------- Form ---------- */
  function openForm({ id } = {}) {
    const state = Store.getState();
    const editing = id ? state.recurring.find(r => r.id === id) : null;

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-grid">
        <div class="field span-2">
          <label>Descrição *</label>
          <input type="text" name="description" required value="${editing?.description || ''}" placeholder="Ex: Aluguel, Internet, Academia" />
        </div>
        <div class="field">
          <label>Tipo</label>
          <select name="type">
            <option value="expense" ${(!editing || editing.type === 'expense') ? 'selected' : ''}>Despesa</option>
            <option value="income" ${editing?.type === 'income' ? 'selected' : ''}>Receita</option>
          </select>
        </div>
        <div class="field">
          <label>Valor (R$) *</label>
          <div class="input-group"><span>R$</span>
            <input type="number" step="0.01" min="0" name="amount" required value="${editing?.amount || ''}" />
          </div>
        </div>
        <div class="field">
          <label>Categoria</label>
          ${UI.categorySelect(state, { value: editing?.categoryId })}
        </div>
        <div class="field">
          <label>Frequência</label>
          <select name="frequency">
            ${Object.entries(FREQ_LABELS).map(([v, l]) =>
              `<option value="${v}" ${editing?.frequency === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Próximo vencimento *</label>
          <input type="date" name="nextDueDate" required value="${editing?.nextDueDate || Utils.today()}" />
        </div>
        <div class="field">
          <label>Forma de pagamento</label>
          <select name="paymentMethod">
            ${(global.PAYMENT_METHODS || []).map(m =>
              `<option ${editing?.paymentMethod === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="field field--inline span-2">
          <input type="checkbox" name="active" id="fActive" ${(!editing || editing.active) ? 'checked' : ''} />
          <label for="fActive">Conta ativa</label>
        </div>
      </div>
      <div class="card mt-2" style="background:var(--surface-2)">
        <small class="text-muted">💡 Use "Gerar próximas" no topo para criar os lançamentos automáticos das contas ativas nos próximos meses.</small>
      </div>
    `;

    const footer = el('div', { style: 'display:flex;gap:10px;width:100%;' }, [
      el('button', { class: 'btn btn--ghost', text: 'Cancelar', onclick: () => UI.closeModal() }),
      el('div', { style: 'flex:1' }),
      el('button', { class: 'btn btn--primary', text: editing ? 'Salvar' : 'Criar',
        onclick: () => save(body, editing) })
    ]);

    UI.openModal({ title: editing ? 'Editar conta recorrente' : 'Nova conta recorrente', body, footer });
  }

  function save(bodyEl, editing) {
    const state = Store.getState();
    const d = UI.formValues(bodyEl);
    if (!d.description || !d.amount || !d.nextDueDate) {
      UI.toast('Preencha os campos obrigatórios.', { type: 'error' }); return;
    }
    const payload = {
      description: d.description, amount: parseFloat(d.amount),
      categoryId: d.categoryId, frequency: d.frequency,
      nextDueDate: d.nextDueDate, paymentMethod: d.paymentMethod,
      type: d.type, active: d.active
    };
    if (editing) {
      Object.assign(editing, payload);
      Store.emit({ type: 'recurring:update' });
      UI.toast('Conta atualizada.', { type: 'success' });
    } else {
      const perfilId = App.getActiveProfileId();
      state.recurring.push(Object.assign({
        id: Store.uid('rec'), perfilId: perfilId || null, createdAt: Date.now()
      }, payload));
      Store.emit({ type: 'recurring:create' });
      UI.toast('Conta recorrente criada.', { type: 'success' });
    }
    UI.closeModal();
  }

  function escapeHtmlSafe(s) { return global.Utils.escapeHtml(s); }

  App.Recurring = { render, openForm };
})(window);
