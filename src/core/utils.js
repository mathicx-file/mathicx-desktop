/**
 * mathicx-file · core/utils.js
 * Utilitários puros (sem estado, sem DOM) — SRP + reutilizáveis.
 */

/** ID curto e único o suficiente para uso local. */
export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Número com zero à esquerda (2 dígitos). */
export const pad2 = (n) => String(n).padStart(2, '0');

/** Clamp numérico. */
export const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

/** Debounce genérico. */
export const debounce = (fn, wait = 200) => {
  let t;
  const debounced = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => clearTimeout(t);
  return debounced;
};

/** Throttle via rAF — ideal para drag/resize. */
export const rafThrottle = (fn) => {
  let scheduled = false;
  let lastArgs;
  return (...args) => {
    lastArgs = args;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      fn(...lastArgs);
    });
  };
};

/** Escapa HTML para inserção segura em innerHTML. */
export const escapeHTML = (str) =>
  String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

/** Normaliza texto para busca (sem acento, minúsculo). */
export const norm = (str) =>
  String(str ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Formata bytes de forma legível. */
export const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

/** Formata timestamp ISO/Date para "dd/mm/aaaa hh:mm". */
export const formatDate = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d)) return '—';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/** Dias em português e meses (pt-BR). */
export const WEEKDAYS_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
export const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];
export const WEEKDAYS_LONG = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado'
];

/** Capitaliza primeira letra. */
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Pausa assíncrona. */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cria elemento a partir de string HTML (1ª raiz). */
export const h = (html) => {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
};

/** querySelector enxuto. */
export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];
