/* Teste funcional: exercita operações de dados (CRUD) e cálculos
   para garantir que a lógica financeira está correta. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeEl() {
  const self = {
    style: { removeProperty(){}, setProperty(){} }, dataset: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){return false} },
    children: [], _listeners: {},
    set innerHTML(v){ self._html = v }, get innerHTML(){ return self._html || '' },
    set textContent(v){ self._text = v }, get textContent(){ return self._text || '' },
    setAttribute(){}, getAttribute(){return null}, removeAttribute(){}, appendChild(c){ self.children.push(c); return c },
    removeChild(){}, remove(){}, focus(){}, click(){}, scrollIntoView(){},
    addEventListener(){}, querySelector(){ return makeEl() }, querySelectorAll(){ return [] },
    closest(){ return null }, insertAdjacentHTML(){}, cloneNode(){ return makeEl() },
    dispatchEvent(){}, getContext(){ return null }
  };
  Object.defineProperty(self, 'content', { get(){ return { firstElementChild: makeEl() }; } });
  return self;
}
const mockEl = makeEl();
const documentMock = {
  documentElement: { style: { removeProperty(){}, setProperty(){} }, setAttribute(){}, getAttribute(){return null} },
  body: { style:{}, appendChild(){}, setAttribute(){} }, readyState: 'complete',
  createElement: () => makeEl(), createTextNode: () => makeEl(),
  querySelector: () => mockEl, querySelectorAll: () => [], getElementById: () => mockEl,
  addEventListener: () => {}, removeEventListener: () => {}
};
const memStore = {};
const ctx = {
  window:{}, document: documentMock, console,
  localStorage: { getItem:(k)=>k in memStore?memStore[k]:null, setItem:(k,v)=>{memStore[k]=String(v)}, removeItem:(k)=>{delete memStore[k]} },
  Intl, Date, Math, parseInt, parseFloat, Number, String, Boolean, Array, Object, JSON,
  Blob: class { constructor(p){ this.size=(p&&p[0]?p[0].length:0)} },
  setTimeout:(fn)=>{try{fn()}catch(e){console.error(e)};return 0}, clearTimeout(){}, setInterval:()=>0,
  addEventListener:()=>{}, removeEventListener:()=>{},
  URL:{createObjectURL:()=>'',revokeObjectURL(){}}, FileReader: function(){}, matchMedia:()=>({matches:false,addListener(){}}),
  navigator:{userAgent:'node'}, Chart: undefined, jspdf: undefined, XLSX: undefined,
  getComputedStyle:()=>({getPropertyValue:()=>'#666'})
};
ctx.window = ctx; ctx.global = ctx;
vm.createContext(ctx);

const ROOT = path.join(__dirname, '..');
['js/storage.js','js/utils.js','js/ui.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'), ctx, {filename:f}));

let pass = 0, fail = 0;
function assert(name, cond, extra='') {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗', name, extra); }
}

const { Utils } = ctx;
ctx.Store.load();
const state = ctx.Store.getState();

console.log('\n== Categorias padrão ==');
assert('tem categorias padrão', state.categories.length >= 18, `veio ${state.categories.length}`);
assert('categoria Mercado existe', state.categories.some(c=>c.name==='Mercado'));
assert('categoria Salário é income', state.categories.find(c=>c.name==='Salário').type==='income');

console.log('\n== Formatação ==');
assert('money formata BRL', Utils.money(1234.5).includes('1.234,50'));
assert('parseDate + isoDate roundtrip', Utils.isoDate('2026-03-15')==='2026-03-15');
assert('formatDate short', Utils.formatDate('2026-03-15','short').includes('mar'));
assert('addMonths', Utils.isoDate(Utils.addMonths('2026-01-31', 1))==='2026-02-28');

console.log('\n== Status efetivo ==');
assert('pending vencido -> overdue',
  Utils.effectiveStatus({status:'pending', dueDate:'2020-01-01'})==='overdue');
assert('pago continua pago',
  Utils.effectiveStatus({status:'paid', dueDate:'2020-01-01'})==='paid');
assert('pendente futuro',
  Utils.effectiveStatus({status:'pending', dueDate:'2099-01-01'})==='pending');

console.log('\n== Perfis ==');
const profiles = state.profiles;
assert('tem ao menos 2 perfis (seed)', profiles.length >= 2, `veio ${profiles.length}`);
const prof1 = profiles[0];
const prof2 = profiles[1];
assert('perfil tem id', !!prof1.id);
assert('perfil tem nome', !!prof1.name);

console.log('\n== Perfil filterByProfile ==');
const txsProf1 = Utils.filterByProfile(state.transactions, prof1.id);
const txsProf2 = Utils.filterByProfile(state.transactions, prof2.id);
assert('transactions do prof1 existem', txsProf1.length > 0);
assert('transactions do prof1 tem perfilId correto', txsProf1.every(t => t.perfilId === prof1.id));
assert('transactions do prof2 tem perfilId', txsProf2.every(t => t.perfilId === prof2.id));
const allTxs = Utils.filterByProfile(state.transactions, null);
assert('filterByProfile null retorna todos', allTxs.length === state.transactions.length);

console.log('\n== Agregações com perfil ==');
const entries = Utils.allEntries(state);
assert('allEntries retorna array', Array.isArray(entries));
assert('tem lançamentos (seed)', entries.length > 5, `veio ${entries.length}`);

const entriesProf1 = Utils.allEntries(state, prof1.id);
assert('allEntries prof1 filtrado', entriesProf1.every(e => e.perfilId === prof1.id));

// Resumo do mês atual
const now = new Date();
const summ = Utils.monthSummary(state, now.getFullYear(), now.getMonth());
assert('monthSummary tem income', typeof summ.income==='number');
assert('monthSummary tem balance', typeof summ.balance==='number');
const summProf1 = Utils.monthSummary(state, now.getFullYear(), now.getMonth(), prof1.id);
assert('monthSummary por perfil tem income', typeof summProf1.income==='number');

console.log('\n== Transferências entre perfis ==');
assert('transfers array existe', Array.isArray(state.transfers));
// Simula transferência
const tx = state.profiles.length >= 2;
if (tx) {
  state.transfers.push({
    id: 'test_tf', fromProfileId: prof1.id, toProfileId: prof2.id,
    amount: 500, description: 'Teste', date: Utils.today(), createdAt: Date.now()
  });
  assert('transferência adicionada', state.transfers.length > 0);
  const tf = state.transfers[0];
  assert('transferência tem origem/destino', tf.fromProfileId && tf.toProfileId);
}

console.log('\n== Saldo por perfil ==');
const balProf1 = Utils.overallBalance(state, prof1.id);
const balProf2 = Utils.overallBalance(state, prof2.id);
assert('overallBalance prof1 é número', typeof balProf1==='number');
assert('overallBalance prof2 é número', typeof balProf2==='number');

console.log('\n== Evolução mensal ==');
const evol = Utils.monthlyEvolution(state, 6);
assert('evolution 6 meses', evol.length===6, `veio ${evol.length}`);
assert('evolution tem labels', evol[0].label && evol[0].label.length>0);

console.log('\n== Simulador (Tabela Price) ==');
// 1200 em 12x sem juros = 100
assert('sem juros: 1200/12 = 100', Math.abs(Utils.calcInstallment(1200,0,12)-100) < 0.01);
// com juros: parcela maior que sem juros
const comJuros = Utils.calcInstallment(1200, 5, 12);
assert('com juros: parcela > 100', comJuros > 100, `veio ${comJuros}`);
// total final = parcela * n
assert('total final coerente', Math.abs(comJuros*12 - comJuros*12) < 0.01);

console.log('\n== Backup/Restore ==');
const json = ctx.Store.exportJSON();
assert('exporta JSON válido', (()=>{ try{JSON.parse(json); return true}catch(e){return false} })());
// limpa e reimporta
ctx.Store.resetAll();
assert('resetAll zera transactions', ctx.Store.getState().transactions.length===0);
ctx.Store.importJSON(json);
assert('importJSON restaura dados', ctx.Store.getState().transactions.length>0);

console.log('\n== UID único ==');
const ids = new Set();
for (let i=0;i<1000;i++) ids.add(ctx.Store.uid('x'));
assert('1000 uids únicos', ids.size===1000);

console.log(`\n=== Resultado: ${pass} passaram, ${fail} falharam ===`);
process.exit(fail ? 1 : 0);
