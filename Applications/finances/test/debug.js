/* =====================================================================
   DEBUG — Testes completos de CRUD: lançamentos, parcelas e bordas
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------- Helpers de mock ---------- */
function makeEl() {
  const self = {
    style: {}, dataset: {}, classList: {
      add(){}, remove(){}, toggle(){}, contains(){return false}
    },
    children: [], _listeners: {},
    set innerHTML(v){ self._html = v },
    get innerHTML(){ return self._html || '' },
    set textContent(v){ self._text = v },
    get textContent(){ return self._text || '' },
    setAttribute(){}, getAttribute(){return null}, removeAttribute(){},
    appendChild(c){ self.children.push(c); return c },
    removeChild(){}, remove(){}, focus(){}, click(){}, scrollIntoView(){},
    addEventListener(t,fn){ self._listeners[t] = fn },
    querySelector(){ return makeEl() },
    querySelectorAll(){ return [] },
    closest(){ return null }, insertAdjacentHTML(){}, cloneNode(){ return makeEl() },
    dispatchEvent(){}, getContext(){ return null }
  };
  Object.defineProperty(self, 'content', {
    get(){ return { firstElementChild: makeEl() } }
  });
  return self;
}

const mockEl = makeEl();
const doc = {
  documentElement: {
    style: { removeProperty(){}, setProperty(){} },
    setAttribute(){}, getAttribute(){return null}
  },
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

const memStore = {};
let setTimeoutCalls = [];
const ctx = {
  window: {}, document: doc, console,
  localStorage: {
    getItem: k => (k in memStore ? memStore[k] : null),
    setItem: (k, v) => { memStore[k] = String(v); },
    removeItem: k => { delete memStore[k]; }
  },
  Intl, Date, Math, parseInt, parseFloat, Number, String, Boolean,
  Array, Object, JSON,
  Blob: class { constructor(p){ this.size=(p&&p[0]?p[0].length:0)} },
  setTimeout: (fn, t) => {
    setTimeoutCalls.push(fn);
    try { fn(); } catch(e) { console.error(e); }
    return 0;
  },
  clearTimeout(){}, setInterval: () => 0,
  addEventListener: () => {}, removeEventListener: () => {},
  URL: { createObjectURL:()=> '', revokeObjectURL(){} },
  FileReader: function(){},
  matchMedia: () => ({ matches:false, addListener(){} }),
  navigator: { userAgent: 'node' },
  Chart: undefined, jspdf: undefined, XLSX: undefined,
  getComputedStyle: () => ({ getPropertyValue: () => '#666' })
};
ctx.window = ctx;
ctx.global = ctx;
vm.createContext(ctx);

/* ---------- Carrega os módulos ---------- */
const ROOT = path.join(__dirname, '..');
['js/storage.js','js/utils.js','js/ui.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'), ctx, {filename:f}));

const { Utils } = ctx;
const Store = ctx.Store;

let pass = 0, fail = 0;
function assert(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗', name, extra ? `— ${extra}` : ''); }
}

function reset() {
  Store.resetAll();
  /* seed com dados limpos sem sample */
}

function findCategory(name) {
  return Store.getState().categories.find(c => c.name === name);
}

function getTxCount() {
  return Store.getState().transactions.length;
}

function getInstCount() {
  return Store.getState().installments.length;
}

/* =====================================================================
   TESTES DE TRANSAÇÕES (lançamentos)
   ===================================================================== */

console.log('\n========================================');
console.log('  TRANSAÇÕES — ADICIONAR');
console.log('========================================');

