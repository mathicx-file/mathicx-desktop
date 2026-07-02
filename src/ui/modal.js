/**
 * mathicx-file · ui/modal.js
 * Modal/dialog assíncrono. Promessa resolve com os dados ou null (cancelado).
 *
 * Uso (texto):
 *   const name = await promptModal({ title: 'Renomear', label: 'Nome', value: 'x' });
 *
 * Uso (form custom):
 *   const data = await formModal({ title: 'Novo atalho', fields: [...] });
 */

const LAYER_ID = 'modal-layer';

function _ensureLayer() {
  let layer = document.getElementById(LAYER_ID);
  if (!layer) {
    layer = document.createElement('div');
    layer.id = LAYER_ID;
    document.body.appendChild(layer);
  }
  return layer;
}

function _close(root, resolve, value) {
  root.remove();
  resolve(value);
}

/** Modal de prompt simples (1 campo de texto). */
export function promptModal({ title = 'Entrada', label = 'Valor', value = '', placeholder = '', okText = 'OK', cancelText = 'Cancelar', multiline = false, validate } = {}) {
  return new Promise((resolve) => {
    const layer = _ensureLayer();
    const root = document.createElement('div');
    root.className = 'modal-backdrop';
    root.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3>${title}</h3>
        <div class="field">
          ${label ? `<label>${label}</label>` : ''}
          ${multiline
            ? `<textarea rows="3" placeholder="${placeholder}"></textarea>`
            : `<input type="text" placeholder="${placeholder}" />`}
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-act="cancel">${cancelText}</button>
          <button type="button" class="btn btn-primary" data-act="ok">${okText}</button>
        </div>
      </div>`;

    const input = root.querySelector(multiline ? 'textarea' : 'input');
    if (input) input.value = value;
    layer.appendChild(root);

    const finish = (val) => _close(root, resolve, val);
    root.querySelector('[data-act="cancel"]').addEventListener('click', () => finish(null));
    root.querySelector('[data-act="ok"]').addEventListener('click', () => {
      const v = input?.value ?? '';
      if (validate) {
        const err = validate(v);
        if (err) { toast.warn(err); input?.focus(); return; }
      }
      finish(v);
    });
    root.addEventListener('click', (e) => { if (e.target === root) finish(null); });
    setTimeout(() => { input?.focus(); input?.select?.(); }, 30);
  });
}

/** Modal de confirmação (true/false). */
export function confirmModal({ title = 'Confirmar', message = '', okText = 'Confirmar', cancelText = 'Cancelar', danger = false } = {}) {
  return new Promise((resolve) => {
    const layer = _ensureLayer();
    const root = document.createElement('div');
    root.className = 'modal-backdrop';
    root.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3>${title}</h3>
        ${message ? `<p style="color:var(--muted);font-size:13px;margin:0 0 var(--sp-4);">${message}</p>` : ''}
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-act="cancel">${cancelText}</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${okText}</button>
        </div>
      </div>`;
    layer.appendChild(root);
    const finish = (v) => _close(root, resolve, v);
    root.querySelector('[data-act="cancel"]').addEventListener('click', () => finish(false));
    root.querySelector('[data-act="ok"]').addEventListener('click', () => finish(true));
    root.addEventListener('click', (e) => { if (e.target === root) finish(false); });
  });
}

/**
 * Modal de formulário genérico.
 * fields: [{ key, label, type: 'text'|'textarea'|'select'|'icon', value, options, placeholder }]
 * Retorna objeto {key: value} ou null.
 */
export function formModal({ title = 'Formulário', fields = [], okText = 'Salvar', cancelText = 'Cancelar' } = {}) {
  return new Promise((resolve) => {
    const layer = _ensureLayer();
    const root = document.createElement('div');
    root.className = 'modal-backdrop';
    const ICON_SET = ['📁','📄','🧮','📝','⚙️','🗂️','💡','📊','🎨','🔧','🔔','⭐','🚀','💾','🌐','📌'];

    const renderField = (f) => {
      const v = f.value ?? '';
      if (f.type === 'textarea') {
        return `<textarea rows="3" data-key="${f.key}" placeholder="${f.placeholder || ''}">${v}</textarea>`;
      }
      if (f.type === 'select') {
        const opts = (f.options || []).map((o) =>
          `<option value="${o.value}" ${o.value === v ? 'selected' : ''}>${o.label}</option>`
        ).join('');
        return `<select data-key="${f.key}">${opts}</select>`;
      }
      if (f.type === 'icon') {
        return `<div class="icon-picker" data-key="${f.key}">
          ${ICON_SET.map((ic) => `<button type="button" data-icon="${ic}" class="${ic === v ? 'is-selected' : ''}">${ic}</button>`).join('')}
        </div>`;
      }
      return `<input type="text" data-key="${f.key}" value="${v.replace(/"/g, '&quot;')}" placeholder="${f.placeholder || ''}" />`;
    };

    root.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3>${title}</h3>
        ${fields.map((f) => `
          <div class="field">
            ${f.label ? `<label>${f.label}</label>` : ''}
            ${renderField(f)}
          </div>`).join('')}
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-act="cancel">${cancelText}</button>
          <button type="button" class="btn btn-primary" data-act="ok">${okText}</button>
        </div>
      </div>`;
    layer.appendChild(root);

    // Picker de ícone
    root.querySelectorAll('.icon-picker').forEach((picker) => {
      picker.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-icon]');
        if (!btn) return;
        picker.querySelectorAll('button').forEach((b) => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        picker.dataset.value = btn.dataset.icon;
      });
      // inicializa dataset
      const sel = picker.querySelector('.is-selected');
      if (sel) picker.dataset.value = sel.dataset.icon;
    });

    const finish = (val) => _close(root, resolve, val);
    root.querySelector('[data-act="cancel"]').addEventListener('click', () => finish(null));
    root.querySelector('[data-act="ok"]').addEventListener('click', () => {
      const data = {};
      fields.forEach((f) => {
        const el = root.querySelector(`[data-key="${f.key}"]`);
        if (f.type === 'icon') data[f.key] = el.dataset.value || ICON_SET[0];
        else data[f.key] = el.value;
      });
      finish(data);
    });
    root.addEventListener('click', (e) => { if (e.target === root) finish(null); });
    setTimeout(() => root.querySelector('input, textarea, select')?.focus(), 30);
  });
}

// Importa toast para validação (late import para evitar ciclo).
import { toast } from './toast.js';
