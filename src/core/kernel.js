/**
 * mathicx-file · core/kernel.js
 * Orquestrador central da aplicação.
 *
 * Responsabilidade única (SRP): coordenar a inicialização e a ordem
 * de boot dos subsistemas (storage → state → theme → wm → desktop →
 * launcher → explorer → apps). Cada subsistema é auto-contido; o kernel
 * apenas instancia e ordena.
 *
 * Exposto como singleton `app` acessível de qualquer módulo via import.
 */

import { bus, EVT } from './event-bus.js';
import { store } from './state.js';
import { shortcuts } from './shortcuts.js';
import { ls } from '../storage/local-storage.js';
import { db } from '../storage/indexeddb.js';
import { themeManager } from '../themes/theme-manager.js';
import { WindowManager } from '../window-manager/manager.js';
import { Desktop } from '../desktop/desktop.js';
import { Launcher } from '../launcher/launcher.js';
import { Taskbar } from '../launcher/taskbar.js';
import { appRegistry, canonicalAppId } from '../apps/registry.js';
import { explorerProvider } from '../explorer/fs-store.js';
import { toast } from '../ui/toast.js';
import { authProvider } from '../auth/provider.js';
import { LoginScreen } from '../auth/login-screen.js';
import { desktopSync } from '../data/desktop/desktop-sync.js';

class Kernel {
  constructor() {
    this.bus = bus;
    this.store = store;
    this.shortcuts = shortcuts;
    this.ls = ls;
    this.db = db;
    /** Subsistemas inicializados na ordem de boot. */
    this.modules = {};
    this._booted = false;
  }

  async boot() {
    if (this._booted) return;
    this._booted = true;

    // 1. Storage + estado (precisa para ler usuários/sessões)
    await db.open();
    await this._hydrateState();

    // 2. AUTH GATE ─────────────────────────────────────────
    await this._authGate();
  }

  async _authGate() {
    // Tenta restaurar sessão existente (remember me)
    const restored = await authProvider.restoreSession();
    if (restored) {
      await this._bootDesktop();
      return;
    }

    // Sem sessão → mostra login (ou setup do 1º admin)
    const authenticated = await authProvider.isAuthenticatedAsync?.();
    const approved = await authProvider.isApprovedAsync?.();
    const initialMode = authenticated && !approved ? 'pending' : undefined;

    const loginScreen = new LoginScreen({
      auth: authProvider,
      initialMode,
      onAuthenticated: () => {
        loginScreen.unmount();
        this._bootDesktop();
      },
    });
    loginScreen.mount(document.getElementById('app'));
  }

  async _bootDesktop() {
    this._hydrateScopedDesktopState();
    await desktopSync.init();

    // Tema (antes de renderizar UI)
    themeManager.init();

    // Apps registry (carrega metadados; views permanecem lazy)
    appRegistry.registerAll();

    // Window Manager (depende de storage)
    this.modules.wm = new WindowManager({ bus, store });
    this.modules.wm.init();

    // Desktop + Widgets + Dashboard
    this.modules.desktop = new Desktop({ bus, store });
    this.modules.desktop.init();

    // Launcher + Taskbar
    this.modules.taskbar = new Taskbar({ bus, store, wm: this.modules.wm });
    this.modules.taskbar.init();
    this.modules.launcher = new Launcher({ bus, store, wm: this.modules.wm });
    this.modules.launcher.init();

    // Explorer provider hidrata FS na primeira execução
    await explorerProvider.seed();

    // Atalhos de teclado globais
    this._registerHotkeys();

    // Reage a mudanças de FS para atualizar busca global
    bus.on(EVT.FS_CHANGE, () => bus.emit(EVT.DESKTOP_REFRESH));

    // Conecta bus events para launcher e dashboard
    bus.on(EVT.LAUNCHER_TOGGLE, () => this.modules.launcher?.toggle());
    bus.on(EVT.LAUNCHER_OPEN, () => this.modules.launcher?.open());
    bus.on(EVT.LAUNCHER_CLOSE, () => this.modules.launcher?.close());
    bus.on('dashboard:toggle', () => this.modules.desktop?.toggleDashboard());

    // Fecha launcher ao clicar fora
    document.addEventListener('pointerdown', (e) => {
      const launcher = document.getElementById('launcher');
      if (!launcher || launcher.classList.contains('is-hidden')) return;
      if (e.target.closest('#launcher') || e.target.closest('[data-act="start"]')) return;
      this.modules.launcher?.close();
    });

    bus.emit(EVT.ACTIVITY_LOG, { icon: '🚀', label: 'mathicx-file iniciado', ts: Date.now() });
    console.info('[mathicx-file] boot completo');

    // Hook de rastreamento de uso (Fase 5)
    this._wireUsageTracking();
  }