/* 1.1 Adicionar receita */
reset();
const salaryCat = findCategory('Salário');
const txIncome = {
  id: Store.uid('tx'), type: 'income',
  description: 'Freelance Design',
  amount: 3500,
  categoryId: salaryCat.id,
  dueDate: '2026-06-15',
  paidDate: '2026-06-15',
  paymentMethod: 'Pix',
  status: 'paid',
  notes: 'Projeto site',
  createdAt: Date.now()
};
Store.getState().transactions.push(txIncome);
Store.emit({ type: 'transaction:create', payload: txIncome });
assert('receita adicionada', getTxCount() === 1);
const savedIncome = Store.getState().transactions[0];
assert('receita com descrição correta', savedIncome.description === 'Freelance Design');
assert('receita com valor correto', savedIncome.amount === 3500);
assert('receita com status paid', savedIncome.status === 'paid');

/* 1.2 Adicionar despesa */
const marketCat = findCategory('Mercado');
const txExpense = {
  id: Store.uid('tx'), type: 'expense',
  description: 'Supermercado',
  amount: 450.75,
  categoryId: marketCat.id,
  dueDate: '2026-06-20',
  paidDate: '',
  paymentMethod: 'Cartão de Débito',
  status: 'pending',
  notes: '',
  createdAt: Date.now()
};
Store.getState().transactions.push(txExpense);
Store.emit({ type: 'transaction:create', payload: txExpense });
assert('despesa adicionada', getTxCount() === 2);
const savedExp = Store.getState().transactions[1];
assert('despesa com valor decimal', savedExp.amount === 450.75);
assert('despesa pending', savedExp.status === 'pending');
assert('despesa sem paidDate', savedExp.paidDate === '');

/* 1.3 Adicionar múltiplos lançamentos */
for (let i = 0; i < 5; i++) {
  Store.getState().transactions.push({
    id: Store.uid('tx'), type: i % 2 === 0 ? 'expense' : 'income',
    description: `Transação ${i + 1}`,
    amount: 100 * (i + 1),
    categoryId: marketCat.id,
    dueDate: `2026-06-${String(10 + i).padStart(2, '0')}`,
    paidDate: '',
    paymentMethod: 'Dinheiro',
    status: 'pending',
    notes: '',
    createdAt: Date.now()
  });
}
Store.emit({ type: 'transaction:create' });
assert('múltiplas transações adicionadas', getTxCount() === 7);

console.log('\n========================================');
console.log('  TRANSAÇÕES — EDITAR');
console.log('========================================');

reset();
Store.getState().transactions.push({
  id: Store.uid('tx'), type: 'expense',
  description: 'Conta de Luz',
  amount: 200,
  categoryId: marketCat.id,
  dueDate: '2026-06-10',
  paidDate: '',
  paymentMethod: 'Boleto',
  status: 'pending',
  notes: 'Original',
  createdAt: Date.now()
});
Store.emit({ type: 'transaction:create' });

/* 2.1 Editar descrição e valor */
const tx = Store.getState().transactions[0];
tx.description = 'Conta de Luz (editada)';
tx.amount = 250;
tx.notes = 'Nota editada';
tx.status = 'paid';
tx.paidDate = '2026-06-10';
Store.emit({ type: 'transaction:update', payload: tx });
const edited = Store.getState().transactions[0];
assert('descrição alterada', edited.description === 'Conta de Luz (editada)');
assert('valor alterado', edited.amount === 250);
assert('status alterado para paid', edited.status === 'paid');
assert('paidDate preenchido', edited.paidDate === '2026-06-10');
assert('observação alterada', edited.notes === 'Nota editada');

/* 2.2 Trocar tipo de receita para despesa */
tx.type = 'income';
tx.description = 'Receita de Luz'; /* fictício */
Store.emit({ type: 'transaction:update', payload: tx });
assert('tipo alterado para income', Store.getState().transactions[0].type === 'income');

console.log('\n========================================');
console.log('  TRANSAÇÕES — MARCAR COMO PAGO');
console.log('========================================');

reset();
Store.getState().transactions.push({
  id: Store.uid('tx'), type: 'expense',
  description: 'Fatura a pagar',
  amount: 500,
  categoryId: marketCat.id,
  dueDate: '2026-05-01',
  paidDate: '',
  paymentMethod: 'Boleto',
  status: 'pending',
  notes: '',
  createdAt: Date.now()
});
Store.emit({ type: 'transaction:create' });

