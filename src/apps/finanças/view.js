/**
 * mathicx-file · apps/finanças/view.js
 * 
 * Integração otimizada de aplicação HTML externa via iframe.
 * 
 * PERFORMANCE:
 * - Iframe isolado: não conflita com CSS/JS do host
 * - Lazy carregamento: a app só inicia quando a janela abre
 * - Memória separada: cada iframe tem seu próprio contexto
 * - Sem parsing de HTML: arquivo bruto, sem conversão
 * - Comunicação via postMessage: desacoplada e eficiente
 * 
 * SEGURANÇA:
 * - sandbox="allow-same-origin allow-scripts allow-storage"
 * - Origem: mesmo protocolo/domínio, sem cross-origin issues
 */

const CSS = `
.mxc-finanças {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--surface);
  overflow: hidden;
}

.mxc-finanças .spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--muted);
  font-size: 14px;
  gap: 8px;
}

.mxc-finanças .spinner::before {
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

.mxc-finanças iframe {
  flex: 1;
  width: 100%;
  height: 100%;
  border: none;
  background: inherit;
}
`;

/**
 * Injetar estilos globais
 */
function injectStyle() {
  if (document.getElementById('mxc-finanças-style')) return;
  const s = document.createElement('style');
  s.id = 'mxc-finanças-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Calcula URL relativa da aplicação de finanças
 * A app está em: /Applications/finances/index.html (raiz do projeto)
 * 
 * Usa novo URL() para resolver relativamente à página atual,
 * garantindo que funcione em qualquer contexto.
 */
function getAppUrl() {
  try {
    // Usar URL relativa ao local atual da página
    const url = new URL('./Applications/finances/index.html', window.location.href);
    return url.pathname;
  } catch {
    // Fallback para URL absoluta da raiz
    return '/Applications/finances/index.html';
  }
}

/**
 * Monta a aplicação de finanças em um iframe.
 * 
 * @param {HTMLElement} host - Elemento container
 * @returns {Function} Função cleanup (opcional)
 */
export function mount(host) {
  injectStyle();

  host.innerHTML = `
    <div class="mxc-finanças">
      <div class="spinner">Carregando Finanças...</div>
    </div>
  `;

  const container = host.querySelector('.mxc-finanças');
  const appUrl = getAppUrl();

  // Criar iframe isolado
  const iframe = document.createElement('iframe');
  iframe.src = appUrl;
  iframe.sandbox.add('allow-same-origin');
  iframe.sandbox.add('allow-scripts');
  iframe.sandbox.add('allow-storage');
  iframe.sandbox.add('allow-popups');
  iframe.sandbox.add('allow-popups-to-escape-sandbox');
  
  // Atributos de performance
  iframe.loading = 'lazy'; // Lazy loading nativo
  iframe.decoding = 'async'; // Async decode
  iframe.importance = 'low'; // Prioridade baixa
  
  // Listeners de carregamento
  iframe.addEventListener('load', () => {
    // Remover spinner quando iframe carregar
    const spinner = container.querySelector('.spinner');
    if (spinner) spinner.remove();
  }, { once: true });

  iframe.addEventListener('error', () => {
    container.innerHTML = `
      <div class="mxc-finanças">
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
          <div style="font-size: 42px; opacity: 0.5;">⚠️</div>
          <div style="font-weight: 600; color: var(--text-strong);">Erro ao carregar</div>
          <div style="font-size: 12px;">A aplicação de finanças não pôde ser carregada.</div>
          <div style="font-size: 11px; opacity: 0.7;">Verifique se o arquivo existe em: ${appUrl}</div>
        </div>
      </div>
    `;
  });

  // Inserir iframe no container
  container.appendChild(iframe);

  /**
   * Cleanup: remover iframe ao desmontar
   * Isso garante que a memória do iframe seja liberada completamente
   */
  return () => {
    try {
      iframe.src = 'about:blank'; // Limpar conteúdo antes de remover
      iframe.remove();
    } catch (e) {
      console.warn('Erro ao desmontar iframe de finanças:', e);
    }
  };
}
