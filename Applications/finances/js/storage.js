/* =====================================================================
   STORAGE — Camada de dados (persistência local)
   - Usa LocalStorage com versão do schema.
   - Centraliza o estado (Store) e emite eventos para as views.
   - Backup/restore JSON, seed inicial com dados de exemplo.
   ===================================================================== */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'financas_pessoais_v1';
  const SCHEMA_VERSION = 1;

  /* ---------- IDs ---------- */
  const uid = (prefix = 'id') =>
    `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  /* ---------- Categorias padrão ---------- */
  function defaultCategories() {
    const defs = [
      ['Mercado', 'expense', '#ef4444', '🛒'],
      ['Alimentação', 'expense', '#f97316', '🍔'],
      ['Compras', 'expense', '#ec4899', '🛍️'],
      ['Cartão de Crédito', 'expense', '#8b5cf6', '💳'],
      ['Saúde', 'expense', '#14b8a6', '❤️‍🩹'],
      ['Hospital', 'expense', '#0ea5e9', '🏥'],
      ['Farmácia', 'expense', '#06b6d4', '💊'],
      ['Transporte', 'expense', '#6366f1', '🚗'],
      ['Combustível', 'expense', '#7c3aed', '⛽'],
      ['Moradia', 'expense', '#10b981', '🏠'],
      ['Água', 'expense', '#0284c7', '🚰'],
      ['Energia', 'expense', '#eab308', '💡'],
      ['Internet', 'expense', '#3b82f6', '🌐'],
      ['Lazer', 'expense', '#d946ef', '🎮'],
      ['Streaming', 'expense', '#f43f5e', '🎬'],
      ['Educação', 'expense', '#0891b2', '📚'],
      ['Salário', 'income', '#10b981', '💰'],
      ['Freelance', 'income', '#22c55e', '💼'],
      ['Investimentos', 'income', '#059669', '📈'],
      ['Outros', 'both', '#6b7280', '✨']
    ];
    return defs.map(([name, type, color, icon]) => ({
      id: uid('cat'),
      name, type, color, icon, perfilId: null        // null = compartilhada
    }));
  }

  /* ---------- Perfil padrão ---------- */
  function defaultProfile() {
    return {
      id: uid('prof'),
      name: 'Pessoal',
      color: '#6366f1',
      icon: '👤',
      description: 'Perfil financeiro pessoal',
      createdAt: Date.now(),
      active: true
    };
  }

  /* ---------- Estado inicial ---------- */
  function emptyState() {
    const prof = defaultProfile();
    return {
      meta: { schema: SCHEMA_VERSION, createdAt: new Date().toISOString() },
      settings: {
        theme: 'auto',
        customTheme: null,
        currency: 'BRL',
        monthIncomeBudget: 0,
        activeProfileId: prof.id,       // null = "Todos" (consolidado)
        navCollapsed: false
      },
      profiles: [prof],
      categories: defaultCategories(),
      transactions: [],
      installments: [],
      recurring: [],
      cards: [],
      goals: [],
      budgets: [],
      transfers: []              // transferências entre perfis
    };
  }

  /* ---------- Dados de exemplo ---------- */
  function seedSampleData(state) {
    const today = new Date();
    const ym = (d) => d.toISOString().slice(0, 10);
    const monthAhead = (n) => {
      const d = new Date(today.getFullYear(), today.getMonth() + n, 10);
      return ym(d);
    };

    // Garante perfil padrão
    if (!state.profiles.length) state.profiles.push(defaultProfile());
    const mainProf = state.profiles[0].id;

    // Cria perfil secundário
    const prof2 = {
      id: uid('prof'), name: 'Casa', color: '#10b981', icon: '🏠',
      description: 'Despesas da casa', createdAt: Date.now(), active: true
    };
    state.profiles.push(prof2);
    const prof2Id = prof2.id;

    const findCat = (name) => state.categories.find(c => c.name === name)?.id;

    // Salário (receita recorrente típica)
    state.transactions.push({
      id: uid('tx'), type: 'income', description: 'Salário mensal',
      amount: 5200, categoryId: findCat('Salário'),
      dueDate: ym(new Date(today.getFullYear(), today.getMonth(), 5)),
      paidDate: ym(new Date(today.getFullYear(), today.getMonth(), 5)),
      paymentMethod: 'Pix', status: 'paid', notes: '', perfilId: mainProf,
      createdAt: Date.now()
    });

    // Despesas variadas
    const expenses = [
      ['Mercado', 680, 'Cartão de Débito', 'paid', -2],
      ['Aluguel', 1500, 'Transferência', 'paid', -2],
      ['Conta de Luz', 220, 'Boleto', 'pending', 0],
      ['Internet', 99.90, 'Cartão de Crédito', 'pending', 0],
      ['Academia', 89.90, 'Cartão de Crédito', 'paid', -5],
      ['Streaming', 55.90, 'Cartão de Crédito', 'paid', -8],
      ['Posto de Gasolina', 250, 'Cartão de Crédito', 'pending', 2]
    ];
    expenses.forEach(([cat, amt, method, status, dayOffset]) => {
      const d = new Date(today); d.setDate(d.getDate() + dayOffset);
      // Algumas despesas vão pro perfil Casa
      const prof = (cat === 'Aluguel' || cat === 'Conta de Luz' || cat === 'Internet') ? prof2Id : mainProf;
      state.transactions.push({
        id: uid('tx'), type: 'expense', description: cat,
        amount: amt, categoryId: findCat(cat === 'Conta de Luz' ? 'Energia' : cat),
        dueDate: ym(d), paidDate: status === 'paid' ? ym(d) : '',
        paymentMethod: method, status, notes: '', perfilId: prof, createdAt: Date.now()
      });
    });

    // Compra parcelada (Notebook)
    const parcels = [];
    for (let i = 1; i <= 10; i++) {
      parcels.push({
        id: uid('pc'), number: i, total: 10,
        amount: 350, dueDate: monthAhead(i - 1),
        paid: i <= 3, paidDate: i <= 3 ? monthAhead(i - 1) : null,
        status: i <= 3 ? 'paid' : 'pending'
      });
    }
    state.installments.push({
      id: uid('inst'), description: 'Notebook Gamer',
      totalAmount: 3500, installmentsCount: 10, firstDueDate: monthAhead(0),
      categoryId: findCat('Compras'), paymentMethod: 'Cartão de Crédito',
      cardId: null, parcels, perfilId: mainProf, createdAt: Date.now()
    });

    // Contas recorrentes
    state.recurring.push(
      {
        id: uid('rec'), description: 'Aluguel', amount: 1500,
        categoryId: findCat('Moradia'), frequency: 'monthly', frequencyInterval: 1,
        nextDueDate: monthAhead(0), paymentMethod: 'Transferência',
        type: 'expense', active: true, perfilId: prof2Id, createdAt: Date.now()
      },
      {
        id: uid('rec'), description: 'Streaming', amount: 55.90,
        categoryId: findCat('Streaming'), frequency: 'monthly', frequencyInterval: 1,
        nextDueDate: monthAhead(0), paymentMethod: 'Cartão de Crédito',
        type: 'expense', active: true, perfilId: mainProf, createdAt: Date.now()
      }
    );

    // Cartão
    state.cards.push({
      id: uid('card'), name: 'Nubank', brand: 'Mastercard',
      limit: 8000, closingDay: 28, dueDay: 8,
      color: '#8b5cf6', perfilId: mainProf, createdAt: Date.now()
    });

    // Meta
    state.goals.push({
      id: uid('goal'), name: 'Reserva de Emergência',
      targetAmount: 20000, currentAmount: 6500,
      targetDate: ym(new Date(today.getFullYear() + 1, 0, 1)),
      color: '#10b981', icon: '🛟', perfilId: mainProf, createdAt: Date.now()
    });
    state.goals.push({
      id: uid('goal'), name: 'Reforma Cozinha',
      targetAmount: 8000, currentAmount: 1200,
      targetDate: ym(new Date(today.getFullYear(), 11, 31)),
      color: '#f59e0b', icon: '🔧', perfilId: prof2Id, createdAt: Date.now()
    });

    state.settings.monthIncomeBudget = 5200;

    // Orçamentos
    state.budgets = [
      { categoryId: findCat('Mercado'), limit: 800, perfilId: mainProf },
      { categoryId: findCat('Lazer'), limit: 300, perfilId: mainProf },
      { categoryId: findCat('Transporte'), limit: 400, perfilId: mainProf }
    ];

    return state;
  }

  /* ---------- Persistência ---------- */
  let state = null;

  function migrateState(state) {
    // Garante que perfis existam
    if (!state.profiles || !state.profiles.length) {
      state.profiles = [defaultProfile()];
    }
    const defaultProfId = state.profiles[0].id;
    if (!state.settings.activeProfileId) state.settings.activeProfileId = defaultProfId;
    if (!state.transfers) state.transfers = [];

    // Migra perfilId em registros sem perfil
    const migrate = (arr) => {
      if (!Array.isArray(arr)) return;
      arr.forEach(item => { if (!item.perfilId) item.perfilId = defaultProfId; });
    };
    migrate(state.transactions);
    migrate(state.installments);
    state.installments.forEach(inst => {
      if (inst.parcels) inst.parcels.forEach(p => { if (!p.perfilId) p.perfilId = inst.perfilId; });
    });
    migrate(state.recurring);
    migrate(state.cards);
    migrate(state.goals);
    if (state.budgets) state.budgets.forEach(b => { if (!b.perfilId) b.perfilId = defaultProfId; });

    // Migra perfilId em categorias (null = compartilhada)
    if (state.categories) state.categories.forEach(c => { if (c.perfilId === undefined) c.perfilId = null; });

    return state;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        state = seedSampleData(emptyState());
        save();
        return state;
      }
      const parsed = JSON.parse(raw);
      state = Object.assign(emptyState(), parsed);
      state.settings = Object.assign(emptyState().settings, state.settings || {});
      migrateState(state);
      return state;
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      state = emptyState();
      if (typeof global.UI !== 'undefined') {
        global.UI.toast('Erro ao carregar dados salvos. Os dados foram reiniciados.', { type: 'error' });
      }
      return state;
    }
  }

  let saveTimer = null;
  function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (err) {
        console.error('Erro ao salvar:', err);
      }
    }, 80);
  }

  function getState() { return state; }

  /* ---------- Event bus simples ---------- */
  const listeners = new Set();
  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function emit(evt) {
    // evt: { type, payload }
    save();
    listeners.forEach(fn => { try { fn(evt); } catch (e) { console.error(e); } });
  }

  /* ---------- Backup / Restore ---------- */
  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }

  function importJSON(jsonStr, { replace = true } = {}) {
    let data;
    try {
      data = JSON.parse(jsonStr);
    } catch (err) {
      throw new Error('Arquivo JSON inválido: ' + err.message);
    }
    if (!data || typeof data !== 'object') throw new Error('Arquivo inválido.');
    if (replace) {
      state = Object.assign(emptyState(), data);
    } else {
      // Merge simples: append arrays
      ['transactions', 'installments', 'recurring', 'cards', 'goals', 'categories', 'budgets']
        .forEach(k => {
          if (Array.isArray(data[k])) state[k].push(...data[k]);
        });
    }
    emit({ type: 'import' });
    return state;
  }

  function resetAll() {
    state = emptyState();
    emit({ type: 'reset' });
  }

  function clearAndSeed() {
    state = seedSampleData(emptyState());
    emit({ type: 'reset' });
  }

  /* ---------- Helpers de Perfil ---------- */
  function getActiveProfileId() {
    return state.settings.activeProfileId;
  }
  function setActiveProfileId(id) {
    state.settings.activeProfileId = id;
    save();
  }
  function getProfiles() { return state.profiles; }
  function getProfile(id) { return state.profiles.find(p => p.id === id); }
  function addProfile(prof) { state.profiles.push(prof); emit({ type: 'profile:create' }); }
  function updateProfile(id, data) {
    const p = state.profiles.find(x => x.id === id);
    if (p) Object.assign(p, data);
    emit({ type: 'profile:update' });
  }
  function removeProfile(id) {
    if (state.profiles.length <= 1) return;
    state.profiles = state.profiles.filter(p => p.id !== id);
    // Reatribui registros órfãos ao primeiro perfil
    const firstId = state.profiles[0]?.id;
    if (firstId) {
      const reassign = (arr) => { if (Array.isArray(arr)) arr.forEach(item => { if (item.perfilId === id) item.perfilId = firstId; }); };
      reassign(state.transactions);
      reassign(state.installments);
      reassign(state.recurring);
      reassign(state.cards);
      reassign(state.goals);
      if (state.budgets) state.budgets.forEach(b => { if (b.perfilId === id) b.perfilId = firstId; });
    }
    if (state.settings.activeProfileId === id) state.settings.activeProfileId = firstId;
    emit({ type: 'profile:delete' });
  }

  /* ---------- API pública ---------- */
  global.Store = {
    STORAGE_KEY,
    uid,
    load, save, getState,
    subscribe, emit,
    exportJSON, importJSON, resetAll, clearAndSeed,
    emptyState, seedSampleData,
    getActiveProfileId, setActiveProfileId,
    getProfiles, getProfile, addProfile, updateProfile, removeProfile
  };
})(window);
