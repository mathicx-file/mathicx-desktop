/* =====================================================================
   UTILS — Funções utilitárias (formatação, datas, cálculos, DOM)
   ===================================================================== */
(function (global) {
  'use strict';

  /* ---------- DOM helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'dataset') Object.entries(v).forEach(([dk, dv]) => node.dataset[dk] = dv);
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else node.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c == null || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  /* ---------- Formatação ---------- */
  const BRL = new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL'
  });
  const money = (v) => BRL.format(Number(v) || 0);
  const moneyShort = (v) => {
    v = Number(v) || 0;
    const abs = Math.abs(v);
    if (abs >= 1e6) return `R$ ${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `R$ ${(v / 1e3).toFixed(1)}k`;
    return money(v);
  };
  const num = (v, d = 2) => (Number(v) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: d, maximumFractionDigits: d
  });
  const pct = (v, d = 1) => `${num(v, d)}%`;

  const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MONTHS_LONG = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  /** Aceita 'YYYY-MM-DD' ou Date, devolve Date às 00:00 local. */
  function parseDate(d) {
    if (!d) return null;
    if (d instanceof Date) return new Date(d);
    if (typeof d === 'string') {
      const [y, m, day] = d.split('-').map(Number);
      if (y && m) return new Date(y, m - 1, day || 1);
    }
    return new Date(d);
  }
  /** ISO 'YYYY-MM-DD' */
  function isoDate(d) {
    const dt = parseDate(d);
    if (!dt) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function formatDate(d, fmt = 'short') {
    const dt = parseDate(d);
    if (!dt) return '—';
    if (fmt === 'short') return `${String(dt.getDate()).padStart(2, '0')} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
    if (fmt === 'long') return `${String(dt.getDate()).padStart(2, '0')} de ${MONTHS_LONG[dt.getMonth()]} de ${dt.getFullYear()}`;
    if (fmt === 'month') return `${MONTHS_LONG[dt.getMonth()]} ${dt.getFullYear()}`;
    if (fmt === 'monthShort') return `${MONTHS[dt.getMonth()]}/${String(dt.getFullYear()).slice(2)}`;
    return dt.toLocaleDateString('pt-BR');
  }
  function ymKey(d) { return isoDate(d).slice(0, 7); }
  function addMonths(d, n) {
    const dt = parseDate(d); if (!dt) return null;
    const day = dt.getDate();
    // Alvo: mesmo dia, mas se ultrapassar o fim do mês (ex.: 31/01 + 1m),
    // fixamos no último dia do mês alvo (ex.: 28/02) para não "pular" o mês.
    const target = new Date(dt.getFullYear(), dt.getMonth() + n, 1);
    const lastDayOfMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day, lastDayOfMonth));
    return target;
  }
  function addDays(d, n) {
    const dt = parseDate(d); if (!dt) return null;
    const r = new Date(dt); r.setDate(r.getDate() + n);
    return r;
  }
  function today() { return isoDate(new Date()); }
  function daysBetween(a, b) {
    const d1 = parseDate(a), d2 = parseDate(b);
    return Math.round((d2 - d1) / 86400000);
  }

  /* ---------- Status helpers ---------- */
  // Calcula status efetivo: se 'pending' e dueDate < hoje -> 'overdue'
  function effectiveStatus(item) {
    if (item.status === 'paid' || item.paid) return 'paid';
    if (item.status === 'cancelled' || item.status === 'canceled') return 'cancelled';
    const due = parseDate(item.dueDate || item.nextDueDate);
    if (due && parseDate(today()) > due) return 'overdue';
    return 'pending';
  }
  const STATUS_LABEL = {
    paid: 'Pago', pending: 'Pendente', overdue: 'Atrasado', cancelled: 'Cancelado'
  };

  /* ---------- Agregações financeiras ---------- */
  // Retorna o ID do perfil ativo (null = consolidado/todos)
  function activeProfileId() {
    return (Store.getState && Store.getState().settings.activeProfileId) || null;
  }

  // Filtra um array por perfil: se perfilId for null, retorna todos
  function filterByProfile(arr, perfilId) {
    if (!perfilId || !arr) return arr || [];
    return arr.filter(item => item.perfilId === perfilId);
  }

  // Coleta todas as "parcelas" individuais: tx avulsas + parcelas de compras
  // Aceita perfilId opcional para filtrar
  function allEntries(state, perfilId) {
    const txs = state.transactions.map(t => ({
      kind: 'transaction', ref: t.id, source: 'transaction',
      description: t.description, amount: t.amount, type: t.type,
      categoryId: t.categoryId, dueDate: t.dueDate, paidDate: t.paidDate,
      status: effectiveStatus(t), paymentMethod: t.paymentMethod,
      notes: t.notes, installRef: null, installmentLabel: null,
      perfilId: t.perfilId, raw: t
    }));
    const parcels = [];
    state.installments.forEach(inst => {
      inst.parcels.forEach(p => {
        if (p.status === 'cancelled') return;
        parcels.push({
          kind: 'installment', ref: p.id, source: 'installment',
          parentId: inst.id,
          description: `${inst.description} (${p.number}/${p.total})`,
          amount: p.amount, type: 'expense',
          categoryId: inst.categoryId, dueDate: p.dueDate, paidDate: p.paidDate,
          status: effectiveStatus({ status: p.status, dueDate: p.dueDate, paid: p.paid }),
          paymentMethod: inst.paymentMethod, notes: '', installRef: inst.id,
          installmentLabel: `${p.number}/${p.total}`, raw: p, parent: inst,
          perfilId: inst.perfilId
        });
      });
    });
    const all = [...txs, ...parcels];
    return perfilId ? all.filter(e => e.perfilId === perfilId) : all;
  }

  function inMonth(dateStr, year, month) {
    const d = parseDate(dateStr);
    return d && d.getFullYear() === year && d.getMonth() === month;
  }

  // Soma por tipo/status em determinado mês
  function monthSummary(state, year, month, perfilId) {
    const entries = allEntries(state, perfilId).filter(e => inMonth(e.dueDate, year, month));
    let income = 0, expense = 0, paidIncome = 0, paidExpense = 0;
    let pendingCount = 0, overdueCount = 0, paidCount = 0;
    let pendingAmount = 0, overdueAmount = 0;

    entries.forEach(e => {
      if (e.type === 'income') {
        income += e.amount;
        if (e.status === 'paid') paidIncome += e.amount;
      } else {
        expense += e.amount;
        if (e.status === 'paid') paidExpense += e.amount;
      }
      if (e.status === 'pending') { pendingCount++; pendingAmount += e.amount; }
      else if (e.status === 'overdue') { overdueCount++; overdueAmount += e.amount; }
      else if (e.status === 'paid') paidCount++;
    });
    return {
      income, expense,
      balance: income - expense,
      paidIncome, paidExpense,
      pendingCount, overdueCount, paidCount,
      pendingAmount, overdueAmount,
      entries
    };
  }

  // Próximas parcelas futuras (valor comprometido)
  function futureCommitments(state, fromDate = new Date(), perfilId) {
    const fd = parseDate(isoDate(fromDate));
    return allEntries(state, perfilId).filter(e =>
      e.type === 'expense' && e.status !== 'paid' && parseDate(e.dueDate) >= fd
    );
  }

  // Saldo geral acumulado (todas receitas - despesas pagas)
  function overallBalance(state, perfilId) {
    let bal = 0;
    allEntries(state, perfilId).forEach(e => {
      if (e.status === 'paid') bal += e.type === 'income' ? e.amount : -e.amount;
    });
    return bal;
  }

  // Agrupa por categoria
  function byCategory(entries, type) {
    const map = new Map();
    entries.filter(e => e.type === type).forEach(e => {
      const cur = map.get(e.categoryId) || 0;
      map.set(e.categoryId, cur + e.amount);
    });
    return map;
  }

  // Evolução dos últimos N meses
  function monthlyEvolution(state, monthsBack = 6, perfilId) {
    const now = new Date();
    const result = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const s = monthSummary(state, d.getFullYear(), d.getMonth(), perfilId);
      result.push({
        label: `${MONTHS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
        income: s.income, expense: s.expense, balance: s.balance, key: ymKey(d)
      });
    }
    return result;
  }

  /* ---------- Helpers de categoria ---------- */
  function categoryById(state, id) {
    return state.categories.find(c => c.id === id) || { name: 'Sem categoria', color: '#6b7280', icon: '❓' };
  }

  /* ---------- Misc ---------- */
  function debounce(fn, wait = 250) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }
  function download(filename, content, mime = 'text/plain') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* ---------- Tabela Price (simulador) ---------- */
  // PMT: calcula parcela com juros compostos
  function calcInstallment(principal, ratePct, n) {
    const i = (ratePct || 0) / 100;
    if (i === 0) return principal / n;
    return principal * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
  }

  /* ---------- Export ---------- */
  const api = {
    $, $$, el,
    money, moneyShort, num, pct,
    MONTHS, MONTHS_LONG,
    parseDate, isoDate, formatDate, ymKey, addMonths, addDays, today, daysBetween,
    effectiveStatus, STATUS_LABEL,
    allEntries, inMonth, monthSummary, futureCommitments,
    overallBalance, byCategory, monthlyEvolution,
    categoryById,
    debounce, download, escapeHtml,
    calcInstallment,
    activeProfileId, filterByProfile
  };
  global.Utils = api;
  // Também expõe os helpers diretamente em window, já que as views
  // fazem `const { $, el, money, Utils, UI } = global;`.
  Object.keys(api).forEach(k => { global[k] = api[k]; });
})(window);
