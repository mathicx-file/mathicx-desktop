/**
 * mathicx-file - apps/configuracoes/view.js
 * Configuracoes: perfil, tema, widgets do desktop, dados do sistema e sobre.
 */
import { themeManager } from '../../themes/theme-manager.js';
import { ls } from '../../storage/local-storage.js';
import { db } from '../../storage/indexeddb.js';
import { store } from '../../core/state.js';
import { bus, EVT } from '../../core/event-bus.js';
import { toast } from '../../ui/toast.js';
import { confirmModal } from '../../ui/modal.js';
import { authProvider } from '../../auth/provider.js';
import { WIDGET_DEFS } from '../../desktop/widgets.js';
import { appDataHost } from '../integration/app-data-host.js';
import {
  loadSyncCenterState,
  summarizeSyncCenter,
  syncCenterApp,
} from './sync-center.js';
import {
  collectUnifiedBackup,
  downloadUnifiedBackup,
  validateUnifiedBackupPackage,
} from '../integration/unified-backup.js';
import {
  collectEncryptedBackup,
  downloadEncryptedBackup,
} from '../integration/encrypted-backup.js';
import {
  parseBackupFile,
  restoreBackupPackage,
  unlockBackupFile,
} from '../integration/restore-backup.js';

const CSS = `
.mxc-set { display:flex; flex-direction:column; height:100%; background:var(--surface); }
.mxc-set .tabs { display:flex; gap:6px; padding:12px 14px 0; border-bottom:1px solid var(--border-soft); }
.mxc-set .tab {
  padding:8px 12px; border-radius:var(--r-sm) var(--r-sm) 0 0;
  color:var(--muted); font-size:12px; font-weight:800;
}
.mxc-set .tab:hover { background:var(--surface-hover); color:var(--text); }
.mxc-set .tab.is-active { background:var(--surface-2); color:var(--accent); }
.mxc-set .body { flex:1; overflow-y:auto; padding:20px; }
.mxc-set .panel.is-hidden { display:none; }
.mxc-set .group { margin-bottom:24px; }
.mxc-set .group h3 { font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); margin-bottom:10px; }
.mxc-set .row {
  display:flex; align-items:center; gap:12px; padding:12px 14px;
  background:var(--surface-2); border:1px solid var(--border-soft); border-radius:var(--r-md);
  margin-bottom:8px;
}
.mxc-set .row .label { flex:1; min-width:0; }
.mxc-set .row .label .t { font-size:13px; font-weight:700; color:var(--text); }
.mxc-set .row .label .d { font-size:11.5px; color:var(--muted); margin-top:2px; }
.mxc-set .seg { display:flex; gap:4px; background:var(--surface); padding:3px; border-radius:var(--r-md); border:1px solid var(--border); }
.mxc-set .seg button { padding:7px 14px; border-radius:var(--r-sm); font-size:12px; font-weight:700; color:var(--muted); }
.mxc-set .seg button.is-active { background:var(--accent); color:#fff; }
.mxc-set .about { font-size:12px; color:var(--muted); line-height:1.7; }
.mxc-set .profile-avatar { width:44px; height:44px; border-radius:50%; background:var(--brand-grad); display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0; }
.mxc-set .profile-info { flex:1; min-width:0; }
.mxc-set .profile-info .t { font-size:14px; font-weight:700; color:var(--text); }
.mxc-set .profile-info .d { font-size:12px; color:var(--muted); margin-top:1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mxc-set .widget-list { display:flex; flex-direction:column; gap:8px; }
.mxc-set .widget-item {
  display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:12px;
  padding:12px 14px; background:var(--surface-2); border:1px solid var(--border-soft);
  border-radius:var(--r-md);
}
.mxc-set .widget-item.is-disabled { opacity:.62; }
.mxc-set .widget-toggle { width:18px; height:18px; accent-color:var(--accent); }
.mxc-set .widget-meta { min-width:0; }
.mxc-set .widget-title { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:800; color:var(--text); }
.mxc-set .widget-title .ico { width:22px; text-align:center; flex-shrink:0; }
.mxc-set .widget-desc { font-size:11.5px; color:var(--muted); margin-top:2px; }
.mxc-set .widget-actions { display:flex; gap:4px; }
.mxc-set .icon-btn {
  width:30px; height:30px; border-radius:var(--r-sm); border:1px solid var(--border);
  background:var(--surface); color:var(--text); font-size:14px; font-weight:800;
}
.mxc-set .icon-btn:hover { background:var(--surface-hover); }
.mxc-set .icon-btn:disabled { opacity:.35; cursor:not-allowed; }
.mxc-set .sync-toolbar { display:flex; align-items:center; gap:8px; margin-bottom:12px; }
.mxc-set .sync-summary {
  flex:1; min-width:0; display:flex; flex-wrap:wrap; gap:8px 14px; align-items:center;
  font-size:11.5px; color:var(--muted);
}
.mxc-set .sync-summary strong { color:var(--text); font-size:12px; }
.mxc-set .sync-list { display:flex; flex-direction:column; gap:8px; }
.mxc-set .sync-list.is-loading { opacity:.72; }
.mxc-set .sync-item {
  display:grid; grid-template-columns:38px minmax(0, 1fr) auto; align-items:center; gap:12px;
  padding:12px 14px; background:var(--surface-2); border:1px solid var(--border-soft);
  border-radius:var(--r-md);
}
.mxc-set .sync-app-icon {
  width:36px; height:36px; display:flex; align-items:center; justify-content:center;
  background:var(--surface); border:1px solid var(--border); border-radius:var(--r-sm);
  color:var(--text); font-size:15px; font-weight:900;
}
.mxc-set .sync-meta { min-width:0; }
.mxc-set .sync-title-line { display:flex; flex-wrap:wrap; align-items:center; gap:7px; }
.mxc-set .sync-title { color:var(--text); font-size:13px; font-weight:800; }
.mxc-set .sync-status {
  display:inline-flex; align-items:center; gap:5px; font-size:10.5px; font-weight:800;
  color:var(--muted);
}
.mxc-set .sync-status::before { content:''; width:7px; height:7px; border-radius:50%; background:currentColor; }
.mxc-set .sync-status[data-tone="success"] { color:var(--success); }
.mxc-set .sync-status[data-tone="progress"] { color:var(--accent); }
.mxc-set .sync-status[data-tone="warning"] { color:var(--warning); }
.mxc-set .sync-status[data-tone="danger"] { color:var(--danger); }
.mxc-set .sync-message { margin-top:3px; color:var(--muted); font-size:11.5px; line-height:1.35; }
.mxc-set .sync-time { margin-top:3px; color:var(--muted); font-size:10.5px; }
.mxc-set .sync-actions { display:flex; align-items:center; gap:6px; }
.mxc-set .sync-empty { padding:18px; color:var(--muted); text-align:center; font-size:12px; }
.mxc-set .backup-list { display:flex; flex-direction:column; gap:8px; }
.mxc-set .backup-mode { display:flex; justify-content:flex-end; margin-bottom:10px; }
.mxc-set .backup-passwords {
  display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;
}
.mxc-set .backup-passwords.is-hidden { display:none; }
.mxc-set .backup-field { display:flex; flex-direction:column; gap:5px; color:var(--muted); font-size:11px; font-weight:700; }
.mxc-set .backup-field input {
  width:100%; min-width:0; padding:9px 10px; border:1px solid var(--border);
  border-radius:var(--r-sm); background:var(--surface-2); color:var(--text); font-size:12px;
}
.mxc-set .backup-field input:focus { outline:2px solid color-mix(in srgb, var(--accent) 34%, transparent); border-color:var(--accent); }
.mxc-set .backup-item {
  display:grid; grid-template-columns:auto minmax(0, 1fr) auto; align-items:center; gap:12px;
  padding:11px 14px; background:var(--surface-2); border:1px solid var(--border-soft);
  border-radius:var(--r-md);
}
.mxc-set .backup-item.is-unavailable { opacity:.64; }
.mxc-set .backup-toggle { width:18px; height:18px; accent-color:var(--accent); }
.mxc-set .backup-meta { min-width:0; }
.mxc-set .backup-title { display:block; font-size:12.5px; font-weight:800; color:var(--text); }
.mxc-set .backup-detail { display:block; margin-top:2px; font-size:11px; color:var(--muted); }
.mxc-set .backup-state { font-size:10.5px; font-weight:800; color:var(--muted); }
.mxc-set .backup-state.is-ready { color:var(--success); }
.mxc-set .backup-footer { display:flex; justify-content:flex-end; margin-top:10px; }
.mxc-set .restore-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
.mxc-set .restore-file-name { flex:1; min-width:0; color:var(--muted); font-size:11.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mxc-set .restore-unlock { display:flex; align-items:flex-end; gap:8px; margin-bottom:10px; }
.mxc-set .restore-unlock.is-hidden { display:none; }
.mxc-set .restore-unlock .backup-field { flex:1; }
.mxc-set .restore-list { display:flex; flex-direction:column; gap:8px; }
.mxc-set .restore-item {
  display:grid; grid-template-columns:auto minmax(0, 1fr) auto auto; align-items:center; gap:10px;
  padding:11px 14px; background:var(--surface-2); border:1px solid var(--border-soft);
  border-radius:var(--r-md);
}
.mxc-set .restore-item.is-unavailable { opacity:.64; }
.mxc-set .restore-mode {
  padding:7px 28px 7px 9px; border:1px solid var(--border); border-radius:var(--r-sm);
  background:var(--surface); color:var(--text); font-size:11.5px;
}
.mxc-set .restore-status { color:var(--muted); font-size:10.5px; font-weight:800; }
.mxc-set .restore-status.is-ready { color:var(--success); }
.mxc-set .restore-empty { padding:15px; border-top:1px solid var(--border-soft); color:var(--muted); text-align:center; font-size:11.5px; }
@media (max-width: 560px) {
  .mxc-set .tabs { overflow-x:auto; }
  .mxc-set .row { align-items:flex-start; flex-direction:column; }
  .mxc-set .widget-item { grid-template-columns:auto 1fr; }
  .mxc-set .widget-actions { grid-column:2; }
  .mxc-set .sync-item { grid-template-columns:36px minmax(0, 1fr); }
  .mxc-set .sync-actions { grid-column:2; justify-content:flex-start; }
  .mxc-set .backup-item { grid-template-columns:auto minmax(0, 1fr); }
  .mxc-set .backup-state { grid-column:2; }
  .mxc-set .backup-passwords { grid-template-columns:1fr; }
  .mxc-set .restore-item { grid-template-columns:auto minmax(0, 1fr); }
  .mxc-set .restore-mode, .mxc-set .restore-status { grid-column:2; }
  .mxc-set .restore-unlock { align-items:stretch; flex-direction:column; }
}
`;

