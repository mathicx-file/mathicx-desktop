/**
 * Shared iframe host bridge for integrated applications.
 */
import { bus, EVT } from '../../core/event-bus.js';
import { themeManager } from '../../themes/theme-manager.js';

const DEFAULT_SANDBOX = [
  'allow-same-origin',
  'allow-scripts',
  'allow-storage',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
];

export function mountIframeApp(host, options = {}) {
  const {
    appId,
    appPath,
    title,
    className = `mxc-${appId}`,
    styleId = `${className}-style`,
    loadingText = `Carregando ${title || appId}...`,
    errorText = `${title || appId} nao pode ser carregado.`,
    context = {},
    sandbox = DEFAULT_SANDBOX,
    actionType = 'navigate',
    forwardTheme = true,
    onLoad = null,
    onAction = null,
    onHostMessage = null,
  } = options;

  if (!appId || !appPath) {
    throw new Error('mountIframeApp requer appId e appPath.');
  }

  injectIframeStyle({ styleId, className });

  host.innerHTML = `
    <div class="${className}">
      <div class="spinner">${escapeHTML(loadingText)}</div>
    </div>
  `;

  const container = host.querySelector(`.${className}`);
  const appUrl = resolveAppUrl(appPath);
  const iframe = document.createElement('iframe');
  const initialPayload = context.win?.launchOptions?.payload || {};
  const post = (type, payload) => postToIframe(iframe, type, payload);

  iframe.src = appUrl;
  sandbox.forEach((permission) => iframe.sandbox.add(permission));
  iframe.loading = 'lazy';
  iframe.decoding = 'async';
  iframe.importance = 'low';
  iframe.title = title || appId;

  iframe.addEventListener('load', () => {
    container.querySelector('.spinner')?.remove();
    if (forwardTheme) post('theme', getResolvedTheme());
    if (hasPayload(initialPayload)) post(actionType, initialPayload);
    setTimeout(() => {
      if (forwardTheme) post('theme', getResolvedTheme());
      if (hasPayload(initialPayload)) post(actionType, initialPayload);
    }, 250);
    onLoad?.({ iframe, post, initialPayload, appUrl });
  }, { once: true });

  iframe.addEventListener('error', () => {
    container.innerHTML = `
      <div class="${className}">
        <div class="iframe-error">
          <div class="iframe-error-icon">!</div>
          <div class="iframe-error-title">Erro ao carregar</div>
          <div class="iframe-error-message">${escapeHTML(errorText)}</div>
          <div class="iframe-error-path">Verifique se o arquivo existe em: ${escapeHTML(appUrl)}</div>
        </div>
      </div>
    `;
  });

  const unsubscribeTheme = forwardTheme
    ? bus.on(EVT.THEME_CHANGE, ({ resolved, theme } = {}) => {
      post('theme', resolved || theme || getResolvedTheme());
    })
    : null;

  const unsubscribeAction = bus.on(EVT.APP_ACTION, ({ appId: targetAppId, payload } = {}) => {
    if (targetAppId !== appId) return;
    if (onAction) {
      onAction({ iframe, post, payload: payload || {}, appUrl });
      return;
    }
    post(actionType, payload || {});
  });

  const handleHostMessage = (event) => {
    if (event.origin !== window.location.origin) return;
    const message = event.data || {};

    if (onHostMessage?.({ message, iframe, post, appUrl }) === true) return;

    const { type, value, payload } = message;
    if (type === 'theme') {
      post('theme', value ?? payload ?? '');
      return;
    }
    if (type === 'refresh') {
      iframe.src = iframe.src;
      return;
    }
    if (type === 'focus') {
      iframe.contentWindow?.focus();
    }
  };

  window.addEventListener('message', handleHostMessage);
  container.appendChild(iframe);

  return () => {
    window.removeEventListener('message', handleHostMessage);
    unsubscribeTheme?.();
    unsubscribeAction?.();
    try {
      iframe.src = 'about:blank';
      iframe.remove();
    } catch (err) {
      console.warn(`[iframe-app] erro ao desmontar ${appId}:`, err);
    }
  };
}

function injectIframeStyle({ styleId, className }) {
  if (document.getElementById(styleId)) return;
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
.${className} {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--surface);
  overflow: hidden;
}
.${className} .spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--muted);
  font-size: 14px;
  gap: 8px;
}
.${className} .spinner::before {
  content: '';
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid var(--border);
  border-top-color: var(--text);
  border-radius: 50%;
  animation: ${className}-spin 1s linear infinite;
}
@keyframes ${className}-spin {
  to { transform: rotate(360deg); }
}
.${className} iframe {
  flex: 1;
  width: 100%;
  height: 100%;
  border: none;
  background: inherit;
}
.${className} .iframe-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--muted);
  padding: 20px;
  text-align: center;
}
.${className} .iframe-error-icon {
  font-size: 42px;
  opacity: .5;
}
.${className} .iframe-error-title {
  font-weight: 600;
  color: var(--text-strong);
}
.${className} .iframe-error-message {
  font-size: 12px;
}
.${className} .iframe-error-path {
  font-size: 11px;
  opacity: .7;
}
`;
  document.head.appendChild(style);
}

function resolveAppUrl(appPath) {
  try {
    return new URL(appPath, window.location.href).pathname;
  } catch {
    return appPath.startsWith('/') ? appPath : `/${appPath}`;
  }
}

function postToIframe(iframe, type, payload) {
  if (!iframe?.contentWindow) return;
  iframe.contentWindow.postMessage({ type, value: payload, payload }, window.location.origin);
}

function getResolvedTheme() {
  return themeManager.resolved || themeManager.current || document.documentElement.dataset.theme || '';
}

function hasPayload(payload) {
  return payload && typeof payload === 'object' && Object.keys(payload).length > 0;
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
