const CSS = `
.mxc-<app-id> {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--surface);
  overflow: hidden;
}

.mxc-<app-id> .spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--muted);
  font-size: 14px;
  gap: 8px;
}

.mxc-<app-id> .spinner::before {
  content: '';
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid var(--border);
  border-top-color: var(--text);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.mxc-<app-id> iframe {
  flex: 1;
  width: 100%;
  height: 100%;
  border: none;
  background: inherit;
}

.mxc-<app-id> .error {
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

.mxc-<app-id> .error-icon { font-size: 42px; opacity: 0.5; }
.mxc-<app-id> .error-title { font-weight: 600; color: var(--text-strong); }
.mxc-<app-id> .error-desc { font-size: 12px; }
.mxc-<app-id> .error-path { font-size: 11px; opacity: 0.7; }
`;

function injectStyle() {
  if (document.getElementById('mxc-<app-id>-style')) return;
  const s = document.createElement('style');
  s.id = 'mxc-<app-id>-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

function getAppUrl() {
  try {
    const url = new URL('./Applications/<app-id>/index.html', window.location.href);
    return url.pathname;
  } catch {
    return '/Applications/<app-id>/index.html';
  }
}

export function mount(host) {
  injectStyle();

  host.innerHTML = `
    <div class="mxc-<app-id>">
      <div class="spinner">Carregando <Nome do App>...</div>
    </div>
  `;

  const container = host.querySelector('.mxc-<app-id>');
  const appUrl = getAppUrl();

  const iframe = document.createElement('iframe');
  iframe.src = appUrl;
  iframe.sandbox.add('allow-same-origin');
  iframe.sandbox.add('allow-scripts');
  iframe.sandbox.add('allow-storage');
  iframe.sandbox.add('allow-popups');
  iframe.sandbox.add('allow-popups-to-escape-sandbox');

  iframe.loading = 'lazy';
  iframe.decoding = 'async';
  iframe.importance = 'low';

  iframe.addEventListener('load', () => {
    const spinner = container.querySelector('.spinner');
    if (spinner) spinner.remove();
  }, { once: true });

  iframe.addEventListener('error', () => {
    container.innerHTML = `
      <div class="mxc-<app-id>">
        <div class="error">
          <div class="error-icon">⚠️</div>
          <div class="error-title">Erro ao carregar</div>
          <div class="error-desc">A aplicação não pôde ser carregada.</div>
          <div class="error-path">Verifique se o arquivo existe em: ${appUrl}</div>
        </div>
      </div>
    `;
  });

  container.appendChild(iframe);

  return () => {
    try {
      iframe.src = 'about:blank';
      iframe.remove();
    } catch (e) {
      console.warn('Erro ao desmontar iframe de <app-id>:', e);
    }
  };
}
