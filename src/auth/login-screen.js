/**
 * mathicx-file · auth/login-screen.js
 * Login/setup screen for local auth and Firebase auth modes.
 */

import { toast } from '../ui/toast.js';

const REMEMBER_LOGIN_KEY = 'mathicx.auth.rememberedLogin';

const CSS = `
.mx-auth {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg); padding: var(--sp-6);
}
.mx-auth-card {
  width: min(420px, 100%);
  background: var(--glass-bg); backdrop-filter: blur(28px);
  border: 1px solid var(--border-soft); border-radius: var(--r-xl);
  box-shadow: var(--shadow-lg); padding: var(--sp-8);
}
.mx-auth .mx-logo {
  width: 56px; height: 56px; border-radius: var(--r-lg);
  background: var(--brand-grad); margin: 0 auto var(--sp-4);
  display: flex; align-items: center; justify-content: center;
  font-size: 28px; color: #fff;
}
.mx-auth h1 { text-align: center; font-size: 20px; color: var(--text-strong); }
.mx-auth .subtitle { text-align: center; font-size: 12px; color: var(--muted); margin-bottom: var(--sp-6); }
.mx-auth .field { margin-bottom: var(--sp-4); }
.mx-auth label { display: block; font-size: 11px; font-weight: 700; color: var(--muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: .05em; }
.mx-auth input {
  width: 100%; padding: 11px 14px; box-sizing: border-box;
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--r-md); color: var(--text); font-size: 14px;
}
.mx-auth input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.mx-auth .remember-field {
  display: flex; align-items: center; gap: 8px; margin: -4px 0 var(--sp-3);
}
.mx-auth .remember-field input {
  width: 16px; height: 16px; padding: 0; margin: 0; accent-color: var(--accent);
}
.mx-auth .remember-field label {
  margin: 0; text-transform: none; letter-spacing: 0; font-size: 12px; color: var(--text);
}
.mx-auth .btn-auth {
  width: 100%; padding: 12px; margin-top: var(--sp-2);
  background: var(--brand-grad); color: #fff; border: none;
  border-radius: var(--r-md); font-size: 14px; font-weight: 700;
  cursor: pointer; transition: transform var(--t-fast);
}
.mx-auth .btn-auth:hover { transform: translateY(-1px); }
.mx-auth .btn-auth:disabled { opacity: .6; cursor: wait; }
.mx-auth .guest-divider { display:flex; align-items:center; gap:10px; margin:var(--sp-4) 0 var(--sp-2); color:var(--muted); font-size:10px; }
.mx-auth .guest-divider::before, .mx-auth .guest-divider::after { content:''; flex:1; height:1px; background:var(--border-soft); }
.mx-auth .btn-guest {
  width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:var(--r-md);
  background:var(--surface-2); color:var(--text); font-size:12px; font-weight:700; cursor:pointer;
}
.mx-auth .btn-guest:hover { background:var(--surface-hover); }
.mx-auth .btn-guest:disabled { opacity:.6; cursor:wait; }
.mx-auth .switch { text-align: center; margin-top: var(--sp-4); font-size: 12px; color: var(--muted); }
.mx-auth .switch button { background: none; border: none; color: var(--accent); font-weight: 700; cursor: pointer; }
`;

export class LoginScreen {
  constructor({ auth, onAuthenticated, initialMode = null }) {
    this.auth = auth;
    this.onAuthenticated = onAuthenticated;
    this._initialMode = initialMode;
    this._el = null;
    this._mode = 'login';
  }

  async mount(host) {
    this._injectStyle();
    this._mode = this._initialMode || ((await this.auth.hasUsers()) ? 'login' : 'setup');
    this._el = document.createElement('div');
    this._el.className = 'mx-auth';
    this._render();
    host.appendChild(this._el);
  }

  unmount() {
    this._el?.remove();
  }

  _injectStyle() {
    if (document.getElementById('mx-auth-style')) return;
    const style = document.createElement('style');
    style.id = 'mx-auth-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  _render() {
    const isFirebase = this.auth.isFirebaseMode === true;
    const isPending = this._mode === 'pending';
    const isLogin = this._mode === 'login';
    const isSetup = this._mode === 'setup';
    const title = isPending
      ? 'Aguardando aprovacao'
      : (isLogin ? 'Bem-vindo' : (isSetup ? 'Configurar administrador' : 'Criar conta'));
    const subtitle = isPending
      ? 'Sua conta foi criada e precisa ser liberada pelo proprietario.'
      : (isLogin ? 'Entre para acessar seu desktop' : (isSetup ? 'Crie a primeira conta de administrador' : 'Preencha seus dados'));

    this._el.innerHTML = `
      <div class="mx-auth-card">
        <div class="mx-logo">MF</div>
        <h1>${title}</h1>
        <p class="subtitle">${subtitle}</p>
        ${isPending ? this._pendingHTML() : this._formHTML({ isFirebase, isLogin, isSetup })}
      </div>`;

    this._attach();
  }

  _pendingHTML() {
    return `
      <div class="switch" style="line-height:1.6;margin-top:0;">
        O acesso ao desktop sera habilitado quando seu perfil estiver aprovado.
      </div>
      <button type="button" class="btn-auth" data-act="check-approval">Verificar aprovacao</button>
      <div class="switch"><button data-act="logout">Sair desta conta</button></div>`;
  }

