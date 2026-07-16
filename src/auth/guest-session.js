export const GUEST_SESSION_STORAGE_KEY = 'mathicx.auth.guest-session.v1';
export const GUEST_USER_SCOPE = 'guest-local-v1';

const GUEST_USER = Object.freeze({
  id: GUEST_USER_SCOPE,
  nome: 'Visitante',
  displayName: 'Visitante',
  email: '',
  perfil: 'guest',
  role: 'guest',
  accessStatus: 'local',
  avatar: 'V',
});

export class GuestSession {
  constructor(options = {}) {
    this.storage = options.storage || globalThis.localStorage;
    this.active = false;
  }

  restore() {
    try {
      const value = JSON.parse(this.storage?.getItem(GUEST_SESSION_STORAGE_KEY) || 'null');
      this.active = value?.schemaVersion === 1 && value.active === true;
    } catch {
      this.active = false;
    }
    return this.active;
  }

  enter() {
    this.active = true;
    try {
      this.storage?.setItem(GUEST_SESSION_STORAGE_KEY, JSON.stringify({
        schemaVersion: 1,
        active: true,
      }));
    } catch {
      // A sessao ainda funciona na aba quando o armazenamento esta bloqueado.
    }
    return this.getUser();
  }

  clear() {
    this.active = false;
    try {
      this.storage?.removeItem(GUEST_SESSION_STORAGE_KEY);
    } catch {
      // Ignora ambientes com armazenamento bloqueado.
    }
  }

  getUser() {
    return this.active ? GUEST_USER : null;
  }
}

export const guestSession = new GuestSession();