const WIDGET_DESCRIPTIONS = Object.freeze({
  clock: 'Horario atual em formato compacto.',
  cal: 'Calendario mensal com destaque para hoje.',
  notes: 'Anotacoes rapidas salvas neste navegador.',
  tasks: 'Lista curta de tarefas pessoais.',
  weather: 'Clima atual usando localizacao do navegador.',
  activity: 'Ultimas atividades registradas no desktop.',
  'japanese-study': 'Resumo sincronizado e atalhos do Japanese Study.',
});

export function mount(host, context = {}) {
  if (!document.getElementById('mxc-set-style')) {
    const s = document.createElement('style');
    s.id = 'mxc-set-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  const user = authProvider.getCurrentUser();
  const userName = user?.nome || user?.displayName || user?.email || 'Usuario';
  const userEmail = user?.email || '';
  const userProfile = user?.perfil || user?.role || 'user';
  const userAvatar = user?.avatar || userName.charAt(0).toUpperCase();

  host.innerHTML = `
    <div class="mxc-set">
      <div class="tabs" role="tablist" aria-label="Configuracoes">
        <button type="button" class="tab is-active" data-tab="geral">Geral</button>
        <button type="button" class="tab" data-tab="widgets">Widgets</button>
        <button type="button" class="tab" data-tab="sync">Sincronizacao</button>
        <button type="button" class="tab" data-tab="sobre">Sobre</button>
      </div>
      <div class="body">
        <section class="panel" data-panel="geral">
          ${user ? `<div class="group">
            <h3>Perfil</h3>
            <div class="row">
              <div class="profile-avatar">${escapeHTML(userAvatar)}</div>
              <div class="profile-info">
                <div class="t">${escapeHTML(userName)}</div>
                <div class="d">${escapeHTML(userEmail)} - ${escapeHTML(userProfile)}</div>
              </div>
              <button class="btn btn-danger" data-act="logout">Sair</button>
            </div>
          </div>` : ''}
          <div class="group">
            <h3>Aparencia</h3>
            <div class="row">
              <div class="label"><div class="t">Tema</div><div class="d">Alternar entre claro e escuro</div></div>
              <div class="seg" data-el="theme"></div>
            </div>
          </div>
          <div class="group">
            <h3>Dados</h3>
            <div class="row">
              <div class="label"><div class="t">Restaurar padroes</div><div class="d">Limpa preferencias, atalhos e arquivos</div></div>
              <button class="btn btn-danger" data-act="reset">Resetar</button>
            </div>
            <div class="row">
              <div class="label"><div class="t">Estatisticas</div><div class="d" data-el="stats">--</div></div>
            </div>
          </div>
        </section>
        <section class="panel is-hidden" data-panel="widgets">
          <div class="group">
            <h3>Tela inicial</h3>
            <div class="row">
              <div class="label">
                <div class="t">Widgets do desktop</div>
                <div class="d">Escolha quais cards aparecem na tela inicial e ajuste a ordem.</div>
              </div>
              <button class="btn" data-act="widgets-reset">Restaurar</button>
            </div>
            <div class="widget-list" data-el="widget-list"></div>
          </div>
        </section>
        <section class="panel is-hidden" data-panel="sync">
          <div class="group">
            <h3>Central de sincronizacao</h3>
            <div class="sync-toolbar">
              <div class="sync-summary" data-el="sync-summary" aria-live="polite">Consultando...</div>
              <button type="button" class="icon-btn" data-act="sync-all" title="Sincronizar aplicativos disponiveis" aria-label="Sincronizar aplicativos disponiveis">&#8635;</button>
              <button type="button" class="icon-btn" data-act="sync-refresh" title="Atualizar estados" aria-label="Atualizar estados">&#10227;</button>
            </div>
            <div class="sync-list" data-el="sync-list" aria-live="polite"></div>
          </div>
          <div class="group">
            <h3>Backup unificado</h3>
            <div class="backup-mode">
              <div class="seg" data-el="backup-mode" aria-label="Protecao do backup">
                <button type="button" class="is-active" data-backup-mode="plain">Sem senha</button>
                <button type="button" data-backup-mode="protected">Com senha</button>
              </div>
            </div>
            <div class="backup-passwords is-hidden" data-el="backup-passwords">
              <label class="backup-field">Senha
                <input type="password" data-el="backup-password" minlength="12" maxlength="256" autocomplete="new-password" />
              </label>
              <label class="backup-field">Confirmar senha
                <input type="password" data-el="backup-password-confirm" minlength="12" maxlength="256" autocomplete="new-password" />
              </label>
            </div>
            <div class="backup-list" data-el="backup-list"></div>
            <div class="backup-footer">
              <button type="button" class="btn" data-act="backup-export">Exportar backup</button>
            </div>
          </div>
          <div class="group">
            <h3>Restaurar backup</h3>
            <div class="restore-toolbar">
              <button type="button" class="btn" data-act="restore-file">Selecionar arquivo</button>
              <span class="restore-file-name" data-el="restore-file-name">Nenhum arquivo selecionado</span>
              <input type="file" data-el="restore-file-input" accept="application/json,.json" hidden />
            </div>
            <div class="restore-unlock is-hidden" data-el="restore-unlock">
              <label class="backup-field">Senha do backup
                <input type="password" data-el="restore-password" minlength="12" maxlength="256" autocomplete="current-password" />
              </label>
              <button type="button" class="btn" data-act="restore-unlock">Desbloquear</button>
            </div>
            <div class="restore-list" data-el="restore-list">
              <div class="restore-empty">Selecione um arquivo de backup.</div>
            </div>
            <div class="backup-footer">
              <button type="button" class="btn" data-act="restore-run" disabled>Restaurar selecionados</button>
            </div>
          </div>
        </section>
        <section class="panel is-hidden" data-panel="sobre">
          <div class="group">
            <h3>Sobre</h3>
            <div class="about">
              <strong>mathicx-file</strong> - ambiente desktop web pessoal.<br/>
              Arquitetura modular em ES Modules, sem build e sem dependencias de runtime.<br/>
              Inspirado em Windows 11, Arc Browser e macOS.
            </div>
          </div>
        </section>
      </div>
    </div>`;

  initTabs(host);
  initThemeControls(host);
  initSessionControls(host);
  initStats(host);
  initWidgetControls(host);
  initResetControls(host);
  return initSyncCenter(host, context);
}

function initTabs(host) {
  host.querySelector('.tabs')?.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (!tab) return;
    const target = tab.dataset.tab;
    host.querySelectorAll('[data-tab]').forEach((button) => {
      button.classList.toggle('is-active', button === tab);
    });
    host.querySelectorAll('[data-panel]').forEach((panel) => {
      panel.classList.toggle('is-hidden', panel.dataset.panel !== target);
    });
  });
}

