/**
 * mathicx-file · auth/firebase-auth-provider.js
 * Parallel Firebase Auth provider for migration Phase 2.
 *
 * This module is intentionally not wired into the kernel yet. Phase 3 will
 * decide when `authMode: "firebase"` becomes the desktop gate.
 */

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';

import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';

import { initFirebase } from '../firebase/firebase-client.js';
import { USER_ACCESS_STATUS, USER_ROLES, firestorePaths } from '../firebase/firestore-paths.js';
import { hasAdminClaim, roleFromClaims } from './firebase-claims.js';

const SCHEMA_VERSION = 1;

class FirebaseAuthProvider {
  constructor() {
    this._services = null;
    this._current = null;
    this._readyPromise = null;
    this._unsubAuth = null;
    this._listeners = new Set();
  }

  async ready() {
    if (this._readyPromise) return this._readyPromise;

    this._readyPromise = this._init().then(({ auth }) => new Promise((resolve) => {
      this._unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
        this._current = firebaseUser
          ? await this._buildSession(firebaseUser, { touchLogin: false })
          : null;

        this._emit(this._current);
        resolve(this._current);
      });
    }));

    return this._readyPromise;
  }

  async restoreSession({ forceRefresh = true } = {}) {
    await this.ready();

    const { auth } = await this._init();
    if (!auth.currentUser) {
      this._current = null;
      this._emit(null);
      return false;
    }

    this._current = await this._buildSession(auth.currentUser, {
      forceServerProfile: forceRefresh,
      forceTokenRefresh: forceRefresh,
      touchLogin: false,
    });
    this._emit(this._current);
    return !!this._current;
  }

  async register({ nome, displayName, email, senha, password }) {
    const name = (displayName || nome || '').trim();
    const mail = (email || '').trim().toLowerCase();
    const pass = password || senha;
    const validation = _validateCredentials({ name, email: mail, password: pass });
    if (validation) return { ok: false, error: validation };

    try {
      const { auth } = await this._init();
      const credential = await createUserWithEmailAndPassword(auth, mail, pass);

      if (name) {
        await updateProfile(credential.user, { displayName: name });
      }

      const session = await this._ensureUserProfile(credential.user, {
        displayName: name,
        createPendingProfile: true,
        touchLogin: true,
      });

      return {
        ok: true,
        user: session.user,
        pendente: session.user.accessStatus === USER_ACCESS_STATUS.PENDING,
      };
    } catch (err) {
      return { ok: false, error: _friendlyFirebaseError(err) };
    }
  }

  async login(email, senha) {
    const mail = (email || '').trim().toLowerCase();
    const pass = senha || '';
    if (!mail || !pass) return { ok: false, error: 'Informe e-mail e senha.' };

    try {
      const { auth } = await this._init();
      const credential = await signInWithEmailAndPassword(auth, mail, pass);
      const session = await this._buildSession(credential.user, { touchLogin: true });
      this._current = session;
      this._emit(session);

      return {
        ok: true,
        user: session.user,
        pendente: session.user.accessStatus === USER_ACCESS_STATUS.PENDING,
      };
    } catch (err) {
      return { ok: false, error: _friendlyFirebaseError(err) };
    }
  }

  async logout() {
    const { auth } = await this._init();
    const previous = this._current;
    await signOut(auth);
    this._current = null;
    this._emit(null, previous);
  }

  getCurrentUser() {
    return this._current?.user ?? null;
  }

  isAuthenticated() {
    return !!this._current?.firebaseUser;
  }

  isApproved() {
    return this.isAdmin()
      || this.getCurrentUser()?.accessStatus === USER_ACCESS_STATUS.APPROVED;
  }

  isAdmin() {
    return hasAdminClaim(this._current?.claims);
  }

  requireAdmin() {
    if (!this.isAdmin()) throw new Error('Permissao negada: requer admin claim.');
  }

  async listUsers() {
    this.requireAdmin();
    const { firestore } = await this._init();
    const snapshot = await getDocs(collection(firestore, 'users'));
    return snapshot.docs
      .map((item) => _normalizeManagedProfile(item.id, item.data()))
      .sort((left, right) => left.nome.localeCompare(right.nome, 'pt-BR'));
  }

  async pendingUsers() {
    return (await this.listUsers()).filter((user) => (
      user.accessStatus === USER_ACCESS_STATUS.PENDING
    ));
  }

  async approveUser(uid) {
    return this.setStatus(uid, USER_ACCESS_STATUS.APPROVED);
  }

  async rejectUser(uid) {
    return this.setStatus(uid, USER_ACCESS_STATUS.REJECTED);
  }

  async setStatus(uid, status) {
    this.requireAdmin();
    const accessStatus = _toAccessStatus(status);
    const { firestore } = await this._init();
    const userRef = doc(firestore, firestorePaths.user(uid));
    await updateDoc(userRef, { accessStatus, updatedAt: serverTimestamp() });
    return _normalizeManagedProfile(uid, (await getDoc(userRef)).data());
  }

  async setPerfil() {
    throw new Error('Papeis Firebase so podem ser alterados pelo script administrativo confiavel.');
  }

  async deleteUser() {
    throw new Error('Exclusao de contas Firebase exige uma operacao administrativa dedicada.');
  }

  onAuthChange(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  dispose() {
    this._unsubAuth?.();
    this._unsubAuth = null;
    this._listeners.clear();
    this._readyPromise = null;
    this._current = null;
  }

  async _init() {
    if (this._services) return this._services;
    this._services = await initFirebase({ force: true });
    return this._services;
  }

  async _buildSession(firebaseUser, {
    forceServerProfile = false,
    forceTokenRefresh = false,
    touchLogin = false,
  } = {}) {
    const session = await this._ensureUserProfile(firebaseUser, {
      displayName: firebaseUser.displayName || '',
      createPendingProfile: false,
      forceServerProfile,
      forceTokenRefresh,
      touchLogin,
    });
    return session;
  }

  async _ensureUserProfile(firebaseUser, {
    displayName = '',
    createPendingProfile = false,
    forceServerProfile = false,
    forceTokenRefresh = false,
    touchLogin = false,
  } = {}) {
    const { firestore } = await this._init();
    const userRef = doc(firestore, firestorePaths.user(firebaseUser.uid));
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      if (!createPendingProfile) {
        await setDoc(userRef, _newPendingProfile(firebaseUser, displayName));
      } else {
        await setDoc(userRef, _newPendingProfile(firebaseUser, displayName));
      }
    } else if (touchLogin) {
      await updateDoc(userRef, {
        displayName: displayName || firebaseUser.displayName || snap.data().displayName || '',
        photoURL: firebaseUser.photoURL || snap.data().photoURL || '',
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });
    }

    const refreshed = forceServerProfile ? await getDocFromServer(userRef) : await getDoc(userRef);
    const profile = refreshed.exists() ? refreshed.data() : _newPendingProfile(firebaseUser, displayName);
    const token = await firebaseUser.getIdTokenResult(forceTokenRefresh);
    const normalizedUser = _normalizeUser(firebaseUser, profile, token.claims);

    return {
      firebaseUser,
      user: normalizedUser,
      claims: token.claims,
      session: {
        uid: firebaseUser.uid,
        provider: 'firebase',
        accessStatus: normalizedUser.accessStatus,
      },
    };
  }

  _emit(current, previous = null) {
    this._listeners.forEach((listener) => {
      try {
        listener(current, previous);
      } catch (err) {
        console.error('[firebase-auth-provider] listener failed:', err);
      }
    });
  }
}

