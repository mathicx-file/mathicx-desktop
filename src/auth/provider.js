/**
 * mathicx-file · auth/provider.js
 * Provider de autenticação — espelha FsProvider (src/explorer/fs-store.js).
 *
 * Responsabilidades: registro, login, logout, gestão de sessão,
 * validação de permissões e queries de estatísticas.
 *
 * Sessão atual: store.set('session', { userId, ... }) | null.
 */

import { db } from '../storage/indexeddb.js';
import { store } from '../core/state.js';
import { bus, EVT } from '../core/event-bus.js';
import { uid, norm } from '../core/utils.js';
import { hashPassword, verifyPassword } from './crypto.js';
import { featureFlags } from '../firebase/feature-flags.js';

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;   // 7 dias

const usersStore    = () => db.store('users');
const sessionsStore = () => db.store('sessions');
const statsStore    = () => db.store('stats');

class AuthProvider {
  constructor() {
    this._current = null;   // { user, session }
  }

  /** True se há sessão válida no store. */
  isAuthenticated() {
    const s = store.get('session');
    return !!(s && s.userId && (!s.expiresAt || s.expiresAt > Date.now()));
  }

  getCurrentUser() { return this._current?.user ?? null; }
  isAdmin() { return this._current?.user?.perfil === 'admin'; }
  requireAdmin() {
    if (!this.isAdmin()) throw new Error('Permissão negada: requer admin');
  }

  /** Há usuários cadastrados? (decide setup do 1º admin vs login) */
  async hasUsers() {
    return (await usersStore().all()).length > 0;
  }

  /** Busca usuário por username OU email (case/accento insensitive). */
  async findByLogin(login) {
    const q = norm(login);
    const all = await usersStore().all();
    return all.find((u) => norm(u.username) === q || norm(u.email) === q) ?? null;
  }

  /**
   * Cadastra novo usuário.
   * @returns {Promise<{ok: true, user}> | {ok: false, error}}
   */
  async register({ nome, username, email, senha, perfil = 'user' }) {
    // Validações
    const errs = _validateRegister({ nome, username, email, senha });
    if (errs.length) return { ok: false, error: errs.join(' ') };

    // E-mail/username duplicados (índices garantiriam lookup rápido)
    if (await this.findByLogin(username)) return { ok: false, error: 'Nome de usuário já existe.' };
    if (await this.findByLogin(email))    return { ok: false, error: 'E-mail já cadastrado.' };

    const { hash, salt, iterations } = await hashPassword(senha);
    const isSetup = perfil === 'admin';
    const user = {
      id: uid('usr'),
      nome: nome.trim(),
      username: username.trim(),
      email: email.trim().toLowerCase(),
      senha_hash: hash,
      salt,
      iterations,
      perfil,
      status: isSetup ? 'ativo' : 'pendente',
      avatar: nome.trim().charAt(0).toUpperCase() || '👤',
      data_criacao: Date.now(),
      ultimo_acesso: null,
    };
    await usersStore().put(user);
    bus.emit(EVT.USER_REGISTER, user);
    return { ok: true, user, pendente: !isSetup };
  }

  /**
   * Autentica e cria sessão.
   * @returns {Promise<{ok: true}> | {ok: false, error}>
   */
  async login(login, senha) {
    const user = await this.findByLogin(login);
    if (!user) return { ok: false, error: 'Credenciais inválidas.' };
    if (user.status === 'bloqueado') return { ok: false, error: 'Conta bloqueada.' };
    if (user.status === 'pendente') return { ok: false, error: 'Conta pendente de aprovação do administrador.' };

    const valid = await verifyPassword(senha, user.senha_hash, user.salt, user.iterations);
    if (!valid) return { ok: false, error: 'Credenciais inválidas.' };

    // Atualiza último acesso + cria sessão
    user.ultimo_acesso = Date.now();
    await usersStore().put(user);

    const session = {
      key: uid('ses'),
      userId: user.id,
      login_at: Date.now(),
      logout_at: null,
      duracao: null,
      expiresAt: Date.now() + SESSION_TTL,
    };
    await sessionsStore().put(session);

    // Registra stat de login
    await this._logStat({ userId: user.id, type: 'login' });

    // Sessão atual no store reativo + em memória
    store.set('session', { key: session.key, userId: user.id, expiresAt: session.expiresAt });
    this._current = { user, session };

    bus.emit(EVT.USER_LOGIN, { user, session });
    bus.emit(EVT.AUTH_CHANGE, this._current);
    return { ok: true };
  }