function initThemeControls(host) {
  const themeSeg = host.querySelector('[data-el="theme"]');
  if (!themeSeg) return;

  const THEME_LABELS = { dark: 'Escuro', light: 'Claro' };
  ['dark', 'light'].forEach((theme) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = THEME_LABELS[theme];
    if (themeManager.current === theme) button.classList.add('is-active');
    button.addEventListener('click', () => {
      themeManager.set(theme);
      themeSeg.querySelectorAll('button').forEach((x) => x.classList.remove('is-active'));
      button.classList.add('is-active');
      toast.success(`Tema: ${button.textContent}`);
    });
    themeSeg.appendChild(button);
  });
}

function initSessionControls(host) {
  host.querySelector('[data-act="logout"]')?.addEventListener('click', async () => {
    const ok = await confirmModal({ title: 'Sair', message: 'Encerrar sessao?', okText: 'Sair', danger: true });
    if (!ok) return;
    await authProvider.logout();
    location.reload();
  });
}

function initStats(host) {
  const statsEl = host.querySelector('[data-el="stats"]');
  if (!statsEl) return;

  const usage = store.get('usage', {});
  const favorites = store.get('favorites', []).length;
  const total = Object.values(usage).reduce((a, b) => a + b, 0);
  statsEl.textContent = `${favorites} favorito(s) - ${total} abertura(s) registrada(s)`;
}

