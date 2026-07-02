/**
 * mathicx-file · ui/toast.js
 * Notificações temporárias (portais #toast-portal no index.html).
 * API imperativa simples: toast.success(msg), toast.error(msg), etc.
 */

const PORTAL_ID = 'toast-portal';
const ICONS = { success: '✓', error: '✕', info: 'ℹ', warn: '⚠' };

function _show(message, type = 'info', duration = 3200) {
  const portal = document.getElementById(PORTAL_ID);
  if (!portal) return;

  const el = document.createElement('div');
  el.className = `toast is-${type}`;
  el.innerHTML = `<span class="t-ico">${ICONS[type] || ICONS.info}</span><span>${message}</span>`;
  portal.appendChild(el);

  const remove = () => {
    el.classList.add('is-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  };
  const timer = setTimeout(remove, duration);
  el.addEventListener('click', () => { clearTimeout(timer); remove(); });
}

export const toast = {
  show: (msg, type, ms) => _show(msg, type, ms),
  success: (msg) => _show(msg, 'success'),
  error: (msg) => _show(msg, 'error'),
  info: (msg) => _show(msg, 'info'),
  warn: (msg) => _show(msg, 'warn'),
};