  /** Encerra sessão atual. */
  async logout() {
    const s = store.get('session');
    if (s) {
      const session = await sessionsStore().get(s.key);
      if (session) {
        session.logout_at = Date.now();
        session.duracao = session.logout_at - session.login_at;
        await sessionsStore().put(session);
      }
      await this._logStat({ userId: s.userId, type: 'logout' });
    }
    store.set('session', null);
    const prev = this._current?.user ?? null;
    this._current = null;
    bus.emit(EVT.USER_LOGOUT, prev);
    bus.emit(EVT.AUTH_CHANGE, null);
  }

  /** Restaura sessão ao reabrir o app (se ainda válida e não expirada). */
  async restoreSession() {
    const s = store.get('session');
    if (!s || (s.expiresAt && s.expiresAt <= Date.now())) {
      store.set('session', null);
      return false;
    }
    const user = await usersStore().get(s.userId);
    if (!user || user.status === 'bloqueado' || user.status === 'pendente') {
      store.set('session', null);
      return false;
    }
    const session = await sessionsStore().get(s.key);
    this._current = { user, session };
    bus.emit(EVT.AUTH_CHANGE, this._current);
    return true;
  }

  // ── ADMIN: gestão de usuários ──────────────────────────

  async listUsers() { return usersStore().all(); }

  async updateUser(id, patch) {
    this.requireAdmin();
    const user = await usersStore().get(id);
    if (!user) return null;
    Object.assign(user, patch);
    await usersStore().put(user);
    bus.emit(EVT.USER_UPDATE, user);
    return user;
  }

  async setStatus(id, status) {  // 'ativo' | 'bloqueado' | 'pendente'
    return this.updateUser(id, { status });
  }

  /** Usuários pendentes de aprovação. */
  async pendingUsers() {
    return usersStore().all({ filter: (u) => u.status === 'pendente' });
  }

  /** Aprova um usuário pendente. */
  async approveUser(id) {
    return this.setStatus(id, 'ativo');
  }

  async setPerfil(id, perfil) {  // 'admin' | 'user'
    return this.updateUser(id, { perfil });
  }

  async deleteUser(id) {
    this.requireAdmin();
    await usersStore().delete(id);
    // Opcional: limpar stats do usuário
  }

  // ── STATS ──────────────────────────────────────────────

  /** Loga um evento de uso (interno). */
  async _logStat({ userId, type, app = null, duracao = null }) {
    await statsStore().put({
      id: uid('stat'),
      userId, type, app, duracao,
      ts: Date.now(),
    });
  }

  /** Apps mais usados (global ou por usuário). */
  async topApps({ userId = null, limit = 5 } = {}) {
    const filter = userId ? (s) => s.userId === userId && s.type === 'app_open' : (s) => s.type === 'app_open';
    const all = await statsStore().all({ filter });
    const counts = all.reduce((acc, s) => {
      acc[s.app] = (acc[s.app] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([app, n]) => ({ app, count: n }));
  }

  /** Logins agrupados por dia { dia: 'YYYY-MM-DD', count }. */
  async loginsByDay(days = 7) {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const all = await statsStore().all({ filter: (s) => s.type === 'login' && s.ts >= since });
    const buckets = {};
    all.forEach((s) => {
      const d = new Date(s.ts).toISOString().slice(0, 10);
      buckets[d] = (buckets[d] || 0) + 1;
    });
    return Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b))
      .map(([dia, count]) => ({ dia, count }));
  }

  /** Tempo médio de sessão (ms). */
  async avgSessionDuration() {
    const all = await sessionsStore().all({ filter: (s) => s.duracao != null });
    if (!all.length) return 0;
    return all.reduce((a, s) => a + s.duracao, 0) / all.length;
  }
}

