/**
 * mathicx-file · ui/components.js
 * Factory de componentes UI reutilizáveis: logo SVG, ícones de janela,
 * spinner, etc. Centraliza SVGs para DRY.
 */

export const LOGO_SVG = `
<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M7 23V9l9 10 9-10v14" stroke="#fff" stroke-width="2.6"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

export const WIN_ICONS = {
  min: `<svg viewBox="0 0 10 10" fill="none"><line x1="1" y1="8.2" x2="9" y2="8.2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>`,
  max: `<svg viewBox="0 0 10 10" fill="none"><rect x="1.3" y="1.3" width="7.4" height="7.4" rx="1" stroke="currentColor" stroke-width="1.1"/></svg>`,
  restore: `<svg viewBox="0 0 10 10" fill="none"><rect x="2.7" y="1" width="6.3" height="6.3" rx="1" stroke="currentColor" stroke-width="1"/><rect x="1" y="2.7" width="6.3" height="6.3" rx="1" stroke="currentColor" stroke-width="1" fill="var(--surface-2)"/></svg>`,
  close: `<svg viewBox="0 0 10 10" fill="none"><line x1="1.2" y1="1.2" x2="8.8" y2="8.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="8.8" y1="1.2" x2="1.2" y2="8.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
};

export const ICONS = {
  search: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>`,
  start: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="2" width="9" height="9" rx="1.5"/><rect x="13" y="2" width="9" height="9" rx="1.5"/><rect x="2" y="13" width="9" height="9" rx="1.5"/><rect x="13" y="13" width="9" height="9" rx="1.5"/></svg>`,
};

/** Cria o markup do logo (com classe/size opcionais). */
export const logoHTML = () =>
  `<span class="logo">${LOGO_SVG}</span>`;

/** Spinner simples. */
export const spinnerHTML = (label = 'Carregando...') =>
  `<div class="os-loader"><span class="spinner"></span>${label}</div>`;
