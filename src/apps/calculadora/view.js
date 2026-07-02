/**
 * mathicx-file · apps/calculadora/view.js
 * Controller da Calculadora. Renderiza no corpo da janela.
 *
 * Export default: mount(hostEl, { close }) -> opcional cleanup.
 */

const CSS = `
.mxc-calc { display:flex; flex-direction:column; height:100%; padding:12px; gap:10px; background:var(--surface); }
.mxc-calc .display {
  background:var(--surface-2); border:1px solid var(--border); border-radius:var(--r-md);
  padding:16px 14px; text-align:right; min-height:84px; display:flex; flex-direction:column; justify-content:flex-end;
}
.mxc-calc .expr { font-size:13px; color:var(--muted); min-height:18px; font-family:var(--font-mono); word-break:break-all; }
.mxc-calc .result { font-size:34px; font-weight:800; color:var(--text-strong); font-family:var(--font-mono); word-break:break-all; line-height:1.1; }
.mxc-calc .pad { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; flex:1; }
.mxc-calc button {
  background:var(--surface-2); border:1px solid var(--border); border-radius:var(--r-md);
  font-size:18px; font-weight:700; color:var(--text); transition:background var(--t-fast), transform var(--t-fast);
}
.mxc-calc button:hover { background:var(--surface-hover); }
.mxc-calc button:active { transform:scale(.95); }
.mxc-calc button.op { color:var(--accent); }
.mxc-calc button.eq { background:var(--brand-grad); border-color:transparent; color:#fff; }
.mxc-calc button.fn { color:var(--muted); }
`;

function injectStyle() {
  if (document.getElementById('mxc-calc-style')) return;
  const s = document.createElement('style');
  s.id = 'mxc-calc-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

export function mount(host) {
  injectStyle();
  host.innerHTML = `
    <div class="mxc-calc">
      <div class="display"><div class="expr" data-el="expr"></div><div class="result" data-el="result">0</div></div>
      <div class="pad" data-el="pad"></div>
    </div>`;

  const exprEl = host.querySelector('[data-el="expr"]');
  const resultEl = host.querySelector('[data-el="result"]');
  const pad = host.querySelector('[data-el="pad"]');

  let expr = '';
  let justEvaluated = false;

  const buttons = [
    { l: 'C', t: 'fn', a: 'clear' }, { l: '±', t: 'fn', a: 'neg' }, { l: '%', t: 'fn', a: 'pct' }, { l: '÷', t: 'op', v: '/' },
    { l: '7', v: '7' }, { l: '8', v: '8' }, { l: '9', v: '9' }, { l: '×', t: 'op', v: '*' },
    { l: '4', v: '4' }, { l: '5', v: '5' }, { l: '6', v: '6' }, { l: '−', t: 'op', v: '-' },
    { l: '1', v: '1' }, { l: '2', v: '2' }, { l: '3', v: '3' }, { l: '+', t: 'op', v: '+' },
    { l: '0', v: '0', span: 2 }, { l: '.', v: '.' }, { l: '=', t: 'eq', a: 'eq' },
  ];

  buttons.forEach((b) => {
    const btn = document.createElement('button');
    btn.textContent = b.l;
    if (b.t) btn.classList.add(b.t);
    if (b.span === 2) btn.style.gridColumn = 'span 2';
    btn.addEventListener('click', () => handle(b));
    pad.appendChild(btn);
  });

  const show = () => {
    exprEl.textContent = expr || '';
    try {
      // Avaliação segura: só dígitos, operadores, ponto, parênteses, espaço, %
      if (/^[\d+\-*/.()% ]+$/.test(expr) && expr.trim()) {
        const safe = expr.replace(/%/g, '/100');
        // eslint-disable-next-line no-new-func
        const r = Function(`"use strict";return (${safe})`)();
        resultEl.textContent = (Math.round((r + Number.EPSILON) * 1e10) / 1e10).toString();
      } else if (!expr) {
        resultEl.textContent = '0';
      }
    } catch { /* mantém último resultado */ }
  };

  function handle(b) {
    if (b.a === 'clear') { expr = ''; }
    else if (b.a === 'eq') { justEvaluated = true; }
    else if (b.a === 'neg') { expr = expr.startsWith('-') ? expr.slice(1) : '-' + expr; }
    else if (b.a === 'pct') { expr += '%'; }
    else {
      if (justEvaluated && /\d/.test(b.v)) expr = '';
      justEvaluated = false;
      expr += b.v;
    }
    show();
  }

  // Teclado dentro da janela
  const onKey = (e) => {
    const k = e.key;
    if (/[0-9.]/.test(k)) { expr += k; show(); }
    else if (['+', '-', '*', '/'].includes(k)) { expr += k; show(); }
    else if (k === 'Enter' || k === '=') { e.preventDefault(); justEvaluated = true; show(); }
    else if (k === 'Backspace') { expr = expr.slice(0, -1); show(); }
    else if (k === 'Escape') { expr = ''; show(); }
    else if (k === '%') { expr += '%'; show(); }
  };
  host.addEventListener('keydown', onKey);
  host.tabIndex = 0;
  setTimeout(() => host.focus(), 0);

  return () => host.removeEventListener('keydown', onKey);
}