function initWidgetControls(host) {
  const list = host.querySelector('[data-el="widget-list"]');
  if (!list) return;

  const render = () => renderWidgetList(list);
  render();

  list.addEventListener('change', (event) => {
    const toggle = event.target.closest('[data-widget-toggle]');
    if (!toggle) return;
    const widgetId = toggle.dataset.widgetToggle;
    const hidden = { ...(store.get('widgets') || {}) };
    if (toggle.checked) delete hidden[widgetId];
    else hidden[widgetId] = true;
    store.set('widgets', hidden);
    bus.emit(EVT.WIDGET_UPDATE, { source: 'settings-toggle', widgetId });
    render();
    toast.success(toggle.checked ? 'Widget adicionado ao desktop.' : 'Widget removido do desktop.');
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-widget-move]');
    if (!button) return;
    moveWidget(button.dataset.widgetId, Number(button.dataset.widgetMove));
    bus.emit(EVT.WIDGET_UPDATE, { source: 'settings-reorder', widgetId: button.dataset.widgetId });
    render();
  });

  host.querySelector('[data-act="widgets-reset"]')?.addEventListener('click', () => {
    store.set({
      widgets: null,
      widgetLayout: null,
    });
    bus.emit(EVT.WIDGET_UPDATE, { source: 'settings-reset' });
    render();
    toast.success('Widgets restaurados.');
  });
}

function initResetControls(host) {
  host.querySelector('[data-act="reset"]')?.addEventListener('click', async () => {
    const ok = await confirmModal({
      title: 'Restaurar padroes?',
      message: 'Isto removera preferencias, atalhos personalizados e todos os arquivos. Esta acao nao pode ser desfeita.',
      okText: 'Resetar tudo',
      danger: true,
    });
    if (!ok) return;
    await db.store('fs').clear();
    await db.store('widgets').clear();
    ls.clear();
    toast.success('Dados resetados. Recarregando...');
    setTimeout(() => location.reload(), 800);
  });
}

