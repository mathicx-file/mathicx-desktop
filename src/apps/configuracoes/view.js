/**
 * mathicx-file · apps/configuracoes/view.js
 * Configurações: tema, dados do sistema (reset), sobre.
 */
import { themeManager } from '../../themes/theme-manager.js';
import { ls } from '../../storage/local-storage.js';
import { db } from '../../storage/indexeddb.js';
import { store } from '../../core/state.js';
import { toast } from '../../ui/toast.js';
import { confirmModal } from '../../ui/modal.js';
import { authProvider } from '../../auth/provider.js';

const CSS = `
.mxc-set { display:flex; flex-direction:column; height:100%; background:var(--surface); }
.mxc-set .body { flex:1; overflow-y:auto; padding:20px; }
.mxc-set .group { margin-bottom:24px; }
.mxc-set .group h3 { font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); margin-bottom:10px; }
.mxc-set .row {
  display:flex; align-items:center; gap:12px; padding:12px 14px;
  background:var(--surface-2); border:1px solid var(--border-soft); border-radius:var(--r-md);
  margin-bottom:8px;
}
.mxc-set .row .label { flex:1; }
.mxc-set .row .label .t { font-size:13px; font-weight:700; color:var(--text); }
.mxc-set .row .label .d { font-size:11.5px; color:var(--muted); margin-top:2px; }
.mxc-set .seg { display:flex; gap:4px; background:var(--surface); padding:3px; border-radius:var(--r-md); border:1px solid var(--border); }
.mxc-set .seg button { padding:7px 14px; border-radius:var(--r-sm); font-size:12px; font-weight:700; color:var(--muted); }
.mxc-set .seg button.is-active { background:var(--accent); color:#fff; }
.mxc-set .about { font-size:12px; color:var(--muted); line-height:1.7; }
.mxc-set .profile-avatar { width:44px; height:44px; border-radius:50%; background:var(--brand-grad); display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0; }
.mxc-set .profile-info { flex:1; }
.mxc-set .profile-info .t { font-size:14px; font-weight:700; color:var(--text); }
.mxc-set .profile-info .d { font-size:12px; color:var(--muted); margin-top:1px; }
`;

export function mount(host) {
  if (!document.getElementById('mxc-set-style')) {
    const s = document.createElement('style'); s.id = 'mxc-set-style'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  const user = authProvider.getCurrentUser();

  host.innerHTML = `
    <div class="mxc-set">
      <div class="body">
        ${user ? `<div class="group">
          <h3>Perfil</h3>
          <div class="row">
            <div class="profile-avatar">${user.avatar}</div>
            <div class="profile-info">
              <div class="t">${user.nome}</div>
              <div class="d">${user.email} · ${user.perfil}</div>
            </div>
            <button class="btn btn-danger" data-act="logout">Sair</button>
          </div>
        </div>` : ''}
        <div class="group">
          <h3>Aparência</h3>
          <div class="row">
            <div class="label"><div class="t">Tema</div><div class="d">Alternar entre claro e escuro</div></div>
            <div class="seg" data-el="theme"></div>
          </div>
        </div>
        <div class="group">
          <h3>Dados</h3>
          <div class="row">
            <div class="label"><div class="t">Restaurar padrões</div><div class="d">Limpa preferências, atalhos e arquivos</div></div>
            <button class="btn btn-danger" data-act="reset">Resetar</button>
          </div>
          <div class="row">
            <div class="label"><div class="t">Estatísticas</div><div class="d" data-el="stats">—</div></div>
          </div>
        </div>
        <div class="group">
          <h3>Sobre</h3>
          <div class="about">
            <strong>mathicx-file</strong> — ambiente desktop web pessoal.<br/>
            Arquitetura modular em ES Modules · sem build · sem dependências de runtime.<br/>
            Inspirado em Windows 11, Arc Browser e macOS.
          </div>
        </div>
      </div>
    </div>`;

  // Segmento de tema
  const themeSeg = host.querySelector('[data-el="theme"]');
  const THEME_LABELS = { dark: 'Escuro', light: 'Claro' };
  ['dark', 'light'].forEach((t) => {
    const b = document.createElement('button');
    b.textContent = THEME_LABELS[t];
    if (themeManager.current === t) b.classList.add('is-active');
    b.addEventListener('click', () => {
      themeManager.set(t);
      themeSeg.querySelectorAll('button').forEach((x) => x.classList.remove('is-active'));
      b.classList.add('is-active');
      toast.success(`Tema: ${b.textContent}`);
    });
    themeSeg.appendChild(b);
  });

  // Logout
  host.querySelector('[data-act="logout"]')?.addEventListener('click', async () => {
    const ok = await confirmModal({ title: 'Sair', message: 'Encerrar sessão?', okText: 'Sair', danger: true });
    if (!ok) return;
    await authProvider.logout();
    location.reload();
  });

  // Stats
  const statsEl = host.querySelector('[data-el="stats"]');
  const updateStats = () => {
    const usage = store.get('usage', {});
    const favorites = store.get('favorites', []).length;
    const total = Object.values(usage).reduce((a, b) => a + b, 0);
    statsEl.textContent = `${favorites} favorito(s) · ${total} abertura(s) registrada(s)`;
  };
  updateStats();

  // Reset
  host.querySelector('[data-act="reset"]').addEventListener('click', async () => {
    const ok = await confirmModal({
      title: 'Restaurar padrões?',
      message: 'Isto removerá preferências, atalhos personalizados e todos os arquivos. Esta ação não pode ser desfeita.',
      okText: 'Resetar tudo', danger: true,
    });
    if (!ok) return;
    await db.store('fs').clear();
    await db.store('widgets').clear();
    ls.clear();
    toast.success('Dados resetados. Recarregando...');
    setTimeout(() => location.reload(), 800);
  });
}