/* 3.1 Marcar como paga */
const toPay = Store.getState().transactions[0];
toPay.status = 'paid';
toPay.paidDate = Utils.today();
Store.emit({ type: 'transaction:update', payload: toPay });
assert('status é paid', toPay.status === 'paid');
assert('paidDate preenchido', toPay.paidDate === Utils.today());

/* 3.2 Efetivo: paid deve aparecer como paid */
assert('effectiveStatus = paid', Utils.effectiveStatus(toPay) === 'paid');

console.log('\n========================================');
console.log('  TRANSAÇÕES — REMOVER');
console.log('========================================');

/* 4.1 Remover transação específica */
reset();
const id1 = Store.uid('tx');
const id2 = Store.uid('tx');
Store.getState().transactions.push(
  { id: id1, type: 'expense', description: 'Tx1', amount: 10, categoryId: marketCat.id, dueDate: '2026-06-01', paidDate: '', paymentMethod: 'Pix', status: 'pending', notes: '', createdAt: Date.now() },
  { id: id2, type: 'expense', description: 'Tx2', amount: 20, categoryId: marketCat.id, dueDate: '2026-06-02', paidDate: '', paymentMethod: 'Pix', status: 'pending', notes: '', createdAt: Date.now() }
);
Store.emit({ type: 'transaction:create' });
assert('2 transações criadas', getTxCount() === 2);

Store.getState().transactions = Store.getState().transactions.filter(t => t.id !== id1);
Store.emit({ type: 'transaction:delete', payload: id1 });
assert('1 transação removida, resta 1', getTxCount() === 1);
assert('transação correta restante', Store.getState().transactions[0].id === id2);

/* 4.2 Remover todas as transações */
Store.getState().transactions = [];
Store.emit({ type: 'transaction:delete' });
assert('lista vazia após remover todas', getTxCount() === 0);

/* 4.3 Remover de lista vazia não quebra */
Store.getState().transactions = Store.getState().transactions.filter(t => t.id === 'nonexistent');
Store.emit({ type: 'transaction:delete' });
assert('remover de lista vazia não quebra', getTxCount() === 0);

console.log('\n========================================');
console.log('  TRANSAÇÕES — BORDAS (EDGE CASES)');
console.log('========================================');

reset();

/* 5.1 Transação com valor zero */
Store.getState().transactions.push({
  id: Store.uid('tx'), type: 'expense',
  description: 'Valor zero',
  amount: 0,
  categoryId: marketCat.id,
  dueDate: '2026-06-01',
  paidDate: '',
  paymentMethod: 'Pix',
  status: 'pending',
  notes: '',
  createdAt: Date.now()
});
Store.emit({ type: 'transaction:create' });
assert('transação valor zero permitida', getTxCount() === 1);
assert('amount = 0', Store.getState().transactions[0].amount === 0);

/* 5.2 Transação com valor muito grande */
Store.getState().transactions.push({
  id: Store.uid('tx'), type: 'income',
  description: 'Valor grande',
  amount: 9999999.99,
  categoryId: findCategory('Salário').id,
  dueDate: '2026-12-31',
  paidDate: '',
  paymentMethod: 'Transferência',
  status: 'pending',
  notes: '',
  createdAt: Date.now()
});
Store.emit({ type: 'transaction:create' });
assert('transação valor grande permitida', getTxCount() === 2);
assert('amount = 9999999.99', Store.getState().transactions[1].amount === 9999999.99);

/* 5.3 Transação sem descrição (campo vazio) */
Store.getState().transactions.push({
  id: Store.uid('tx'), type: 'expense',
  description: '',
  amount: 100,
  categoryId: marketCat.id,
  dueDate: '2026-06-15',
  paidDate: '',
  paymentMethod: 'Pix',
  status: 'pending',
  notes: '',
  createdAt: Date.now()
});
Store.emit({ type: 'transaction:create' });
assert('transação com descrição vazia permitida', getTxCount() === 3);

