/* Smoke test: carrega todos os scripts em ordem com globals mockados
   e verifica que init() + render de cada view não lançam erros. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const files = [
  'js/storage.js', 'js/utils.js', 'js/ui.js',
  'js/views/dashboard.js', 'js/views/transactions.js',
  'js/views/installments.js', 'js/views/recurring.js',
  'js/views/categories.js', 'js/views/cards.js',
  'js/views/simulator.js', 'js/views/goals.js',
  'js/views/reports.js', 'js/views/calendar.js',
  'js/views/settings.js', 'js/views/profiles.js',
  'js/views/transfers.js', 'js/views/comparison.js',
  'js/app.js'
];

// Mock de DOM mínimo
function makeEl() {
  const self = {
    style: {}, dataset: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){return false} },
    children: [], _listeners: {},
    set innerHTML(v){ self._html = v }, get innerHTML(){ return self._html || '' },
    set textContent(v){ self._text = v }, get textContent(){ return self._text || '' },
    setAttribute(){}, getAttribute(){return null}, removeAttribute(){}, appendChild(c){ self.children.push(c); return c },
    removeChild(){}, remove(){}, focus(){}, click(){}, scrollIntoView(){},
    addEventListener(t,fn){ self._listeners[t] = fn },
    querySelector(){ return makeEl() }, querySelectorAll(){ return [] },
    closest(){ return null }, insertAdjacentHTML(){}, cloneNode(){ return makeEl() },
    dispatchEvent(){}, getContext(){ return null }
  };
  Object.defineProperty(self, 'content', { get(){ return { firstElementChild: makeEl() }; } });
  return self;
}

const mockEl = makeEl();
const documentMock = {
  documentElement: { style: { removeProperty(){}, setProperty(){} }, setAttribute(){}, getAttribute(){return null} },
  body: { style:{}, appendChild(){}, setAttribute(){} },
  readyState: 'complete',
  createElement: () => makeEl(),
  createTextNode: () => makeEl(),
  querySelector: () => mockEl,
  querySelectorAll: () => [],
  getElementById: () => mockEl,
  addEventListener: () => {},
  removeEventListener: () => {}
};

// localStorage em memória
const memStore = {};
const localStorageMock = {
  getItem: (k) => (k in memStore ? memStore[k] : null),
  setItem: (k,v) => { memStore[k] = String(v); },
  removeItem: (k) => { delete memStore[k]; }
};

const ctx = {
  window: {}, document: documentMock, console,
  localStorage: localStorageMock,
  Intl, Date, Math, parseInt, parseFloat, Number, String, Boolean,
  Array, Object, JSON, Blob: class { constructor(p){ this.size=(p&&p[0]?p[0].length:0)} },
  setTimeout: (fn,t)=>{ try{fn()}catch(e){console.error(e)} return 0 },
  clearTimeout(){}, setInterval: ()=>0,
  addEventListener: () => {}, removeEventListener: () => {},
  URL: { createObjectURL:()=> '', revokeObjectURL(){} },
  FileReader: function(){}, matchMedia: () => ({ matches:false, addListener(){} }),
  navigator: { userAgent: 'node' },
  Chart: undefined, jspdf: undefined, XLSX: undefined,
  getComputedStyle: () => ({ getPropertyValue: () => '#666' })
};
ctx.window = ctx;       // window === global
ctx.global = ctx;

vm.createContext(ctx);
for (const f of files) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try {
    vm.runInContext(code, ctx, { filename: f });
    console.log('✓ carregou', f);
  } catch (e) {
    console.error('✗ ERRO em', f, '->', e.message);
    process.exit(1);
  }
}

// Agora chama init() (app.js agenda via DOMContentLoaded, mas readyState='complete' => roda direto)
try {
  console.log('\n--- Chamando App.init() ---');
  ctx.App.init();
  console.log('✓ init() OK');
} catch (e) {
  console.error('✗ init() falhou:', e.stack);
  process.exit(1);
}

// Renderiza cada view
const views = ['dashboard','transactions','installments','recurring','cards',
  'categories','simulator','goals','reports','calendar','settings',
  'profiles','transfers','comparison'];
console.log('\n--- Renderizando cada view ---');
for (const v of views) {
  try {
    ctx.App.navigate(v);
    console.log('✓ view', v);
  } catch (e) {
    console.error('✗ view', v, 'falhou:', e.message);
  }
}

console.log('\n✅ Smoke test concluído.');
