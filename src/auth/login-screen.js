/**
 * mathicx-file · auth/login-screen.js
 * Tela de login / setup do 1º admin. Full-screen, usa tokens do design system.
 *
 * Fluxo:
 *   - Se NÃO há usuários → modo "setup": cadastra o 1º admin.
 *   - Senão → modo "login": username/email + senha + botão "criar conta".
 */
import { toast } from '../ui/toast.js';
import { authProvider } from './provider.js';
import { ICONS } from '../ui/components.js';

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
.mx-auth .btn-auth {
  width: 100%; padding: 12px; margin-top: var(--sp-2);
  background: var(--brand-grad); color: #fff; border: none;
  border-radius: var(--r-md); font-size: 14px; font-weight: 700;
  cursor: pointer; transition: transform var(--t-fast);
}
.mx-auth .btn-auth:hover { transform: translateY(-1px); }
.mx-auth .btn-auth:disabled { opacity: .6; cursor: wait; }
.mx-auth .switch { text-align: center; margin-top: var(--sp-4); font-size: 12px; color: var(--muted); }
.mx-auth .switch button { background: none; border: none; color: var(--accent); font-weight: 700; cursor: pointer; }
`;

export class LoginScreen {
  constructor({ auth, onAuthenticated }) {
    this.auth = auth;
    this.onAuthenticated = onAuthenticated;
    this._el = null;
    this._mode = 'login';   // 'login' | 'setup' | 'register'
  }

  async mount(host) {
    this._injectStyle();
    this._mode = (await this.auth.hasUsers()) ? 'login' : 'setup';
    this._el = document.createElement('div');
    this._el.className = 'mx-auth';
    this._render();
    host.appendChild(this._el);
  }

  unmount() { this._el?.remove(); }

  _injectStyle() {
    if (document.getElementById('mx-auth-style')) return;
    const s = document.createElement('style');
    s.id = 'mx-auth-style'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  _render() {
    const isLogin = this._mode === 'login';
    const isSetup = this._mode === 'setup';
    const title = isLogin ? 'Bem-vindo' : (isSetup ? 'Configurar administrador' : 'Criar conta');
    const subtitle = isLogin ? 'Entre para acessar seu desktop' : (isSetup ? 'Crie a primeira conta de administrador' : 'Preencha seus dados');

    this._el.innerHTML = `
      <div class="mx-auth-card">
        <div class="mx-logo">📁</div>
        <h1>${title}</h1>
        <p class="subtitle">${subtitle}</p>
        <form data-el="form">
          ${!isLogin ? `
            <div class="field"><label>Nome completo</label><input data-f="nome" type="text" placeholder="Seu nome"></div>
            <div class="field"><label>Usuário</label><input data-f="username" type="text" placeholder="usuario"></div>
            <div class="field"><label>E-mail</label><input data-f="email" type="email" placeholder="voce@email.com"></div>
          ` : `
            <div class="field"><label>Usuário ou e-mail</label><input data-f="login" type="text" placeholder="usuario ou voce@email.com" autofocus></div>
          `}
          <div class="field"><label>Senha</label><input data-f="senha" type="password" placeholder="••••••••"></div>
          <button type="submit" class="btn-auth">${isLogin ? 'Entrar' : 'Criar e entrar'}</button>
        </form>
        ${isLogin ? `<div class="switch">Ainda não tem conta? <button data-act="go-register">Criar agora</button></div>` : ''}
        ${!isLogin && !isSetup ? `<div class="switch"><button data-act="go-login">Voltar ao login</button></div>` : ''}
      </div>`;

    this._attach();
  }

  _attach() {
    const form = this._el.querySelector('[data-el="form"]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('.btn-auth');
      const get = (k) => form.querySelector(`[data-f="${k}"]`).value.trim();

      btn.disabled = true;
      btn.textContent = 'Aguarde…';

      try {
        if (this._mode === 'login') {
          const res = await this.auth.login(get('login'), get('senha'));
          if (!res.ok) { toast.error(res.error); return; }
          toast.success('Bem-vindo!');
          this.onAuthenticated?.();
        } else {
          const res = await this.auth.register({
            nome: get('nome'), username: get('username'),
            email: get('email'), senha: get('senha'),
            perfil: this._mode === 'setup' ? 'admin' : 'user',
          });
          if (!res.ok) { toast.error(res.error); return; }
          if (res.pendente) {
            toast.success('Conta criada! Aguarde aprovação do administrador.');
            this._mode = 'login';
            this._render();
            return;
          }
          // Setup do 1º admin: loga automaticamente
          const loginRes = await this.auth.login(get('email'), get('senha'));
          if (!loginRes.ok) { toast.error(loginRes.error); return; }
          toast.success('Conta criada!');
          this.onAuthenticated?.();
        }
      } finally {
        btn.disabled = false;
        btn.textContent = this._mode === 'login' ? 'Entrar' : 'Criar e entrar';
      }
    });

    this._el.querySelector('[data-act="go-register"]')?.addEventListener('click', () => {
      this._mode = 'register'; this._render();
    });
    this._el.querySelector('[data-act="go-login"]')?.addEventListener('click', () => {
      this._mode = 'login'; this._render();
    });
  }
}