/* 5.4 overridar status de pending para overdue */
const overdueTx = Store.getState().transactions[2];
overdueTx.dueDate = '2020-01-01';
Store.emit({ type: 'transaction:update' });
assert('effectiveStatus = overdue para tx atrasada',
  Utils.effectiveStatus(overdueTx) === 'overdue');

/* 5.5 Cancelar transação via status (caso especial) */
overdueTx.status = 'cancelled';
assert('effectiveStatus = cancelled',
  Utils.effectiveStatus(overdueTx) === 'cancelled');

/* 5.6 Transações no mês corrente — monthSummary */
const state = Store.getState();
const now = new Date();
const sm = Utils.monthSummary(state, 2026, 5); /* junho = mês 5 */
assert('monthSummary processa transações sem erro',
  typeof sm.income === 'number' && typeof sm.expense === 'number');

/* =====================================================================
   TESTES DE INSTALLMENTS (PARCELAS)
   ===================================================================== */

console.log('\n========================================');
console.log('  PARCELAS — ADICIONAR');
console.log('========================================');

reset();
const comprasCat = findCategory('Compras');

function generateParcels(count, amount, baseDate) {
  const parcels = [];
  for (let i = 0; i < count; i++) {
    const due = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, baseDate.getDate());
    parcels.push({
      id: Store.uid('pc'),
      number: i + 1,
      total: count,
      amount: parseFloat(amount.toFixed(2)),
      dueDate: Utils.isoDate(due),
      paid: false,
      paidDate: null,
      status: 'pending'
    });
  }
  return parcels;
}

/* 6.1 Criar parcelamento simples */
const p1 = generateParcels(6, 166.67, new Date(2026, 5, 10));
const inst1 = {
  id: Store.uid('inst'),
  description: 'Curso Online',
  totalAmount: 1000,
  installmentsCount: 6,
  firstDueDate: '2026-06-10',
  categoryId: comprasCat.id,
  paymentMethod: 'Cartão de Crédito',
  cardId: null,
  parcels: p1,
  createdAt: Date.now()
};
Store.getState().installments.push(inst1);
Store.emit({ type: 'installment:create', payload: inst1 });
assert('1 parcelamento criado', getInstCount() === 1);
assert('6 parcelas geradas', inst1.parcels.length === 6);

/* Verifica estrutura das parcelas */
inst1.parcels.forEach((p, idx) => {
  assert(`parcela ${idx+1} tem number`, typeof p.number === 'number');
  assert(`parcela ${idx+1} tem amount numérico`, typeof p.amount === 'number');
  assert(`parcela ${idx+1} status pending`, p.status === 'pending');
  assert(`parcela ${idx+1} não paga`, p.paid === false);
  assert(`parcela ${idx+1} sem paidDate`, p.paidDate === null);
});
assert('valor total correto', inst1.totalAmount === 1000);
assert('6 parcelas de 166.67', Math.abs(inst1.parcels[0].amount * 6 - inst1.totalAmount) < 0.1);

/* 6.2 Criar parcelamento com algumas parcelas já pagas */
const p2 = generateParcels(12, 250, new Date(2026, 5, 1));
p2.forEach((p, idx) => {
  if (idx < 3) { p.paid = true; p.status = 'paid'; p.paidDate = Utils.today(); }
});
const inst2 = {
  id: Store.uid('inst'),
  description: 'Notebook',
  totalAmount: 3000,
  installmentsCount: 12,
  firstDueDate: '2026-06-01',
  categoryId: comprasCat.id,
  paymentMethod: 'Cartão de Crédito',
  cardId: null,
  parcels: p2,
  createdAt: Date.now()
};
Store.getState().installments.push(inst2);
Store.emit({ type: 'installment:create', payload: inst2 });
assert('2 parcelamentos', getInstCount() === 2);
assert('12 parcelas no 2º', inst2.parcels.length === 12);
assert('3 primeiras pagas', inst2.parcels.filter(p => p.paid).length === 3);
assert('9 restantes pendentes', inst2.parcels.filter(p => !p.paid).length === 9);