function initSyncCenter(host, context) {
  const list = host.querySelector('[data-el="sync-list"]');
  const summaryEl = host.querySelector('[data-el="sync-summary"]');
  const backupList = host.querySelector('[data-el="backup-list"]');
  const backupExportButton = host.querySelector('[data-act="backup-export"]');
  const backupPasswords = host.querySelector('[data-el="backup-passwords"]');
  const backupPassword = host.querySelector('[data-el="backup-password"]');
  const backupPasswordConfirm = host.querySelector('[data-el="backup-password-confirm"]');
  const restoreFileInput = host.querySelector('[data-el="restore-file-input"]');
  const restoreFileName = host.querySelector('[data-el="restore-file-name"]');
  const restoreUnlock = host.querySelector('[data-el="restore-unlock"]');
  const restorePasswordInput = host.querySelector('[data-el="restore-password"]');
  const restoreList = host.querySelector('[data-el="restore-list"]');
  const restoreRunButton = host.querySelector('[data-act="restore-run"]');
  const refreshButton = host.querySelector('[data-act="sync-refresh"]');
  const syncAllButton = host.querySelector('[data-act="sync-all"]');
  if (!list || !summaryEl) return undefined;

  let apps = [];
  let renderSequence = 0;
  let disposed = false;
  const refreshTimers = new Set();
  const backupSelection = new Set(['desktop', 'japanese-study']);
  let backupMode = 'plain';
  let restoreParsed = null;
  let restoreUnified = null;
  let restoreEncrypted = false;
  let restorePassword = '';
  const restoreSelection = new Set();
  const restoreModes = new Map();

  const refresh = async () => {
    const sequence = ++renderSequence;
    list.classList.add('is-loading');
    refreshButton?.setAttribute('disabled', '');
    const nextApps = await loadSyncCenterState(appDataHost, {
      resolveIframe: (appId) => getOpenAppIframe(context.wm, appId),
    });
    if (disposed || sequence !== renderSequence) return;
    apps = nextApps;
    renderSyncCenter(list, summaryEl, apps);
    renderBackupCenter(backupList, backupExportButton, apps, backupSelection, backupMode);
    renderRestoreCenter(restoreList, restoreRunButton, restoreUnified, apps, restoreSelection, restoreModes);
    list.classList.remove('is-loading');
    refreshButton?.removeAttribute('disabled');
    if (syncAllButton) syncAllButton.disabled = !apps.some((app) => app.canSync);
  };

  const scheduleRefresh = () => {
    [100, 1_500, 5_000].forEach((delay) => {
      const timer = setTimeout(() => {
        refreshTimers.delete(timer);
        if (!disposed) void refresh();
      }, delay);
      refreshTimers.add(timer);
    });
  };

  const handleClick = async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.act === 'sync-refresh') {
      await refresh();
      return;
    }
    if (button.dataset.act === 'restore-file') {
      restoreFileInput?.click();
      return;
    }
    if (button.dataset.act === 'restore-unlock') {
      try {
        restorePassword = restorePasswordInput?.value || '';
        const unlocked = await unlockBackupFile(restoreParsed, restorePassword);
        restoreUnified = unlocked.unified;
        initializeRestoreSelection(restoreUnified, restoreSelection, restoreModes);
        restoreUnlock?.classList.add('is-hidden');
        if (restorePasswordInput) restorePasswordInput.value = '';
        renderRestoreCenter(restoreList, restoreRunButton, restoreUnified, apps, restoreSelection, restoreModes);
        toast.success('Backup desbloqueado.');
      } catch (error) {
        restorePassword = '';
        toast.error(error?.message || 'Nao foi possivel desbloquear o backup.');
      }
      return;
    }
    if (button.dataset.openApp) {
      context.wm?.open(button.dataset.openApp);
      scheduleRefresh();
      return;
    }
    if (button.dataset.backupMode) {
      backupMode = button.dataset.backupMode === 'protected' ? 'protected' : 'plain';
      host.querySelectorAll('[data-backup-mode]').forEach((modeButton) => {
        modeButton.classList.toggle('is-active', modeButton === button);
      });
      backupPasswords?.classList.toggle('is-hidden', backupMode !== 'protected');
      renderBackupCenter(backupList, backupExportButton, apps, backupSelection, backupMode);
      if (backupMode === 'protected') backupPassword?.focus();
      return;
    }
    if (button.dataset.syncApp) {
      await runAppSync(button.dataset.syncApp, button, refresh, context.wm);
      return;
    }
    if (button.dataset.act === 'sync-all') {
      button.disabled = true;
      const targets = apps.filter((app) => app.canSync);
      const results = await Promise.allSettled(targets.map((app) => syncCenterApp(appDataHost, app.appId, {
        iframe: getOpenAppIframe(context.wm, app.appId),
      })));
      const completed = results.filter((result) => result.status === 'fulfilled' && result.value?.ok !== false).length;
      if (completed === targets.length) toast.success(`${completed} aplicativo(s) sincronizado(s).`);
      else toast.error(`${targets.length - completed} sincronizacao(oes) nao foram concluidas.`);
      await refresh();
      button.disabled = false;
      return;
    }
    if (button.dataset.act === 'backup-export') {
      await exportSelectedBackup(button, apps, backupSelection, context.wm, {
        mode: backupMode,
        passwordInput: backupPassword,
        confirmationInput: backupPasswordConfirm,
      });
      return;
    }
    if (button.dataset.act === 'restore-run') {
      await runSelectedRestore({
        button,
        unified: restoreUnified,
        encrypted: restoreEncrypted,
        password: restorePassword,
        apps,
        selection: restoreSelection,
        modes: restoreModes,
        wm: context.wm,
        refresh,
        onSuccess: resetRestoreState,
      });
    }
  };

  const handleChange = async (event) => {
    if (event.target === restoreFileInput) {
      const file = restoreFileInput.files?.[0];
      if (!file) return;
      try {
        if (file.size > 100 * 1024 * 1024) throw createViewError('file-too-large', 'O arquivo excede o limite de 100 MB.');
        restoreParsed = parseBackupFile(await file.text());
        restoreEncrypted = restoreParsed.encrypted;
        restorePassword = '';
        restoreUnified = null;
        restoreSelection.clear();
        restoreModes.clear();
        if (restoreFileName) restoreFileName.textContent = file.name;
        if (restoreEncrypted) {
          restoreUnlock?.classList.remove('is-hidden');
          restorePasswordInput?.focus();
        } else {
          const unlocked = await unlockBackupFile(restoreParsed, '');
          restoreUnified = unlocked.unified;
          initializeRestoreSelection(restoreUnified, restoreSelection, restoreModes);
          restoreUnlock?.classList.add('is-hidden');
        }
        renderRestoreCenter(restoreList, restoreRunButton, restoreUnified, apps, restoreSelection, restoreModes);
      } catch (error) {
        resetRestoreState();
        toast.error(error?.message || 'Nao foi possivel ler o arquivo.');
      }
      return;
    }
    const checkbox = event.target.closest('[data-backup-app]');
    if (checkbox) {
      if (checkbox.checked) backupSelection.add(checkbox.dataset.backupApp);
      else backupSelection.delete(checkbox.dataset.backupApp);
      updateBackupExportButton(backupExportButton, apps, backupSelection, backupMode);
      return;
    }
    const restoreCheckbox = event.target.closest('[data-restore-app]');
    if (restoreCheckbox) {
      if (restoreCheckbox.checked) restoreSelection.add(restoreCheckbox.dataset.restoreApp);
      else restoreSelection.delete(restoreCheckbox.dataset.restoreApp);
      updateRestoreButton(restoreRunButton, restoreUnified, apps, restoreSelection);
      return;
    }
    const restoreMode = event.target.closest('[data-restore-mode]');
    if (restoreMode) restoreModes.set(restoreMode.dataset.restoreMode, restoreMode.value);
  };

  const resetRestoreState = () => {
    restoreParsed = null;
    restoreUnified = null;
    restoreEncrypted = false;
    restorePassword = '';
    restoreSelection.clear();
    restoreModes.clear();
    if (restoreFileInput) restoreFileInput.value = '';
    if (restoreFileName) restoreFileName.textContent = 'Nenhum arquivo selecionado';
    if (restorePasswordInput) restorePasswordInput.value = '';
    restoreUnlock?.classList.add('is-hidden');
    renderRestoreCenter(restoreList, restoreRunButton, null, apps, restoreSelection, restoreModes);
  };

  host.addEventListener('click', handleClick);
  host.addEventListener('change', handleChange);
  const unsubscribeHost = appDataHost.subscribe(scheduleRefresh);
  const interval = setInterval(refresh, 30_000);
  void refresh();

  return () => {
    disposed = true;
    clearInterval(interval);
    refreshTimers.forEach(clearTimeout);
    refreshTimers.clear();
    unsubscribeHost();
    host.removeEventListener('click', handleClick);
    host.removeEventListener('change', handleChange);
  };
}

