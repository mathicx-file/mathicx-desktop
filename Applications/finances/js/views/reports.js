/* =====================================================================
   VIEW: REPORTS — Relatórios filtráveis + exportação PDF/Excel/CSV
   ===================================================================== */
(function (global) {
  'use strict';
  const { $, $$, el, money, moneyShort, pct, Utils, UI } = global;
  const App = global.App = global.App || {};

  const reportFilters = {
    from: '', to: '', categoryId: '', status: '', type: '', report: 'flow'
  };

  const REPORTS = [
    { id: 'flow', label: 'Fluxo de Caixa', icon: '💵' },
    { id: 'byCategoryExpense', label: 'Despesas por Categoria', icon: '📉' },
    { id: 'byCategoryIncome', label: 'Receitas por Categoria', icon: '📈' },
    { id: 'installments', label: 'Parcelamentos Ativos', icon: '🧾' },
    { id: 'overdue', label: 'Contas Atrasadas', icon: '🚨' },
    { id: 'evolution', label: 'Evolução Financeira', icon: '📊' },
    { id: 'ranking', label: 'Ranking de Gastos', icon: '🏆' }
  ];

  function render() {
    const state = Store.getState();
    const now = new Date();
    const firstDay = Utils.isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    if (!reportFilters.from) reportFilters.from = firstDay;
    if (!reportFilters.to) reportFilters.to = Utils.isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    const root = $('#viewRoot');
    root.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Relatórios</h1>
          <p>Análise e exportação dos seus dados financeiros</p>
        </div>
      </div>

      <div class="filter-bar card mb-2">
        <div class="field">
          <label>Relatório</label>
          <select id="rReport">
            ${REPORTS.map(r => `<option value="${r.id}" ${reportFilters.report === r.id ? 'selected' : ''}>${r.icon} ${r.label}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>De</label>
          <input type="date" id="rFrom" value="${reportFilters.from}" />
        </div>
        <div class="field">
          <label>Até</label>
          <input type="date" id="rTo" value="${reportFilters.to}" />
        </div>
        <div class="field">
          <label>Tipo</label>
          <select id="rType">
            <option value="">Todos</option>
            <option value="income" ${reportFilters.type === 'income' ? 'selected' : ''}>Receita</option>
            <option value="expense" ${reportFilters.type === 'expense' ? 'selected' : ''}>Despesa</option>
          </select>
        </div>
        <div class="field">
          <label>Categoria</label>
          ${UI.categorySelect(state, { value: reportFilters.categoryId })}
        </div>
        <div class="field">
          <label>Status</label>
          <select id="rStatus">
            ${['', 'paid', 'pending', 'overdue'].map(s =>
              `<option value="${s}" ${reportFilters.status === s ? 'selected' : ''}>${s ? Utils.STATUS_LABEL[s] : 'Todos'}</option>`).join('')}
          </select>
        </div>
      </div>

      <div id="reportContent" class="mb-2"></div>

      <div class="card flex gap-1 flex-wrap">
        <strong class="mr-1">Exportar:</strong>
        <button class="btn btn--sm btn--ghost" data-export="csv">📄 CSV</button>
        <button class="btn btn--sm btn--ghost" data-export="excel">📗 Excel</button>
        <button class="btn btn--sm btn--ghost" data-export="pdf">📕 PDF</button>
      </div>
    `;

    ['rReport', 'rFrom', 'rTo', 'rType', 'rStatus'].forEach(id => {
      $('#' + id).addEventListener('change', () => {
        reportFilters.report = $('#rReport').value;
        reportFilters.from = $('#rFrom').value;
        reportFilters.to = $('#rTo').value;
        reportFilters.type = $('#rType').value;
        reportFilters.status = $('#rStatus').value;
        reportFilters.categoryId = root.querySelector('[name="categoryId"]').value;
        renderReport();
      });
    });
    root.querySelector('[name="categoryId"]').addEventListener('change', () => {
      reportFilters.categoryId = root.querySelector('[name="categoryId"]').value;
      renderReport();
    });
    $$('[data-export]').forEach(b => b.addEventListener('click', () => exportData(b.dataset.export)));

    renderReport();
  }

  function filteredEntries(state) {
    const perfilId = App.getActiveProfileId();
    let entries = Utils.allEntries(state, perfilId);
    const f = reportFilters;
    if (f.from) entries = entries.filter(e => Utils.parseDate(e.dueDate) >= Utils.parseDate(f.from));
    if (f.to) entries = entries.filter(e => Utils.parseDate(e.dueDate) <= Utils.parseDate(f.to));
    if (f.type) entries = entries.filter(e => e.type === f.type);
    if (f.categoryId) entries = entries.filter(e => e.categoryId === f.categoryId);
    if (f.status) entries = entries.filter(e => e.status === f.status);
    return entries.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }

  function renderReport() {
    const state = Store.getState();
    const wrap = $('#reportContent');
    const f = reportFilters;

    if (f.report === 'flow') return renderFlow(state, wrap);
    if (f.report === 'byCategoryExpense' || f.report === 'byCategoryIncome')
      return renderByCategory(state, wrap, f.report === 'byCategoryIncome' ? 'income' : 'expense');
    if (f.report === 'installments') return renderInstallments(state, wrap);
    if (f.report === 'overdue') return renderOverdue(state, wrap);
    if (f.report === 'evolution') return renderEvolution(state, wrap);
    if (f.report === 'ranking') return renderRanking(state, wrap);
  }

  function renderFlow(state, wrap) {
    const entries = filteredEntries(state);
    const inc = entries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
    const exp = entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
    wrap.innerHTML = `
      <div class="stat-grid mb-2">
        ${UI.statCard({ label: 'Entradas', value: money(inc), icon: '📈', variant: 'income' })}
        ${UI.statCard({ label: 'Saídas', value: money(exp), icon: '📉', variant: 'expense' })}
        ${UI.statCard({ label: 'Saldo', value: money(inc - exp), icon: '⚖️', variant: 'primary' })}
      </div>
      ${entriesTable(entries, state)}
    `;
  }

  function renderByCategory(state, wrap, type) {
    const entries = filteredEntries(state).filter(e => e.type === type);
    const byCat = Utils.byCategory(entries, type);
    const sorted = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    const rows = sorted.map(([catId, v]) => {
      const cat = Utils.categoryById(state, catId);
      return {
        category: UI.categoryTag(cat),
        total: money(v),
        share: pct(total > 0 ? (v / total) * 100 : 0),
        count: entries.filter(e => e.categoryId === catId).length,
        progress: UI.progressBar(v, total, { variant: type === 'income' ? 'income' : 'expense' })
      };
    });
    wrap.innerHTML = `
      <div class="stat-grid mb-2">
        ${UI.statCard({ label: 'Total', value: money(total), icon: type === 'income' ? '📈' : '📉', variant: type === 'income' ? 'income' : 'expense' })}
      </div>
      <div class="grid grid--2 mb-2">
        <div class="card card--pad-lg"><div class="chart-box"><canvas id="chartCat"></canvas></div></div>
        <div class="card card--pad-lg">
          ${UI.table({
            columns: [
              { key: 'category', label: 'Categoria' },
              { key: 'total', label: 'Total', align: 'right' },
              { key: 'share', label: '%', align: 'right' }
            ],
            rows,
            emptyText: 'Sem dados no período.'
          })}
        </div>
      </div>
      <div class="card card--pad-lg">
        <div class="card__title mb-2">Distribuição detalhada</div>
        ${sorted.length ? sorted.map(([catId, v]) => {
          const cat = Utils.categoryById(state, catId);
          const p = total > 0 ? (v / total) * 100 : 0;
          return `<div class="goal-item">
            <div class="goal-head">
              <span>${cat.icon} ${escapeHtmlSafe(cat.name)} <small class="text-muted">(${entries.filter(e => e.categoryId === catId).length} lançamentos)</small></span>
              <strong>${money(v)} · ${pct(p)}</strong>
            </div>
            ${UI.progressBar(v, total, { variant: type === 'income' ? 'income' : 'expense' })}
          </div>`;
        }).join('') : UI.emptyState({ icon: '📭', title: 'Sem dados' })}
      </div>
    `;
    if (sorted.length) UI.chart('chartCat', {
      type: 'bar',
      data: {
        labels: sorted.map(([id]) => Utils.categoryById(state, id).name),
        datasets: [{ label: 'Valor', data: sorted.map(([, v]) => v),
          backgroundColor: sorted.map(([id]) => Utils.categoryById(state, id).color), borderRadius: 6 }]
      },
      options: { indexAxis: 'y', plugins: { legend: { display: false } } }
    });
  }

  function renderInstallments(state, wrap) {
    const perfilId = App.getActiveProfileId();
    const insts = perfilId ? state.installments.filter(i => i.perfilId === perfilId) : state.installments;
    const rows = insts.map(inst => {
      const paid = inst.parcels.filter(p => p.paid).length;
      const open = inst.parcels.filter(p => !p.paid && p.status !== 'cancelled');
      return {
        description: escapeHtmlSafe(inst.description),
        category: UI.categoryTag(Utils.categoryById(state, inst.categoryId)),
        total: money(inst.totalAmount),
        progress: `${paid}/${inst.parcels.length}`,
        remaining: money(open.reduce((s, p) => s + p.amount, 0)),
        _inst: inst
      };
    });
    wrap.innerHTML = UI.table({
      columns: [
        { key: 'description', label: 'Compra' },
        { key: 'category', label: 'Categoria' },
        { key: 'total', label: 'Total', align: 'right' },
        { key: 'progress', label: 'Progresso', align: 'center' },
        { key: 'remaining', label: 'Restante', align: 'right' }
      ],
      rows,
      emptyText: 'Nenhum parcelamento cadastrado.'
    });
  }

  function renderOverdue(state, wrap) {
    const perfilId = App.getActiveProfileId();
    const overdue = Utils.allEntries(state, perfilId)
      .filter(e => e.status === 'overdue')
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    const total = overdue.reduce((s, e) => s + e.amount, 0);
    wrap.innerHTML = `
      <div class="stat-grid mb-2">
        ${UI.statCard({ label: 'Contas atrasadas', value: overdue.length, icon: '🚨', variant: 'expense' })}
        ${UI.statCard({ label: 'Total em atraso', value: money(total), icon: '💸', variant: 'warn' })}
      </div>
      ${entriesTable(overdue, state)}
    `;
  }

  function renderEvolution(state, wrap) {
    const perfilId = App.getActiveProfileId();
    const evol = Utils.monthlyEvolution(state, 12, perfilId);
    wrap.innerHTML = `
      <div class="card card--pad-lg mb-2">
        <div class="card__title mb-2">Evolução financeira (12 meses)</div>
        <div class="chart-box chart-box--lg"><canvas id="chartEvol"></canvas></div>
      </div>
      <div class="card card--pad-lg">
        ${UI.table({
          columns: [
            { key: 'label', label: 'Mês' },
            { key: 'income', label: 'Receitas', align: 'right', render: r => `<span class="text-income">${money(r.income)}</span>` },
            { key: 'expense', label: 'Despesas', align: 'right', render: r => `<span class="text-expense">${money(r.expense)}</span>` },
            { key: 'balance', label: 'Saldo', align: 'right', render: r => `<strong class="${r.balance >= 0 ? 'text-income' : 'text-expense'}">${money(r.balance)}</strong>` }
          ],
          rows: evol
        })}
      </div>
    `;
    UI.chart('chartEvol', {
      type: 'line',
      data: {
        labels: evol.map(e => e.label),
        datasets: [
          { label: 'Receitas', data: evol.map(e => e.income), borderColor: '#10b981',
            backgroundColor: 'rgba(16,185,129,.12)', tension: .35, fill: true },
          { label: 'Despesas', data: evol.map(e => e.expense), borderColor: '#ef4444',
            backgroundColor: 'rgba(239,68,68,.12)', tension: .35, fill: true },
          { label: 'Saldo', data: evol.map(e => e.balance), borderColor: '#6366f1', tension: .35 }
        ]
      }
    });
  }

  function renderRanking(state, wrap) {
    const entries = filteredEntries(state).filter(e => e.type === 'expense');
    const byCat = Utils.byCategory(entries, 'expense');
    const sorted = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const medals = ['🥇', '🥈', '🥉'];
    wrap.innerHTML = `
      <div class="card card--pad-lg">
        <div class="card__title mb-2">🏆 Ranking das categorias com maiores gastos</div>
        ${sorted.length ? `<div class="list">
          ${sorted.map(([catId, v], idx) => {
            const cat = Utils.categoryById(state, catId);
            return `<div class="list__item">
              <div class="list__icon" style="background:${cat.color};width:34px;height:34px;font-size:14px">
                ${medals[idx] || '#' + (idx + 1)}
              </div>
              <div class="list__body">
                <div class="list__title">${cat.icon} ${escapeHtmlSafe(cat.name)}</div>
                <div class="list__sub">${entries.filter(e => e.categoryId === catId).length} lançamento(s)</div>
              </div>
              <div class="list__right">
                <strong class="text-expense">${money(v)}</strong>
              </div>
            </div>`;
          }).join('')}
        </div>` : UI.emptyState({ icon: '🏆', title: 'Sem dados', message: 'Nenhuma despesa no período.' })}
      </div>
    `;
  }

  function entriesTable(entries, state) {
    return UI.table({
      columns: [
        { key: 'dueDate', label: 'Vencimento', render: e => Utils.formatDate(e.dueDate, 'short') },
        { key: 'description', label: 'Descrição' },
        { key: 'category', label: 'Categoria', render: e => UI.categoryTag(Utils.categoryById(state, e.categoryId)) },
        { key: 'status', label: 'Status', render: e => UI.statusBadge(e.status) },
        { key: 'amount', label: 'Valor', align: 'right', render: e =>
          `<strong class="${e.type === 'income' ? 'text-income' : 'text-expense'}">${e.type === 'income' ? '+' : '−'} ${money(e.amount)}</strong>` }
      ],
      rows: entries,
      emptyText: 'Nenhum registro para o filtro selecionado.'
    });
  }

  /* ---------- Exportação ---------- */
  function buildExportData(state) {
    const f = reportFilters;
    if (f.report === 'installments') {
      const perfilId = App.getActiveProfileId();
      const insts = perfilId ? state.installments.filter(i => i.perfilId === perfilId) : state.installments;
      return insts.flatMap(inst =>
        inst.parcels.filter(p => p.status !== 'cancelled').map(p => ({
          'Compra': inst.description,
          'Parcela': `${p.number}/${p.total}`,
          'Vencimento': p.dueDate,
          'Valor': p.amount,
          'Status': p.paid ? 'Pago' : (Utils.effectiveStatus(p) === 'overdue' ? 'Atrasado' : 'Pendente'),
          'Categoria': Utils.categoryById(state, inst.categoryId).name
        })));
    }
    if (f.report === 'evolution') {
      const perfilId = App.getActiveProfileId();
      return Utils.monthlyEvolution(state, 12, perfilId).map(e => ({
        'Mês': e.label, 'Receitas': e.income, 'Despesas': e.expense, 'Saldo': e.balance
      }));
    }
    if (f.report === 'ranking') {
      const entries = filteredEntries(state).filter(e => e.type === 'expense');
      const byCat = Utils.byCategory(entries, 'expense');
      return [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([catId, v]) => ({
        'Categoria': Utils.categoryById(state, catId).name, 'Total': v,
        'Lançamentos': entries.filter(e => e.categoryId === catId).length
      }));
    }
    // Padrão: lançamentos filtrados
    return filteredEntries(state).map(e => ({
      'Vencimento': e.dueDate, 'Descrição': e.description,
      'Tipo': e.type === 'income' ? 'Receita' : 'Despesa',
      'Categoria': Utils.categoryById(state, e.categoryId).name,
      'Valor': e.amount, 'Status': Utils.STATUS_LABEL[e.status],
      'Pagamento': e.paymentMethod || ''
    }));
  }

  function exportData(format) {
    const state = Store.getState();
    const data = buildExportData(state);
    if (!data.length) { UI.toast('Sem dados para exportar neste filtro.', { type: 'warn' }); return; }
    const fname = `relatorio_${reportFilters.report}_${Utils.today()}`;

    if (format === 'csv') {
      const headers = Object.keys(data[0]);
      const lines = [headers.join(';')];
      data.forEach(r => lines.push(headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(';')));
      Utils.download(`${fname}.csv`, '\uFEFF' + lines.join('\n'), 'text/csv;charset=utf-8');
      UI.toast('CSV exportado.', { type: 'success' });
    } else if (format === 'excel') {
      if (!global.XLSX) { UI.toast('Biblioteca Excel indisponível.', { type: 'error' }); return; }
      const ws = global.XLSX.utils.json_to_sheet(data);
      const wb = global.XLSX.utils.book_new();
      global.XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
      global.XLSX.writeFile(wb, `${fname}.xlsx`);
      UI.toast('Excel exportado.', { type: 'success' });
    } else if (format === 'pdf') {
      exportPDF(state, data, fname);
    }
  }

  function exportPDF(state, data, fname) {
    if (!global.jspdf || !global.jspdf.jsPDF) { UI.toast('Biblioteca PDF indisponível.', { type: 'error' }); return; }
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });
    const reportLabel = REPORTS.find(r => r.id === reportFilters.report)?.label || 'Relatório';

    doc.setFontSize(16);
    doc.text('Relatório Financeiro', 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`${reportLabel} · período: ${reportFilters.from || 'início'} a ${reportFilters.to || 'fim'} · emitido em ${Utils.formatDate(Utils.today(), 'long')}`, 14, 23);

    const headers = [Object.keys(data[0])];
    const body = data.map(r => Object.values(r).map(v => {
      if (typeof v === 'number') return v;
      return String(v ?? '');
    }));

    doc.autoTable({
      head: headers, body,
      startY: 30,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [99, 102, 241], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 246, 251] }
    });

    doc.save(`${fname}.pdf`);
    UI.toast('PDF exportado.', { type: 'success' });
  }

  function escapeHtmlSafe(s) { return global.Utils.escapeHtml(s); }

  App.Reports = { render };
})(window);