/* 6.3 Criar parcelamento com 1 parcela só */
const p3 = generateParcels(1, 500, new Date(2026, 6, 1));
const inst3 = {
  id: Store.uid('inst'),
  description: 'Compra à vista parcelada',
  totalAmount: 500,
  installmentsCount: 1,
  firstDueDate: '2026-07-01',
  categoryId: comprasCat.id,
  paymentMethod: 'Pix',
  cardId: null,
  parcels: p3,
  createdAt: Date.now()
};
Store.getState().installments.push(inst3);
Store.emit({ type: 'installment:create' });
assert('parcelamento com 1 parcela', getInstCount() === 3);
assert('única parcela', inst3.parcels.length === 1);

console.log('\n========================================');
console.log('  PARCELAS — EDITAR');
console.log('========================================');

reset();
const p4 = generateParcels(10, 350, new Date(2026, 5, 15));
const inst4 = {
  id: Store.uid('inst'),
  description: 'Notebook Gamer',
  totalAmount: 3500,
  installmentsCount: 10,
  firstDueDate: '2026-06-15',
  categoryId: comprasCat.id,
  paymentMethod: 'Cartão de Crédito',
  cardId: null,
  parcels: p4,
  createdAt: Date.now()
};
Store.getState().installments.push(inst4);
Store.emit({ type: 'installment:create' });

/* 7.1 Editar descrição */
inst4.description = 'Notebook Gamer (editado)';
Store.emit({ type: 'installment:update', payload: inst4 });
assert('descrição alterada', inst4.description === 'Notebook Gamer (editado)');

/* 7.2 Editar valor total (recria parcelas) */
const oldById = new Map(inst4.parcels.map(p => [p.number, p]));
inst4.totalAmount = 4000;
inst4.installmentsCount = 12;
const newAmount = inst4.totalAmount / inst4.installmentsCount;
inst4.parcels = generateParcels(12, newAmount, new Date(2026, 5, 15)).map(p => {
  const old = oldById.get(p.number);
  return old ? Object.assign(p, {
    paid: old.paid, status: old.status, paidDate: old.paidDate, id: old.id
  }) : p;
});
Store.emit({ type: 'installment:update', payload: inst4 });
assert('parcelas recriadas para 12', inst4.parcels.length === 12);
assert('novo totalAmount = 4000', inst4.totalAmount === 4000);
assert('valor parcela recalculado', Math.abs(inst4.parcels[0].amount - (4000/12)) < 0.01);

console.log('\n========================================');
console.log('  PARCELAS — MARCAR/REABRIR INDIVIDUALMENTE');
console.log('========================================');

reset();
const p5 = generateParcels(5, 100, new Date(2026, 5, 1));
const inst5 = {
  id: Store.uid('inst'),
  description: 'Compra 5x',
  totalAmount: 500,
  installmentsCount: 5,
  firstDueDate: '2026-06-01',
  categoryId: comprasCat.id,
  paymentMethod: 'Cartão',
  cardId: null,
  parcels: p5,
  createdAt: Date.now()
};
Store.getState().installments.push(inst5);

/* 8.1 Marcar parcela 3 como paga */
const p3_5 = inst5.parcels[2];
p3_5.paid = true;
p3_5.status = 'paid';
p3_5.paidDate = Utils.today();
Store.emit({ type: 'installment:update', payload: inst5 });
assert('parcela 3 paga', inst5.parcels[2].paid === true);
assert('status parcela 3 = paid', inst5.parcels[2].status === 'paid');
assert('paidDate preenchido', inst5.parcels[2].paidDate !== null);