async function runAppSync(appId, button, refresh, wm) {
  button.disabled = true;
  try {
    const result = await syncCenterApp(appDataHost, appId, {
      iframe: getOpenAppIframe(wm, appId),
    });
    if (result?.ok === false) {
      toast.error('A sincronizacao nao esta disponivel neste momento.');
    } else {
      toast.success('Sincronizacao concluida.');
    }
  } catch (error) {
    console.warn(`[sync-center] failed to sync ${appId}`, error);
    toast.error('Nao foi possivel sincronizar o aplicativo.');
  } finally {
    await refresh();
    button.disabled = false;
  }
}

function getOpenAppIframe(wm, appId) {
  const appWindow = wm?.list?.().find((win) => win.appId === appId);
  return appWindow?.contentEl?.querySelector?.('iframe') || null;
}

async function exportSelectedBackup(button, apps, selection, wm, options) {
  const selectedApps = apps.filter((app) => isBackupAvailable(app, options.mode) && selection.has(app.appId));
  if (selectedApps.length === 0) {
    toast.error('Selecione ao menos um aplicativo disponivel.');
    return;
  }
  button.disabled = true;
  button.textContent = 'Preparando...';
  try {
    const requestOptions = { resolveIframe: (appId) => getOpenAppIframe(wm, appId) };
    let result;
    if (options.mode === 'protected') {
      const password = options.passwordInput?.value || '';
      const confirmation = options.confirmationInput?.value || '';
      if (password !== confirmation) {
        options.confirmationInput?.focus();
        throw createViewError('password-mismatch', 'As senhas nao conferem.');
      }
      const encrypted = await collectEncryptedBackup(appDataHost, selectedApps, password, requestOptions);
      result = downloadEncryptedBackup(encrypted);
      if (options.passwordInput) options.passwordInput.value = '';
      if (options.confirmationInput) options.confirmationInput.value = '';
    } else {
      const backup = await collectUnifiedBackup(appDataHost, selectedApps, requestOptions);
      const validation = await validateUnifiedBackupPackage(backup);
      if (!validation.ok) throw new Error(validation.errors.join(' '));
      result = downloadUnifiedBackup(backup);
    }
    toast.success(`Backup exportado: ${formatBytes(result.byteLength)}.`);
  } catch (error) {
    console.warn('[sync-center] unified backup failed', error);
    const message = {
      'financial-data-requires-encryption': 'Dados financeiros exigem um backup com senha.',
      'invalid-backup-password': error?.message,
      'password-mismatch': error?.message,
    }[error?.code] || 'Nao foi possivel exportar o backup unificado.';
    toast.error(message);
  } finally {
    button.textContent = options.mode === 'protected' ? 'Exportar backup protegido' : 'Exportar backup';
    updateBackupExportButton(button, apps, selection, options.mode);
  }
}