  _formHTML({ isFirebase, isLogin, isSetup }) {
    const rememberedLogin = isLogin ? this._getRememberedLogin() : '';
    return `
      <form data-el="form">
        ${!isLogin ? `
          <div class="field"><label>Nome completo</label><input data-f="nome" type="text" placeholder="Seu nome"></div>
          ${isFirebase ? '' : '<div class="field"><label>Usuario</label><input data-f="username" type="text" placeholder="usuario"></div>'}
          <div class="field"><label>E-mail</label><input data-f="email" type="email" placeholder="voce@email.com"></div>
        ` : `
          <div class="field"><label>${isFirebase ? 'E-mail' : 'Usuario ou e-mail'}</label><input data-f="login" type="${isFirebase ? 'email' : 'text'}" placeholder="${isFirebase ? 'voce@email.com' : 'usuario ou voce@email.com'}" value="${escapeAttr(rememberedLogin)}" autofocus></div>
        `}
        <div class="field"><label>Senha</label><input data-f="senha" type="password" placeholder="********"></div>
        ${isLogin ? `
          <div class="remember-field">
            <input data-f="remember" id="mx-auth-remember" type="checkbox" ${rememberedLogin ? 'checked' : ''}>
            <label for="mx-auth-remember">Lembre de mim</label>
          </div>` : ''}
        <button type="submit" class="btn-auth">${isLogin ? 'Entrar' : 'Criar e entrar'}</button>
      </form>
      ${isLogin ? '<div class="switch">Ainda nao tem conta? <button data-act="go-register">Criar agora</button></div>' : ''}
      ${!isLogin && !isSetup ? '<div class="switch"><button data-act="go-login">Voltar ao login</button></div>' : ''}
      ${isFirebase ? '<div class="guest-divider">ou</div><button type="button" class="btn-guest" data-act="enter-guest">Continuar como visitante</button>' : ''}`;
  }

  _attach() {
    this._el.querySelector('[data-act="check-approval"]')?.addEventListener('click', async () => {
      const restored = await this.auth.restoreSession();
      if (restored) {
        toast.success('Acesso aprovado.');
        this.onAuthenticated?.();
        return;
      }
      toast.error('A conta ainda esta aguardando aprovacao.');
    });

    this._el.querySelector('[data-act="logout"]')?.addEventListener('click', async () => {
      await this.auth.logout();
      this._mode = 'login';
      this._render();
    });

    const form = this._el.querySelector('[data-el="form"]');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('.btn-auth');
      const get = (key) => form.querySelector(`[data-f="${key}"]`)?.value.trim() ?? '';

      button.disabled = true;
      button.textContent = 'Aguarde...';

      try {
        if (this._mode === 'login') {
          await this._submitLogin(get, form);
        } else {
          await this._submitRegister(get);
        }
      } finally {
        button.disabled = false;
        button.textContent = this._mode === 'login' ? 'Entrar' : 'Criar e entrar';
      }
    });

    this._el.querySelector('[data-act="go-register"]')?.addEventListener('click', () => {
      this._mode = 'register';
      this._render();
    });

    this._el.querySelector('[data-act="go-login"]')?.addEventListener('click', () => {
      this._mode = 'login';
      this._render();
    });

    this._el.querySelector('[data-act="enter-guest"]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const result = await this.auth.enterGuest?.();
        if (!result?.ok) {
          toast.error(result?.error || 'Nao foi possivel iniciar o modo visitante.');
          return;
        }
        toast.success('Sessao visitante iniciada.');
        this.onAuthenticated?.();
      } finally {
        button.disabled = false;
      }
    });
  }

  async _submitLogin(get, form) {
    const login = get('login');
    const result = await this.auth.login(login, get('senha'));
    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    this._persistRememberedLogin(form, login);

    if (result.pendente || (await this.auth.isApprovedAsync?.()) === false) {
      toast.success('Login realizado. Aguarde aprovacao do proprietario.');
      this._mode = 'pending';
      this._render();
      return;
    }

    toast.success('Bem-vindo!');
    this.onAuthenticated?.();
  }

  async _submitRegister(get) {
    const result = await this.auth.register({
      nome: get('nome'),
      username: get('username'),
      email: get('email'),
      senha: get('senha'),
      perfil: this._mode === 'setup' ? 'admin' : 'user',
    });

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    if (result.pendente) {
      toast.success('Conta criada! Aguarde aprovacao do proprietario.');
      this._mode = this.auth.isFirebaseMode ? 'pending' : 'login';
      this._render();
      return;
    }

    const loginResult = await this.auth.login(get('email'), get('senha'));
    if (!loginResult.ok) {
      toast.error(loginResult.error);
      return;
    }

    toast.success('Conta criada!');
    this.onAuthenticated?.();
  }

  _getRememberedLogin() {
    try {
      return localStorage.getItem(REMEMBER_LOGIN_KEY) || '';
    } catch {
      return '';
    }
  }

  _persistRememberedLogin(form, login) {
    const remember = form?.querySelector('[data-f="remember"]')?.checked === true;
    try {
      if (remember && login) {
        localStorage.setItem(REMEMBER_LOGIN_KEY, login);
      } else {
        localStorage.removeItem(REMEMBER_LOGIN_KEY);
      }
    } catch {
      // Ignora ambientes com armazenamento bloqueado.
    }
  }
}

function escapeAttr(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