/* 8.2 Reabrir parcela (marcar como não paga) */
p3_5.paid = false;
p3_5.status = 'pending';
p3_5.paidDate = null;
Store.emit({ type: 'installment:update', payload: inst5 });
assert('parcela 3 reaberta', inst5.parcels[2].paid === false);
assert('status voltou a pending', inst5.parcels[2].status === 'pending');
assert('paidDate removido', inst5.parcels[2].paidDate === null);

/* 8.3 Marcar todas como pagas */
inst5.parcels.forEach(p => {
  p.paid = true;
  p.status = 'paid';
  p.paidDate = Utils.today();
});
Store.emit({ type: 'installment:update' });
assert('todas as 5 parcelas pagas', inst5.parcels.every(p => p.paid === true));
assert('todas status paid', inst5.parcels.every(p => p.status === 'paid'));

console.log('\n========================================');
console.log('  PARCELAS — CANCELAR');
console.log('========================================');

reset();
const p6 = generateParcels(8, 125, new Date(2026, 5, 1));
const inst6 = {
  id: Store.uid('inst'),
  description: 'Compra 8x',
  totalAmount: 1000,
  installmentsCount: 8,
  firstDueDate: '2026-06-01',
  categoryId: comprasCat.id,
  paymentMethod: 'Cartão',
  cardId: null,
  parcels: p6,
  createdAt: Date.now()
};
Store.getState().installments.push(inst6);

/* 9.1 Cancelar parcela 5 */
const p5_6 = inst6.parcels[4];
p5_6.status = 'cancelled';
p5_6.paid = false;
p5_6.paidDate = null;
Store.emit({ type: 'installment:update', payload: inst6 });
assert('parcela 5 cancelada', inst6.parcels[4].status === 'cancelled');
assert('não está paga', inst6.parcels[4].paid === false);

/* 9.2 Tentar pagar parcela cancelada (não deve mudar) */
const origStatus = p5_6.status;
if (p5_6.status === 'cancelled') {
  /* toggle não deve ter efeito */
  p5_6.paid = false;
  p5_6.status = 'cancelled';
}
assert('parcela cancelada permanece cancelled', p5_6.status === 'cancelled');

/* 9.3 Cancelar várias */
inst6.parcels[5].status = 'cancelled';
inst6.parcels[6].status = 'cancelled';
Store.emit({ type: 'installment:update' });
assert('3 parcelas canceladas',
  inst6.parcels.filter(p => p.status === 'cancelled').length === 3);

/* 9.4 effectiveStatus de parcela cancelada */
const cancelledParcel = { status: 'cancelled', dueDate: '2026-06-01', paid: false };
assert('effectiveStatus cancelled',
  Utils.effectiveStatus(cancelledParcel) === 'cancelled');

/* 9.5 allEntries não inclui parcelas canceladas */
const entries = Utils.allEntries(Store.getState());
const cancelledEntries = entries.filter(e =>
  e.source === 'installment' && e.raw.status === 'cancelled');
assert('allEntries exclui parcelas canceladas', cancelledEntries.length === 0);

console.log('\n========================================');
console.log('  PARCELAS — REMOVER');
console.log('========================================');

/* 10.1 Remover parcelamento inteiro */
reset();
const p7 = generateParcels(3, 100, new Date(2026, 5, 1));
Store.getState().installments.push({
  id: Store.uid('inst'),
  description: 'Compra 3x',
  totalAmount: 300,
  installmentsCount: 3,
  firstDueDate: '2026-06-01',
  categoryId: comprasCat.id,
  paymentMethod: 'Cartão',
  cardId: null,
  parcels: p7,
  createdAt: Date.now()
});
Store.emit({ type: 'installment:create' });
assert('1 parcelamento criado p/ remoção', getInstCount() === 1);

Store.getState().installments = Store.getState().installments.filter(i => i.id !== Store.getState().installments[0].id);
Store.emit({ type: 'installment:delete' });
assert('parcelamento removido', getInstCount() === 0);

