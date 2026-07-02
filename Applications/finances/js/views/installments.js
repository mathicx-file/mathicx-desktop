/* =====================================================================
   VIEW: INSTALLMENTS — Compras parceladas
   - Cadastro com geração automática de parcelas
   - Marcar parcelas como pagas, cancelar futuras, ver progresso
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
          <h1>Compras Parceladas</h1>
          <p>Acompanhe o progresso de cada compra</p>
        </div>
        <div class="page-header__actions">
          <button class="btn btn--primary" data-action="new">＋ Nova compra parcelada</button>
        </div>
      </div>

      <div class="stat-grid mb-3">
        ${summaryCards(state)}
      </div>

      <div id="installmentsList"></div>
    `;
    $$('[data-action="new"]').forEach(b => b.addEventListener('click', () => openForm()));
    renderList();
  }

  function summaryCards(state) {
    let totalOpen = 0, totalPaid = 0, activeCount = 0;
    const perfilId = App.getActiveProfileId();
    const insts = perfilId ? state.installments.filter(i => i.perfilId === perfilId) : state.installments;
    insts.forEach(inst => {
      const open = inst.parcels.filter(p => p.status !== 'cancelled' && !p.paid);
      if (open.length) { activeCount++; totalOpen += open.reduce((s, p) => s + p.amount, 0); }
      totalPaid += inst.parcels.filter(p => p.paid).reduce((s, p) => s + p.amount, 0);
    });
    return [
      UI.statCard({ label: 'Compras ativas', value: activeCount, icon: '🧾', variant: 'primary' }),
      UI.statCard({ label: 'Já pago em parcelas', value: money(totalPaid), icon: '✅', variant: 'income' }),
      UI.statCard({ label: 'A pagar (futuro)', value: money(totalOpen), icon: '🔒', variant: 'warn' }),
      UI.statCard({ label: 'Total cadastrado', value: state.installments.length, icon: '📦', variant: 'accent' })
    ].join('');
  }

  function renderList() {
    const state = Store.getState();
    const perfilId = App.getActiveProfileId();
    const insts = perfilId ? state.installments.filter(i => i.perfilId === perfilId) : state.installments;
    const list = $('#installmentsList');
    if (!insts.length) {
      list.innerHTML = UI.emptyState({
        icon: '🧾', title: 'Nenhuma compra parcelada',
        message: 'Cadastre uma compra e o sistema gera as parcelas automaticamente.',
        action: `<button class="btn btn--primary" data-action="new">＋ Nova compra</button>`
      });
      $$('[data-action="new"]', list).forEach(b => b.addEventListener('click', () => openForm()));
      return;
    }

    list.innerHTML = insts.map(inst => {
      const paid = inst.parcels.filter(p => p.paid).length;
      const total = inst.parcels.length;
      const open = inst.parcels.filter(p => !p.paid && p.status !== 'cancelled').length;
      const cancelled = inst.parcels.filter(p => p.status === 'cancelled').length;
      const cat = Utils.categoryById(state, inst.categoryId);
      const remaining = inst.parcels
        .filter(p => !p.paid && p.status !== 'cancelled')
        .reduce((s, p) => s + p.amount, 0);

      return `
        <div class="card card--pad-lg mb-2">
          <div class="flex items-center justify-between flex-wrap gap-1 mb-2">
            <div class="flex items-center gap-1">
              <div class="list__icon" style="background:${cat.color}">${cat.icon}</div>
              <div>
                <div class="fs-lg fw-700">${escapeHtmlSafe(inst.description)}</div>
                <div class="text-muted fs-12">
                  ${Utils.formatDate(inst.firstDueDate, 'monthShort')} ·
                  ${inst.installmentsCount}x de ${money(inst.totalAmount / inst.installmentsCount)} ·
                  ${inst.paymentMethod}
                </div>
              </div>
            </div>
            <div class="flex gap-1">
              <button class="btn btn--sm btn--ghost" data-act="detail" data-id="${inst.id}">Ver parcelas</button>
              <button class="btn btn--sm btn--ghost" data-act="edit" data-id="${inst.id}">✏️</button>
              <button class="btn btn--sm btn--ghost" data-act="del" data-id="${inst.id}">🗑️</button>
            </div>
          </div>

          <div class="flex items-center justify-between mb-1">
            <strong>${paid} de ${total} parcelas pagas</strong>
            <span class="text-muted">${cancelled ? `${cancelled} cancelada(s) · ` : ''}Restam ${money(remaining)}</span>
          </div>
          ${UI.progressBar(paid, total - cancelled, { variant: 'primary' })}

          <div class="flex gap-1 mt-2 flex-wrap">
            ${inst.parcels.map((p, idx) => {
              const stCls = p.status === 'cancelled' ? 'badge--soft'
                : (p.paid ? 'badge--paid' : (Utils.effectiveStatus(p) === 'overdue' ? 'badge--overdue' : 'badge--pending'));
              const stLbl = p.status === 'cancelled' ? 'Cancelada'
                : (p.paid ? 'Pago' : (Utils.effectiveStatus(p) === 'overdue' ? 'Atrasada' : 'Pendente'));
              return `<button class="btn btn--sm ${p.paid ? 'btn--income' : (p.status === 'cancelled' ? 'btn--ghost' : 'btn--ghost')}"
                  style="opacity:${p.status === 'cancelled' ? .5 : 1}"
                  data-act="toggle" data-id="${inst.id}" data-pid="${p.id}"
                  title="Parcela ${p.number}/${p.total} - ${Utils.formatDate(p.dueDate, 'short')}">
                  ${p.number}/${p.total} · ${stLbl}
                </button>`;
            }).join('')}
          </div>
        </div>`;
    }).join('');

    // bind
    $$('[data-act]', list).forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if (act === 'toggle') toggleParcel(id, btn.dataset.pid);
      if (act === 'detail') openDetail(id);
      if (act === 'edit') openForm({ id });
      if (act === 'del') removeInstallment(id);
    }));
  }

  function toggleParcel(instId, parcelId) {
    const state = Store.getState();
    const inst = state.installments.find(i => i.id === instId);
    if (!inst) return;
    const p = inst.parcels.find(x => x.id === parcelId);
    if (!p || p.status === 'cancelled') return;
    p.paid = !p.paid;
    p.status = p.paid ? 'paid' : 'pending';
    p.paidDate = p.paid ? Utils.today() : null;
    Store.emit({ type: 'installment:update', payload: inst });
    UI.toast(p.paid ? 'Parcela marcada como paga.' : 'Parcela reaberta.', { type: 'success' });
  }

  function removeInstallment(id) {
    UI.confirmDialog({
      title: 'Excluir compra',
      message: 'Excluir esta compra parcelada removerá todas as parcelas. Continuar?',
      confirmText: 'Excluir', danger: true
    }).then(ok => {
      if (!ok) return;
      const state = Store.getState();
      state.installments = state.installments.filter(i => i.id !== id);
      Store.emit({ type: 'installment:delete' });
      UI.toast('Compra excluída.', { type: 'success' });
    });
  }

  /* ---------- Detalhe (com cancelar parcelas futuras) ---------- */
  function openDetail(id) {
    const state = Store.getState();
    const inst = state.installments.find(i => i.id === id);
    if (!inst) return;
    const cat = Utils.categoryById(state, inst.categoryId);
    const paid = inst.parcels.filter(p => p.paid).length;
    const total = inst.parcels.length;

    const body = el('div', {});
    body.innerHTML = `
      <div class="flex items-center gap-1 mb-2">
        <div class="list__icon" style="background:${cat.color}">${cat.icon}</div>
        <div>
          <div class="fs-lg fw-700">${escapeHtmlSafe(inst.description)}</div>
          <div class="text-muted fs-12">${cat.name} · ${inst.paymentMethod}</div>
        </div>
      </div>
      <div class="stat-grid mb-2">
        ${UI.statCard({ label: 'Valor total', value: money(inst.totalAmount), icon: '💰', variant: 'primary' })}
        ${UI.statCard({ label: 'Parcelas pagas', value: `${paid}/${total}`, icon: '✅', variant: 'income' })}
        ${UI.statCard({ label: 'Restante', value: money(inst.parcels.filter(p => !p.paid && p.status !== 'cancelled').reduce((s, p) => s + p.amount, 0)), icon: '🔒', variant: 'warn' })}
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            ${inst.parcels.map(p => {
              const st = p.status === 'cancelled' ? 'cancelled'
                : (p.paid ? 'paid' : Utils.effectiveStatus(p));
              return `<tr style="${p.status === 'cancelled' ? 'opacity:.5' : ''}">
                <td><strong>${p.number}/${p.total}</strong></td>
                <td>${Utils.formatDate(p.dueDate, 'short')}</td>
                <td>${money(p.amount)}</td>
                <td>${UI.statusBadge(st)}</td>
                <td>
                  ${p.status !== 'cancelled' && !p.paid
                    ? `<button class="btn btn--sm btn--ghost" data-cancel="${p.id}">Cancelar</button>` : ''}
                  ${p.status !== 'cancelled'
                    ? `<button class="btn btn--sm ${p.paid ? 'btn--ghost' : 'btn--income'}" data-pay="${p.id}">${p.paid ? 'Reabrir' : 'Pagar'}</button>`
                    : ''}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    body.querySelectorAll('[data-pay]').forEach(b => b.addEventListener('click', () => {
      toggleParcel(id, b.dataset.pay);
      UI.closeModal();
    }));
    body.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => {
      const p = inst.parcels.find(x => x.id === b.dataset.cancel);
      UI.confirmDialog({
        title: 'Cancelar parcela',
        message: `Cancelar a parcela ${p.number}/${p.total} de ${money(p.amount)}? Parcelas canceladas não entram mais no fluxo.`,
        confirmText: 'Cancelar parcela', danger: true
      }).then(ok => {
        if (!ok) return;
        p.status = 'cancelled'; p.paid = false; p.paidDate = null;
        Store.emit({ type: 'installment:update', payload: inst });
        UI.closeModal();
        UI.toast('Parcela cancelada.', { type: 'success' });
      });
    }));

    UI.openModal({ title: 'Detalhes da compra', body, size: 'lg' });
  }

  /* ---------- Formulário ---------- */
  function openForm({ id } = {}) {
    const state = Store.getState();
    const editing = id ? state.installments.find(i => i.id === id) : null;

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-grid">
        <div class="field span-2">
          <label>Nome da compra *</label>
          <input type="text" name="description" required value="${editing?.description || ''}" placeholder="Ex: Notebook, Geladeira..." />
        </div>
        <div class="field">
          <label>Valor total (R$) *</label>
          <div class="input-group"><span>R$</span>
            <input type="number" step="0.01" min="0" name="totalAmount" id="fTotal"
              required value="${editing?.totalAmount || ''}" placeholder="0,00" />
          </div>
        </div>
        <div class="field">
          <label>Nº de parcelas *</label>
          <input type="number" min="1" max="120" name="installmentsCount" id="fCount"
            required value="${editing?.installmentsCount || 1}" />
        </div>
        <div class="field">
          <label>${editing ? '1º vencimento' : 'Data da compra'} *</label>
          <input type="date" name="firstDueDate" id="fDate"
            required value="${editing?.firstDueDate || Utils.today()}" />
        </div>
        <div class="field">
          <label>Categoria</label>
          ${UI.categorySelect(state, { value: editing?.categoryId, type: 'expense' })}
        </div>
        <div class="field span-2">
          <label>Forma de pagamento</label>
          <select name="paymentMethod">
            ${(global.PAYMENT_METHODS || []).map(m =>
              `<option ${editing?.paymentMethod === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        ${editing ? '' : `
        <div class="field span-2">
          <label>Parcelas já pagas no cadastro</label>
          <input type="number" min="0" name="alreadyPaid" id="fPaid" value="0" />
          <small class="text-muted">Marcará automaticamente as primeiras parcelas como pagas.</small>
        </div>`}
        <div class="field span-2">
          <div class="card" style="background:var(--surface-2)">
            <div class="flex justify-between">
              <span>Valor da parcela:</span>
              <strong id="previewParcel">—</strong>
            </div>
            <div class="flex justify-between mt-1">
              <span>Total final:</span>
              <strong id="previewTotal">—</strong>
            </div>
          </div>
        </div>
      </div>
    `;

    const updatePreview = () => {
      const total = parseFloat(body.querySelector('#fTotal').value) || 0;
      const count = parseInt(body.querySelector('#fCount').value) || 1;
      body.querySelector('#previewParcel').textContent = money(total / count);
      body.querySelector('#previewTotal').textContent = money(total);
    };
    ['fTotal', 'fCount'].forEach(id => body.querySelector('#' + id).addEventListener('input', updatePreview));
    updatePreview();

    const footer = el('div', { style: 'display:flex;gap:10px;width:100%;' }, [
      el('button', { class: 'btn btn--ghost', text: 'Cancelar', onclick: () => UI.closeModal() }),
      el('div', { style: 'flex:1' }),
      el('button', { class: 'btn btn--primary', text: editing ? 'Salvar' : 'Criar parcelamento',
        onclick: () => save(body, editing) })
    ]);

    UI.openModal({ title: editing ? 'Editar compra parcelada' : 'Nova compra parcelada', body, footer });
  }

  function save(bodyEl, editing) {
    const state = Store.getState();
    const d = UI.formValues(bodyEl);
    if (!d.description || !d.totalAmount || !d.installmentsCount || !d.firstDueDate) {
      UI.toast('Preencha os campos obrigatórios.', { type: 'error' }); return;
    }
    const count = parseInt(d.installmentsCount);
    const amount = d.totalAmount / count;
    const baseDate = Utils.parseDate(d.firstDueDate);

    if (editing) {
      // Recria parcelas mantendo status das existentes quando possível
      const oldById = new Map(editing.parcels.map(p => [p.number, p]));
      editing.parcels = generateParcels(count, amount, baseDate).map(p => {
        const old = oldById.get(p.number);
        return old ? Object.assign(p, {
          paid: old.paid, status: old.status, paidDate: old.paidDate, id: old.id
        }) : p;
      });
      editing.description = d.description;
      editing.totalAmount = parseFloat(d.totalAmount);
      editing.installmentsCount = count;
      editing.firstDueDate = d.firstDueDate;
      editing.categoryId = d.categoryId;
      editing.paymentMethod = d.paymentMethod;
      Store.emit({ type: 'installment:update', payload: editing });
      UI.toast('Compra atualizada.', { type: 'success' });
    } else {
      const already = parseInt(d.alreadyPaid) || 0;
      const parcels = generateParcels(count, amount, baseDate).map((p, idx) => {
        if (idx < already) { p.paid = true; p.status = 'paid'; p.paidDate = Utils.today(); }
        return p;
      });
      const perfilId = App.getActiveProfileId();
      const inst = {
        id: Store.uid('inst'),
        description: d.description,
        totalAmount: parseFloat(d.totalAmount),
        installmentsCount: count,
        firstDueDate: d.firstDueDate,
        categoryId: d.categoryId,
        paymentMethod: d.paymentMethod,
        cardId: null,
        parcels,
        perfilId: perfilId || null,
        createdAt: Date.now()
      };
      state.installments.push(inst);
      Store.emit({ type: 'installment:create', payload: inst });
      UI.toast(`${count} parcelas geradas com sucesso.`, { type: 'success' });
    }
    UI.closeModal();
  }

  function generateParcels(count, amount, baseDate) {
    const parcels = [];
    for (let i = 0; i < count; i++) {
      const due = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, baseDate.getDate());
      parcels.push({
        id: Store.uid('pc'),
        number: i + 1,
        total: count,
        amount: parseFloat(amount.toFixed(2)),
        dueDate: Utils.isoDate(due),
        paid: false,
        paidDate: null,
        status: 'pending'
      });
    }
    return parcels;
  }

  function escapeHtmlSafe(s) { return global.Utils.escapeHtml(s); }

  /* API pública: criar parcelamento a partir do simulador */
  function createFromSimulator({ description, totalAmount, count, firstDueDate, categoryId, paymentMethod }) {
    const state = Store.getState();
    const baseDate = Utils.parseDate(firstDueDate);
    const amount = totalAmount / count;
    const parcels = generateParcels(count, amount, baseDate);
    const perfilId = App.getActiveProfileId();
    const inst = {
      id: Store.uid('inst'),
      description, totalAmount: parseFloat(totalAmount),
      installmentsCount: count, firstDueDate,
      categoryId, paymentMethod, cardId: null,
      perfilId: perfilId || null,
      parcels, createdAt: Date.now()
    };
    state.installments.push(inst);
    Store.emit({ type: 'installment:create', payload: inst });
    return inst;
  }

  App.Installments = { render, openForm, createFromSimulator };
})(window);