function _newPendingProfile(firebaseUser, displayName) {
  return {
    uid: firebaseUser.uid,
    displayName: displayName || firebaseUser.displayName || '',
    email: firebaseUser.email || '',
    photoURL: firebaseUser.photoURL || '',
    accessStatus: USER_ACCESS_STATUS.PENDING,
    role: USER_ROLES.USER,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    schemaVersion: SCHEMA_VERSION,
  };
}

function _normalizeUser(firebaseUser, profile, claims) {
  const role = roleFromClaims(claims);
  return {
    id: firebaseUser.uid,
    uid: firebaseUser.uid,
    nome: profile.displayName || firebaseUser.displayName || firebaseUser.email || 'Usuario',
    displayName: profile.displayName || firebaseUser.displayName || '',
    email: profile.email || firebaseUser.email || '',
    avatar: (profile.displayName || firebaseUser.email || 'U').trim().charAt(0).toUpperCase(),
    photoURL: profile.photoURL || firebaseUser.photoURL || '',
    perfil: role,
    role,
    accessStatus: profile.accessStatus || USER_ACCESS_STATUS.PENDING,
    schemaVersion: profile.schemaVersion || SCHEMA_VERSION,
    provider: 'firebase',
  };
}

function _normalizeManagedProfile(uid, profile = {}) {
  const accessStatus = profile.accessStatus || USER_ACCESS_STATUS.PENDING;
  const statusMap = {
    [USER_ACCESS_STATUS.PENDING]: 'pendente',
    [USER_ACCESS_STATUS.APPROVED]: 'ativo',
    [USER_ACCESS_STATUS.REJECTED]: 'bloqueado',
  };
  const displayName = profile.displayName || profile.email || 'Usuario';
  return {
    id: uid,
    uid,
    nome: displayName,
    displayName,
    email: profile.email || '',
    username: '',
    avatar: displayName.trim().charAt(0).toUpperCase() || 'U',
    perfil: profile.role === USER_ROLES.ADMIN ? USER_ROLES.ADMIN : USER_ROLES.USER,
    role: profile.role === USER_ROLES.ADMIN ? USER_ROLES.ADMIN : USER_ROLES.USER,
    status: statusMap[accessStatus] || 'pendente',
    accessStatus,
    provider: 'firebase',
  };
}

function _toAccessStatus(status) {
  const aliases = {
    ativo: USER_ACCESS_STATUS.APPROVED,
    bloqueado: USER_ACCESS_STATUS.REJECTED,
    pendente: USER_ACCESS_STATUS.PENDING,
  };
  const normalized = aliases[status] || status;
  if (!Object.values(USER_ACCESS_STATUS).includes(normalized)) {
    throw new Error(`Status Firebase invalido: ${status}`);
  }
  return normalized;
}

function _validateCredentials({ name, email, password }) {
  if (!name || name.length < 2) return 'Nome muito curto.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) return 'E-mail invalido.';
  if (!password || password.length < 6) return 'Senha precisa de 6+ caracteres.';
  return '';
}

function _friendlyFirebaseError(err) {
  const code = err?.code || '';
  const map = {
    'auth/email-already-in-use': 'E-mail ja cadastrado.',
    'auth/invalid-email': 'E-mail invalido.',
    'auth/invalid-credential': 'Credenciais invalidas.',
    'auth/user-disabled': 'Conta desativada.',
    'auth/user-not-found': 'Credenciais invalidas.',
    'auth/wrong-password': 'Credenciais invalidas.',
    'auth/weak-password': 'Senha precisa ser mais forte.',
    'permission-denied': 'Permissao negada pelo Firestore.',
  };

  return map[code] || err?.message || 'Falha na autenticacao Firebase.';
}

export const firebaseAuthProvider = new FirebaseAuthProvider();
export { FirebaseAuthProvider };
