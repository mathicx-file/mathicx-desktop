(function (global) {
  'use strict';
  const { $, $$, el, money, Utils, UI } = global;
  const App = global.App = global.App || {};

  function render() {
    const state = Store.getState();
    const root = $('#viewRoot');
    root.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Transferências Entre Perfis</h1>
          <p>Movimente valores entre seus perfis financeiros</p>
        </div>
        <div class="page-header__actions">
          <button class="btn btn--primary" data-action="new">＋ Nova transferência</button>
        </div>
      </div>
      <div class="stat-grid mb-3">
        ${UI.statCard({ label: 'Total transferido', value: money(totalTransferred(state)), icon: '🔄', variant: 'primary' })}
        ${UI.statCard({ label: 'Transferências', value: state.transfers.length, icon: '📋', variant: 'accent' })}
      </div>
      <div id="transfersList"></div>
    `;
    $$('[data-action="new"]').forEach(b => b.addEventListener('click', () => openForm()));
    renderList();
  }

  function totalTransferred(state) {
    return state.transfers.reduce((s, t) => s + t.amount, 0);
  }

  function renderList() {
    const state = Store.getState();
    const list = $('#transfersList');
    if (!state.transfers.length) {
      list.innerHTML = UI.emptyState({
        icon: '🔄', title: 'Nenhuma transferência',
        message: 'Transfira valores entre seus perfis financeiros.',
        action: '<button class="btn btn--primary" data-action="new">＋ Nova transferência</button>'
      });
      $$('[data-action="new"]', list).forEach(b => b.addEventListener('click', () => openForm()));
      return;
    }

    list.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Data</th><th>Descrição</th><th>Origem</th><th>Destino</th><th>Valor</th><th></th>
          </tr></thead>
          <tbody>
            ${[...state.transfers].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map(t => {
              const from = Store.getProfile(t.fromProfileId);
              const to = Store.getProfile(t.toProfileId);
              return `<tr>
                <td>${Utils.formatDate(t.date || Utils.isoDate(new Date(t.createdAt)), 'short')}</td>
                <td>${escapeHtmlSafe(t.description)}</td>
                <td><span style="color:${from?.color || '#666'}">${from?.icon || '?'} ${escapeHtmlSafe(from?.name || 'N/A')}</span></td>
                <td><span style="color:${to?.color || '#666'}">${to?.icon || '?'} ${escapeHtmlSafe(to?.name || 'N/A')}</span></td>
                <td><strong class="text-expense">${money(t.amount)}</strong></td>
                <td><button class="btn btn--sm btn--ghost" data-act="del" data-id="${t.id}">🗑️</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
    $$('[data-act="del"]', list).forEach(b => b.addEventListener('click', () => remove(b.dataset.id)));
  }

  function remove(id) {
    UI.confirmDialog({
      title: 'Remover transferência',
      message: 'Remover este registro de transferência? As movimentações geradas nos perfis não serão removidas automaticamente.',
      confirmText: 'Remover', danger: true
    }).then(ok => {
      if (!ok) return;
      const state = Store.getState();
      const tx = state.transfers.find(t => t.id === id);
      // Remove as transações vinculadas
      if (tx) {
        state.transactions = state.transactions.filter(t => t.transferRef !== id);
      }
      state.transfers = state.transfers.filter(t => t.id !== id);
      Store.emit({ type: 'transfer:delete' });
      UI.toast('Transferência removida.', { type: 'success' });
    });
  }

  function openForm() {
    const state = Store.getState();
    const activeProfiles = state.profiles.filter(p => p.active);
    if (activeProfiles.length < 2) {
      UI.toast('Você precisa de pelo menos 2 perfis ativos para transferir.', { type: 'warn' });
      return;
    }

    const activeId = App.getActiveProfileId() || activeProfiles[0].id;

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-grid">
        <div class="field span-2">
          <label>Descrição</label>
          <input type="text" id="tfDesc" placeholder="Ex: Transferência mensal" value="Transferência entre perfis" />
        </div>
        <div class="field">
          <label>Origem *</label>
          <select id="tfFrom">
            ${activeProfiles.map(p => `<option value="${p.id}" ${p.id === activeId ? 'selected' : ''}>${p.icon} ${escapeHtmlSafe(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Destino *</label>
          <select id="tfTo">
            ${activeProfiles.map(p => `<option value="${p.id}" ${p.id !== activeId ? 'selected' : ''}>${p.icon} ${escapeHtmlSafe(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field span-2">
          <label>Valor (R$) *</label>
          <div class="input-group"><span>R$</span>
            <input type="number" step="0.01" min="0" id="tfAmount" placeholder="0,00" />
          </div>
        </div>
        <div class="field span-2">
          <label>Data</label>
          <input type="date" id="tfDate" value="${Utils.today()}" />
        </div>
      </div>
    `;

    // Trocar origem/destino quando selecionar o mesmo
    body.querySelector('#tfFrom').addEventListener('change', () => {
      const from = body.querySelector('#tfFrom').value;
      const to = body.querySelector('#tfTo').value;
      if (from === to) {
        // Inverte
        const opts = [...body.querySelector('#tfTo').options];
        const idx = opts.findIndex(o => o.value !== from);
        if (idx >= 0) body.querySelector('#tfTo').selectedIndex = idx;
      }
    });
    body.querySelector('#tfTo').addEventListener('change', () => {
      const from = body.querySelector('#tfFrom').value;
      const to = body.querySelector('#tfTo').value;
      if (from === to) {
        const opts = [...body.querySelector('#tfFrom').options];
        const idx = opts.findIndex(o => o.value !== to);
        if (idx >= 0) body.querySelector('#tfFrom').selectedIndex = idx;
      }
    });

    const footer = el('div', { style: 'display:flex;gap:10px;' }, [
      el('button', { class: 'btn btn--ghost', text: 'Cancelar', onclick: () => UI.closeModal() }),
      el('button', { class: 'btn btn--primary', text: 'Transferir',
        onclick: () => {
          const fromId = body.querySelector('#tfFrom').value;
          const toId = body.querySelector('#tfTo').value;
          const amount = parseFloat(body.querySelector('#tfAmount').value) || 0;
          const desc = body.querySelector('#tfDesc').value.trim() || 'Transferência entre perfis';
          const date = body.querySelector('#tfDate').value || Utils.today();
          if (!fromId || !toId) { UI.toast('Selecione origem e destino.', { type: 'error' }); return; }
          if (fromId === toId) { UI.toast('Origem e destino devem ser diferentes.', { type: 'error' }); return; }
          if (amount <= 0) { UI.toast('Informe um valor válido.', { type: 'error' }); return; }
          executeTransfer(fromId, toId, amount, desc, date);
          UI.closeModal();
        } })
    ]);

    UI.openModal({ title: 'Nova transferência', body, footer, size: 'sm' });
  }

  function executeTransfer(fromId, toId, amount, description, date) {
    const state = Store.getState();
    const transferId = Store.uid('tf');

    // Gera saída no perfil de origem
    state.transactions.push({
      id: Store.uid('tx'), type: 'expense',
      description: `${description} → ${Store.getProfile(toId)?.name || '?'}`,
      amount, categoryId: null,
      dueDate: date, paidDate: date,
      paymentMethod: 'Transferência Interna', status: 'paid',
      notes: 'Transferência entre perfis',
      perfilId: fromId, transferRef: transferId,
      createdAt: Date.now()
    });

    // Gera entrada no perfil de destino
    state.transactions.push({
      id: Store.uid('tx'), type: 'income',
      description: `${description} ← ${Store.getProfile(fromId)?.name || '?'}`,
      amount, categoryId: null,
      dueDate: date, paidDate: date,
      paymentMethod: 'Transferência Interna', status: 'paid',
      notes: 'Transferência entre perfis',
      perfilId: toId, transferRef: transferId,
      createdAt: Date.now()
    });

    // Registra a transferência
    state.transfers.push({
      id: transferId, fromProfileId: fromId, toProfileId: toId,
      amount, description, date, createdAt: Date.now()
    });

    Store.emit({ type: 'transfer:create' });
    UI.toast(`Transferência de ${money(amount)} realizada!`, { type: 'success' });
  }

  function escapeHtmlSafe(s) { return global.Utils.escapeHtml(s); }

  App.Transfers = { render, openForm, executeTransfer };
})(window);