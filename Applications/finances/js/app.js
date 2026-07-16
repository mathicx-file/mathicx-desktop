/* =====================================================================
   APP — Orquestrador principal
   - Boot, navegação (router), contexto (mês selecionado), tema
   - Busca global, alertas (vencimentos), sidebar mobile, perfis
   ===================================================================== */
(function (global) {
  'use strict';
  const { $, $$, el, Utils, UI } = global;

  /* ---------- Definição da navegação ---------- */
  const NAV = [
    { group: 'Principal', items: [
      { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
      { id: 'transactions', label: 'Movimentações', icon: '💸' },
      { id: 'calendar', label: 'Calendário', icon: '📅' }
    ]},
    { group: 'Perfis', items: [
      { id: 'profiles', label: 'Meus Perfis', icon: '👥' },
      { id: 'comparison', label: 'Comparação', icon: '📊' },
      { id: 'transfers', label: 'Transferências', icon: '🔄' }
    ]},
    { group: 'Organização', items: [
      { id: 'installments', label: 'Parcelamentos', icon: '🧾' },
      { id: 'recurring', label: 'Recorrentes', icon: '🔁' },
      { id: 'cards', label: 'Cartões', icon: '💳' },
      { id: 'categories', label: 'Categorias', icon: '🏷️' }
    ]},
    { group: 'Planejamento', items: [
      { id: 'simulator', label: 'Simulador', icon: '🧮' },
      { id: 'goals', label: 'Metas', icon: '🎯' },
      { id: 'reports', label: 'Relatórios', icon: '📊' }
    ]},
    { group: 'Sistema', items: [
      { id: 'settings', label: 'Configurações', icon: '⚙️' }
    ]}
  ];

  const VIEWS = {
    dashboard: () => App.Dashboard.render(),
    transactions: () => App.Transactions.render(),
    installments: () => App.Installments.render(),
    recurring: () => App.Recurring.render(),
    cards: () => App.Cards.render(),
    categories: () => App.Categories.render(),
    simulator: () => App.Simulator.render(),
    goals: () => App.Goals.render(),
    reports: () => App.Reports.render(),
    calendar: () => App.Calendar.render(),
    settings: () => App.Settings.render(),
    profiles: () => App.Profiles.render(),
    transfers: () => App.Transfers.render(),
    comparison: () => App.Comparison.render()
  };

  /* ---------- Estado de navegação ---------- */
  let currentView = 'dashboard';
  let context = (() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  })();
  let firebaseSyncModule = null;
  let firebaseSyncStatus = {
    state: 'checking',
    message: 'Sincronizacao ainda nao inicializada.',
  };
  let firebaseConflictModalOpen = false;

  function getContext() { return context; }
  function setContext(c) { Object.assign(context, c); updatePeriodLabel(); }

  function getActiveProfileId() {
    const s = Store.getState().settings;
    return s.activeProfileId || null; // null = todos
  }

  /* ---------- Boot ---------- */
  function init() {
    setupHostListener();
    Store.load();
    Store.subscribe(onStoreChange);
    buildNav();
    bindGlobalUI();
    bindFirebaseSyncStatus();
    applyTheme();
    navigate('dashboard');
    renderAlerts();
    setupFirebaseSync();

    // Verifica vencimentos atrasados a cada minuto (atualiza badges)
    setInterval(renderAlerts, 60000);
    window.addEventListener('storage', (e) => {
      if (e.key === Store.STORAGE_KEY) {
        Store.load();
        renderAlerts();
        if (VIEWS[currentView]) VIEWS[currentView]();
      }
    });
  }

  async function setupFirebaseSync() {
    if (!shouldAttemptFirebaseSync()) {
      setFirebaseSyncStatus({
        state: 'disabled',
        message: 'Sincronizacao remota indisponivel neste modo.',
      });
      return;
    }

    try {
      const module = await import('./firebase/finances-firebase-sync.js');
      firebaseSyncModule = module;
      const result = await module.financesFirebaseSync.init({ storage: Store });
      if (result.enabled) {
        console.info('[finances-firebase-sync] enabled for current user');
      }
    } catch (error) {
      console.info('[finances-firebase-sync] unavailable in this runtime', error?.message || error);
      setFirebaseSyncStatus({
        state: 'error',
        message: 'Nao foi possivel inicializar a sincronizacao remota.',
        error: error?.message || String(error),
      });
    }
  }

  function shouldAttemptFirebaseSync() {
    const location = global.location;
    if (!location?.protocol) return false;
    if (location.protocol === 'file:') return false;
    const params = new URLSearchParams(location.search || '');
    const scope = String(params.get('desktopUserScope') || '').trim();
    return Boolean(scope && scope !== 'local' && scope !== 'guest-local-v1');
  }

  function bindFirebaseSyncStatus() {
    window.addEventListener('finances:firebase-sync-status', (event) => {
      setFirebaseSyncStatus(event.detail || {});
    });
  }

  function setFirebaseSyncStatus(detail) {
    firebaseSyncStatus = {
      ...firebaseSyncStatus,
      ...detail,
    };
    updateFirebaseSyncPanel();
    if (firebaseSyncStatus.state === 'conflict') {
      showFirebaseConflictModal(firebaseSyncStatus);
    }
  }

  function getFirebaseSyncStatus() {
    return { ...firebaseSyncStatus };
  }

  async function syncFirebaseNow() {
    if (!firebaseSyncModule?.financesFirebaseSync) {
      setFirebaseSyncStatus({
        state: 'checking',
        message: 'A sincronizacao ainda esta inicializando.',
      });
      return { ok: false, reason: 'not-ready' };
    }
    return firebaseSyncModule.financesFirebaseSync.syncNow();
  }

  function beginFirebaseRestore() {
    return firebaseSyncModule?.financesFirebaseSync?.beginRestore()
      || { ok: true, supported: false };
  }

  function endFirebaseRestore(payload) {
    return firebaseSyncModule?.financesFirebaseSync?.endRestore(payload)
      || { ok: true, supported: false };
  }

  async function resolveFirebaseConflict(strategy) {
    if (!firebaseSyncModule?.financesFirebaseSync) {
      return { ok: false, reason: 'not-ready' };
    }
    return firebaseSyncModule.financesFirebaseSync.resolveConflict(strategy);
  }

  function showFirebaseConflictModal(status) {
    if (firebaseConflictModalOpen || status?.state !== 'conflict') return;
    if (!global.UI?.openModal) return;
    if (global.UI._currentModal) {
      setTimeout(() => showFirebaseConflictModal(getFirebaseSyncStatus()), 400);
      return;
    }

    firebaseConflictModalOpen = true;
    const remoteDate = status.remoteUpdatedAt
      ? new Date(status.remoteUpdatedAt).toLocaleString('pt-BR')
      : 'horario nao informado';
    const body = el('div', { class: 'sync-conflict-modal' }, [
      el('div', { class: 'sync-conflict-modal__alert', text: 'Seus dados nao foram sobrescritos.' }),
      el('p', {
        text: 'Este dispositivo possui alteracoes locais, mas o Firebase tambem recebeu uma versao mais recente. Escolha qual delas deve continuar.'
      }),
      el('div', { class: 'sync-conflict-modal__meta' }, [
        el('span', { text: `Revisao remota: ${status.revision ?? 'nao informada'}` }),
        el('span', { text: `Atualizada em: ${remoteDate}` }),
      ]),
    ]);
    const remoteButton = el('button', {
      class: 'btn btn--ghost',
      text: 'Usar versao do Firebase',
    });
    const localButton = el('button', {
      class: 'btn btn--primary',
      text: 'Manter versao deste dispositivo',
    });
    const footer = el('div', { class: 'sync-conflict-modal__actions' }, [remoteButton, localButton]);

    const resolve = async (strategy) => {
      remoteButton.disabled = true;
      localButton.disabled = true;
      let result;
      try {
        result = await resolveFirebaseConflict(strategy);
      } catch (error) {
        console.warn('[finances] failed to resolve sync conflict', error);
        result = { ok: false, reason: 'resolution-failed' };
      }
      if (result?.ok) {
        UI.closeModal();
        UI.toast(
          strategy === 'remote' ? 'Versao do Firebase carregada.' : 'Versao deste dispositivo salva no Firebase.',
          { type: 'success' }
        );
        if (strategy === 'remote') navigate('dashboard');
        return;
      }

      UI.closeModal();
      UI.toast('O conflito mudou enquanto era processado. Revise as versoes novamente.', { type: 'warn' });
      setTimeout(() => showFirebaseConflictModal(getFirebaseSyncStatus()), 100);
    };

    remoteButton.addEventListener('click', () => resolve('remote'));
    localButton.addEventListener('click', () => resolve('local'));
    UI.openModal({
      title: 'Conflito de sincronizacao',
      body,
      footer,
      size: 'sm',
      static: true,
      onClose: () => { firebaseConflictModalOpen = false; },
    });
  }

  function setupHostListener() {
    if (setupHostListener.ready) return;
    setupHostListener.ready = true;

    window.addEventListener('message', (event) => {
      if (!isAllowedHostMessage(event)) return;
      const data = event.data || {};
      const payload = data.payload || data.value || {};

      if (data.type === 'user-scope') {
        const previousKey = Store.getStorageKey?.();
        Store.setUserScope?.(payload.scope || payload.uid || payload.userId || 'local');
        if (Store.getStorageKey?.() !== previousKey) {
          renderAfterScopeChange();
        }
        return;
      }

      if (data.type === 'theme') {
        applyHostTheme(payload);
        return;
      }

      if (data.type === 'navigate') {
        const view = normalizeHostView(payload.view || payload.target || '');
        if (view) navigate(view);
      }
    });
  }

  function isAllowedHostMessage(event) {
    if (event.source !== window.parent && event.source !== window.opener && event.source !== window) return false;
    if (event.origin !== window.location.origin && !(event.origin === 'null' && window.location.protocol === 'file:')) return false;
    return event.data && typeof event.data === 'object' && typeof event.data.type === 'string';
  }

  function normalizeHostView(view) {
    const value = String(view || '').toLowerCase();
    return {
      dashboard: 'dashboard',
      home: 'dashboard',
      transactions: 'transactions',
      movimentacoes: 'transactions',
      calendar: 'calendar',
      calendario: 'calendar',
      profiles: 'profiles',
      perfis: 'profiles',
      settings: 'settings',
      configuracoes: 'settings',
      reports: 'reports',
      relatorios: 'reports',
    }[value] || '';
  }

  function renderAfterScopeChange() {
    renderProfileSelector();
    updatePeriodLabel();
    renderAlerts();
    if (VIEWS[currentView]) VIEWS[currentView]();
  }

  function applyHostTheme(value) {
    const theme = String(value || '').toLowerCase();
    if (!['dark', 'light'].includes(theme)) return;
    const s = Store.getState()?.settings;
    if (!s || s.theme !== 'auto') return;
    document.documentElement.setAttribute('data-theme', theme);
  }

  /* ---------- Navegação ---------- */
  function buildNav() {
    const nav = $('#mainNav');
    nav.innerHTML = NAV.map(section => `
      <div class="nav__group-title">${section.group}</div>
      ${section.items.map(it => {
        const badge = it.id === 'transactions' ? overdueBadge() : '';
        return `<button class="nav__item" data-nav="${it.id}">
          <span class="icon">${it.icon}</span>
          <span>${it.label}</span>
          ${badge}
        </button>`;
      }).join('')}
    `).join('');
  }

  function overdueBadge() {
    const perfilId = getActiveProfileId();
    const overdue = Utils.allEntries(Store.getState(), perfilId).filter(e => e.status === 'overdue').length;
    return overdue ? `<span class="nav__badge">${overdue}</span>` : '';
  }

  function navigate(viewId) {
    if (!VIEWS[viewId]) viewId = 'dashboard';
    currentView = viewId;
    // Marca nav ativa
    $$('.nav__item').forEach(it =>
      it.classList.toggle('is-active', it.dataset.nav === viewId));
    // Fecha sidebar mobile
    $('#sidebar').classList.remove('is-open');
    document.body.style.overflow = '';
    // Renderiza
    UI.destroyCharts();
    try {
      VIEWS[viewId]();
    } catch (err) {
      console.error('Erro ao renderizar view', viewId, err);
      $('#viewRoot').innerHTML = `<div class="card"><strong>Erro ao carregar a página.</strong><br><small>${err.message}</small></div>`;
    }
    // Scroll topo
    $('#viewRoot').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- Bind UI global ---------- */
  function bindGlobalUI() {
    // Nav clicks (delegação)
    document.addEventListener('click', (e) => {
      const navTarget = e.target.closest('[data-nav]');
      if (navTarget) { navigate(navTarget.dataset.nav); return; }
      const actTarget = e.target.closest('[data-action]');
      if (actTarget) {
        const a = actTarget.dataset.action;
        if (a === 'quick-add' || a === 'add-income') App.Transactions.add('income');
        else if (a === 'add-expense') App.Transactions.add('expense');
      }
    });

    // Profile selector
    renderProfileSelector();
    $('#profileSelector').addEventListener('change', (e) => {
      Store.getState().settings.activeProfileId = e.target.value || null;
      Store.emit({ type: 'settings:active-profile' });
      updatePeriodLabel();
      if (VIEWS[currentView]) VIEWS[currentView]();
      renderAlerts();
    });

    // Botão quick add
    $('#btnQuickAdd').addEventListener('click', () => App.Transactions.openForm());
    $('#btnFabAdd').addEventListener('click', () => App.Transactions.openForm());

    // Sidebar mobile
    $('#btnToggleSidebar').addEventListener('click', toggleSidebar);
    $('#sidebarBackdrop').addEventListener('click', toggleSidebar);

    // Theme quick toggle
    $('#btnThemeQuick').addEventListener('click', () => {
      const s = Store.getState().settings;
      s.theme = s.theme === 'dark' ? 'light' : 'dark';
      Store.emit({ type: 'settings:update' });
      applyTheme();
      UI.refreshChartColors();
      UI.toast(`Tema ${s.theme === 'dark' ? 'escuro' : 'claro'}.`, { type: 'info' });
    });

    // Period selector
    $('#btnPrevMonth').addEventListener('click', () => shiftMonth(-1));
    $('#btnNextMonth').addEventListener('click', () => shiftMonth(1));
    updatePeriodLabel();

    // Busca global
    const search = $('#globalSearch');
    search.addEventListener('input', Utils.debounce(() => {
      const q = search.value.trim().toLowerCase();
      if (!q) return;
      // Leva pra transactions com query
      navigate('transactions');
      // injeta filtro
      if (App.Transactions) {
        const root = $('#viewRoot');
        const f = root.querySelector('#fQ');
        if (f) { f.value = q; f.dispatchEvent(new Event('input')); }
      }
    }, 400));
  }

  function shiftMonth(delta) {
    const d = new Date(context.year, context.month + delta, 1);
    context.year = d.getFullYear();
    context.month = d.getMonth();
    updatePeriodLabel();
    // Re-renderiza a view atual com novo contexto
    if (VIEWS[currentView]) VIEWS[currentView]();
    renderAlerts();
  }

  function updatePeriodLabel() {
    const lbl = $('#periodLabel');
    if (lbl) {
      const state = Store.getState();
      const profId = getActiveProfileId();
      const prof = profId ? state.profiles.find(p => p.id === profId) : null;
      lbl.textContent = prof
        ? `${prof.icon} ${prof.name} · ${Utils.MONTHS_LONG[context.month]} ${context.year}`
        : `📊 Consolidado · ${Utils.MONTHS_LONG[context.month]} ${context.year}`;
    }
  }

  function renderProfileSelector() {
    const sel = $('#profileSelector');
    if (!sel) return;
    const state = Store.getState();
    const activeId = getActiveProfileId();
    sel.innerHTML = `
      <option value="">📊 Todos os Perfis</option>
      ${state.profiles.filter(p => p.active).map(p =>
        `<option value="${p.id}" ${activeId === p.id ? 'selected' : ''}>${p.icon} ${Utils.escapeHtml(p.name)}</option>`
      ).join('')}
    `;
  }

  function toggleSidebar() {
    const sb = $('#sidebar');
    const open = !sb.classList.contains('is-open');
    sb.classList.toggle('is-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  }

  /* ---------- Tema ---------- */
  const SURFACE_LIGHT = {
    '--bg-2': '#ffffff', '--surface': '#ffffff',
    '--surface-2': '#f8f9fc', '--surface-3': '#eef0f7',
    '--border': '#e6e8f0', '--text': '#1e2333',
    '--text-muted': '#6b7280', '--text-soft': '#9ca3af',
    '--on-primary': '#ffffff', 'color-scheme': 'light'
  };
  const SURFACE_DARK = {
    '--bg-2': '#161922', '--surface': '#1a1d28',
    '--surface-2': '#20242f', '--surface-3': '#2a2f3c',
    '--border': '#2a2f3c', '--text': '#e8eaf2',
    '--text-muted': '#9aa1b1', '--text-soft': '#6b7280',
    '--on-primary': '#ffffff', 'color-scheme': 'dark'
  };

  function isLightColor(hex) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const n = parseInt(full, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
  }

  function applyTheme() {
    const s = Store.getState().settings;
    const docEl = document.documentElement;

    // Limpa todas as vars do tema anterior (inclusive color-scheme)
    const ALL_CUSTOM_VARS = [
      '--c-primary', '--c-primary-rgb', '--c-accent', '--bg',
      '--gradient-primary', '--bg-2', '--surface', '--surface-2',
      '--surface-3', '--border', '--text', '--text-muted', '--text-soft',
      '--on-primary', '--sidebar-bg', 'color-scheme'
    ];
    ALL_CUSTOM_VARS.forEach(v => docEl.style.removeProperty(v));

    if (s.theme === 'custom' && s.customTheme) {
      const ct = s.customTheme;
      docEl.style.setProperty('--c-primary', ct.primary);
      docEl.style.setProperty('--c-primary-rgb', hexToRgb(ct.primary));
      docEl.style.setProperty('--c-accent', ct.accent);
      docEl.style.setProperty('--bg', ct.bg);
      if (ct.gradient && ct.gradient.length === 2) {
        docEl.style.setProperty('--gradient-primary',
          `linear-gradient(135deg, ${ct.gradient[0]}, ${ct.gradient[1]})`);
      }
      // Detecta brilho do fundo e aplica superfície clara ou escura
      const surface = isLightColor(ct.bg) ? SURFACE_LIGHT : SURFACE_DARK;
      Object.entries(surface).forEach(([k, v]) => docEl.style.setProperty(k, v));
      docEl.setAttribute('data-theme', 'custom');
    } else {
      let effective = s.theme;
      if (s.theme === 'auto') {
        effective = global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark' : 'light';
      }
      docEl.setAttribute('data-theme', effective);
    }
  }
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const n = parseInt(full, 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  }

  /* ---------- Alertas (vencimentos próximos / atrasados) ---------- */
  function renderAlerts() {
    const state = Store.getState();
    const perfilId = getActiveProfileId();
    const entries = Utils.allEntries(state, perfilId)
      .filter(e => e.status !== 'paid' && e.status !== 'cancelled');
    const overdue = entries.filter(e => e.status === 'overdue');
    const upcoming = entries.filter(e => {
      const days = Utils.daysBetween(Utils.today(), e.dueDate);
      return days >= 0 && days <= 3;
    });
    const installmentsActive = (perfilId ? state.installments.filter(i => i.perfilId === perfilId) : state.installments).filter(i =>
      i.parcels.some(p => !p.paid && p.status !== 'cancelled')).length;

    const strip = $('#alertsStrip');
    const chips = [];
    if (overdue.length) {
      const total = overdue.reduce((s, e) => s + e.amount, 0);
      chips.push(`<div class="alert-chip" title="Contas vencidas"><span class="icon">🚨</span>
        <strong>${overdue.length}</strong> conta(s) atrasada(s) · ${Utils.money(total)}</div>`);
    }
    if (upcoming.length) {
      chips.push(`<div class="alert-chip alert-chip--warn" title="Vencem nos próximos 3 dias"><span class="icon">📅</span>
        ${upcoming.length} vencimento(s) nos próximos 3 dias</div>`);
    }
    if (installmentsActive) {
      chips.push(`<div class="alert-chip alert-chip--ok"><span class="icon">🧾</span>
        ${installmentsActive} parcelamento(s) ativo(s)</div>`);
    }
    if (!chips.length) {
      chips.push(`<div class="alert-chip alert-chip--ok"><span class="icon">✅</span>Tudo em dia por aqui!</div>`);
    }
    strip.innerHTML = chips.join('');
    // Atualiza badge da nav também
    const navBadge = $('.nav__item[data-nav="transactions"] .nav__badge');
    if (navBadge) navBadge.textContent = overdue.length;
    else buildNav();
  }

  /* ---------- Reagir a mudanças no Store ---------- */
  function updateFirebaseSyncPanel() {
    const panel = document.getElementById('firebaseSyncStatus');
    const button = document.getElementById('btnFirebaseSyncNow');
    const details = document.getElementById('firebaseSyncDetails');
    const conflictActions = document.getElementById('firebaseConflictActions');
    if (!panel && !button && !details) return;

    const status = getFirebaseSyncStatus();
    if (panel) {
      panel.dataset.state = normalizeSyncState(status.state);
      panel.innerHTML = `
        <span class="sync-dot" aria-hidden="true"></span>
        <span><strong>${syncStateLabel(status.state)}</strong><small>${Utils.escapeHtml(status.message || '')}</small></span>
      `;
    }
    if (button) {
      button.disabled = !['synced', 'error'].includes(status.state);
      button.textContent = status.state === 'syncing' || status.state === 'hydrating'
        ? 'Sincronizando...'
        : 'Sincronizar agora';
    }
    if (details) {
      details.innerHTML = buildSyncDetails(status);
    }
    if (conflictActions) {
      conflictActions.hidden = status.state !== 'conflict';
    }
  }

  function normalizeSyncState(state) {
    return ['checking', 'disabled', 'pending', 'hydrating', 'syncing', 'synced', 'conflict', 'error'].includes(state)
      ? state
      : 'checking';
  }

  function syncStateLabel(state) {
    return {
      checking: 'Verificando',
      disabled: 'Desativado',
      pending: 'Aguardando aprovacao',
      hydrating: 'Carregando',
      syncing: 'Sincronizando',
      synced: 'Sincronizado',
      conflict: 'Conflito detectado',
      error: 'Erro',
    }[state] || 'Verificando';
  }

  function buildSyncDetails(status) {
    if (!status.lastSyncedAt && !status.counts && !status.error && status.state !== 'conflict') {
      return 'Os detalhes aparecerao depois da primeira sincronizacao.';
    }
    const rows = [
      ['Ultima sync', status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString('pt-BR') : 'Ainda nao registrada'],
      ['Motivo', status.reason || 'automatico'],
      ['Revisao', status.revision ?? 'Nao registrada'],
      ['Movimentacoes', status.counts?.transactions ?? 0],
      ['Parcelamentos', status.counts?.installments ?? 0],
      ['Cartoes', status.counts?.cards ?? 0],
      ['Metas', status.counts?.goals ?? 0],
    ];
    if (status.error) rows.push(['Erro', status.error]);
    if (status.remoteUpdatedAt) {
      rows.push(['Versao remota', new Date(status.remoteUpdatedAt).toLocaleString('pt-BR')]);
    }
    return `<div class="sync-details-list">${rows.map(([label, value]) =>
      `<div><strong>${label}</strong><span>${Utils.escapeHtml(String(value))}</span></div>`
    ).join('')}</div>`;
  }

  function onStoreChange(evt) {
    renderAlerts();
    renderProfileSelector();
    updatePeriodLabel();
    // Re-renderiza a view atual para refletir mudanças
    if (VIEWS[currentView]) {
      try {
        // Pequeno debounce para evitar múltiplas renders em sequência
        clearTimeout(onStoreChange._t);
        onStoreChange._t = setTimeout(() => {
          UI.destroyCharts();
          VIEWS[currentView]();
        }, 60);
      } catch (e) { console.error(e); }
    }
  }

  /* ---------- API pública ---------- */
  const App = global.App || {};
  Object.assign(App, {
    NAV, VIEWS,
    init, navigate, getContext, setContext,
    applyTheme, getActiveProfileId,
    renderProfileSelector,
    getFirebaseSyncStatus,
    syncFirebaseNow,
    beginFirebaseRestore,
    endFirebaseRestore,
    resolveFirebaseConflict,
    updateFirebaseSyncPanel
  });
  global.App = App;

  // Boot quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