function renderBackupCenter(list, button, apps, selection, mode) {
  if (!list) return;
  list.innerHTML = apps.map((app) => {
    const financial = app.financial || app.capabilities?.backup?.containsFinancialData === true;
    const available = isBackupAvailable(app, mode);
    const detail = financial && mode !== 'protected'
      ? 'Selecione Com senha para incluir dados financeiros.'
      : available ? `${app.capabilities.backup.format} - schema ${app.capabilities.backup.schemaVersion}`
        : 'Abra o aplicativo para disponibilizar o backup.';
    const state = financial && mode !== 'protected' ? 'Protegido' : available ? 'Disponivel' : 'Indisponivel';
    return `
      <label class="backup-item ${available ? '' : 'is-unavailable'}">
        <input type="checkbox" class="backup-toggle" data-backup-app="${escapeHTML(app.appId)}"
          ${selection.has(app.appId) && available ? 'checked' : ''} ${available ? '' : 'disabled'} />
        <span class="backup-meta">
          <span class="backup-title">${escapeHTML(app.name)}</span>
          <span class="backup-detail">${escapeHTML(detail)}</span>
        </span>
        <span class="backup-state ${available ? 'is-ready' : ''}">${escapeHTML(state)}</span>
      </label>`;
  }).join('');
  if (button) button.textContent = mode === 'protected' ? 'Exportar backup protegido' : 'Exportar backup';
  updateBackupExportButton(button, apps, selection, mode);
}

function updateBackupExportButton(button, apps, selection, mode) {
  if (!button) return;
  button.disabled = !apps.some((app) => isBackupAvailable(app, mode) && selection.has(app.appId));
}

function isBackupAvailable(app, mode) {
  const financial = app.financial || app.capabilities?.backup?.containsFinancialData === true;
  return Boolean(
    app.capabilities?.backup
    && (mode === 'protected' || !financial)
    && app.capabilities.actions?.includes('backup-export')
  );
}

function createViewError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function runSelectedRestore(options) {
  if (!options.unified) {
    toast.error('Selecione e valide um arquivo de backup.');
    return;
  }
  const selections = options.unified.apps
    .filter((entry) => options.selection.has(entry.appId))
    .map((entry) => {
      const app = options.apps.find((candidate) => candidate.appId === entry.appId);
      return {
        appId: entry.appId,
        mode: options.modes.get(entry.appId) || 'merge',
        capabilities: app?.capabilities,
      };
    });
  if (selections.length === 0 || selections.some((selection) => !isRestoreAvailable(selection.appId, options.unified, options.apps))) {
    toast.error('Abra ou desmarque os aplicativos indisponiveis.');
    return;
  }

  const replaceCount = selections.filter((selection) => selection.mode === 'replace').length;
  const confirmed = await confirmModal({
    title: 'Restaurar backup?',
    message: `${selections.length} aplicativo(s) serao restaurado(s). ${replaceCount} usarao substituicao. Um backup preventivo sera baixado antes da primeira alteracao.`,
    okText: 'Restaurar',
    danger: replaceCount > 0,
  });
  if (!confirmed) return;

  options.button.disabled = true;
  options.button.textContent = 'Restaurando...';
  try {
    const result = await restoreBackupPackage(appDataHost, options.unified, selections, {
      resolveIframe: (appId) => getOpenAppIframe(options.wm, appId),
      recoveryPassword: options.password,
      forceEncryptedRecovery: options.encrypted,
      saveRecoveryBackup: async (recovery) => {
        const fileName = createRecoveryFileName(recovery.encrypted);
        return recovery.encrypted
          ? downloadEncryptedBackup(recovery.backup, { fileName })
          : downloadUnifiedBackup(recovery.backup, { fileName });
      },
    });
    toast.success(`${result.restored.length} aplicativo(s) restaurado(s).`);
    options.onSuccess?.();
    await options.refresh();
  } catch (error) {
    console.warn('[sync-center] restore failed', error);
    const cause = String(error?.cause?.message || '').trim();
    const message = {
      'restore-failed-rolled-back': `${error.message}${cause ? ` Motivo: ${cause}` : ''}`,
      'restore-failed-rollback-incomplete': `${error.message} Preserve o arquivo preventivo.${cause ? ` Motivo inicial: ${cause}` : ''}`,
      'recovery-backup-required': 'O backup preventivo nao pode ser salvo.',
    }[error?.code] || error?.message || 'Nao foi possivel restaurar o backup.';
    toast.error(message);
  } finally {
    options.button.textContent = 'Restaurar selecionados';
    updateRestoreButton(options.button, options.unified, options.apps, options.selection);
  }
}

function initializeRestoreSelection(unified, selection, modes) {
  selection.clear();
  modes.clear();
  unified.apps.forEach((entry) => {
    selection.add(entry.appId);
    modes.set(entry.appId, 'merge');
  });
}

function renderRestoreCenter(list, button, unified, apps, selection, modes) {
  if (!list) return;
  if (!unified) {
    list.innerHTML = '<div class="restore-empty">Selecione um arquivo de backup.</div>';
    if (button) button.disabled = true;
    return;
  }
  list.innerHTML = unified.apps.map((entry) => {
    const app = apps.find((candidate) => candidate.appId === entry.appId);
    const available = isRestoreAvailable(entry.appId, unified, apps);
    const name = app?.name || entry.appId;
    const mode = modes.get(entry.appId) || 'merge';
    return `
      <div class="restore-item ${available ? '' : 'is-unavailable'}">
        <input type="checkbox" class="backup-toggle" data-restore-app="${escapeHTML(entry.appId)}"
          ${selection.has(entry.appId) ? 'checked' : ''} aria-label="Restaurar ${escapeHTML(name)}" />
        <span class="backup-meta">
          <span class="backup-title">${escapeHTML(name)}</span>
          <span class="backup-detail">${escapeHTML(entry.format)} - schema ${escapeHTML(entry.schemaVersion)}</span>
        </span>
        <select class="restore-mode" data-restore-mode="${escapeHTML(entry.appId)}" ${available ? '' : 'disabled'} aria-label="Modo de restauracao de ${escapeHTML(name)}">
          <option value="merge" ${mode === 'merge' ? 'selected' : ''}>Mesclar</option>
          <option value="replace" ${mode === 'replace' ? 'selected' : ''}>Substituir</option>
        </select>
        ${available
          ? '<span class="restore-status is-ready">Disponivel</span>'
          : app?.canOpen
            ? `<button type="button" class="btn" data-open-app="${escapeHTML(entry.appId)}">Abrir</button>`
            : '<span class="restore-status">Indisponivel</span>'}
      </div>`;
  }).join('');
  updateRestoreButton(button, unified, apps, selection);
}

