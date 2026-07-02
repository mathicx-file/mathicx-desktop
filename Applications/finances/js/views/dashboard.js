/* =====================================================================
   VIEW: DASHBOARD — Resumo financeiro, indicadores e gráficos
   ===================================================================== */
(function (global) {
  'use strict';
  const { $, el, money, moneyShort, pct, Utils, UI } = global;
  const App = global.App = global.App || {};

  function render() {
    const state = Store.getState();
    const ctx = App.getContext();        // { year, month }
    const perfilId = App.getActiveProfileId();
    const summ = Utils.monthSummary(state, ctx.year, ctx.month, perfilId);
    const balance = Utils.overallBalance(state, perfilId);
    const future = Utils.futureCommitments(state, perfilId);
    const futureAmount = future.reduce((s, e) => s + e.amount, 0);
    const evolution = Utils.monthlyEvolution(state, 6, perfilId);
    const savingRate = summ.income > 0 ? (summ.balance / summ.income) * 100 : 0;

    // Saúde financeira (0-100): composição simples
    const health = computeHealth({ summ, balance, savingRate });

    // Dados p/ gráficos
    const expByCat = Utils.byCategory(summ.entries, 'expense');
    const incByCat = Utils.byCategory(summ.entries, 'income');

    const root = $('#viewRoot');
    root.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Olá! 👋 Aqui está seu resumo</h1>
          <p>${Utils.formatDate(new Date(ctx.year, ctx.month, 1), 'long')}</p>
        </div>
        <div class="page-header__actions">
          <button class="btn btn--ghost" data-nav="reports">📊 Relatórios</button>
          <button class="btn btn--primary" data-action="quick-add">＋ Nova movimentação</button>
        </div>
      </div>

      <!-- Cards de resumo -->
      <div class="stat-grid mb-3">
        ${UI.statCard({ label: 'Saldo Atual (Geral)', value: money(balance),
          icon: '🏦', variant: 'primary', hint: 'Receitas - despesas pagas (histórico)' })}
        ${UI.statCard({ label: 'Receitas do mês', value: money(summ.income),
          icon: '📈', variant: 'income', hint: `${money(summ.paidIncome)} já recebido` })}
        ${UI.statCard({ label: 'Despesas do mês', value: money(summ.expense),
          icon: '📉', variant: 'expense', hint: `${money(summ.paidExpense)} já pago` })}
        ${UI.statCard({ label: 'Economia do mês', value: money(summ.balance),
          icon: '🐷', variant: 'accent', hint: savingRate >= 0 ? `${pct(savingRate)} da renda` : 'Saldo negativo' })}
        ${UI.statCard({ label: 'Comprometido futuras', value: money(futureAmount),
          icon: '🔒', variant: 'warn', hint: `${future.length} contas em aberto` })}
        ${UI.statCard({ label: 'A pagar (pendentes)', value: money(summ.pendingAmount),
          icon: '⏳', variant: 'warn', hint: `${summ.pendingCount} contas` })}
        ${UI.statCard({ label: 'Atrasadas', value: money(summ.overdueAmount),
          icon: '🚨', variant: 'expense', hint: `${summ.overdueCount} contas vencidas` })}
        ${UI.statCard({ label: 'Pago no mês', value: money(summ.paidExpense),
          icon: '✅', variant: 'income', hint: `${summ.paidCount} lançamentos quitados` })}
      </div>

      <!-- Saúde financeira + gráficos -->
      <div class="grid grid-sidebar mb-3">
        <div class="card card--pad-lg">
          <div class="card__header">
            <div>
              <div class="card__title">Evolução financeira</div>
              <div class="card__subtitle">Receitas x Despesas (6 meses)</div>
            </div>
          </div>
          <div class="chart-box chart-box--lg"><canvas id="chartEvolution"></canvas></div>
        </div>

        <div class="card card--pad-lg">
          <div class="card__header">
            <div>
              <div class="card__title">Saúde Financeira</div>
              <div class="card__subtitle">Indicador geral</div>
            </div>
          </div>
          ${healthRing(health)}
          <div class="divider"></div>
          <div class="list">
            ${healthTips(health, summ, savingRate)}
          </div>
        </div>
      </div>

      <!-- Distribuição e comparativo -->
      <div class="grid grid--3 mb-3">
        <div class="card card--pad-lg">
          <div class="card__title mb-2">Despesas por categoria</div>
          ${expByCat.size
            ? `<div class="chart-box chart-box--sm"><canvas id="chartExpenses"></canvas></div>`
            : UI.emptyState({ icon: '📭', title: 'Sem despesas', message: 'Nenhuma despesa neste mês.' })}
        </div>
        <div class="card card--pad-lg">
          <div class="card__title mb-2">Receitas por categoria</div>
          ${incByCat.size
            ? `<div class="chart-box chart-box--sm"><canvas id="chartIncome"></canvas></div>`
            : UI.emptyState({ icon: '📭', title: 'Sem receitas', message: 'Nenhuma receita neste mês.' })}
        </div>
        <div class="card card--pad-lg">
          <div class="card__title mb-2">Distribuição dos gastos</div>
          ${expByCat.size
            ? `<div class="chart-box chart-box--sm"><canvas id="chartDist"></canvas></div>`
            : UI.emptyState({ icon: '📭', title: 'Sem dados', message: 'Adicione despesas para ver a distribuição.' })}
        </div>
      </div>

      <!-- Próximos vencimentos + Metas -->
      <div class="grid grid-sidebar">
        <div class="card card--pad-lg">
          <div class="card__header">
            <div class="card__title">Próximos vencimentos</div>
            <button class="btn btn--sm btn--ghost" data-nav="calendar">Ver calendário</button>
          </div>
          ${upcomingList(state)}
        </div>
        <div class="card card--pad-lg">
          <div class="card__header">
            <div class="card__title">Metas em andamento</div>
            <button class="btn btn--sm btn--ghost" data-nav="goals">Ver todas</button>
          </div>
          ${goalsList(state)}
        </div>
      </div>
    `;

    drawCharts({ evolution, expByCat, incByCat, state });
  }

  /* ---------- Saúde financeira ---------- */
  function computeHealth({ summ, balance, savingRate }) {
    let score = 50;
    if (summ.balance >= 0) score += 15; else score -= 20;
    if (savingRate >= 20) score += 15; else if (savingRate >= 10) score += 8;
    if (summ.overdueCount === 0) score += 10; else score -= summ.overdueCount * 6;
    if (balance >= 0) score += 10;
    score = Math.max(0, Math.min(100, score));
    let level = 'Crítica';
    if (score >= 80) level = 'Excelente';
    else if (score >= 60) level = 'Boa';
    else if (score >= 40) level = 'Razoável';
    else if (score >= 20) level = 'Atenção';
    return { score, level };
  }

  function healthRing({ score, level }) {
    const color = score >= 60 ? 'var(--c-income)' : score >= 40 ? 'var(--c-pending)' : 'var(--c-expense)';
    const C = 2 * Math.PI * 45;
    const offset = C * (1 - score / 100);
    return `
      <div class="health-ring">
        <svg width="120" height="120" viewBox="0 0 120 120" style="transform:rotate(-90deg)">
          <circle cx="60" cy="60" r="45" fill="none" stroke="var(--surface-3)" stroke-width="10"/>
          <circle cx="60" cy="60" r="45" fill="none" stroke="${color}" stroke-width="10"
            stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${offset}"
            style="transition:stroke-dashoffset 1s ease"/>
        </svg>
        <div>
          <div class="health-ring__value" style="color:${color}">${Math.round(score)}</div>
          <div class="text-muted">${level}</div>
        </div>
      </div>`;
  }

  function healthTips(health, summ, savingRate) {
    const tips = [];
    if (summ.overdueCount > 0) tips.push({ icon: '🚨', text: `Você tem ${summ.overdueCount} conta(s) atrasada(s). Quite o quanto antes.` });
    if (savingRate < 0) tips.push({ icon: '⚠️', text: 'Suas despesas superam as receitas neste mês.' });
    else if (savingRate < 10) tips.push({ icon: '💡', text: 'Tente economizar ao menos 10% da renda.' });
    else tips.push({ icon: '✅', text: `Boa economia: ${pct(savingRate)} da renda.` });
    if (summ.pendingCount > 3) tips.push({ icon: '📅', text: `${summ.pendingCount} contas a pagar. Organize os vencimentos.` });
    if (!tips.length) tips.push({ icon: '🎉', text: 'Tudo sob controle!' });
    return tips.map(t => `
      <div class="list__item">
        <div class="list__icon" style="background:var(--surface-3);color:var(--text)">${t.icon}</div>
        <div class="list__body"><div class="list__sub">${t.text}</div></div>
      </div>`).join('');
  }

  /* ---------- Listas ---------- */
  function upcomingList(state) {
    const perfilId = App.getActiveProfileId();
    const items = Utils.allEntries(state, perfilId)
      .filter(e => e.status !== 'paid' && e.status !== 'cancelled')
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
      .slice(0, 6);
    if (!items.length) return UI.emptyState({ icon: '🎉', title: 'Tudo em dia!', message: 'Nenhum vencimento pendente.' });
    return `<div class="list">${items.map(e => {
      const cat = Utils.categoryById(state, e.categoryId);
      const days = Utils.daysBetween(Utils.today(), e.dueDate);
      const overdue = days < 0;
      return `<div class="list__item">
        <div class="list__icon" style="background:${cat.color}">${cat.icon}</div>
        <div class="list__body">
          <div class="list__title">${escapeHtmlSafe(e.description)}</div>
          <div class="list__sub">${Utils.formatDate(e.dueDate, 'short')} · ${overdue ? `<span class="text-expense">há ${Math.abs(days)}d atrasada</span>` : days === 0 ? 'hoje' : `em ${days}d`}</div>
        </div>
        <div class="list__right">
          <div class="fw-700 text-expense">${money(e.amount)}</div>
          ${e.status === 'overdue' ? '<span class="badge badge--overdue">Atrasado</span>' : '<span class="badge badge--pending">Pendente</span>'}
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  function goalsList(state) {
    const perfilId = App.getActiveProfileId();
    const goals = perfilId ? state.goals.filter(g => g.perfilId === perfilId) : state.goals;
    if (!goals.length) return UI.emptyState({ icon: '🎯', title: 'Sem metas', message: 'Crie uma meta para acompanhar.' });
    const sorted = [...goals].sort((a, b) =>
      (b.currentAmount / b.targetAmount) - (a.currentAmount / a.targetAmount)).slice(0, 3);
    return sorted.map(g => {
      const p = Math.min(100, (g.currentAmount / g.targetAmount) * 100);
      return `<div class="goal-item">
        <div class="goal-head">
          <strong>${g.icon} ${escapeHtmlSafe(g.name)}</strong>
          <span class="text-muted">${pct(p)}</span>
        </div>
        ${UI.progressBar(g.currentAmount, g.targetAmount)}
        <small class="text-muted">${money(g.currentAmount)} de ${money(g.targetAmount)}</small>
      </div>`;
    }).join('');
  }

  /* ---------- Gráficos ---------- */
  function drawCharts({ evolution, expByCat, incByCat, state }) {
    // Evolução: barras agrupadas
    UI.chart('chartEvolution', {
      type: 'bar',
      data: {
        labels: evolution.map(e => e.label),
        datasets: [
          { label: 'Receitas', data: evolution.map(e => e.income),
            backgroundColor: 'rgba(16,185,129,.7)', borderRadius: 6 },
          { label: 'Despesas', data: evolution.map(e => e.expense),
            backgroundColor: 'rgba(239,68,68,.7)', borderRadius: 6 },
          { label: 'Saldo', type: 'line', data: evolution.map(e => e.balance),
            borderColor: UI.cssVar('--c-primary'), backgroundColor: 'transparent',
            tension: .35, borderWidth: 2, pointRadius: 3 }
        ]
      },
      options: { plugins: { legend: { position: 'top' } } }
    });

    if (expByCat.size) {
      const entries = [...expByCat.entries()].sort((a, b) => b[1] - a[1]);
      UI.chart('chartExpenses', {
        type: 'doughnut',
        data: {
          labels: entries.map(([id]) => Utils.categoryById(state, id).name),
          datasets: [{ data: entries.map(([, v]) => v),
            backgroundColor: entries.map(([id]) => Utils.categoryById(state, id).color) }]
        },
        options: { plugins: { legend: { position: 'right' } },
          scales: {} }
      });
      UI.chart('chartDist', {
        type: 'polarArea',
        data: {
          labels: entries.map(([id]) => Utils.categoryById(state, id).name),
          datasets: [{ data: entries.map(([, v]) => v),
            backgroundColor: entries.map(([id]) => Utils.categoryById(state, id).color + 'cc') }]
        },
        options: { scales: { r: { ticks: { display: false }, grid: { color: UI.cssVar('--border') } } } }
      });
    }
    if (incByCat.size) {
      const entries = [...incByCat.entries()].sort((a, b) => b[1] - a[1]);
      UI.chart('chartIncome', {
        type: 'doughnut',
        data: {
          labels: entries.map(([id]) => Utils.categoryById(state, id).name),
          datasets: [{ data: entries.map(([, v]) => v),
            backgroundColor: entries.map(([id]) => Utils.categoryById(state, id).color) }]
        },
        options: { plugins: { legend: { position: 'right' } } }
      });
    }
  }

  function escapeHtmlSafe(s) { return global.Utils.escapeHtml(s); }

  App.Dashboard = { render };
})(window);