  /** Rastreia abertura/fechamento de apps e persiste activity log. */
  _wireUsageTracking() {
    const openAt = new Map();   // appId -> timestamp

    this.bus.on(EVT.WINDOW_OPEN, ({ appId }) => {
      openAt.set(appId, Date.now());
      const userId = authProvider.getCurrentUser()?.id;
      if (userId) authProvider._logStat({ userId, type: 'app_open', app: appId });
    });

    this.bus.on(EVT.WINDOW_CLOSE, ({ appId }) => {
      const start = openAt.get(appId);
      if (start) {
        const duracao = Date.now() - start;
        openAt.delete(appId);
        const userId = authProvider.getCurrentUser()?.id;
        if (userId) authProvider._logStat({ userId, type: 'app_close', app: appId, duracao });
      }
    });

    // Logout registra duração da sessão (já em provider.logout())
    this.bus.on(EVT.USER_LOGOUT, () => {
      openAt.clear();
      this._clearScopedDesktopState();
    });

    // Notifica admin sobre pendentes ao logar
    this.bus.on(EVT.AUTH_CHANGE, async (payload) => {
      if (!payload?.user || payload.user.perfil !== 'admin') return;
      const pendentes = await authProvider.pendingUsers();
      if (pendentes.length) {
        toast.warn(`🟡 ${pendentes.length} usuário(s) pendente(s) de aprovação`);
        this.bus.emit(EVT.NOTIFICATION);
      }
    });
  }

  /** Carrega preferências e dados leves do LocalStorage para o store. */
  async _hydrateState() {
    const prefs = ls.get('prefs', {});
    store.set({
      theme: prefs.theme ?? 'dark',
      widgets: prefs.widgets ?? null, // null = default
      widgetLayout: prefs.widgetLayout ?? null,
      shortcuts: this._normalizeShortcuts(prefs.shortcuts),
      favorites: this._normalizeAppIds(ls.get('favorites', [])),
      recents: [],
      usage: {},
      pinned: this._normalizeAppIds(ls.get('pinned', [])),
      activity: [],
    });

    // Persistência: ao mudar prefs relevantes, salva.
    const persistPrefs = () => {
      const s = store.get();
      ls.set('prefs', {
        theme: s.theme,
        widgets: s.widgets,
        widgetLayout: s.widgetLayout,
        shortcuts: s.shortcuts,
      });
    };
    ['theme', 'widgets', 'widgetLayout', 'shortcuts'].forEach((k) =>
      store.subscribe(k, persistPrefs)
    );
    ['favorites', 'pinned'].forEach((k) =>
      store.subscribe(k, () => ls.set(k, store.get(k)))
    );
    this._wireScopedDesktopPersistence();
  }

  // Estado local do dashboard e launcher é persistido por usuário autenticado.
  _wireScopedDesktopPersistence() {
    ['activity', 'recents', 'usage'].forEach((key) =>
      this.store.subscribe(key, () => {
        this.ls.set(this._scopedDesktopKey(key), this.store.get(key));
      })
    );
  }

  _hydrateScopedDesktopState() {
    const usage = ls.get(this._scopedDesktopKey('usage'), {});
    store.set({
      activity: ls.get(this._scopedDesktopKey('activity'), []),
      recents: this._normalizeAppIds(ls.get(this._scopedDesktopKey('recents'), [])),
      usage: this._normalizeUsage(usage),
    });
  }

  _normalizeAppIds(items) {
    return [...new Set(
      (Array.isArray(items) ? items : []).map(canonicalAppId).filter(Boolean)
    )];
  }

  _normalizeShortcuts(shortcuts) {
    if (!Array.isArray(shortcuts)) return shortcuts ?? null;
    return shortcuts.map((shortcut) => (
      shortcut?.appId
        ? { ...shortcut, appId: canonicalAppId(shortcut.appId) }
        : shortcut
    ));
  }

  _normalizeUsage(usage) {
    if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return {};
    return Object.entries(usage).reduce((result, [appId, count]) => {
      const canonicalId = canonicalAppId(appId);
      result[canonicalId] = (result[canonicalId] || 0) + (Number(count) || 0);
      return result;
    }, {});
  }

  _clearScopedDesktopState() {
    store.set({
      activity: [],
      recents: [],
      usage: {},
    });
  }

  _scopedDesktopKey(key) {
    return `${key}:${this._currentUserScope()}`;
  }

  _currentUserScope() {
    const user = authProvider.getCurrentUser?.();
    return user?.uid || user?.id || 'local';
  }

  _registerHotkeys() {
    // Meta (Win/Cmd) + tecla — padrão de SO
    shortcuts.register('mod+e', (e) => { e.preventDefault(); this.modules.launcher.toggle(); }, { id: 'launcher' });
    shortcuts.register('mod+l', (e) => { e.preventDefault(); themeManager.cycle(); }, { id: 'theme' });
    shortcuts.register('mod+d', (e) => { e.preventDefault(); this.modules.desktop.toggleDashboard(); }, { id: 'dashboard' });
    shortcuts.register('escape', () => this.modules.launcher.close());
    // Win+Z → snap (simulado por mod+z)
    shortcuts.register('mod+shift+z', (e) => {
      e.preventDefault();
      const focused = this.modules.wm.getFocused();
      if (focused) this.modules.wm.snap.showLayoutsFor(focused.id);
    }, { id: 'snap-layouts' });
    // Alt+Tab simples (fecha janela focada via mod+w)
    shortcuts.register('mod+w', (e) => {
      e.preventDefault();
      const focused = this.modules.wm.getFocused();
      if (focused) this.modules.wm.close(focused.id);
    }, { id: 'close-window' });
  }

  /** Helper conveniente para abrir um app pelo id. */
  launchApp(appId, opts) {
    return this.modules.wm.open(appId, opts);
  }
}

/** Singleton da aplicação. */
export const app = new Kernel();
