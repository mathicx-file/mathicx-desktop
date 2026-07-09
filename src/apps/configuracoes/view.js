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
@media (max-width: 560px) {
  .mxc-set .tabs { overflow-x:auto; }
  .mxc-set .row { align-items:flex-start; flex-direction:column; }
  .mxc-set .widget-item { grid-template-columns:auto 1fr; }
  .mxc-set .widget-actions { grid-column:2; }
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

export function mount(host) {
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
