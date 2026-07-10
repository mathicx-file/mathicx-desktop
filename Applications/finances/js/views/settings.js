/* =====================================================================
   VIEW: SETTINGS — Temas, orçamento, backup/restore, dados
   ===================================================================== */
(function (global) {
  'use strict';
  const { $, $$, el, money, pct, Utils, UI } = global;
  const App = global.App = global.App || {};

  // Paletas pré-definidas p/ tema personalizado
  const THEMES = [
    { id: 'light', label: 'Claro', preview: '#f4f5fb' },
    { id: 'dark', label: 'Escuro', preview: '#0f1117' },
    { id: 'auto', label: 'Automático', preview: 'linear-gradient(135deg,#f4f5fb,#0f1117)' },
    { id: 'custom', label: 'Personalizado', preview: 'linear-gradient(135deg,#6366f1,#ec4899)' }
  ];
  const GRADIENTS = [
    ['#6366f1', '#8b5cf6'],
    ['#3b82f6', '#06b6d4'],
    ['#10b981', '#14b8a6'],
    ['#f59e0b', '#ef4444'],
    ['#ec4899', '#8b5cf6'],
    ['#0ea5e9', '#6366f1'],
    ['#14b8a6', '#3b82f6'],
    ['#f43f5e', '#f59e0b']
  ];

  function render() {
    const state = Store.getState();
    const root = $('#viewRoot');
    root.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Configurações</h1>
          <p>Personalize a aparência, orçamentos e gerencie seus dados</p>
        </div>
      </div>

      <!-- Tema -->
      <div class="card card--pad-lg mb-2">
        <div class="card__title mb-2">🎨 Aparência</div>
        <div class="grid grid--4 mb-2">
          ${THEMES.map(t => `
            <button class="card" data-theme-pick="${t.id}"
              style="text-align:center;padding:14px;cursor:pointer;${state.settings.theme === t.id ? 'border-color:var(--c-primary);box-shadow:0 0 0 2px rgba(var(--c-primary-rgb),.25)' : ''}">
              <div style="width:100%;height:50px;border-radius:10px;background:${t.preview};margin-bottom:8px;border:1px solid var(--border)"></div>
              <strong>${t.label}</strong>
            </button>`).join('')}
        </div>
        <div id="customThemeBox" ${state.settings.theme !== 'custom' ? 'style="display:none"' : ''}>
          <div class="card__subtitle mb-1">Gradiente personalizado</div>
          <div class="swatch-grid mb-2" id="gradPicker">
            ${GRADIENTS.map(([a, b], i) => `
              <div class="swatch ${(state.settings.customTheme?.gradient?.[0] === a && state.settings.customTheme?.gradient?.[1] === b) ? 'is-selected' : ''}"
                data-grad="${a},${b}" style="background:linear-gradient(135deg,${a},${b})" title="${a} → ${b}"></div>`).join('')}
          </div>
          <div class="grid grid--3">
            <div class="field">
              <label>Cor primária</label>
              <input type="color" id="ctPrimary" value="${state.settings.customTheme?.primary || '#6366f1'}" />
            </div>
            <div class="field">
              <label>Cor de destaque</label>
              <input type="color" id="ctAccent" value="${state.settings.customTheme?.accent || '#8b5cf6'}" />
            </div>
            <div class="field">
              <label>Fundo</label>
              <input type="color" id="ctBg" value="${state.settings.customTheme?.bg || '#f4f5fb'}" />
            </div>
          </div>
          <button class="btn btn--primary mt-2" id="btnApplyCustom">Aplicar tema personalizado</button>
        </div>
      </div>

      <!-- Orçamento -->
      <div class="card card--pad-lg mb-2">
        <div class="card__title mb-2">🎯 Orçamento mensal por categoria</div>
        <div class="form-grid mb-2">
          <div class="field">
            <label>Renda mensal planejada (R$)</label>
            <div class="input-group"><span>R$</span>
              <input type="number" step="0.01" min="0" id="budgetIncome" value="${state.settings.monthIncomeBudget || ''}" />
            </div>
          </div>
        </div>
        <div id="budgetList"></div>
        <button class="btn btn--ghost btn--sm mt-2" id="btnAddBudget">＋ Adicionar categoria ao orçamento</button>
      </div>

      <!-- Dados -->
      <div class="card card--pad-lg mb-2">
        <div class="card__title mb-2">💾 Backup e Dados</div>
        <div class="grid grid--2">
          <button class="btn btn--ghost" id="btnExport">⬇️ Exportar backup (JSON)</button>
          <button class="btn btn--ghost" id="btnImport">⬆️ Importar backup</button>
          <button class="btn btn--ghost" id="btnSeed">🌱 Recarregar dados de exemplo</button>
          <button class="btn btn--danger" id="btnReset">🗑️ Apagar todos os dados</button>
        </div>
        <input type="file" id="importFile" accept="application/json" style="display:none" />
        <div class="card mt-2" style="background:var(--surface-2)">
          <small class="text-muted">
            📊 <strong>Estatísticas:</strong>
            ${state.transactions.length} movimentações,
            ${state.installments.length} parcelamentos,
            ${state.recurring.length} recorrentes,
            ${state.categories.length} categorias,
            ${state.cards.length} cartões,
            ${state.goals.length} metas.
            <br>Armazenamento usado: <strong id="storageSize">—</strong>
          </small>
        </div>
      </div>

      <!-- Firebase -->
      <div class="card card--pad-lg mb-2">
        <div class="card__title mb-2">Sincronizacao Firebase</div>
        <div class="sync-status" id="firebaseSyncStatus" data-state="checking">
          <span class="sync-dot" aria-hidden="true"></span>
          <span><strong>Verificando</strong><small>Sincronizacao ainda nao inicializada.</small></span>
        </div>
        <div class="sync-actions mt-2">
          <button class="btn btn--primary" id="btnFirebaseSyncNow" disabled>Sincronizar agora</button>
        </div>
        <div class="sync-conflict-actions mt-2" id="firebaseConflictActions" hidden>
          <p class="text-muted fs-12">Escolha qual versao deve continuar. Os dados locais permanecem intactos ate sua decisao.</p>
          <div class="sync-actions">
            <button class="btn btn--ghost" id="btnUseFirebaseData">Usar versao do Firebase</button>
            <button class="btn btn--primary" id="btnKeepLocalData">Manter versao deste dispositivo</button>
          </div>
        </div>
        <div class="sync-details mt-2" id="firebaseSyncDetails">
          Os detalhes aparecerao depois da primeira sincronizacao.
        </div>
      </div>

      <div class="card card--pad-lg">
        <div class="card__title mb-1">ℹ️ Sobre</div>
        <p class="text-muted fs-12">
          <strong>Finanças Pessoais</strong> — seus dados ficam disponíveis localmente e podem ser sincronizados
          com sua conta aprovada no Mathicx-File. Feita com HTML5, CSS3 e JavaScript puro + Chart.js, jsPDF e SheetJS.
        </p>
      </div>
    `;

    // Temas
    $$('[data-theme-pick]').forEach(b => b.addEventListener('click', () => {
      const t = b.dataset.themePick;
      state.settings.theme = t;
      if (t !== 'custom') state.settings.customTheme = null;
      Store.emit({ type: 'settings:update' });
      App.applyTheme();
      UI.toast(`Tema ${THEMES.find(x => x.id === t)?.label} aplicado.`, { type: 'success' });
      render();
    }));

    // Tema custom
    const ctBox = $('#customThemeBox');
    if (state.settings.theme === 'custom') ctBox.style.display = 'block';
    $$('[data-grad]').forEach(s => s.addEventListener('click', () => {
      $$('[data-grad]').forEach(x => x.classList.remove('is-selected'));
      s.classList.add('is-selected');
    }));
    $('#btnApplyCustom').addEventListener('click', () => {
      const sel = $('[data-grad].is-selected');
      const grad = sel ? sel.dataset.grad.split(',') : GRADIENTS[0];
      state.settings.customTheme = {
        primary: $('#ctPrimary').value,
        accent: $('#ctAccent').value,
        bg: $('#ctBg').value,
        gradient: grad
      };
      state.settings.theme = 'custom';
      Store.emit({ type: 'settings:update' });
      App.applyTheme();
      UI.toast('Tema personalizado aplicado!', { type: 'success' });
    });

    // Orçamento
    $('#budgetIncome').addEventListener('change', (e) => {
      state.settings.monthIncomeBudget = parseFloat(e.target.value) || 0;
      Store.emit({ type: 'settings:budget-income' });
    });
    $('#btnAddBudget').addEventListener('click', addBudgetRow);
    renderBudgets();

    // Dados
    $('#btnExport').addEventListener('click', () => {
      Utils.download(`backup_financas_${Utils.today()}.json`, Store.exportJSON(), 'application/json');
      UI.toast('Backup exportado.', { type: 'success' });
    });
    $('#btnImport').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', handleImport);
    $('#btnSeed').addEventListener('click', () => {
      UI.confirmDialog({
        title: 'Recarregar exemplo',
        message: 'Isso vai substituir todos os dados atuais pelos dados de exemplo. Continuar?',
        confirmText: 'Recarregar', danger: true
      }).then(ok => {
        if (!ok) return;
        Store.clearAndSeed();
        UI.toast('Dados de exemplo recarregados.', { type: 'success' });
        App.navigate('dashboard');
      });
    });
    $('#btnReset').addEventListener('click', () => {
      UI.confirmDialog({
        title: 'Apagar tudo',
        message: 'Esta ação remove TODOS os seus dados permanentemente. Recomendamos exportar um backup antes. Continuar?',
        confirmText: 'Apagar tudo', danger: true
      }).then(ok => {
        if (!ok) return;
        Store.resetAll();
        UI.toast('Todos os dados foram apagados.', { type: 'success' });
        App.navigate('dashboard');
      });
    });
    $('#btnFirebaseSyncNow').addEventListener('click', async () => {
      const result = await App.syncFirebaseNow?.();
      if (result?.ok) UI.toast('Sincronizacao Firebase concluida.', { type: 'success' });
      else if (result?.reason === 'conflict') UI.toast('Conflito detectado. Escolha qual versao deve continuar.', { type: 'warn' });
      else UI.toast('Sincronizacao Firebase ainda nao esta disponivel.', { type: 'warn' });
    });
    $('#btnUseFirebaseData').addEventListener('click', async () => {
      const result = await App.resolveFirebaseConflict?.('remote');
      if (result?.ok) {
        UI.toast('Versao do Firebase carregada.', { type: 'success' });
        App.navigate('dashboard');
      } else {
        UI.toast('Nao foi possivel resolver o conflito.', { type: 'error' });
      }
    });
    $('#btnKeepLocalData').addEventListener('click', async () => {
      const result = await App.resolveFirebaseConflict?.('local');
      if (result?.ok) UI.toast('Versao deste dispositivo salva no Firebase.', { type: 'success' });
      else UI.toast('O Firebase mudou novamente. Revise o conflito antes de continuar.', { type: 'warn' });
    });
    App.updateFirebaseSyncPanel?.();
    updateStorageSize();
  }

  function renderBudgets() {
    const state = Store.getState();
    const ctx = App.getContext();
    const list = $('#budgetList');
    if (!state.budgets.length) {
      list.innerHTML = `<small class="text-muted">Nenhum orçamento configurado. Adicione categorias para acompanhar limites mensais.</small>`;
      return;
    }
    const perfilId = App.getActiveProfileId();
    const budgets = perfilId ? state.budgets.filter(b => b.perfilId === perfilId) : state.budgets;
    list.innerHTML = budgets.map(b => {
      const cat = Utils.categoryById(state, b.categoryId);
      const entries = Utils.allEntries(state, perfilId).filter(e =>
        e.type === 'expense' && e.categoryId === b.categoryId &&
        Utils.inMonth(e.dueDate, ctx.year, ctx.month));
      const spent = entries.reduce((s, e) => s + e.amount, 0);
      const over = spent > b.limit;
      return `<div class="goal-item" data-budget="${b.categoryId}">
        <div class="goal-head">
          <span>${cat.icon} ${escapeHtmlSafe(cat.name)}</span>
          <span>
            <strong class="${over ? 'text-expense' : ''}">${money(spent)}</strong> / ${money(b.limit)}
            <button class="btn btn--sm btn--ghost" data-del-budget="${b.categoryId}" title="Remover">✕</button>
          </span>
        </div>
        ${UI.progressBar(spent, b.limit, { variant: over ? 'expense' : 'income' })}
      </div>`;
    }).join('');

    $$('[data-del-budget]').forEach(b => b.addEventListener('click', () => {
      state.budgets = state.budgets.filter(x => x.categoryId !== b.dataset.delBudget);
      Store.emit({ type: 'budget:update' });
    }));
  }

  function addBudgetRow() {
    const state = Store.getState();
    const avail = state.categories.filter(c => c.type !== 'income' &&
      !state.budgets.find(b => b.categoryId === c.id));
    if (!avail.length) { UI.toast('Todas as categorias já têm orçamento.', { type: 'warn' }); return; }
    const body = el('div', { class: 'form-grid' }, [
      el('div', { class: 'field' }, [
        el('label', { text: 'Categoria' }),
        (() => { const s = el('select', { id: 'bCat' });
          s.innerHTML = avail.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
          return s; })()
      ]),
      el('div', { class: 'field' }, [
        el('label', { text: 'Limite mensal (R$)' }),
        (() => { const w = el('div', { class: 'input-group' });
          w.innerHTML = `<span>R$</span><input type="number" step="0.01" min="0" id="bLimit" />`; return w; })()
      ])
    ]);
    const footer = el('div', { style: 'display:flex;gap:10px;' }, [
      el('button', { class: 'btn btn--ghost', text: 'Cancelar', onclick: () => UI.closeModal() }),
      el('button', { class: 'btn btn--primary', text: 'Adicionar', onclick: () => {
        const catId = document.getElementById('bCat').value;
        const limit = parseFloat(document.getElementById('bLimit').value) || 0;
        if (limit <= 0) { UI.toast('Informe um limite válido.', { type: 'error' }); return; }
        const perfilId = App.getActiveProfileId();
        state.budgets.push({ categoryId: catId, limit, perfilId: perfilId || null });
        Store.emit({ type: 'budget:create' });
        UI.closeModal();
        UI.toast('Orçamento adicionado.', { type: 'success' });
      } })
    ]);
    UI.openModal({ title: 'Novo orçamento', body, footer, size: 'sm' });
  }

  function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        UI.confirmDialog({
          title: 'Importar backup',
          message: 'Deseja SUBSTITUIR todos os dados atuais pelo backup? ("Não" mescla os dados.)',
          confirmText: 'Substituir', cancelText: 'Mesclar'
        }).then(replace => {
          try {
            Store.importJSON(ev.target.result, { replace });
            UI.toast('Backup importado com sucesso!', { type: 'success' });
            App.applyTheme();
            App.navigate('dashboard');
          } catch (err) {
            UI.toast('Arquivo inválido: ' + err.message, { type: 'error' });
          }
        });
      } catch (err) {
        UI.toast('Erro ao ler arquivo.', { type: 'error' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function updateStorageSize() {
    try {
      const raw = localStorage.getItem(Store.STORAGE_KEY) || '';
      const kb = (new Blob([raw]).size / 1024).toFixed(2);
      const node = document.getElementById('storageSize');
      if (node) node.textContent = `${kb} KB`;
    } catch (e) {}
  }

  function escapeHtmlSafe(s) { return global.Utils.escapeHtml(s); }

  App.Settings = { render };
})(window);