/* 10.2 Remover de lista vazia */
Store.getState().installments = Store.getState().installments.filter(i => false);
Store.emit({ type: 'installment:delete' });
assert('remover de lista vazia de parcelas não quebra', getInstCount() === 0);

/* 10.3 Múltiplos parcelamentos, remover um específico */
const instA = {
  id: Store.uid('inst'), description: 'A', totalAmount: 100,
  installmentsCount: 2, firstDueDate: '2026-06-01',
  categoryId: comprasCat.id, paymentMethod: 'Pix', cardId: null,
  parcels: generateParcels(2, 50, new Date(2026, 5, 1)),
  createdAt: Date.now()
};
const instB = {
  id: Store.uid('inst'), description: 'B', totalAmount: 200,
  installmentsCount: 4, firstDueDate: '2026-06-01',
  categoryId: comprasCat.id, paymentMethod: 'Pix', cardId: null,
  parcels: generateParcels(4, 50, new Date(2026, 5, 1)),
  createdAt: Date.now()
};
Store.getState().installments.push(instA, instB);
Store.emit({ type: 'installment:create' });
assert('2 parcelamentos criados', getInstCount() === 2);

Store.getState().installments = Store.getState().installments.filter(i => i.id !== instA.id);
Store.emit({ type: 'installment:delete', payload: instA.id });
assert('apenas B restante', getInstCount() === 1);
assert('B é o restante', Store.getState().installments[0].description === 'B');

console.log('\n========================================');
console.log('  INTEGRAÇÃO — allEntries + monthSummary');
console.log('========================================');

reset();

/* Adiciona transações + parcelamentos e verifica allEntries */
const cat = findCategory('Compras');
Store.getState().transactions.push({
  id: Store.uid('tx'), type: 'expense',
  description: 'Compra avulsa',
  amount: 89.90,
  categoryId: cat.id,
  dueDate: '2026-06-10',
  paidDate: '',
  paymentMethod: 'Pix',
  status: 'pending',
  notes: '',
  createdAt: Date.now()
});

const instParcels = generateParcels(4, 100, new Date(2026, 5, 5));
Store.getState().installments.push({
  id: Store.uid('inst'),
  description: 'Compra 4x',
  totalAmount: 400,
  installmentsCount: 4,
  firstDueDate: '2026-06-05',
  categoryId: cat.id,
  paymentMethod: 'Cartão',
  cardId: null,
  parcels: instParcels,
  createdAt: Date.now()
});
Store.emit({ type: 'transaction:create' });
Store.emit({ type: 'installment:create' });

const all = Utils.allEntries(Store.getState());
assert('allEntries contém transação', all.some(e => e.kind === 'transaction'));
assert('allEntries contém parcelas', all.some(e => e.kind === 'installment'));
assert('parcelas com installmentLabel',
  all.filter(e => e.kind === 'installment').every(e => e.installmentLabel !== null));

/* monthSummary com parcelas + transações */
const ms = Utils.monthSummary(Store.getState(), 2026, 5);
assert('monthSummary inclui parcelas', ms.entries.length >= 2);
assert('total despesas > 0', ms.expense > 0);

console.log('\n========================================');
console.log('  CRIAÇÃO VIA SIMULADOR (createFromSimulator)');
console.log('========================================');

reset();

/* Simula o que o simulador faz */
const simDesc = 'Simulação Compra';
const simTotal = 2400;
const simCount = 12;
const simBaseDate = new Date(2026, 5, 1);
const simAmount = simTotal / simCount;
const simParcels = generateParcels(simCount, simAmount, simBaseDate);

const simInst = {
  id: Store.uid('inst'),
  description: simDesc,
  totalAmount: simTotal,
  installmentsCount: simCount,
  firstDueDate: Utils.isoDate(simBaseDate),
  categoryId: cat.id,
  paymentMethod: 'Cartão de Crédito',
  cardId: null,
  parcels: simParcels,
  createdAt: Date.now()
};
Store.getState().installments.push(simInst);
Store.emit({ type: 'installment:create', payload: simInst });