function _validateRegister({ nome, username, email, senha }) {
  const errs = [];
  if (!nome || nome.trim().length < 2) errs.push('Nome muito curto.');
  if (!username || username.trim().length < 3) errs.push('Usuário precisa de 3+ caracteres.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) errs.push('E-mail inválido.');
  if (!senha || senha.length < 6) errs.push('Senha precisa de 6+ caracteres.');
  return errs;
}

export const localAuthProvider = new AuthProvider();

class AuthProviderFacade {
  constructor() {
    this._firebaseProviderPromise = null;
    this._firebaseProviderInstance = null;
  }

  get mode() {
    return featureFlags.authMode === 'firebase' ? 'firebase' : 'local';
  }

  get isFirebaseMode() {
    return this.mode === 'firebase';
  }

  async _firebaseProvider() {
    if (!this._firebaseProviderPromise) {
      this._firebaseProviderPromise = import('./firebase-auth-provider.js')
        .then((mod) => {
          this._firebaseProviderInstance = mod.firebaseAuthProvider;
          return mod.firebaseAuthProvider;
        });
    }
    return this._firebaseProviderPromise;
  }

  _local() {
    return localAuthProvider;
  }

  async _activeAsync() {
    return this.isFirebaseMode ? this._firebaseProvider() : this._local();
  }

  _activeSync() {
    return this.isFirebaseMode ? this._firebaseProviderInstance : this._local();
  }

  async ready() {
    const provider = await this._activeAsync();
    return provider.ready?.() ?? true;
  }

  async hasUsers() {
    if (this.isFirebaseMode) return true;
    return this._local().hasUsers();
  }

  async restoreSession() {
    const provider = await this._activeAsync();
    const restored = await provider.restoreSession();
    if (!this.isFirebaseMode) return restored;
    const canEnter = restored && provider.isApproved?.() === true;
    if (canEnter) {
      bus.emit(EVT.AUTH_CHANGE, { user: provider.getCurrentUser(), session: { provider: 'firebase' } });
    }
    return canEnter;
  }

  async register(payload) {
    const provider = await this._activeAsync();
    const result = await provider.register(payload);
    if (this.isFirebaseMode && result.ok) {
      bus.emit(EVT.USER_REGISTER, result.user);
      bus.emit(EVT.AUTH_CHANGE, { user: result.user, session: { provider: 'firebase' } });
    }
    return result;
  }

  async login(login, senha) {
    const provider = await this._activeAsync();
    const result = await provider.login(login, senha);
    if (this.isFirebaseMode && result.ok) {
      bus.emit(EVT.USER_LOGIN, { user: result.user, session: { provider: 'firebase' } });
      bus.emit(EVT.AUTH_CHANGE, { user: result.user, session: { provider: 'firebase' } });
    }
    return result;
  }

  async logout() {
    const provider = await this._activeAsync();
    const previous = provider.getCurrentUser?.() ?? null;
    const result = await provider.logout();
    if (this.isFirebaseMode) {
      bus.emit(EVT.USER_LOGOUT, previous);
      bus.emit(EVT.AUTH_CHANGE, null);
    }
    return result;
  }

  getCurrentUser() {
    const provider = this._activeSync();
    if (provider) return provider.getCurrentUser();
    return null;
  }

  async getCurrentUserAsync() {
    const provider = await this._activeAsync();
    return provider.getCurrentUser();
  }

  isAuthenticated() {
    const provider = this._activeSync();
    return provider ? provider.isAuthenticated() : false;
  }

  async isAuthenticatedAsync() {
    const provider = await this._activeAsync();
    return provider.isAuthenticated();
  }

  isApproved() {
    if (!this.isFirebaseMode) return true;
    return this._firebaseProviderInstance?.isApproved() === true;
  }

  async isApprovedAsync() {
    if (!this.isFirebaseMode) return true;
    const provider = await this._firebaseProvider();
    return provider.isApproved();
  }

  isAdmin() {
    const provider = this._activeSync();
    return provider ? provider.isAdmin() : false;
  }

  requireAdmin() {
    const provider = this._activeSync();
    if (provider) return provider.requireAdmin();
    throw new Error('Permissao negada: requer admin');
  }

  async pendingUsers() {
    if (this.isFirebaseMode) return [];
    return this._local().pendingUsers();
  }

  async listUsers() {
    if (this.isFirebaseMode) return [];
    return this._local().listUsers();
  }

  async approveUser(id) {
    if (this.isFirebaseMode) throw new Error('Aprovacao Firebase deve ser feita pelo Console nesta fase.');
    return this._local().approveUser(id);
  }

  async setStatus(id, status) {
    if (this.isFirebaseMode) throw new Error('Gestao Firebase remota indisponivel nesta fase.');
    return this._local().setStatus(id, status);
  }

  async setPerfil(id, perfil) {
    if (this.isFirebaseMode) throw new Error('Admin Firebase requer custom claims.');
    return this._local().setPerfil(id, perfil);
  }

  async deleteUser(id) {
    if (this.isFirebaseMode) throw new Error('Gestao Firebase remota indisponivel nesta fase.');
    return this._local().deleteUser(id);
  }

  async topApps(options) {
    if (this.isFirebaseMode) return [];
    return this._local().topApps(options);
  }

  async loginsByDay(days) {
    if (this.isFirebaseMode) return [];
    return this._local().loginsByDay(days);
  }

  async avgSessionDuration() {
    if (this.isFirebaseMode) return 0;
    return this._local().avgSessionDuration();
  }

  async _logStat(payload) {
    if (this.isFirebaseMode) return;
    return this._local()._logStat(payload);
  }
}

export const authProvider = new AuthProviderFacade();
