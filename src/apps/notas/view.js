/**
 * mathicx-file · apps/notas/view.js
 * Bloco de notas. Persiste no LocalStorage (uma nota por janela não é
 * necessário; mantemos um caderno único editável).
 */
import { ls } from '../../storage/local-storage.js';
import { debounce } from '../../core/utils.js';

const CSS = `
.mxc-notes { display:flex; flex-direction:column; height:100%; background:var(--surface); }
.mxc-notes .toolbar {
  display:flex; align-items:center; gap:8px; padding:8px 12px;
  border-bottom:1px solid var(--border); background:var(--surface-2);
}
.mxc-notes .title {
  flex:1; background:transparent; border:none; font-size:14px; font-weight:700; color:var(--text-strong);
}
.mxc-notes .meta { font-size:11px; color:var(--muted); font-weight:600; }
.mxc-notes textarea {
  flex:1; resize:none; border:none; padding:16px; background:var(--surface);
  color:var(--text); font-size:13.5px; line-height:1.6; font-family:var(--font-ui);
}
.mxc-notes textarea:focus { outline:none; }
`;

export function mount(host) {
  if (!document.getElementById('mxc-notes-style')) {
    const s = document.createElement('style'); s.id = 'mxc-notes-style'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  const saved = ls.get('notepad', { title: 'Sem título', body: '' });
  host.innerHTML = `
    <div class="mxc-notes">
      <div class="toolbar">
        <input class="title" data-el="title" value="" placeholder="Título da nota..." />
        <span class="meta" data-el="meta">salvo</span>
      </div>
      <textarea data-el="body" placeholder="Comece a escrever..."></textarea>
    </div>`;

  const titleEl = host.querySelector('[data-el="title"]');
  const bodyEl = host.querySelector('[data-el="body"]');
  const metaEl = host.querySelector('[data-el="meta"]');
  titleEl.value = saved.title;
  bodyEl.value = saved.body;

  const save = debounce(() => {
    ls.set('notepad', { title: titleEl.value, body: bodyEl.value });
    metaEl.textContent = 'salvo ✓';
    setTimeout(() => (metaEl.textContent = 'salvo'), 1500);
  }, 500);

  [titleEl, bodyEl].forEach((el) => el.addEventListener('input', () => {
    metaEl.textContent = 'digitando...';
    save();
  }));
}