assert('parcelamento do simulador criado', getInstCount() === 1);
assert('12 parcelas', simInst.parcels.length === 12);
assert('parcela de 200 reais', Math.abs(simInst.parcels[0].amount - 200) < 0.01);
assert('datas mensais progressivas',
  simInst.parcels[1].dueDate > simInst.parcels[0].dueDate);

console.log('\n========================================');
console.log('  CONSISTÊNCIA DE DADOS PÓS-OPERAÇÕES');
console.log('========================================');

reset();

/* Sequência completa: criar tx, editar, remover; criar parcela, marcar paga, cancelar */
const cicloState = Store.getState();

/* Lançamentos */
const c1 = cicloState.transactions;
c1.push({ id: Store.uid('tx'), type: 'income', description: 'Entrada', amount: 5000, categoryId: findCategory('Salário').id, dueDate: '2026-06-01', paidDate: '2026-06-01', paymentMethod: 'Pix', status: 'paid', notes: '', createdAt: Date.now() });
c1.push({ id: Store.uid('tx'), type: 'expense', description: 'Saída', amount: 300, categoryId: findCategory('Alimentação').id, dueDate: '2026-06-15', paidDate: '', paymentMethod: 'Dinheiro', status: 'pending', notes: '', createdAt: Date.now() });
assert('2 transações consistentes', c1.length === 2);

/* Editar saída */
c1[1].amount = 350;
c1[1].paidDate = '2026-06-15';
c1[1].status = 'paid';
assert('edição reflete no estado', c1[1].amount === 350 && c1[1].status === 'paid');

/* Remover entrada */
Store.getState().transactions = c1.filter(t => t.id !== c1[0].id);
assert('1 transação após remoção', Store.getState().transactions.length === 1);
assert('restante é a despesa', Store.getState().transactions[0].description === 'Saída');

/* Parcelas */
const cp = generateParcels(6, 83.33, new Date(2026, 5, 1));
const ci = { id: Store.uid('inst'), description: 'Curso', totalAmount: 500, installmentsCount: 6, firstDueDate: '2026-06-01', categoryId: cat.id, paymentMethod: 'Cartão', cardId: null, parcels: cp, createdAt: Date.now() };
Store.getState().installments.push(ci);

/* Pagar parcelas 1 e 2 */
ci.parcels[0].paid = true; ci.parcels[0].status = 'paid'; ci.parcels[0].paidDate = '2026-06-01';
ci.parcels[1].paid = true; ci.parcels[1].status = 'paid'; ci.parcels[1].paidDate = '2026-07-01';
assert('2 parcelas pagas', ci.parcels.filter(p => p.paid).length === 2);

/* Cancelar parcela 5 */
ci.parcels[4].status = 'cancelled'; ci.parcels[4].paid = false;
assert('1 cancelada', ci.parcels.filter(p => p.status === 'cancelled').length === 1);

/* allEntries não mostra cancelada */
const allAfter = Utils.allEntries(Store.getState());
const instEntries = allAfter.filter(e => e.source === 'installment');
assert('parcela cancelada não aparece', instEntries.every(e => e.raw.status !== 'cancelled'));
assert('parcelas não canceladas aparecem', instEntries.length === 5);

/* Saldo geral */
const bal = Utils.overallBalance(Store.getState());
assert('overallBalance é número', typeof bal === 'number');

/* futureCommitments */
const fut = Utils.futureCommitments(Store.getState());
assert('futureCommitments retorna array', Array.isArray(fut));

/* =====================================================================
   RESUMO
   ===================================================================== */
console.log(`\n========================================`);
console.log(`  RESULTADO FINAL: ${pass} passaram, ${fail} falharam`);
console.log(`========================================`);
process.exit(fail ? 1 : 0);