function updateRestoreButton(button, unified, apps, selection) {
  if (!button || !unified) {
    if (button) button.disabled = true;
    return;
  }
  const selectedIds = unified.apps.filter((entry) => selection.has(entry.appId)).map((entry) => entry.appId);
  button.disabled = selectedIds.length === 0
    || selectedIds.some((appId) => !isRestoreAvailable(appId, unified, apps));
}

function isRestoreAvailable(appId, unified, apps) {
  const entry = unified?.apps?.find((candidate) => candidate.appId === appId);
  const app = apps.find((candidate) => candidate.appId === appId);
  return Boolean(
    entry
    && app?.capabilities?.backup
    && app.capabilities.actions?.includes('backup-import')
    && app.capabilities.backup.format === entry.format
    && app.capabilities.backup.schemaVersion >= entry.schemaVersion
  );
}

function createRecoveryFileName(encrypted) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '');
  return `mathicx-recovery-before-restore-${encrypted ? 'protected-' : ''}${stamp}.json`;
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderSyncCenter(list, summaryEl, apps) {
  const summary = summarizeSyncCenter(apps);
  summaryEl.innerHTML = `
    <span><strong>${summary.synced}</strong> sincronizado(s)</span>
    <span><strong>${summary.attention}</strong> requer atencao</span>
    <span><strong>${summary.closed}</strong> fechado(s)</span>`;

  list.innerHTML = apps.map((app) => `
    <div class="sync-item" data-sync-id="${escapeHTML(app.appId)}">
      <div class="sync-app-icon" aria-hidden="true">${escapeHTML(app.shortName)}</div>
      <div class="sync-meta">
        <div class="sync-title-line">
          <span class="sync-title">${escapeHTML(app.name)}</span>
          <span class="sync-status" data-tone="${escapeHTML(app.tone)}">${escapeHTML(app.statusLabel)}</span>
        </div>
        <div class="sync-message">${escapeHTML(app.message)}</div>
        ${app.lastSyncedAt ? `<div class="sync-time">Ultima sincronizacao: ${escapeHTML(formatSyncTime(app.lastSyncedAt))}</div>` : ''}
      </div>
      <div class="sync-actions">
        ${app.canSync ? `<button type="button" class="icon-btn" data-sync-app="${escapeHTML(app.appId)}" title="Sincronizar agora" aria-label="Sincronizar ${escapeHTML(app.name)} agora">&#8635;</button>` : ''}
        ${app.state === 'closed' && app.canOpen ? `<button type="button" class="btn" data-open-app="${escapeHTML(app.appId)}">Abrir</button>` : ''}
      </div>
    </div>`).join('');
}

function formatSyncTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'horario indisponivel';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function renderWidgetList(list) {
  const order = getWidgetOrder();
  const hidden = store.get('widgets') || {};

  list.innerHTML = order.map((widgetId, index) => {
    const def = WIDGET_DEFS.find((widget) => widget.id === widgetId);
    if (!def) return '';
    const enabled = hidden[widgetId] !== true;
    const description = WIDGET_DESCRIPTIONS[widgetId] || 'Widget da tela inicial.';
    return `
      <div class="widget-item ${enabled ? '' : 'is-disabled'}" data-widget-id="${escapeHTML(widgetId)}">
        <input class="widget-toggle" type="checkbox" data-widget-toggle="${escapeHTML(widgetId)}" ${enabled ? 'checked' : ''} aria-label="Mostrar ${escapeHTML(def.title)}" />
        <div class="widget-meta">
          <div class="widget-title"><span class="ico">${escapeHTML(def.icon)}</span><span>${escapeHTML(def.title)}</span></div>
          <div class="widget-desc">${escapeHTML(description)}</div>
        </div>
        <div class="widget-actions">
          <button type="button" class="icon-btn" data-widget-id="${escapeHTML(widgetId)}" data-widget-move="-1" ${index === 0 ? 'disabled' : ''} title="Mover para cima">&uarr;</button>
          <button type="button" class="icon-btn" data-widget-id="${escapeHTML(widgetId)}" data-widget-move="1" ${index === order.length - 1 ? 'disabled' : ''} title="Mover para baixo">&darr;</button>
        </div>
      </div>`;
  }).join('');
}

function moveWidget(widgetId, direction) {
  const order = getWidgetOrder();
  const index = order.indexOf(widgetId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= order.length) return;

  const nextOrder = [...order];
  [nextOrder[index], nextOrder[target]] = [nextOrder[target], nextOrder[index]];
  store.set('widgetLayout', nextOrder);
}

function getWidgetOrder() {
  const knownIds = WIDGET_DEFS.map((widget) => widget.id);
  const savedLayout = store.get('widgetLayout');
  const savedOrder = Array.isArray(savedLayout) ? savedLayout.filter((id) => knownIds.includes(id)) : [];
  const missing = knownIds.filter((id) => !savedOrder.includes(id));
  return savedOrder.length ? [...savedOrder, ...missing] : knownIds;
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
