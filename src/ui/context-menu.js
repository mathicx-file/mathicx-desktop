/**
 * mathicx-file · ui/context-menu.js
 * Menu de contexto reutilizável (estilo Windows 11).
 *
 * Uso:
 *   showContextMenu(event, [
 *     { label: 'Abrir', icon: '📂', onSelect: () => ... },
 *     { type: 'separator' },
 *     { label: 'Excluir', icon: '🗑️', danger: true, onSelect: () => ... },
 *   ]);
 *
 * Um único menu ativo por vez. Fecha em click fora, Escape, scroll ou blur.
 */

const LAYER_ID = 'context-menu-layer';
let _active = null;

function _dismiss() {
  if (_active) { _active.remove(); _active = null; }
  document.removeEventListener('click', _onDocClick);
  document.removeEventListener('contextmenu', _onDocClick);
  window.removeEventListener('blur', _dismiss);
  window.removeEventListener('resize', _dismiss);
}

function _onDocClick(e) {
  if (_active && !_active.contains(e.target)) _dismiss();
}

/**
 * @param {MouseEvent|{clientX,clientY}} e
 * @param {Array} items  — itens {label, icon, onSelect, danger, kbd} ou {type:'separator'|'label', label}
 */
export function showContextMenu(e, items = []) {
  e.preventDefault?.();
  _dismiss();

  const layer = document.getElementById(LAYER_ID) || (() => {
    const l = document.createElement('div');
    l.id = LAYER_ID;
    document.body.appendChild(l);
    return l;
  })();

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.setAttribute('role', 'menu');

  for (const item of items) {
    if (item.type === 'separator') {
      const sep = document.createElement('div');
      sep.className = 'cm-sep';
      menu.appendChild(sep);
      continue;
    }
    if (item.type === 'label') {
      const lab = document.createElement('div');
      lab.className = 'cm-label';
      lab.textContent = item.label;
      menu.appendChild(lab);
      continue;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cm-item' + (item.danger ? ' is-danger' : '');
    btn.setAttribute('role', 'menuitem');
    btn.innerHTML = `<span class="cm-ico">${item.icon || ''}</span>
      <span>${item.label}</span>
      ${item.kbd ? `<span class="cm-kbd">${item.kbd}</span>` : ''}`;
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      _dismiss();
      item.onSelect?.(ev);
    });
    menu.appendChild(btn);
  }

  layer.appendChild(menu);

  // Posicionamento com clamp na viewport.
  const rect = menu.getBoundingClientRect();
  const x = Math.min(e.clientX, window.innerWidth - rect.width - 8);
  const y = Math.min(e.clientY, window.innerHeight - rect.height - 8);
  menu.style.left = Math.max(8, x) + 'px';
  menu.style.top = Math.max(8, y) + 'px';

  _active = menu;
  // Fecha no próximo tick para não conflitar com o evento que abriu.
  setTimeout(() => {
    document.addEventListener('click', _onDocClick);
    document.addEventListener('contextmenu', _onDocClick);
    window.addEventListener('blur', _dismiss);
    window.addEventListener('resize', _dismiss);
  }, 0);
}

export const dismissContextMenu = _dismiss;
