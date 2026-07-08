import { bus, EVT } from '../../core/event-bus.js';
import { themeManager } from '../../themes/theme-manager.js';

const CSS = `
.mxc-japanese-study {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--surface);
  overflow: hidden;
}

.mxc-japanese-study .spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--muted);
  font-size: 14px;
  gap: 8px;
}

.mxc-japanese-study .spinner::before {
  content: '';
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid var(--border);
  border-top-color: var(--text);
  border-radius: 50%;
  animation: mxc-japanese-study-spin 1s linear infinite;
}

@keyframes mxc-japanese-study-spin {
  to { transform: rotate(360deg); }
}

.mxc-japanese-study iframe {
  flex: 1;
  width: 100%;
  height: 100%;
  border: none;
  background: inherit;
}
`;

function injectStyle() {
  if (document.getElementById('mxc-japanese-study-style')) return;
  const style = document.createElement('style');
  style.id = 'mxc-japanese-study-style';
  style.textContent = CSS;
  document.head.appendChild(style);
}

function getAppUrl() {
  try {
    return new URL('./Applications/japanese-study/index.html', window.location.href).pathname;
  } catch {
    return '/Applications/japanese-study/index.html';
  }
}

function postToIframe(iframe, type, payload) {
  if (!iframe?.contentWindow) return;
  iframe.contentWindow.postMessage({ type, value: payload, payload }, window.location.origin);
}

function postNavigation(iframe, payload = {}) {
  postToIframe(iframe, 'navigate', payload);
}

function getResolvedTheme() {
  return themeManager.resolved || themeManager.current || document.documentElement.dataset.theme || '';
}

export function mount(host, context = {}) {
  injectStyle();

  host.innerHTML = `
    <div class="mxc-japanese-study">
      <div class="spinner">Carregando Japanese Study...</div>
    </div>
  `;

  const container = host.querySelector('.mxc-japanese-study');
  const appUrl = getAppUrl();
  const iframe = document.createElement('iframe');
  const initialPayload = context.win?.launchOptions?.payload || {};

  iframe.src = appUrl;
  iframe.sandbox.add('allow-same-origin');
  iframe.sandbox.add('allow-scripts');
  iframe.sandbox.add('allow-storage');
  iframe.sandbox.add('allow-popups');
  iframe.sandbox.add('allow-popups-to-escape-sandbox');
  iframe.loading = 'lazy';
  iframe.decoding = 'async';
  iframe.importance = 'low';
  iframe.title = 'Japanese Study';

  iframe.addEventListener('load', () => {
    container.querySelector('.spinner')?.remove();
    postToIframe(iframe, 'theme', getResolvedTheme());
    if (initialPayload.view) postNavigation(iframe, initialPayload);
    setTimeout(() => postToIframe(iframe, 'theme', getResolvedTheme()), 150);
    if (initialPayload.view) setTimeout(() => postNavigation(iframe, initialPayload), 250);
  }, { once: true });

  const unsubscribeTheme = bus.on(EVT.THEME_CHANGE, ({ resolved, theme } = {}) => {
    postToIframe(iframe, 'theme', resolved || theme || getResolvedTheme());
  });

  const unsubscribeAction = bus.on(EVT.APP_ACTION, ({ appId, payload } = {}) => {
    if (appId !== 'japanese-study') return;
    postNavigation(iframe, payload || {});
  });

  iframe.addEventListener('error', () => {
    container.innerHTML = `
      <div class="mxc-japanese-study">
        <div style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 12px;
          color: var(--muted);
          padding: 20px;
          text-align: center;
        ">
          <div style="font-size: 42px; opacity: 0.5;">!</div>
          <div style="font-weight: 600; color: var(--text-strong);">Erro ao carregar</div>
          <div style="font-size: 12px;">O Japanese Study nao pode ser carregado.</div>
          <div style="font-size: 11px; opacity: 0.7;">Verifique se o arquivo existe em: ${appUrl}</div>
        </div>
      </div>
    `;
  });

  const handleHostMessage = (event) => {
    if (event.origin !== window.location.origin) return;
    const { type, value, payload } = event.data || {};

    if (type === 'theme') {
      postToIframe(iframe, 'theme', value ?? payload ?? '');
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
      console.warn('Erro ao desmontar iframe do Japanese Study:', err);
    }
  };
}
