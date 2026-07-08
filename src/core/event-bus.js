/**
 * mathicx-file · core/event-bus.js
 * Pub/sub desacoplado entre módulos. Substitui referências diretas
 * (desktop ⇄ window-manager ⇄ launcher ⇄ explorer) reduzindo acoplamento.
 *
 * Desenho KISS: um mapa de tópicos → Set de listeners.
 */

class EventBus {
  constructor() {
    this._topics = new Map();
  }

  on(topic, handler) {
    if (!this._topics.has(topic)) this._topics.set(topic, new Set());
    this._topics.get(topic).add(handler);
    /** Retorna função de cancelamento (unsubscribe). */
    return () => this.off(topic, handler);
  }

  off(topic, handler) {
    this._topics.get(topic)?.delete(handler);
  }

  /** Emite um evento; handlers recebem (payload, topic). */
  emit(topic, payload) {
    const handlers = this._topics.get(topic);
    if (!handlers) return;
    for (const fn of handlers) {
      try {
        fn(payload, topic);
      } catch (err) {
        // Falha de um handler não quebra os demais.
        console.error(`[event-bus] erro em "${topic}":`, err);
      }
    }
  }

  /** Limpa todos os listeners (útil em testes/reset). */
  clear() {
    this._topics.clear();
  }
}

/** Singleton compartilhado por toda a aplicação. */
export const bus = new EventBus();

/** Catálogo central de nomes de eventos — evita "magic strings". */
export const EVT = Object.freeze({
  // Ciclo de vida de janelas
  WINDOW_OPEN: 'window:open',
  WINDOW_CLOSE: 'window:close',
  WINDOW_FOCUS: 'window:focus',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_RESTORE: 'window:restore',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_MOVE: 'window:move',
  WINDOW_SNAP: 'window:snap',

  // Launcher / busca
  LAUNCHER_TOGGLE: 'launcher:toggle',
  LAUNCHER_OPEN: 'launcher:open',
  LAUNCHER_CLOSE: 'launcher:close',
  SEARCH_QUERY: 'search:query',

  // Apps
  APP_LAUNCH: 'app:launch',
  APP_ACTION: 'app:action',
  APP_INSTALLED: 'app:installed',

  // Atalhos / desktop
  SHORTCUT_CREATE: 'shortcut:create',
  SHORTCUT_UPDATE: 'shortcut:update',
  SHORTCUT_DELETE: 'shortcut:delete',
  SHORTCUT_REORDER: 'shortcut:reorder',
  DESKTOP_REFRESH: 'desktop:refresh',

  // Widgets
  WIDGET_TOGGLE: 'widget:toggle',
  WIDGET_REORDER: 'widget:reorder',
  WIDGET_UPDATE: 'widget:update',

  // Explorer / filesystem
  FS_CHANGE: 'fs:change',
  FAVORITE_TOGGLE: 'favorite:toggle',

  // Tema
  THEME_CHANGE: 'theme:change',

  // Atalhos de teclado
  HOTKEY: 'hotkey',

  // Auth
  AUTH_REQUIRED: 'auth:required',
  AUTH_CHANGE:   'auth:change',     // payload: { user, session } | null
  USER_LOGIN:    'user:login',      // payload: { user, session }
  USER_LOGOUT:   'user:logout',
  USER_REGISTER: 'user:register',
  USER_UPDATE:   'user:update',     // admin edita perfil/status

  // Estado geral
  NOTIFICATION: 'notification',
  ACTIVITY_LOG: 'activity:log',
});
