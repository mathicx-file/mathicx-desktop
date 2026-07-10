/* =====================================================================
   VIEW: SIMULATOR — Simulador de compras
   - Calcula parcela, total, impacto no orçamento
   - Botão "Confirmar e Efetivar Lançamento" cria parcelamento real
   ===================================================================== */
(function (global) {
  'use strict';
  const { $, $$, el, money, pct, Utils, UI } = global;
  const App = global.App = global.App || {};

  function render() {
    const state = Store.getState();
    const root = $('#viewRoot');
    const income = state.settings.monthIncomeBudget || 0;

    root.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Simulador de Compras</h1>
          <p>Veja o impacto antes de comprar — e confirme para lançar</p>
        </div>
      </div>

      <div class="grid grid-sidebar">
        <div class="card card--pad-lg">
          <div class="card__title mb-2">Parâmetros da simulação</div>
          <div class="form-grid">
            <div class="field span-2">
              <label>Descrição da compra</label>
              <input type="text" id="sDesc" placeholder="Ex: TV 50 polegadas" />
            </div>
            <div class="field">
              <label>Valor da compra (R$) *</label>
              <div class="input-group"><span>R$</span>
                <input type="number" step="0.01" min="0" id="sValue" value="1200" />
              </div>
            </div>
            <div class="field">
              <label>Nº de parcelas *</label>
              <input type="number" min="1" max="120" id="sParcels" value="12" />
            </div>
            <div class="field">
              <label>Juros ao mês (%)</label>
              <input type="number" step="0.01" min="0" id="sRate" value="0" />
              <small class="text-muted">Deixe 0 se for sem juros</small>
            </div>
            <div class="field">
              <label>1º vencimento</label>
              <input type="date" id="sDate" value="${Utils.today()}" />
            </div>
            <div class="field">
              <label>Categoria</label>
              ${UI.categorySelect(state, { type: 'expense' })}
            </div>
            <div class="field">
              <label>Renda mensal informada (R$)</label>
              <div class="input-group"><span>R$</span>
                <input type="number" step="0.01" min="0" id="sIncome" value="${income}" />
              </div>
            </div>
          </div>
          <div class="field field--inline mt-2">
            <input type="checkbox" id="sApplyIncome" checked />
            <label for="sApplyIncome">Atualizar minha renda mensal nas configurações</label>
          </div>
        </div>

        <div>
          <div class="card card--pad-lg mb-2" id="resultCard">
            <div class="card__title mb-2">Resultado da simulação</div>
            <div id="resultBody"></div>
          </div>
          <div id="alertBox"></div>
          <div class="card card--pad-lg" id="confirmCard" style="display:none">
            <div class="card__title mb-1">Efetivar lançamento</div>
            <p class="text-muted fs-12 mb-2">Transforme esta simulação em um parcelamento real no seu controle.</p>
            <button class="btn btn--primary btn--block" id="btnConfirm">✓ Confirmar e Efetivar Lançamento</button>
          </div>
        </div>
      </div>
    `;

    // bind inputs
    ['sValue', 'sParcels', 'sRate', 'sIncome'].forEach(id =>
      $('#' + id).addEventListener('input', Utils.debounce(update, 200)));
    $('#sApplyIncome').addEventListener('change', () => {
      if ($('#sApplyIncome').checked) {
        Store.getState().settings.monthIncomeBudget = parseFloat($('#sIncome').value) || 0;
        Store.emit({ type: 'settings:budget-income' });
      }
    });
    $('#sIncome').addEventListener('change', () => {
      if ($('#sApplyIncome').checked) {
        Store.getState().settings.monthIncomeBudget = parseFloat($('#sIncome').value) || 0;
        Store.emit({ type: 'settings:budget-income' });
      }
    });
    $('#btnConfirm').addEventListener('click', confirmCreate);

    update();
  }

  function update() {
    const state = Store.getState();
    const value = parseFloat($('#sValue').value) || 0;
    const n = parseInt($('#sParcels').value) || 1;
    const rate = parseFloat($('#sRate').value) || 0;
    const income = parseFloat($('#sIncome').value) || 0;

    const installment = Utils.calcInstallment(value, rate, n);
    const totalFinal = installment * n;
    const totalInterest = totalFinal - value;

    // Impacto no orçamento atual: soma das despesas fixas + esta parcela
    const ctx = App.getContext();
    const perfilId = App.getActiveProfileId();
    const summ = Utils.monthSummary(state, ctx.year, ctx.month, perfilId);
    const newExpense = summ.expense + installment;
    const newBalance = (income || summ.income) - newExpense;
    const committedPct = income > 0 ? (installment / income) * 100 : 0;
    const totalCommittedPct = income > 0 ? (newExpense / income) * 100 : 0;

    // Projeta próximos meses considerando a parcela recorrente
    const projection = projectMonths(state, installment, n, income);

    $('#resultBody').innerHTML = `
      <div class="list">
        <div class="list__item">
          <div class="list__icon" style="background:var(--gradient-primary)">📅</div>
          <div class="list__body"><div class="list__title fs-lg fw-800">${money(installment)}</div>
            <div class="list__sub">Valor da parcela (${n}x)</div></div>
        </div>
        <div class="list__item">
          <div class="list__icon" style="background:var(--gradient-expense)">💵</div>
          <div class="list__body"><div class="list__title fs-lg fw-800">${money(totalFinal)}</div>
            <div class="list__sub">Total final ${totalInterest > 0 ? `(+ ${money(totalInterest)} de juros)` : '(sem juros)'}</div></div>
        </div>
        <div class="list__item">
          <div class="list__icon" style="background:linear-gradient(135deg,#f59e0b,#d97706)">📊</div>
          <div class="list__body">
            <div class="list__title">${pct(committedPct)} da renda</div>
            <div class="list__sub">Comprometido por mês com esta compra</div>
          </div>
        </div>
      </div>

      <div class="divider"></div>
      <div class="flex justify-between mb-1">
        <span class="text-muted">Despesas atuais do mês</span><strong>${money(summ.expense)}</strong>
      </div>
      <div class="flex justify-between mb-1">
        <span class="text-muted">Com a nova parcela</span><strong class="text-expense">${money(newExpense)}</strong>
      </div>
      <div class="flex justify-between mb-1">
        <span class="text-muted">Saldo projetado do mês</span>
        <strong class="${newBalance >= 0 ? 'text-income' : 'text-expense'}">${money(newBalance)}</strong>
      </div>
      <div class="flex justify-between">
        <span class="text-muted">Total comprometido da renda</span>
        <strong class="${totalCommittedPct <= 50 ? 'text-income' : 'text-expense'}">${pct(totalCommittedPct)}</strong>
      </div>

      ${projection.length ? `
        <div class="divider"></div>
        <div class="card__subtitle mb-1">Projeção dos próximos meses</div>
        <div class="chart-box chart-box--sm"><canvas id="chartProj"></canvas></div>` : ''}
    `;

    // Alertas
    const alerts = [];
    if (income > 0 && committedPct >= 30)
      alerts.push({ type: 'warn', icon: '⚠️', text: `Esta compra comprometerá ${pct(committedPct)} da sua renda mensal.` });
    if (income > 0 && committedPct >= 50)
      alerts.push({ type: 'error', icon: '🚨', text: 'Atenção! Mais da metade da sua renda iria para esta compra.' });
    if (newBalance < 0)
      alerts.push({ type: 'error', icon: '📉', text: 'Seu orçamento ficará negativo neste mês com esta compra.' });
    const futureNeg = projection.filter(p => p.balance < 0);
    if (futureNeg.length)
      alerts.push({ type: 'warn', icon: '🔮', text: `Seu orçamento ficará negativo em ${futureNeg.length} mês(es) dos próximos ${projection.length}.` });
    if (totalInterest > 0)
      alerts.push({ type: 'info', icon: '💸', text: `Você pagará ${money(totalInterest)} de juros no total.` });
    if (!alerts.length)
      alerts.push({ type: 'ok', icon: '✅', text: 'Esta compra parece caber no seu orçamento. Use com consciência!' });

    $('#alertBox').innerHTML = alerts.map(a => `
      <div class="alert-chip ${a.type === 'error' ? '' : 'alert-chip--' + (a.type === 'warn' ? 'warn' : a.type === 'ok' ? 'ok' : '')}" style="margin-bottom:8px">
        <span class="icon">${a.icon}</span><span>${a.text}</span>
      </div>`).join('');

    $('#confirmCard').style.display = value > 0 ? 'block' : 'none';

    if (projection.length) drawProj(projection);
  }

  function projectMonths(state, installment, monthsCount, income) {
    const result = [];
    const now = new Date();
    const perfilId = App.getActiveProfileId();
    for (let i = 0; i < Math.min(monthsCount, 12); i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const summ = Utils.monthSummary(state, d.getFullYear(), d.getMonth(), perfilId);
      const inc = income || summ.income;
      const balance = inc - summ.expense - installment;
      result.push({
        label: `${Utils.MONTHS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
        balance, expense: summ.expense + installment
      });
    }
    return result;
  }

  function drawProj(projection) {
    UI.chart('chartProj', {
      type: 'line',
      data: {
        labels: projection.map(p => p.label),
        datasets: [{
          label: 'Saldo projetado',
          data: projection.map(p => p.balance),
          borderColor: UI.cssVar('--c-primary'),
          backgroundColor: 'rgba(99,102,241,.15)', fill: true, tension: .35
        }]
      },
      options: { plugins: { legend: { display: false } } }
    });
  }

  function confirmCreate() {
    const desc = $('#sDesc').value.trim() || 'Compra simulada';
    const totalAmount = parseFloat($('#sValue').value) || 0;
    const count = parseInt($('#sParcels').value) || 1;
    const firstDueDate = $('#sDate').value || Utils.today();
    const categoryId = $('select[name="categoryId"]').value || null;
    if (!totalAmount || !count) { UI.toast('Informe valor e parcelas.', { type: 'error' }); return; }

    UI.confirmDialog({
      title: 'Confirmar lançamento',
      message: `Criar parcelamento "${desc}" em ${count}x de ${money(totalAmount / count)}?`,
      confirmText: 'Efetivar'
    }).then(ok => {
      if (!ok) return;
      App.Installments.createFromSimulator({
        description: desc, totalAmount, count, firstDueDate,
        categoryId, paymentMethod: 'Cartão de Crédito'
      });
      UI.toast('Parcelamento criado a partir da simulação!', { type: 'success', title: 'Lançamento efetivado' });
      setTimeout(() => App.navigate('installments'), 600);
    });
  }

  App.Simulator = { render };
})(window);
