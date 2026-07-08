/**
 * mathicx-file · launcher/taskbar.js
 * Barra de tarefas: botão start, apps abertos/fixados, relógio, data,
 * indicador de tema, badge de notificações.
 *
 * Usa event delegation (1 listener para todo o taskbar-apps).
 * Re-renderiza apenas quando há mudanças (via subscrição ao bus).
 */

import { bus, EVT } from '../core/event-bus.js';
import { store } from '../core/state.js';
import { pad2, cap, escapeHTML } from '../core/utils.js';
import { appRegistry } from '../apps/registry.js';
import { themeManager } from '../themes/theme-manager.js';
import { ICONS, LOGO_SVG } from '../ui/components.js';
import * as reg from './registry.js';
import { showContextMenu } from '../ui/context-menu.js';
import { confirmModal } from '../ui/modal.js';
import { authProvider } from '../auth/provider.js';

export class Taskbar {
  constructor({ bus: b = bus, store: s = store, wm } = {}) {
    this.bus = b;
    this.store = s;
    this.wm = wm;
    this._el = null;
    this._clockInterval = null;
    this._notifCount = 0;
  }

  init() {
    const app = document.getElementById('app');
    this._el = document.createElement('div');
    this._el.className = 'taskbar';
    this._el.id = 'taskbar';
    this._el.innerHTML = this._buildHTML();
    app.appendChild(this._el);

    this._initClock();
    this._renderApps();
    this._attachEvents();

    // Re-render quando janelas mudam
    [EVT.WINDOW_OPEN, EVT.WINDOW_CLOSE, EVT.WINDOW_FOCUS,
     EVT.WINDOW_MINIMIZE, EVT.WINDOW_RESTORE, EVT.LAUNCHER_CLOSE].forEach((e) =>
      this.bus.on(e, () => this._renderApps())
    );

    this.bus.on(EVT.LAUNCHER_TOGGLE, () => this._renderApps());
    this.bus.on(EVT.LAUNCHER_OPEN, () => this._renderApps());
    this.bus.on(EVT.LAUNCHER_CLOSE, () => this._renderApps());
    this.bus.on(EVT.THEME_CHANGE, () => this._updateTheme());
    this.bus.on(EVT.NOTIFICATION, () => this._bumpNotif());
    this.bus.on(EVT.AUTH_CHANGE, () => this._updateUser());
    this._updateUser();
  }

  _buildHTML() {
    return `
      <button type="button" class="start-btn" data-act="start">
        ${ICONS.start}<span>Menu</span>
      </button>
      <div class="taskbar-apps" data-el="apps"></div>
      <div class="taskbar-right">
        <button type="button" class="tray-btn tray-user" data-act="user" title="Perfil">
          <span class="tu-avatar" data-el="avatar">👤</span>
        </button>
        <button type="button" class="tray-btn tray-admin" data-act="admin" title="Painel Admin" style="display:none">🛡️</button>
        <button type="button" class="tray-btn" data-act="theme" title="Tema">${themeManager.icon}</button>
        <button type="button" class="tray-btn" data-act="dash" title="Dashboard">📊</button>
        <div class="taskbar-clock-wrap">
          <div class="taskbar-clock" data-el="clock">--:--</div>
          <div class="taskbar-date" data-el="date"></div>
        </div>
      </div>`;
  }

  _initClock() {
    const update = () => {
      const now = new Date();
      this._el.querySelector('[data-el="clock"]').textContent = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
      this._el.querySelector('[data-el="date"]').textContent = cap(
        now.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
      );
    };
    update();
    this._clockInterval = setInterval(update, 1000);
  }

