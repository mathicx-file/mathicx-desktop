(function (global) {
  'use strict';
  const { $, $$, el, money, moneyShort, pct, Utils, UI } = global;
  const App = global.App = global.App || {};

  function render() {
    const state = Store.getState();
    const ctx = App.getContext();
    const root = $('#viewRoot');

    const activeProfiles = state.profiles.filter(p => p.active);
    const stats = activeProfiles.map(p => ({
      profile: p,
      summ: Utils.monthSummary(state, ctx.year, ctx.month, p.id)
    }));

    const totalIncome = stats.reduce((s, x) => s + x.summ.income, 0);
    const totalExpense = stats.reduce((s, x) => s + x.summ.expense, 0);

    root.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Comparação Entre Perfis</h1>
          <p>${Utils.formatDate(new Date(ctx.year, ctx.month, 1), 'long')}</p>
        </div>
        <div class="page-header__actions">
          <select id="compPeriod" class="profile-selector">
            <option value="month">Este mês</option>
            <option value="year">Este ano</option>
            <option value="all">Todo histórico</option>
          </select>
        </div>
      </div>

      <div class="card card--pad-lg mb-3">
        <div class="card__title mb-2">📊 Resumo consolidado</div>
        <div class="stat-grid">
          ${UI.statCard({ label: 'Receitas totais', value: money(totalIncome), icon: '📈', variant: 'income' })}
          ${UI.statCard({ label: 'Despesas totais', value: money(totalExpense), icon: '📉', variant: 'expense' })}
          ${UI.statCard({ label: 'Saldo consolidado', value: money(totalIncome - totalExpense), icon: '💰', variant: (totalIncome - totalExpense) >= 0 ? 'primary' : 'expense' })}
        </div>
      </div>

      <div class="grid grid-sidebar mb-3">
        <div>
          <div class="card card--pad-lg mb-2">
            <div class="card__title mb-2">Comparativo por perfil</div>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr>
                  <th>Perfil</th><th style="text-align:right">Receitas</th><th style="text-align:right">Despesas</th><th style="text-align:right">Saldo</th>
                </tr></thead>
                <tbody>
                  ${stats.map(x => `
                    <tr>
                      <td><span style="color:${x.profile.color}">${x.profile.icon} ${escapeHtmlSafe(x.profile.name)}</span></td>
                      <td style="text-align:right" class="text-income">${money(x.summ.income)}</td>
                      <td style="text-align:right" class="text-expense">${money(x.summ.expense)}</td>
                      <td style="text-align:right"><strong class="${x.summ.balance >= 0 ? 'text-income' : 'text-expense'}">${money(x.summ.balance)}</strong></td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <div class="card card--pad-lg">
            <div class="card__title mb-2">💰 Saldo geral por perfil</div>
            <div class="chart-box"><canvas id="chartCompBars"></canvas></div>
          </div>
        </div>

        <div>
          <div class="card card--pad-lg mb-2">
            <div class="card__title mb-2">🍩 Distribuição de receitas</div>
            <div class="chart-box"><canvas id="chartCompIncome"></canvas></div>
          </div>
          <div class="card card--pad-lg">
            <div class="card__title mb-2">🍩 Distribuição de despesas</div>
            <div class="chart-box"><canvas id="chartCompExpense"></canvas></div>
          </div>
        </div>
      </div>

      <div class="card card--pad-lg">
        <div class="card__title mb-2">📈 Evolução comparativa (6 meses)</div>
        <div class="chart-box chart-box--lg"><canvas id="chartCompEvol"></canvas></div>
      </div>
    `;

    $('#compPeriod').addEventListener('change', render);

    drawCharts(stats, activeProfiles, state);
  }

  function drawCharts(stats, profiles, state) {
    const colors = profiles.map(p => p.color);
    const icons = profiles.map(p => p.icon);

    // Barras: receitas vs despesas por perfil
    UI.chart('chartCompBars', {
      type: 'bar',
      data: {
        labels: profiles.map(p => `${p.icon} ${p.name}`),
        datasets: [
          { label: 'Receitas', data: stats.map(x => x.summ.income), backgroundColor: 'rgba(16,185,129,.7)', borderRadius: 6 },
          { label: 'Despesas', data: stats.map(x => x.summ.expense), backgroundColor: 'rgba(239,68,68,.7)', borderRadius: 6 }
        ]
      },
      options: { plugins: { legend: { position: 'top' } },
        scales: { x: { ticks: { maxRotation: 0 } } } }
    });

    // Doughnut: distribuição receitas
    UI.chart('chartCompIncome', {
      type: 'doughnut',
      data: {
        labels: profiles.map(p => `${p.icon} ${p.name}`),
        datasets: [{ data: stats.map(x => x.summ.income), backgroundColor: colors }]
      },
      options: { plugins: { legend: { position: 'right' } } }
    });

    // Doughnut: distribuição despesas
    UI.chart('chartCompExpense', {
      type: 'doughnut',
      data: {
        labels: profiles.map(p => `${p.icon} ${p.name}`),
        datasets: [{ data: stats.map(x => x.summ.expense), backgroundColor: colors }]
      },
      options: { plugins: { legend: { position: 'right' } } }
    });

    // Evolução comparativa 6 meses
    const ctx = App.getContext();
    const evolLabels = [];
    const evolData = {};
    profiles.forEach(p => { evolData[p.id] = []; });
    for (let i = 5; i >= 0; i--) {
      const d = new Date(ctx.year, ctx.month - i, 1);
      evolLabels.push(`${Utils.MONTHS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`);
      profiles.forEach(p => {
        const s = Utils.monthSummary(state, d.getFullYear(), d.getMonth(), p.id);
        evolData[p.id].push(s.balance);
      });
    }

    const datasets = profiles.map(p => ({
      label: `${p.icon} ${p.name}`,
      data: evolData[p.id],
      borderColor: p.color,
      backgroundColor: p.color + '22',
      tension: .35, fill: false
    }));

    UI.chart('chartCompEvol', {
      type: 'line',
      data: { labels: evolLabels, datasets },
      options: { plugins: { legend: { position: 'top' } },
        scales: { y: { ticks: { callback: (v) => moneyShort(v) } } } }
    });
  }

  function escapeHtmlSafe(s) { return global.Utils.escapeHtml(s); }

  App.Comparison = { render };
})(window);