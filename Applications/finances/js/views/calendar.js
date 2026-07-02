/* =====================================================================
   VIEW: CALENDAR — Calendário financeiro (vencimentos por dia)
   ===================================================================== */
(function (global) {
  'use strict';
  const { $, $$, el, money, Utils, UI } = global;
  const App = global.App = global.App || {};

  let viewDate = null;

  function render() {
    const state = Store.getState();
    const ctx = App.getContext();
    viewDate = new Date(ctx.year, ctx.month, 1);

    const root = $('#viewRoot');
    root.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Calendário Financeiro</h1>
          <p>${Utils.MONTHS_LONG[viewDate.getMonth()]} ${viewDate.getFullYear()}</p>
        </div>
        <div class="page-header__actions">
          <button class="btn btn--ghost" id="calToday">Hoje</button>
        </div>
      </div>

      <div class="card card--pad-lg" id="calCard"></div>
    `;
    $('#calToday').addEventListener('click', () => {
      App.setContext({ year: new Date().getFullYear(), month: new Date().getMonth() });
      render();
    });
    drawCalendar();
  }

  function drawCalendar() {
    const state = Store.getState();
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekday = firstDay.getDay();        // 0 = dom
    const daysInMonth = lastDay.getDate();
    const prevMonthLast = new Date(year, month, 0).getDate();
    const todayIso = Utils.today();

    // Mapa dia -> entradas
    const perfilId = App.getActiveProfileId();
    const entries = Utils.allEntries(state, perfilId).filter(e =>
      Utils.inMonth(e.dueDate, year, month));
    const byDay = new Map();
    entries.forEach(e => {
      const d = Utils.parseDate(e.dueDate).getDate();
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d).push(e);
    });

    const heads = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    let cells = '';

    // Dias do mês anterior
    for (let i = startWeekday - 1; i >= 0; i--) {
      cells += `<div class="calendar__cell calendar__cell--muted">
        <div class="calendar__cell-num">${prevMonthLast - i}</div></div>`;
    }
    // Dias do mês atual
    for (let d = 1; d <= daysInMonth; d++) {
      const dateIso = Utils.isoDate(new Date(year, month, d));
      const dayEntries = byDay.get(d) || [];
      const isToday = dateIso === todayIso;
      const totalIn = dayEntries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
      const totalOut = dayEntries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
      const hasOverdue = dayEntries.some(e => e.status === 'overdue');

      cells += `
        <div class="calendar__cell ${isToday ? 'calendar__cell--today' : ''}" data-day="${dateIso}">
          <div class="flex justify-between">
            <span class="calendar__cell-num">${d}</span>
            ${dayEntries.length ? `<small class="text-muted pill-num">${dayEntries.length}</small>` : ''}
          </div>
          ${dayEntries.slice(0, 3).map(e => {
            const cat = Utils.categoryById(state, e.categoryId);
            const st = e.status;
            const bg = e.type === 'income' ? 'var(--c-income)' : st === 'overdue' ? 'var(--c-overdue)' : cat.color;
            return `<div class="cal-entry" style="background:${bg}" title="${escapeHtmlSafe(e.description)} - ${money(e.amount)}">
              ${e.type === 'income' ? '↗' : cat.icon} ${escapeHtmlSafe(e.description).slice(0, 12)}
            </div>`;
          }).join('')}
          ${dayEntries.length > 3 ? `<small class="text-muted">+${dayEntries.length - 3} mais</small>` : ''}
          ${dayEntries.length ? `<div class="fs-11 mt-1">
            ${totalIn ? `<span class="text-income">+${Utils.moneyShort(totalIn)}</span> ` : ''}
            ${totalOut ? `<span class="text-expense">−${Utils.moneyShort(totalOut)}</span>` : ''}
          </div>` : ''}
        </div>`;
    }
    // Próximos dias para completar a grade
    const totalCells = startWeekday + daysInMonth;
    const trailing = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= trailing; i++) {
      cells += `<div class="calendar__cell calendar__cell--muted">
        <div class="calendar__cell-num">${i}</div></div>`;
    }

    $('#calCard').innerHTML = `
      <div class="calendar mb-2">
        ${heads.map(h => `<div class="calendar__head">${h}</div>`).join('')}
        ${cells}
      </div>
      <div class="flex gap-2 flex-wrap mt-2 fs-12 text-muted">
        <span>🟢 Receita</span>
        <span>🔴 Despesa atrasada</span>
        <span>⚪ Despesa pendente</span>
      </div>
    `;
    // Click no dia -> abre lançamentos
    $$('#calCard .calendar__cell[data-day]').forEach(c => c.addEventListener('click', () => {
      const day = c.dataset.day;
      const dayEntries = entries.filter(e => e.dueDate === day);
      if (!dayEntries.length) return;
      openDay(day, dayEntries);
    }));
  }

  function openDay(day, dayEntries) {
    const state = Store.getState();
    const body = el('div', { class: 'list' });
    body.innerHTML = dayEntries.map(e => {
      const cat = Utils.categoryById(state, e.categoryId);
      return `<div class="list__item">
        <div class="list__icon" style="background:${cat.color}">${cat.icon}</div>
        <div class="list__body">
          <div class="list__title">${escapeHtmlSafe(e.description)}</div>
          <div class="list__sub">${cat.name} · ${e.paymentMethod || '—'}</div>
        </div>
        <div class="list__right">
          <strong class="${e.type === 'income' ? 'text-income' : 'text-expense'}">${money(e.amount)}</strong>
          <div>${UI.statusBadge(e.status)}</div>
        </div>
      </div>`;
    }).join('');
    UI.openModal({
      title: `Lançamentos · ${Utils.formatDate(day, 'long')}`,
      body, size: 'sm'
    });
  }

  function escapeHtmlSafe(s) { return global.Utils.escapeHtml(s); }

  App.Calendar = { render };
})(window);