  _attachEvents() {
    // Start button
    this._el.querySelector('[data-act="start"]').addEventListener('click', () => {
      this.bus.emit(EVT.LAUNCHER_TOGGLE);
    });

    // Event delegation: apps abertos
    this._el.querySelector('[data-el="apps"]').addEventListener('click', (e) => {
      const appBtn = e.target.closest('.taskbar-app');
      if (!appBtn) return;
      const id = appBtn.dataset.winId;
      const win = this.wm?.getById(id);
      if (!win) return;
      if (win.minimized) this.wm.restore(id);
      else if (win.focused) this.wm.minimize(id);
      else this.wm.focus(id);
    });

    // Tray buttons
    this._el.querySelector('[data-act="theme"]').addEventListener('click', () => themeManager.cycle());
    this._el.querySelector('[data-act="dash"]').addEventListener('click', () => {
      this.bus.emit('dashboard:toggle');
    });
    this._el.querySelector('[data-act="admin"]')?.addEventListener('click', () => {
      this.wm?.open('admin');
    });

    // User avatar → context menu (posicionado acima do botão)
    this._el.querySelector('[data-act="user"]').addEventListener('click', (e) => {
      e.stopPropagation();
      const user = authProvider.getCurrentUser();
      if (!user) return;
      const rect = this._el.querySelector('[data-act="user"]').getBoundingClientRect();
      const items = [
        { type: 'label', label: `${user.avatar} ${user.nome}` },
        { type: 'separator' },
        { label: '👤 Minha conta', icon: '',
          onSelect: () => this.wm?.open('configuracoes') },
        { type: 'separator' },
        { label: '🚪 Sair', icon: '', danger: true,
          onSelect: () => this._logout() },
      ];
      const taskbarRect = this._el.getBoundingClientRect();
      showContextMenu({ clientX: rect.right, clientY: rect.top }, items);
      const menu = document.querySelector('.context-menu');
      if (menu) {
        const menuRect = menu.getBoundingClientRect();
        const top = taskbarRect.top - menuRect.height - 8;
        const left = rect.right - menuRect.width;
        menu.style.top = Math.max(8, top) + 'px';
        menu.style.left = Math.min(window.innerWidth - menuRect.width - 8, Math.max(8, left)) + 'px';
      }
    });
  }

  async _updateUser() {
    const u = authProvider.getCurrentUser();
    const btn = this._el.querySelector('[data-act="user"]');
    const avatar = this._el.querySelector('[data-el="avatar"]');
    const adminBtn = this._el.querySelector('[data-act="admin"]');
    avatar.textContent = u?.avatar || '👤';
    btn.title = u ? `${u.nome} (${u.perfil})` : 'Perfil';

    // Mostra botão admin apenas para admins
    if (adminBtn) adminBtn.style.display = u?.perfil === 'admin' ? '' : 'none';

    let badge = btn.querySelector('.badge');
    if (u?.perfil === 'admin') {
      const pendentes = await authProvider.pendingUsers();
      if (pendentes.length) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'badge is-pending';
          btn.appendChild(badge);
        }
        badge.textContent = pendentes.length;
        return;
      }
    }
    if (badge) badge.remove();
  }

  async _logout() {
    const ok = await confirmModal({ title: 'Sair', message: 'Encerrar sessão?', okText: 'Sair', danger: true });
    if (!ok) return;
    await authProvider.logout();
    location.reload();
  }

  _renderApps() {
    const wrap = this._el.querySelector('[data-el="apps"]');
    const windows = this.wm?.list() || [];
    const pinned = reg.getPinned();

    // Apps fixados (não abertos)
    const pinnedHTML = pinned
      .filter((appId) => !this.wm?.isOpen(appId))
      .map((appId) => {
        const app = appRegistry.get(appId);
        if (!app) return '';
        return `<button class="taskbar-app is-pinned" data-app-id="${appId}">
          <span class="ta-ico">${app.icon}</span><span class="ta-label">${app.name}</span>
        </button>`;
      }).join('');

    // Apps abertos
    const openHTML = windows.map((w) => {
      const isFocused = w.focused;
      const isMin = w.minimized;
      return `<button class="taskbar-app is-running ${isFocused ? 'is-active' : ''} ${isMin ? 'is-minimized' : ''}" data-win-id="${w.id}">
        <span class="ta-ico">${w.manifest.icon}</span><span class="ta-label">${w.manifest.name}</span>
      </button>`;
    }).join('');

    wrap.innerHTML = pinnedHTML + openHTML;

    // Click em app fixado → abre
    wrap.querySelectorAll('.is-pinned').forEach((btn) => {
      btn.addEventListener('click', () => {
        const appId = btn.dataset.appId;
        this.bus.emit(EVT.APP_LAUNCH, appId);
      });
    });

    // Atualiza estado do start button
    const startBtn = this._el.querySelector('[data-act="start"]');
    startBtn.classList.toggle('is-open', !document.getElementById('launcher')?.classList.contains('is-hidden'));
  }

  _updateTheme() {
    const btn = this._el.querySelector('[data-act="theme"]');
    if (btn) btn.textContent = themeManager.icon;
  }

  _bumpNotif() {
    this._notifCount++;
    const btn = this._el.querySelector('[data-act="theme"]');
    let badge = btn.querySelector('.badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'badge';
      btn.appendChild(badge);
    }
    badge.textContent = this._notifCount;
    setTimeout(() => {
      this._notifCount = 0;
      badge.remove();
    }, 5000);
  }
}
