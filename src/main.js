/**
 * mathicx-file · main.js
 * Bootstrap da aplicação.
 * Carrega o kernel e dispara a sequência de inicialização.
 *
 * Este é o ÚNICO módulo importado pelo index.html.
 * Toda a app é carregada lazy a partir daqui.
 */

import { app } from './core/kernel.js';

// Inicialização assíncrona (IndexedDB pode demorar um ciclo de tick).
app.boot().catch((err) => {
  console.error('[mathicx-file] falha no boot:', err);
  // Fallback: mostra erro na tela.
  document.getElementById('app').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;color:var(--danger);font-family:var(--font-ui);text-align:center;padding:24px;">
      <div>
        <div style="font-size:48px;margin-bottom:12px;">⚠️</div>
        <div style="font-size:16px;font-weight:700;">Falha ao inicializar mathicx-file</div>
        <div style="font-size:13px;color:var(--muted);margin-top:8px;">${err.message}</div>
        <button onclick="location.reload()" style="margin-top:16px;padding:8px 16px;border-radius:8px;background:var(--accent);color:#fff;border:none;cursor:pointer;font-weight:700;">Recarregar</button>
      </div>
    </div>`;
});
