/* =====================================================================
   VIEW: TRANSACTIONS — Receitas e Despesas (CRUD + filtros + busca)
   ===================================================================== */
(function (global) {
  'use strict';
  const { $, $$, el, money, Utils, UI } = global;
  const App = global.App = global.App || {};

  // Estado local de filtros
  const filters = {
    type: '', status: '', categoryId: '', method: '', from: '', to: '', q: ''
  };
  let lastType = 'expense'; // default p/ quick add

  function render() {
    const state = Store.getState();
    const root = $('#viewRoot');

    // Inclui transações avulsas + parcelas individuais (visão unificada)
    const perfilId = App.getActiveProfileId();
    const entries = Utils.allEntries(state, perfilId);

    root.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Movimentações</h1>
          <p>Receitas e despesas registradas</p>
        </div>
        <div class="page-header__actions">
          <div class="segment" id="segType">
            <button data-type="" class="${!filters.type ? 'is-active' : ''}">Todas</button>
            <button data-type="income" class="${filters.type === 'income' ? 'is-active' : ''}">Receitas</button>
            <button data-type="expense" class="${filters.type === 'expense' ? 'is-active' : ''}">Despesas</button>
          </div>
          <button class="btn btn--income" data-action="add-income">＋ Receita</button>
          <button class="btn btn--expense" data-action="add-expense">＋ Despesa</button>
        </div>
      </div>

      <div class="filter-bar card mb-2">
        <div class="field">
          <label>Buscar</label>
          <input type="search" id="fQ" value="${filters.q}" placeholder="Descrição, observação..." />
        </div>
        <div class="field">
          <label>Categoria</label>
          ${UI.categorySelect(state, { value: filters.categoryId })}
        </div>
        <div class="field">
          <label>Status</label>
          <select id="fStatus">
            ${['', 'paid', 'pending', 'overdue'].map(s =>
              `<option value="${s}" ${filters.status === s ? 'selected' : ''}>${s ? Utils.STATUS_LABEL[s] : 'Todos'}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Forma de pagamento</label>
          <select id="fMethod">
            <option value="">Todas</option>
            ${PAYMENT_METHODS.map(m => `<option ${filters.method === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>De</label>
          <input type="date" id="fFrom" value="${filters.from}" />
        </div>
        <div class="field">
          <label>Até</label>
          <input type="date" id="fTo" value="${filters.to}" />
        </div>
        <button class="btn btn--ghost btn--sm" id="btnClearFilters">Limpar</button>
      </div>

      <div id="txList"></div>
    `;

    // Sincroniza names p/ formValues
    $('#fQ').name = 'q';
    $('#fStatus').name = 'status';
    $('#fMethod').name = 'method';
    $('#fFrom').name = 'from';
    $('#fTo').name = 'to';
    const catSel = root.querySelector('[name="categoryId"]');
    if (catSel) catSel.id = 'fCategory';

    // Eventos
    $$('#segType button').forEach(b => b.addEventListener('click', () => {
      filters.type = b.dataset.type;
      render();
    }));
    ['fQ', 'fStatus', 'fMethod', 'fFrom', 'fTo', 'fCategory'].forEach(id => {
      const node = $('#' + id);
      if (node) node.addEventListener('input', Utils.debounce(() => {
        filters.q = $('#fQ').value;
        filters.status = $('#fStatus').value;
        filters.method = $('#fMethod').value;
        filters.from = $('#fFrom').value;
        filters.to = $('#fTo').value;
        filters.categoryId = $('#fCategory').value;
        renderList();
      }, 200));
    });
    $('#btnClearFilters').addEventListener('click', () => {
      Object.keys(filters).forEach(k => filters[k] = '');
      render();
    });

    renderList();
  }

  function applyFilters(state) {
    const perfilId = App.getActiveProfileId();
    let entries = Utils.allEntries(state, perfilId);
    if (filters.type) entries = entries.filter(e => e.type === filters.type);
    if (filters.categoryId) entries = entries.filter(e => e.categoryId === filters.categoryId);
    if (filters.status) entries = entries.filter(e => e.status === filters.status);
    if (filters.method) entries = entries.filter(e => e.paymentMethod === filters.method);
    if (filters.from) entries = entries.filter(e => parseDate(e.dueDate) >= parseDate(filters.from));
    if (filters.to) entries = entries.filter(e => parseDate(e.dueDate) <= parseDate(filters.to));
    if (filters.q) {
      const q = filters.q.toLowerCase();
      entries = entries.filter(e =>
        (e.description || '').toLowerCase().includes(q) ||
        (e.notes || '').toLowerCase().includes(q));
    }
    return entries.sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate));
  }
  const parseDate = Utils.parseDate;

  function renderList() {
    const state = Store.getState();
    const entries = applyFilters(state);
    const totalIn = entries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
    const totalOut = entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);

    const list = $('#txList');
    if (!entries.length) {
      list.innerHTML = UI.emptyState({
        icon: '💸', title: 'Sem movimentações',
        message: 'Comece adicionando uma receita ou despesa.',
        action: `<button class="btn btn--primary" data-action="quick-add">＋ Nova movimentação</button>`
      });
      bindRowActions(list);
      return;
    }

    list.innerHTML = `
      <div class="stat-grid mb-2">
        ${UI.statCard({ label: `Receitas (${entries.filter(e => e.type === 'income').length})`, value: money(totalIn), icon: '📈', variant: 'income' })}
        ${UI.statCard({ label: `Despesas (${entries.filter(e => e.type === 'expense').length})`, value: money(totalOut), icon: '📉', variant: 'expense' })}
        ${UI.statCard({ label: 'Saldo do período', value: money(totalIn - totalOut), icon: '⚖️', variant: 'primary' })}
      </div>
      ${UI.table({
        columns: [
          { key: 'description', label: 'Descrição', render: e => `
            <div class="flex items-center gap-1">
              <div>
                <div class="fw-700">${escapeHtmlSafe(e.description)}</div>
                ${e.installmentLabel ? `<small class="text-muted">parcela ${e.installmentLabel}</small>` : ''}
              </div>
            </div>` },
          { key: 'category', label: 'Categoria', render: e => UI.categoryTag(Utils.categoryById(state, e.categoryId)) },
          { key: 'dueDate', label: 'Vencimento', render: e => Utils.formatDate(e.dueDate, 'short') },
          { key: 'method', label: 'Pagamento', render: e => `<small class="text-muted">${e.paymentMethod || '—'}</small>` },
          { key: 'status', label: 'Status', render: e => UI.statusBadge(e.status) },
          { key: 'amount', label: 'Valor', align: 'right', render: e =>
            `<strong class="${e.type === 'income' ? 'text-income' : 'text-expense'}">${e.type === 'income' ? '+' : '−'} ${money(e.amount)}</strong>` },
          { key: 'actions', label: '', align: 'right', render: rowActions }
        ],
        rows: entries
      })}
    `;
    bindRowActions(list);
  }

  function rowActions(e) {
    if (e.source === 'installment') {
      return `<button class="btn btn--sm btn--ghost" data-nav="installments">Ver compra</button>`;
    }
    const payBtn = e.status !== 'paid'
      ? `<button class="btn btn--sm btn--income" data-act="pay" data-id="${e.ref}">✓ Pagar</button>` : '';
    return `
      ${payBtn}
      <button class="btn btn--sm btn--ghost" data-act="edit" data-id="${e.ref}">✏️</button>
      <button class="btn btn--sm btn--ghost" data-act="del" data-id="${e.ref}">🗑️</button>`;
  }

  function bindRowActions(scope) {
    $$('[data-act]', scope).forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if (act === 'pay') markPaid(id);
      if (act === 'edit') openForm({ id });
      if (act === 'del') removeTx(id);
    }));
  }

  function markPaid(id) {
    const state = Store.getState();
    const tx = state.transactions.find(t => t.id === id);
    if (!tx) return;
    tx.status = 'paid';
    tx.paidDate = Utils.today();
    Store.emit({ type: 'transaction:update', payload: tx });
    UI.toast('Movimentação marcada como paga.', { type: 'success', title: 'Pago!' });
  }

  function removeTx(id) {
    UI.confirmDialog({
      title: 'Excluir movimentação',
      message: 'Tem certeza que deseja excluir esta movimentação? Esta ação não pode ser desfeita.',
      confirmText: 'Excluir', danger: true
    }).then(ok => {
      if (!ok) return;
      const state = Store.getState();
      state.transactions = state.transactions.filter(t => t.id !== id);
      Store.emit({ type: 'transaction:delete', payload: id });
      UI.toast('Movimentação excluída.', { type: 'success' });
    });
  }

  /* ---------- Formulário (criar/editar) ---------- */
  function openForm({ id, type } = {}) {
    const state = Store.getState();
    const editing = id ? state.transactions.find(t => t.id === id) : null;
    const t = editing ? editing.type : (type || lastType);
    if (!editing) lastType = t;

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="segment mb-2" id="formTypeSeg">
        <button data-type="income" class="${t === 'income' ? 'is-active' : ''}">📈 Receita</button>
        <button data-type="expense" class="${t === 'expense' ? 'is-active' : ''}">📉 Despesa</button>
      </div>
      <div class="form-grid">
        <div class="field span-2">
          <label>Descrição *</label>
          <input type="text" name="description" required value="${editing?.description || ''}" placeholder="Ex: Supermercado do mês" />
        </div>
        <div class="field">
          <label>Valor (R$) *</label>
          <div class="input-group"><span>R$</span>
            <input type="number" step="0.01" min="0" name="amount" required value="${editing?.amount || ''}" placeholder="0,00" />
          </div>
        </div>
        <div class="field">
          <label>Categoria *</label>
          ${UI.categorySelect(state, { value: editing?.categoryId, type: t })}
        </div>
        <div class="field">
          <label>Data de vencimento *</label>
          <input type="date" name="dueDate" required value="${editing?.dueDate || Utils.today()}" />
        </div>
        <div class="field">
          <label>Data de pagamento</label>
          <input type="date" name="paidDate" value="${editing?.paidDate || ''}" />
        </div>
        <div class="field">
          <label>Forma de pagamento</label>
          <select name="paymentMethod">
            ${PAYMENT_METHODS.map(m => `<option ${editing?.paymentMethod === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Status</label>
          <select name="status">
            ${['pending', 'paid'].map(s =>
              `<option value="${s}" ${(!editing && s === 'pending') || editing?.status === s ? 'selected' : ''}>${Utils.STATUS_LABEL[s]}</option>`).join('')}
          </select>
        </div>
        <div class="field span-2">
          <label>Observações</label>
          <textarea name="notes" placeholder="Notas adicionais...">${editing?.notes || ''}</textarea>
        </div>
      </div>
    `;

    // alternar segmento de tipo
    body.querySelector('#formTypeSeg').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-type]');
      if (!btn) return;
      body.querySelectorAll('#formTypeSeg button').forEach(b => b.classList.toggle('is-active', b === btn));
      // Atualiza select de categoria
      const newType = btn.dataset.type;
      const sel = body.querySelector('[name="categoryId"]');
      const prev = sel.value;
      sel.innerHTML = UI.categorySelect(state, { type: newType, value: prev })
        .match(/<select[^>]*>([\s\S]*)<\/select>/)?.[1] || '';
    });

    const footer = el('div', { style: 'display:flex;gap:10px;width:100%;' }, [
      editing ? el('button', { class: 'btn btn--danger', html: '🗑️ Excluir', onclick: () => {
        closeModal(); removeTx(editing.id);
      } }) : null,
      el('div', { style: 'flex:1' }),
      el('button', { class: 'btn btn--ghost', text: 'Cancelar', onclick: () => UI.closeModal() }),
      el('button', { class: 'btn btn--primary', text: editing ? 'Salvar alterações' : 'Adicionar',
        onclick: () => saveForm(body, editing) })
    ]);

    UI.openModal({
      title: editing ? 'Editar movimentação' : 'Nova movimentação',
      body, footer
    });
  }

  function saveForm(bodyEl, editing) {
    const state = Store.getState();
    const data = UI.formValues(bodyEl);
    const type = bodyEl.querySelector('#formTypeSeg button.is-active')?.dataset.type || 'expense';

    if (!data.description || !data.amount || !data.dueDate) {
      UI.toast('Preencha os campos obrigatórios.', { type: 'error' });
      return;
    }
    if (data.paidDate || data.status === 'paid') data.status = 'paid';
    else data.status = data.status || 'pending';
    if (data.status === 'paid' && !data.paidDate) data.paidDate = Utils.today();

    if (editing) {
      Object.assign(editing, {
        description: data.description,
        amount: parseFloat(data.amount),
        categoryId: data.categoryId,
        dueDate: data.dueDate,
        paidDate: data.paidDate || '',
        paymentMethod: data.paymentMethod,
        status: data.status,
        notes: data.notes,
        type
      });
      Store.emit({ type: 'transaction:update', payload: editing });
      UI.toast('Movimentação atualizada.', { type: 'success' });
    } else {
      const perfilId = App.getActiveProfileId();
      const tx = {
        id: Store.uid('tx'), type,
        description: data.description,
        amount: parseFloat(data.amount),
        categoryId: data.categoryId,
        dueDate: data.dueDate,
        paidDate: data.paidDate || '',
        paymentMethod: data.paymentMethod,
        status: data.status,
        notes: data.notes,
        perfilId: perfilId || null,
        createdAt: Date.now()
      };
      state.transactions.push(tx);
      Store.emit({ type: 'transaction:create', payload: tx });
      UI.toast('Movimentação criada.', { type: 'success' });
    }
    UI.closeModal();
  }

  function escapeHtmlSafe(s) { return global.Utils.escapeHtml(s); }

  App.Transactions = {
    render,
    openForm,
    add(type) { openForm({ type }); }
  };

  // Constante compartilhada entre as views de formulário
  global.PAYMENT_METHODS = global.PAYMENT_METHODS || [
    'Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro',
    'Transferência', 'Boleto', 'Conta Corrente', 'Outros'
  ];
})(window);
