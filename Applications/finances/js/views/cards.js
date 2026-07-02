/* =====================================================================
   VIEW: CARDS — Cartões de crédito
   - Limite, dias de fechamento/vencimento, fatura
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
          <h1>Cartões de Crédito</h1>
          <p>Acompanhe limites e faturas</p>
        </div>
        <div class="page-header__actions">
          <button class="btn btn--primary" data-action="new">＋ Novo cartão</button>
        </div>
      </div>
      <div class="grid grid--2" id="cardsGrid"></div>
    `;
    $$('[data-action="new"]').forEach(b => b.addEventListener('click', () => openForm()));
    renderGrid();
  }

  function invoiceFor(state, cardId) {
    // Soma despesas pagas no cartão de crédito deste cartão (no mês atual) + parcelas com paymentMethod cartão
    const ctx = App.getContext();
    const perfilId = App.getActiveProfileId();
    let total = 0;
    const entries = Utils.allEntries(state, perfilId).filter(e =>
      e.type === 'expense' && e.paymentMethod === 'Cartão de Crédito' &&
      Utils.inMonth(e.dueDate, ctx.year, ctx.month));
    entries.forEach(e => {
      // Parcelas vinculadas a este cartão
      if (e.source === 'installment') {
        const parent = state.installments.find(i => i.id === e.installRef);
        if (parent && parent.cardId === cardId) total += e.amount;
        else if (!parent?.cardId) total += e.amount; // não vinculado -> conta em todos? Melhor: só se for avulso
      } else if (!e.cardId || e.cardId === cardId) {
        total += e.amount;
      }
    });
    return total;
  }

  function renderGrid() {
    const state = Store.getState();
    const perfilId = App.getActiveProfileId();
    const cards = perfilId ? state.cards.filter(c => c.perfilId === perfilId) : state.cards;
    const grid = $('#cardsGrid');
    if (!cards.length) {
      grid.innerHTML = UI.emptyState({
        icon: '💳', title: 'Nenhum cartão cadastrado',
        message: 'Cadastre seu cartão de crédito para acompanhar a fatura.',
        action: `<button class="btn btn--primary" data-action="new">＋ Novo cartão</button>`
      });
      $$('[data-action="new"]', grid).forEach(b => b.addEventListener('click', () => openForm()));
      return;
    }

    grid.innerHTML = cards.map(card => {
      const used = invoiceFor(state, card.id);
      const limit = card.limit || 0;
      const available = Math.max(0, limit - used);
      const usagePct = limit > 0 ? (used / limit) * 100 : 0;
      const usageCls = usagePct > 80 ? 'progress--expense' : usagePct > 50 ? '' : 'progress--income';

      return `
        <div class="card card--pad-lg" style="background:linear-gradient(135deg, ${card.color}22, var(--surface));border-color:${card.color}55">
          <!-- "cartão físico" -->
          <div style="background:linear-gradient(135deg, ${card.color}, ${card.color}cc);color:#fff;
               border-radius:14px;padding:18px;box-shadow:var(--shadow)">
            <div class="flex justify-between">
              <strong style="font-size:15px">${escapeHtmlSafe(card.name)}</strong>
              <small>${escapeHtmlSafe(card.brand || '')}</small>
            </div>
            <div style="font-size:18px;letter-spacing:3px;margin:18px 0 6px">•••• •••• •••• ${String(card.id).slice(-4)}</div>
            <div class="flex justify-between fs-12">
              <span>Fecha dia ${card.closingDay} · Vence dia ${card.dueDay}</span>
              <span>Limite ${money(limit)}</span>
            </div>
          </div>

          <div class="mt-2">
            <div class="flex justify-between mb-1">
              <span class="text-muted">Fatura atual</span>
              <strong class="text-expense">${money(used)}</strong>
            </div>
            ${UI.progressBar(used, limit, { variant: usageCls.replace('progress--', '') })}
            <div class="flex justify-between mt-1">
              <small class="text-muted">Disponível: <strong>${money(available)}</strong></small>
              <small class="text-muted">${pct(usagePct)} usado</small>
            </div>
          </div>

          <div class="flex gap-1 mt-2">
            <button class="btn btn--sm btn--ghost flex-1" data-act="edit" data-id="${card.id}">Editar</button>
            <button class="btn btn--sm btn--ghost" data-act="del" data-id="${card.id}">🗑️</button>
          </div>
        </div>`;
    }).join('');

    $$('[data-act]', grid).forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.id;
      if (b.dataset.act === 'edit') openForm({ id });
      if (b.dataset.act === 'del') remove(id);
    }));
  }

  function remove(id) {
    UI.confirmDialog({
      title: 'Excluir cartão',
      message: 'Excluir este cartão? Lançamentos vinculados não serão removidos.',
      confirmText: 'Excluir', danger: true
    }).then(ok => {
      if (!ok) return;
      const state = Store.getState();
      state.cards = state.cards.filter(c => c.id !== id);
      Store.emit({ type: 'card:delete' });
      UI.toast('Cartão excluído.', { type: 'success' });
    });
  }

  function openForm({ id } = {}) {
    const state = Store.getState();
    const editing = id ? state.cards.find(c => c.id === id) : null;
    const color = editing?.color || '#8b5cf6';

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-grid">
        <div class="field">
          <label>Nome / Banco *</label>
          <input type="text" name="name" required value="${editing?.name || ''}" placeholder="Ex: Nubank, Itaú" />
        </div>
        <div class="field">
          <label>Bandeira</label>
          <input type="text" name="brand" value="${editing?.brand || ''}" placeholder="Mastercard, Visa..." />
        </div>
        <div class="field">
          <label>Limite (R$)</label>
          <div class="input-group"><span>R$</span>
            <input type="number" step="0.01" min="0" name="limit" value="${editing?.limit || ''}" />
          </div>
        </div>
        <div class="field">
          <label>Dia de fechamento</label>
          <input type="number" min="1" max="31" name="closingDay" value="${editing?.closingDay || 28}" />
        </div>
        <div class="field">
          <label>Dia de vencimento</label>
          <input type="number" min="1" max="31" name="dueDay" value="${editing?.dueDay || 8}" />
        </div>
        <div class="field span-2">
          <label>Cor do cartão</label>
          <div class="swatch-grid" id="swatches">
            ${['#8b5cf6', '#6366f1', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#0ea5e9', '#64748b', '#111827']
              .map(c => `<div class="swatch ${c === color ? 'is-selected' : ''}" data-color="${c}" style="background:${c}"></div>`).join('')}
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
      el('button', { class: 'btn btn--ghost', text: 'Cancelar', onclick: () => UI.closeModal() }),
      el('div', { style: 'flex:1' }),
      el('button', { class: 'btn btn--primary', text: editing ? 'Salvar' : 'Criar',
        onclick: () => {
          const d = UI.formValues(body);
          if (!d.name) { UI.toast('Informe o nome.', { type: 'error' }); return; }
          const payload = {
            name: d.name, brand: d.brand,
            limit: parseFloat(d.limit) || 0,
            closingDay: parseInt(d.closingDay) || 28,
            dueDay: parseInt(d.dueDay) || 8,
            color: selColor
          };
          if (editing) {
            Object.assign(editing, payload);
            Store.emit({ type: 'card:update' });
            UI.toast('Cartão atualizado.', { type: 'success' });
          } else {
            const perfilId = App.getActiveProfileId();
            state.cards.push(Object.assign({ id: Store.uid('card'), perfilId: perfilId || null, createdAt: Date.now() }, payload));
            Store.emit({ type: 'card:create' });
            UI.toast('Cartão criado.', { type: 'success' });
          }
          UI.closeModal();
        } })
    ]);

    UI.openModal({ title: editing ? 'Editar cartão' : 'Novo cartão', body, footer });
  }

  function escapeHtmlSafe(s) { return global.Utils.escapeHtml(s); }

  App.Cards = { render, openForm, invoiceFor };
})(window);
