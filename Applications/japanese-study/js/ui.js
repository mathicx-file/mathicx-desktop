import { JapaneseStorage } from './storage.js';
import { JapaneseSearch } from './search.js';
import { JapaneseStrokePlayer } from './stroke-player.js';
import { JapanesePractice } from './practice.js';
import { JapaneseKanaInput } from './kana-input.js';
import { JapaneseTypingEvaluator } from './typing-evaluator.js';

export const JapaneseUI = (() => {
  let allCharacters = [];
  let currentCharacters = [];
  let currentFilters = { script: 'hiragana', category: '', onlyFavorites: false, dueReview: false };
  let currentView = 'home';
  let dictionaryFilters = { tab: 'all', script: 'all' };
  let currentDictionaryWords = [];
  let expandedDictionaryId = '';
  let currentIndex = 0;
  let modalOpen = false;
  let currentStrokeModel = null;

  const elements = {};

  function init() {
    elements.searchInput = document.getElementById('search-input');
    elements.kanaExportToggle = document.getElementById('kana-export-toggle');
    elements.kanaExportPanel = document.getElementById('kana-export-panel');
    elements.kanaExportScript = document.getElementById('kana-export-script');
    elements.kanaExportPractice = document.getElementById('kana-export-practice');
    elements.kanaExportCharacterList = document.getElementById('kana-export-character-list');
    elements.kanaExportGenerate = document.getElementById('kana-export-generate');
    elements.kanaExportBlankGenerate = document.getElementById('kana-export-blank-generate');
    elements.kanaExportSummary = document.getElementById('kana-export-summary');
    elements.kanaExportSelectAll = document.getElementById('kana-export-select-all');
    elements.kanaExportSelectNone = document.getElementById('kana-export-select-none');
    elements.kanaExportOrientation = document.getElementById('kana-export-orientation');
    elements.kanaExportExtraRows = document.getElementById('kana-export-extra-rows');
    elements.dictionarySearchInput = document.getElementById('dictionary-search-input');
    elements.filtersBar = document.getElementById('filters-bar');
    elements.grid = document.getElementById('character-grid');
    elements.charactersSection = document.getElementById('characters-section');
    elements.modal = document.getElementById('study-modal');
    elements.modalContent = elements.modal.querySelector('.modal-content');
    elements.strokeArea = document.getElementById('stroke-player-area');
    elements.practiceArea = document.getElementById('practice-area');
    elements.practiceCanvas = document.getElementById('practice-canvas');
    elements.practiceResult = document.getElementById('practice-result');
    elements.dashboard = document.getElementById('learning-dashboard');
    elements.dashboardMetrics = document.getElementById('dashboard-metrics');
    elements.adaptiveDashboard = document.getElementById('adaptive-dashboard');
    elements.dashboardProgress = document.getElementById('dashboard-progress');
    elements.activityCalendar = document.getElementById('activity-calendar');
    elements.recentCharacters = document.getElementById('recent-characters');
    elements.viewTabs = document.querySelector('.view-tabs');
    elements.dictionarySection = document.getElementById('dictionary-section');
    elements.dictionaryGrid = document.getElementById('dictionary-grid');
    elements.dictionaryCount = document.getElementById('dictionary-count');
    elements.dictionaryToolbar = document.querySelector('.dictionary-toolbar');
    elements.quizSection = document.getElementById('quiz-section');
    elements.quizMode = document.getElementById('quiz-mode');
    elements.quizScript = document.getElementById('quiz-script');
    elements.quizCategoryFilter = document.getElementById('quiz-category-filter');
    elements.quizLimit = document.getElementById('quiz-limit');
    elements.quizIncludeReviews = document.getElementById('quiz-include-reviews');
    elements.quizCard = document.getElementById('quiz-card');
    elements.quizScore = document.getElementById('quiz-score');
    elements.typingSection = document.getElementById('typing-section');
    elements.typingScript = document.getElementById('typing-script');
    elements.typingSize = document.getElementById('typing-size');
    elements.typingMode = document.getElementById('typing-mode');
    elements.typingLimit = document.getElementById('typing-limit');
    elements.typingStartBtn = document.getElementById('typing-start-btn');
    elements.typingResetBtn = document.getElementById('typing-reset-btn');
    elements.typingCard = document.getElementById('typing-card');
    elements.typingScore = document.getElementById('typing-score');
    elements.studyNowBtn = document.getElementById('study-now-btn');
    elements.diagnosticBtn = document.getElementById('diagnostic-btn');
    elements.dataSection = document.getElementById('data-section');
    elements.backupExportBtn = document.getElementById('backup-export-btn');
    elements.backupFileInput = document.getElementById('backup-file-input');
    elements.backupMergeBtn = document.getElementById('backup-merge-btn');
    elements.backupReplaceBtn = document.getElementById('backup-replace-btn');
    elements.backupPreview = document.getElementById('backup-preview');
    elements.firebaseSyncStatus = document.getElementById('firebase-sync-status');
    elements.clearDataConfirm = document.getElementById('clear-data-confirm');
    elements.clearDataBtn = document.getElementById('clear-data-btn');
    elements.clearDataStatus = document.getElementById('clear-data-status');

    JapaneseStrokePlayer.init(elements.strokeArea);

    elements.modal.addEventListener('click', (e) => {
      if (e.target === elements.modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (!modalOpen) return;
      if (e.key === 'Escape') closeModal();
      if (e.key === 'ArrowRight') navigateModal(1);
      if (e.key === 'ArrowLeft') navigateModal(-1);
    });

    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
    elements.grid.addEventListener('click', handleGridClick);
    if (elements.kanaExportToggle) elements.kanaExportToggle.addEventListener('click', toggleKanaExportPanel);
    if (elements.kanaExportPanel) elements.kanaExportPanel.addEventListener('click', handleKanaExportClick);
    if (elements.kanaExportPanel) elements.kanaExportPanel.addEventListener('change', handleKanaExportChange);
    elements.viewTabs.addEventListener('click', handleViewTabsClick);
    elements.dictionaryToolbar.addEventListener('click', handleDictionaryToolbarClick);
    elements.dictionaryGrid.addEventListener('click', handleDictionaryClick);
    elements.adaptiveDashboard.addEventListener('click', handleAdaptiveDashboardClick);
    elements.adaptiveDashboard.addEventListener('change', handleAdaptiveDashboardChange);
    elements.quizSection.addEventListener('click', handleQuizClick);
    elements.quizSection.addEventListener('input', handleQuizInput);
    elements.quizSection.addEventListener('submit', handleQuizSubmit);
    elements.typingSection.addEventListener('click', handleTypingClick);
    elements.typingSection.addEventListener('input', handleTypingInput);
    elements.typingSection.addEventListener('submit', handleTypingSubmit);
    elements.quizMode.addEventListener('change', notifyQuizSettingsChange);
    elements.quizScript.addEventListener('change', notifyQuizSettingsChange);
    elements.quizCategoryFilter.addEventListener('change', notifyQuizSettingsChange);
    elements.quizLimit.addEventListener('change', notifyQuizSettingsChange);
    elements.quizIncludeReviews.addEventListener('change', notifyQuizSettingsChange);
    elements.typingScript.addEventListener('change', notifyTypingSettingsChange);
    elements.typingSize.addEventListener('change', notifyTypingSettingsChange);
    elements.typingMode.addEventListener('change', notifyTypingSettingsChange);
    elements.typingLimit.addEventListener('change', notifyTypingSettingsChange);
    elements.studyNowBtn.addEventListener('click', () => {
      if (typeof onStudyNow === 'function') onStudyNow();
    });
    elements.diagnosticBtn.addEventListener('click', () => {
      if (typeof onDiagnostic === 'function') onDiagnostic();
    });
    elements.backupExportBtn.addEventListener('click', () => {
      if (typeof onBackupExport === 'function') onBackupExport();
    });
    elements.backupFileInput.addEventListener('change', () => {
      if (typeof onBackupFileSelected === 'function') onBackupFileSelected(elements.backupFileInput.files[0]);
    });
    elements.backupMergeBtn.addEventListener('click', () => {
      if (typeof onBackupImport === 'function') onBackupImport('merge');
    });
    elements.backupReplaceBtn.addEventListener('click', () => {
      if (typeof onBackupImport === 'function') onBackupImport('replace');
    });
    elements.clearDataConfirm.addEventListener('change', () => {
      elements.clearDataBtn.disabled = !elements.clearDataConfirm.checked;
      if (!elements.clearDataConfirm.checked) {
        showClearDataStatus('A exclusão só será liberada após marcar a confirmação.');
      }
    });
    elements.clearDataBtn.addEventListener('click', () => {
      if (typeof onClearData === 'function') onClearData();
    });

    installKanaExportDebugTools();
  }

  function setCharacters(chars) {
    allCharacters = chars || [];
    renderKanaExportChoices();
  }

  function getFilters() {
    return { ...currentFilters };
  }

  function getCurrentView() {
    return currentView;
  }

  function setCurrentView(view) {
    if (!['home', 'characters', 'dictionary', 'quiz', 'typing', 'data'].includes(view)) return;
    currentView = view;
    updateViewTabs();
    updateViewVisibility();
  }

  function getDictionaryFilters() {
    return { ...dictionaryFilters };
  }

  function getQuizSettings() {
    const script = elements.quizScript ? elements.quizScript.value : 'all';
    const categories = getSelectedQuizCategories();
    return {
      mode: elements.quizMode ? elements.quizMode.value : 'recognition',
      script,
      categories: script === 'kanji' && !categories.includes('N5') ? [...categories, 'N5'] : categories,
      limit: elements.quizLimit ? elements.quizLimit.value : '10',
      includeMistakeReviews: elements.quizIncludeReviews ? elements.quizIncludeReviews.checked : true
    };
  }

  function applyQuizSettings(settings = {}) {
    if (elements.quizMode && settings.mode) elements.quizMode.value = settings.mode;
    if (elements.quizScript && settings.script) elements.quizScript.value = settings.script;
    if (elements.quizLimit && settings.limit) elements.quizLimit.value = String(settings.limit);
    if (elements.quizIncludeReviews && typeof settings.includeMistakeReviews === 'boolean') {
      elements.quizIncludeReviews.checked = settings.includeMistakeReviews;
    }
    if (elements.quizCategoryFilter && Array.isArray(settings.categories)) {
      const selected = new Set(settings.categories);
      elements.quizCategoryFilter.querySelectorAll('input[type="checkbox"]').forEach(input => {
        input.checked = selected.has(input.value);
      });
    }
    ensureKanjiQuizCategory();
  }

  function getTypingSettings() {
    return {
      script: elements.typingScript ? elements.typingScript.value : 'hiragana',
      size: elements.typingSize ? elements.typingSize.value : 'small',
      mode: elements.typingMode ? elements.typingMode.value : 'copy',
      level: 'beginner',
      category: 'all',
      limit: elements.typingLimit ? elements.typingLimit.value : '5'
    };
  }

  function applyTypingSettings(settings = {}) {
    if (elements.typingScript && settings.script) elements.typingScript.value = settings.script;
    if (elements.typingSize && settings.size) elements.typingSize.value = settings.size;
    if (elements.typingMode && settings.mode) elements.typingMode.value = settings.mode;
    if (elements.typingLimit && settings.limit) elements.typingLimit.value = String(settings.limit);
  }

  function getSelectedQuizCategories() {
    if (!elements.quizCategoryFilter) return ['gojuuon', 'dakuon', 'handakuon', 'youon'];
    return Array.from(elements.quizCategoryFilter.querySelectorAll('input[type="checkbox"]:checked'))
      .map(input => input.value);
  }

  function setFilters(filters) {
    Object.assign(currentFilters, filters);
    updateFilterButtons();
  }

  function renderGrid(characters) {
    const grid = elements.grid;
    currentCharacters = characters || [];

    if (!characters || characters.length === 0) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDD0D</div><p>Nenhum caractere encontrado</p></div>';
      return;
    }

    grid.innerHTML = '';
    const frag = document.createDocumentFragment();

    characters.forEach((char, idx) => {
      const id = JapaneseSearch.buildId(char);
      const isFav = JapaneseStorage.isFavorite(id);

      const card = document.createElement('div');
      card.className = 'character-card';
      card.dataset.index = idx;
      card.dataset.id = id;
      card.innerHTML =
        '<button class="favorite-btn ' + (isFav ? 'active' : '') + '" data-id="' + id + '" data-char="' + char.char + '" title="Favorito">' + (isFav ? '\u2605' : '\u2606') + '</button>' +
        '<div class="romaji">' + getCardSubtitle(char) + '</div>' +
        '<div class="char-display">' + char.char + '</div>' +
        '<span class="category-tag">' + getCategoryLabel(char.category) + '</span>';

      frag.appendChild(card);
    });

    grid.appendChild(frag);
  }

  function renderDictionary(words) {
    currentDictionaryWords = words || [];
    const grid = elements.dictionaryGrid;

    if (elements.dictionaryCount) {
      elements.dictionaryCount.textContent = currentDictionaryWords.length + (currentDictionaryWords.length === 1 ? ' palavra' : ' palavras');
    }

    if (!currentDictionaryWords.length) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDD0D</div><p>Nenhuma palavra encontrada</p></div>';
      return;
    }

    grid.innerHTML =
      '<div class="dictionary-table-head" aria-hidden="true">' +
        '<span>Japon\u00eas</span>' +
        '<span>Leitura</span>' +
        '<span>Romaji</span>' +
        '<span>Descri\u00e7\u00e3o</span>' +
        '<span>Tags</span>' +
        '<span>A\u00e7\u00f5es</span>' +
      '</div>';
    const frag = document.createDocumentFragment();

    currentDictionaryWords.forEach((word, index) => {
      const isFav = JapaneseStorage.isDictionaryFavorite(word.id);
      const isExpanded = expandedDictionaryId === word.id;
      const row = document.createElement('article');
      row.className = 'dictionary-row' + (isExpanded ? ' expanded viewed' : '');
      row.dataset.index = index;
      row.dataset.id = word.id;
      row.innerHTML = renderDictionaryRow(word, isFav, isExpanded);
      frag.appendChild(row);
    });

    grid.appendChild(frag);
  }

  function renderDictionaryRow(word, isFav, isExpanded) {
    return (
      '<button class="dictionary-main" type="button" aria-expanded="' + isExpanded + '">' +
        '<span class="dictionary-word">' + escapeHtml(word.word) + '</span>' +
        '<span class="dictionary-reading">' + escapeHtml(word.reading || '-') + '</span>' +
        '<span class="dictionary-romaji">' + escapeHtml(word.romaji || '-') + '</span>' +
        '<span class="dictionary-definition">' + escapeHtml(word.definition || '-') + '</span>' +
        '<span class="dictionary-meta">' +
          '<span>' + escapeHtml(getScriptLabel(word.script)) + '</span>' +
          '<span>' + escapeHtml(word.category || 'geral') + '</span>' +
        '</span>' +
        '<span class="dictionary-actions"><span class="dictionary-expand-indicator">' + (isExpanded ? 'Fechar' : 'Detalhes') + '</span></span>' +
      '</button>' +
      '<button class="dictionary-favorite ' + (isFav ? 'active' : '') + '" data-id="' + escapeHtml(word.id) + '" title="Favoritar palavra" aria-label="Favoritar palavra">' + (isFav ? '\u2605' : '\u2606') + '</button>' +
      (isExpanded ? renderDictionaryDetail(word) : '')
    );
  }

  function renderDictionaryDetail(word) {
    return (
      '<div class="dictionary-detail">' +
        '<div><span>Definicao</span><strong>' + escapeHtml(word.definition || '-') + '</strong></div>' +
        '<div><span>Escrita</span><strong>' + escapeHtml(getScriptLabel(word.script)) + '</strong></div>' +
        '<div><span>Categoria</span><strong>' + escapeHtml(word.category || 'geral') + '</strong></div>' +
        '<div><span>Fonte</span><strong>Base local</strong></div>' +
      '</div>'
    );
  }

  function handleGridClick(e) {
    const favBtn = e.target.closest('.favorite-btn');
    if (favBtn) {
      e.stopPropagation();
      toggleCardFavorite(favBtn, favBtn.dataset.id);
      return;
    }

    const card = e.target.closest('.character-card');
    if (!card || !elements.grid.contains(card)) return;

    const index = Number(card.dataset.index);
    const char = currentCharacters[index];
    if (char) openModal(char, index);
  }

  function handleViewTabsClick(e) {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;

    currentView = btn.dataset.view;
    updateViewTabs();
    updateViewVisibility();
    if (typeof onViewChange === 'function') onViewChange(currentView);
  }

  function handleDictionaryToolbarClick(e) {
    const tabBtn = e.target.closest('[data-dictionary-tab]');
    if (tabBtn) {
      dictionaryFilters.tab = tabBtn.dataset.dictionaryTab;
      updateDictionaryControls();
      if (typeof onDictionaryFilterChange === 'function') onDictionaryFilterChange();
      return;
    }

    const scriptBtn = e.target.closest('[data-dictionary-script]');
    if (scriptBtn) {
      dictionaryFilters.script = scriptBtn.dataset.dictionaryScript;
      updateDictionaryControls();
      if (typeof onDictionaryFilterChange === 'function') onDictionaryFilterChange();
    }
  }

  function handleDictionaryClick(e) {
    const favBtn = e.target.closest('.dictionary-favorite');
    if (favBtn) {
      e.stopPropagation();
      toggleDictionaryFavorite(favBtn, favBtn.dataset.id);
      return;
    }

    const row = e.target.closest('.dictionary-row');
    if (!row || !elements.dictionaryGrid.contains(row)) return;

    const index = Number(row.dataset.index);
    const word = currentDictionaryWords[index];
    if (!word) return;

    expandedDictionaryId = expandedDictionaryId === word.id ? '' : word.id;
    renderDictionary(currentDictionaryWords);

    if (expandedDictionaryId === word.id) {
      JapaneseStorage.markDictionaryViewed(word).then(() => {
        JapaneseStorage.emitChange('dictionary-history-updated', { wordId: word.id });
      }).catch(() => {});
    }
  }

  function toggleKanaExportPanel() {
    const isHidden = elements.kanaExportPanel.hidden;
    elements.kanaExportPanel.hidden = !isHidden;
    elements.kanaExportToggle.setAttribute('aria-expanded', String(isHidden));
    if (isHidden) renderKanaExportChoices();
  }

  function handleKanaExportClick(e) {
    const modeBtn = e.target.closest('[data-kana-export-mode]');
    if (modeBtn) {
      elements.kanaExportPanel.dataset.mode = modeBtn.dataset.kanaExportMode;
      updateKanaExportMode();
      return;
    }

    if (e.target === elements.kanaExportSelectAll) {
      setKanaExportChoiceState(true);
      updateKanaExportSummary();
      return;
    }

    if (e.target === elements.kanaExportSelectNone) {
      setKanaExportChoiceState(false);
      updateKanaExportSummary();
      return;
    }

    if (e.target === elements.kanaExportGenerate && typeof onKanaExport === 'function') {
      onKanaExport(getKanaExportSettings());
      return;
    }

    if (e.target === elements.kanaExportBlankGenerate && typeof onKanaExport === 'function') {
      onKanaExport({
        ...getKanaExportSettings(),
        type: 'practice',
        blankOnly: true
      });
      return;
    }

    const expandBtn = e.target.closest('[data-kana-export-expand]');
    if (expandBtn) {
      toggleKanaExportGroupExpanded(expandBtn);
      return;
    }

    const groupHeader = e.target.closest('.kana-export-group-header');
    if (groupHeader && !e.target.closest('input')) {
      const group = groupHeader.closest('.kana-export-group');
      const groupExpandBtn = group ? group.querySelector('[data-kana-export-expand]') : null;
      if (groupExpandBtn) toggleKanaExportGroupExpanded(groupExpandBtn);
    }
  }

  function handleKanaExportChange(e) {
    if (!elements.kanaExportPanel || !elements.kanaExportPanel.contains(e.target)) return;
    if (e.target === elements.kanaExportScript || e.target.closest('.kana-export-categories')) {
      renderKanaExportChoices();
    }
    if (e.target.matches('[data-kana-export-group]')) {
      setKanaExportGroupState(e.target);
    }
    if (e.target.matches('[data-kana-export-character]')) {
      updateKanaExportGroupStates();
    }
    updateKanaExportSummary();
  }

  function updateKanaExportMode() {
    const mode = getKanaExportMode();
    elements.kanaExportPanel.querySelectorAll('[data-kana-export-mode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.kanaExportMode === mode);
    });
    if (elements.kanaExportPractice) elements.kanaExportPractice.hidden = mode !== 'practice';
    elements.kanaExportPanel.querySelectorAll('.kana-export-practice-option').forEach(el => {
      el.hidden = mode !== 'practice';
    });
    if (elements.kanaExportBlankGenerate) elements.kanaExportBlankGenerate.hidden = mode !== 'practice';
    renderKanaExportChoices();
    updateKanaExportSummary();
  }

  function renderKanaExportChoices() {
    if (!elements.kanaExportCharacterList) return;
    const script = elements.kanaExportScript ? elements.kanaExportScript.value : 'hiragana';
    const categories = getKanaExportCategories();
    const chars = (allCharacters || []).filter(char =>
      char.script === script &&
      categories.includes(char.category)
    );

    if (!chars.length) {
      elements.kanaExportCharacterList.innerHTML = '<div class="kana-export-empty">Nenhum caractere para estes filtros.</div>';
      updateKanaExportSummary();
      return;
    }

    elements.kanaExportCharacterList.innerHTML = buildKanaExportGroups(chars).map(group => {
      const checked = group.items.length > 0;
      const choices = group.items.map(char => {
        const id = JapaneseSearch.buildId(char);
        return '<label class="kana-export-choice">' +
          '<input type="checkbox" data-kana-export-character value="' + escapeHtml(id) + '" checked>' +
          '<strong>' + escapeHtml(char.char) + '</strong>' +
          '<span>' + escapeHtml(char.romaji) + '</span>' +
        '</label>';
      }).join('');

      return '<article class="kana-export-group">' +
        '<div class="kana-export-group-header">' +
          '<label class="kana-export-group-toggle">' +
            '<input type="checkbox" data-kana-export-group="' + escapeHtml(group.key) + '" checked>' +
            '<strong>' + escapeHtml(group.label) + '</strong>' +
            '<span>' + group.items.length + ' caracteres</span>' +
          '</label>' +
          '<button class="kana-export-group-expand" type="button" data-kana-export-expand aria-expanded="false" aria-label="Expandir grupo">+</button>' +
        '</div>' +
        '<div class="kana-export-group-items" hidden>' + choices + '</div>' +
      '</article>';
    }).join('');
    initializeKanaExportGroups();
    updateKanaExportGroupStates();
    updateKanaExportSummary();
  }

  function setKanaExportChoiceState(checked) {
    if (!elements.kanaExportCharacterList) return;
    elements.kanaExportCharacterList.querySelectorAll('[data-kana-export-character]').forEach(input => {
      input.checked = checked;
    });
    updateKanaExportGroupStates();
  }

  function setKanaExportGroupState(groupInput) {
    const group = groupInput.closest('.kana-export-group');
    if (!group) return;
    group.querySelectorAll('[data-kana-export-character]').forEach(input => {
      input.checked = groupInput.checked;
    });
  }

  function toggleKanaExportGroupExpanded(expandBtn) {
    const group = expandBtn.closest('.kana-export-group');
    if (!group) return;
    const expanded = !group.classList.contains('expanded');
    setKanaExportGroupExpanded(group, expanded);
    logKanaExportDebug('toggle-group', getKanaExportGroupDebugInfo(group));
  }

  function initializeKanaExportGroups() {
    if (!elements.kanaExportCharacterList) return;
    elements.kanaExportCharacterList.querySelectorAll('.kana-export-group').forEach(group => {
      setKanaExportGroupExpanded(group, false);
    });
  }

  function setKanaExportGroupExpanded(group, expanded) {
    const expandBtn = group.querySelector('[data-kana-export-expand]');
    const items = group.querySelector('.kana-export-group-items');

    group.classList.toggle('expanded', expanded);
    if (expandBtn) {
      expandBtn.setAttribute('aria-expanded', String(expanded));
      expandBtn.setAttribute('aria-label', expanded ? 'Recolher grupo' : 'Expandir grupo');
      expandBtn.textContent = expanded ? '-' : '+';
    }
    if (items) {
      items.hidden = !expanded;
      items.style.display = expanded ? 'grid' : 'none';
    }
  }

  function updateKanaExportGroupStates() {
    if (!elements.kanaExportCharacterList) return;
    elements.kanaExportCharacterList.querySelectorAll('.kana-export-group').forEach(group => {
      const groupInput = group.querySelector('[data-kana-export-group]');
      const itemInputs = Array.from(group.querySelectorAll('[data-kana-export-character]'));
      const checkedCount = itemInputs.filter(input => input.checked).length;
      if (!groupInput || !itemInputs.length) return;
      groupInput.checked = checkedCount === itemInputs.length;
      groupInput.indeterminate = checkedCount > 0 && checkedCount < itemInputs.length;
    });
  }

  function getKanaExportSettings() {
    const mode = getKanaExportMode();
    const settings = {
      type: mode,
      script: elements.kanaExportScript ? elements.kanaExportScript.value : 'hiragana',
      categories: getKanaExportCategories(),
      orientation: elements.kanaExportOrientation ? elements.kanaExportOrientation.value : 'landscape',
      extraRows: elements.kanaExportExtraRows ? Number(elements.kanaExportExtraRows.value || 0) : 0
    };

    if (mode === 'practice' && elements.kanaExportCharacterList) {
      settings.characterIds = Array.from(elements.kanaExportCharacterList.querySelectorAll('[data-kana-export-character]:checked'))
        .map(input => input.value);
    }

    return settings;
  }

  function getKanaExportMode() {
    return elements.kanaExportPanel?.dataset.mode || 'reference';
  }

  function getKanaExportGroupDebugInfo(group) {
    if (!group) return null;
    const items = group.querySelector('.kana-export-group-items');
    const expandBtn = group.querySelector('[data-kana-export-expand]');
    const choices = Array.from(group.querySelectorAll('.kana-export-choice'));
    const styles = items ? getComputedStyle(items) : null;

    return {
      className: group.className,
      header: group.querySelector('.kana-export-group-header')?.innerText || '',
      expandedClass: group.classList.contains('expanded'),
      buttonText: expandBtn?.textContent || '',
      ariaExpanded: expandBtn?.getAttribute('aria-expanded') || '',
      itemsHidden: items ? items.hidden : null,
      inlineDisplay: items ? items.style.display : '',
      computedDisplay: styles ? styles.display : '',
      childCount: items ? items.children.length : 0,
      visibleChoices: choices.filter(choice => choice.offsetParent !== null).length,
      sampleChoices: choices.slice(0, 8).map(choice => choice.innerText.replace(/\s+/g, ' ').trim())
    };
  }

  function logKanaExportDebug(action, details) {
    if (typeof localStorage === 'undefined' || localStorage.getItem('kanaExportDebug') !== '1') return;
    console.info('[Japanese Study] Kana export UI debug:', action, details);
  }

  function installKanaExportDebugTools() {
    if (typeof window === 'undefined') return;
    window.JapaneseKanaExportUIDebug = {
      version: 'kana-export-ui-debug-2026-07-07',
      inspect() {
        const groups = Array.from(document.querySelectorAll('.kana-export-group'));
        const result = groups.map(getKanaExportGroupDebugInfo);
        console.table(result.map((group, index) => ({
          index,
          header: group.header.replace(/\n/g, ' | '),
          expanded: group.expandedClass,
          hidden: group.itemsHidden,
          inlineDisplay: group.inlineDisplay,
          computedDisplay: group.computedDisplay,
          childCount: group.childCount,
          visibleChoices: group.visibleChoices
        })));
        return result;
      },
      toggle(index = 0) {
        const group = document.querySelectorAll('.kana-export-group')[index];
        const button = group ? group.querySelector('[data-kana-export-expand]') : null;
        if (!button) return null;
        toggleKanaExportGroupExpanded(button);
        return getKanaExportGroupDebugInfo(group);
      },
      expand(index = 0) {
        const group = document.querySelectorAll('.kana-export-group')[index];
        if (!group) return null;
        setKanaExportGroupExpanded(group, true);
        return getKanaExportGroupDebugInfo(group);
      },
      collapse(index = 0) {
        const group = document.querySelectorAll('.kana-export-group')[index];
        if (!group) return null;
        setKanaExportGroupExpanded(group, false);
        return getKanaExportGroupDebugInfo(group);
      },
      expandAll() {
        document.querySelectorAll('.kana-export-group').forEach(group => setKanaExportGroupExpanded(group, true));
        return this.inspect();
      }
    };
  }

  function getKanaExportCategories() {
    if (!elements.kanaExportPanel) return ['gojuuon', 'dakuon', 'handakuon', 'youon'];
    const selected = Array.from(elements.kanaExportPanel.querySelectorAll('.kana-export-categories input[type="checkbox"]:checked'))
      .map(input => input.value);
    return selected.length ? selected : ['gojuuon', 'dakuon', 'handakuon', 'youon'];
  }

  function updateKanaExportSummary() {
    if (!elements.kanaExportSummary) return;
    const script = elements.kanaExportScript?.value === 'katakana' ? 'Katakana' : 'Hiragana';
    const categoryCount = getKanaExportCategories().length;
    const categoryText = categoryCount === 4 ? 'todos os niveis' : categoryCount + ' niveis';
    let choiceText = '';

    if (getKanaExportMode() === 'practice' && elements.kanaExportCharacterList) {
      const checked = elements.kanaExportCharacterList.querySelectorAll('[data-kana-export-character]:checked').length;
      const extraRows = elements.kanaExportExtraRows ? Number(elements.kanaExportExtraRows.value || 0) : 0;
      choiceText = ' - ' + checked + ' selecionados' + (extraRows > 0 ? ' - ' + extraRows + ' linhas extras' : '');
    }

    elements.kanaExportSummary.textContent = script + ' - ' + categoryText + choiceText;
  }

  function buildKanaExportGroups(chars) {
    const groups = [];
    const groupMap = new Map();

    chars.forEach(char => {
      const group = getKanaExportGroup(char);
      if (!groupMap.has(group.key)) {
        groupMap.set(group.key, { ...group, items: [] });
        groups.push(groupMap.get(group.key));
      }
      groupMap.get(group.key).items.push(char);
    });

    return groups;
  }

  function getKanaExportGroup(char) {
    const romaji = String(char.romaji || '').toLowerCase();
    const category = char.category;

    if (category === 'youon') {
      const prefix = romaji.replace(/(ya|yu|yo|a|u|o)$/u, '');
      const groupKey = getYouonGroupKey(prefix);
      return { key: 'youon-' + groupKey, label: 'Youon ' + getKanaGroupLabel(groupKey).replace('Linha ', '') };
    }

    if (['a', 'i', 'u', 'e', 'o'].includes(romaji)) return { key: 'vowels', label: 'Vogais' };
    if (romaji === 'n') return { key: 'n-final', label: 'N final' };
    if (romaji === 'wo' || romaji === 'wa') return { key: 'w', label: 'Linha W' };
    if (romaji === 'shi') return { key: 's', label: 'Linha S' };
    if (romaji === 'chi' || romaji === 'tsu') return { key: 't', label: 'Linha T' };
    if (romaji === 'fu') return { key: 'h', label: 'Linha H' };
    if (romaji === 'ji' || romaji === 'zu') return { key: 'z', label: 'Linha Z/J' };
    if (romaji === 'dji' || romaji === 'dzu') return { key: 'd', label: 'Linha D' };

    const first = romaji.charAt(0) || 'other';
    return { key: first, label: getKanaGroupLabel(first) };
  }

  function getYouonGroupKey(prefix) {
    if (prefix === 'ch') return 't';
    if (prefix === 'j') return 'z';
    return String(prefix || 'other').charAt(0);
  }

  function getKanaGroupLabel(key) {
    const labels = {
      k: 'Linha K',
      s: 'Linha S',
      t: 'Linha T',
      n: 'Linha N',
      h: 'Linha H',
      m: 'Linha M',
      y: 'Linha Y',
      r: 'Linha R',
      w: 'Linha W',
      g: 'Linha G',
      z: 'Linha Z/J',
      d: 'Linha D',
      b: 'Linha B',
      p: 'Linha P'
    };
    return labels[key] || 'Outros';
  }

  function handleAdaptiveDashboardClick(e) {
    const assistantBtn = e.target.closest('[data-assistant-action]');
    if (assistantBtn) {
      if (typeof onStudyNow === 'function') onStudyNow();
      return;
    }

    const trailBtn = e.target.closest('[data-guided-trail]');
    if (trailBtn) {
      if (typeof onGuidedTrail === 'function') onGuidedTrail(trailBtn.dataset.guidedTrail);
      return;
    }

    const quickBtn = e.target.closest('[data-quick-session]');
    if (quickBtn) {
      if (typeof onQuickSession === 'function') onQuickSession(quickBtn.dataset.quickSession);
      return;
    }

    const errorBtn = e.target.closest('[data-error-practice]');
    if (errorBtn && typeof onErrorPractice === 'function') {
      onErrorPractice({
        char: errorBtn.dataset.errorChar || '',
        script: errorBtn.dataset.errorScript || 'all',
        category: errorBtn.dataset.errorCategory || ''
      });
    }
  }

  function handleAdaptiveDashboardChange(e) {
    const input = e.target.closest('[data-goal-field]');
    if (!input || typeof onGamificationGoalsChange !== 'function') return;

    const goals = {};
    elements.adaptiveDashboard.querySelectorAll('[data-goal-field]').forEach(field => {
      goals[field.dataset.goalField] = Number(field.value || 0);
    });
    onGamificationGoalsChange(goals);
  }

  function toggleDictionaryFavorite(btn, id) {
    const result = JapaneseStorage.toggleDictionaryFavorite(id);
    btn.classList.toggle('active', result.added);
    btn.textContent = result.added ? '\u2605' : '\u2606';
    JapaneseStorage.emitChange(
      result.added ? 'dictionary-favorite-added' : 'dictionary-favorite-removed',
      { wordId: id }
    );
  }

  function handleQuizClick(e) {
    const answerBtn = e.target.closest('[data-quiz-answer]');
    if (answerBtn) {
      if (answerBtn.disabled) return;
      if (typeof onQuizAnswer === 'function') onQuizAnswer(answerBtn.dataset.quizAnswer);
      return;
    }

    const actionBtn = e.target.closest('[data-quiz-action]');
    if (!actionBtn) return;

    if (actionBtn.dataset.quizAction === 'next' && typeof onQuizNext === 'function') {
      onQuizNext();
    }
    if (actionBtn.dataset.quizAction === 'reveal' && typeof onQuizReveal === 'function') {
      onQuizReveal();
    }
    if (actionBtn.dataset.quizAction === 'reset' && typeof onQuizReset === 'function') {
      onQuizReset();
    }
  }

  function handleQuizInput(e) {
    const input = e.target.closest('[data-kana-input]');
    if (!input || input.disabled) return;

    const converted = JapaneseKanaInput.convertRomajiToKana(input.value, input.dataset.kanaInput);
    if (converted === input.value) return;

    input.value = converted;
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }

  function handleQuizSubmit(e) {
    if (!e.target.classList.contains('quiz-answer-form')) return;
    e.preventDefault();
    const input = e.target.querySelector('[name="quiz-answer"]');
    if (!input || input.disabled) return;
    if (input.dataset.kanaInput) {
      input.value = JapaneseKanaInput.convertRomajiToKana(input.value, input.dataset.kanaInput, { finalizeN: true });
    }
    if (input && typeof onQuizAnswer === 'function') {
      onQuizAnswer(input.value);
    }
  }

  function handleTypingClick(e) {
    const actionBtn = e.target.closest('[data-typing-action]');
    if (actionBtn) {
      if (actionBtn.dataset.typingAction === 'next' && typeof onTypingNext === 'function') onTypingNext();
      if (actionBtn.dataset.typingAction === 'reset' && typeof onTypingReset === 'function') onTypingReset();
      return;
    }

    if (e.target === elements.typingStartBtn && typeof onTypingStart === 'function') {
      onTypingStart(getTypingSettings());
      return;
    }

    if (e.target === elements.typingResetBtn && typeof onTypingReset === 'function') {
      onTypingReset();
    }
  }

  function handleTypingInput(e) {
    const input = e.target.closest('[data-typing-input]');
    if (!input || input.disabled) return;

    const converted = JapaneseKanaInput.convertRomajiToKana(input.value, input.dataset.typingInput);
    if (converted !== input.value) {
      input.value = converted;
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }

    if (typeof onTypingInput === 'function') onTypingInput(input.value);
  }

  function handleTypingSubmit(e) {
    if (!e.target.classList.contains('typing-answer-form')) return;
    e.preventDefault();
    const input = e.target.querySelector('[name="typing-answer"]');
    if (!input || input.disabled) return;
    input.value = JapaneseKanaInput.convertRomajiToKana(input.value, input.dataset.typingInput, { finalizeN: true });
    if (typeof onTypingSubmit === 'function') onTypingSubmit(input.value);
  }

  function notifyQuizSettingsChange() {
    ensureKanjiQuizCategory();
    if (typeof onQuizSettingsChange === 'function') onQuizSettingsChange(getQuizSettings());
  }

  function notifyTypingSettingsChange() {
    if (typeof onTypingSettingsChange === 'function') onTypingSettingsChange(getTypingSettings());
  }

  function ensureKanjiQuizCategory() {
    if (!elements.quizScript || !elements.quizCategoryFilter) return;
    if (elements.quizScript.value !== 'kanji') return;
    const kanjiCategory = elements.quizCategoryFilter.querySelector('input[value="N5"]');
    if (kanjiCategory) kanjiCategory.checked = true;
  }

  function renderQuiz(question, stats, result, context) {
    if (!elements.quizCard) return;
    updateQuizScore(stats);
    const contextHtml = renderQuizContext(context);

    if (!question) {
      elements.quizCard.innerHTML = contextHtml + '<div class="empty-state"><p>Nenhum caractere dispon\u00edvel para o quiz.</p></div>';
      return;
    }

    if (question.type === 'complete') {
      elements.quizCard.innerHTML =
        contextHtml +
        '<div class="quiz-prompt-wrap">' +
          '<div class="quiz-instruction">' + question.instruction + '</div>' +
          '<div class="quiz-complete-title">Sess\u00e3o conclu\u00edda</div>' +
          '<div class="quiz-complete-detail">' + (stats.correct || 0) + ' acertos em ' + (stats.answered || 0) + ' respostas.</div>' +
        '</div>' +
        renderSessionSummary(stats, context) +
        '<div class="quiz-actions">' +
          '<button class="quiz-secondary-btn" data-quiz-action="reset">Nova sess\u00e3o</button>' +
        '</div>';
      return;
    }

    const feedback = result ? renderQuizFeedback(result) : '';
    const body = question.type === 'typing'
      ? renderTypingQuestion(question)
      : question.type === 'flashcard'
        ? renderFlashcardQuestion(question)
        : renderChoiceQuestion(question);

    elements.quizCard.innerHTML =
      contextHtml +
      '<div class="quiz-prompt-wrap">' +
        (question.review ? '<div class="quiz-review-pill">Revis\u00e3o</div>' : '') +
        '<div class="quiz-instruction">' + question.instruction + '</div>' +
        '<div class="quiz-prompt">' + question.prompt + '</div>' +
      '</div>' +
      body +
      feedback +
      '<div class="quiz-actions">' +
        '<button class="quiz-secondary-btn" data-quiz-action="reset">Zerar placar</button>' +
        '<button class="quiz-next-btn" data-quiz-action="next">Pr\u00f3xima</button>' +
      '</div>';
  }

  function renderQuizContext(context) {
    if (!context || !context.title) return '';
    const type = context.type === 'diagnostic' ? 'diagnostic' : 'recommended';
    const label = type === 'diagnostic' ? 'Diagn\u00f3stico' : 'Estudo recomendado';
    return '<div class="quiz-session-context ' + type + '">' +
      '<div class="quiz-session-label">' + label + '</div>' +
      '<strong>' + context.title + '</strong>' +
      (context.description ? '<p>' + context.description + '</p>' : '') +
      (context.assistant?.reason ? '<p><strong>Motivo:</strong> ' + escapeHtml(context.assistant.reason) + '</p>' : '') +
    '</div>';
  }

  function renderSessionSummary(stats = {}, context = {}) {
    const accuracy = Number(stats.accuracy || 0);
    const nextStep = context?.assistant?.nextStep || getDefaultSessionNextStep(accuracy);
    const tone = accuracy >= 80 ? 'good' : accuracy >= 50 ? 'steady' : 'attention';

    return '<div class="quiz-complete-summary ' + tone + '">' +
      '<div class="quiz-session-label">Resumo do assistente</div>' +
      '<strong>' + getSessionSummaryTitle(accuracy) + '</strong>' +
      '<p>Precisao da sessao: ' + accuracy + '%.</p>' +
      '<p>Proximo passo: ' + escapeHtml(nextStep) + '</p>' +
    '</div>';
  }

  function getSessionSummaryTitle(accuracy) {
    if (accuracy >= 80) return 'Bom ritmo para avancar';
    if (accuracy >= 50) return 'Reforce antes de acelerar';
    return 'Volte para uma sessao curta de base';
  }

  function getDefaultSessionNextStep(accuracy) {
    if (accuracy >= 80) return 'Continue com a proxima recomendacao do dashboard.';
    if (accuracy >= 50) return 'Repita um bloco curto com revisoes de erro ativadas.';
    return 'Foque nos itens errados antes de incluir conteudo novo.';
  }

  function updateQuizScore(stats = {}) {
    if (!elements.quizScore) return;
    elements.quizScore.textContent =
      (stats.asked || 0) + '/' + (stats.limit || 10) + ' perguntas' +
      ' \u00b7 ' + (stats.correct || 0) + '/' + (stats.answered || 0) +
      ' \u00b7 ' + (stats.accuracy || 0) + '%';
  }

  function renderChoiceQuestion(question) {
    return '<div class="quiz-options">' + question.options.map(option =>
      '<button class="quiz-option" data-quiz-answer="' + option + '"' + (question.answered ? ' disabled' : '') + '>' + option + '</button>'
    ).join('') + '</div>';
  }

  function renderTypingQuestion(question) {
    const isKanaTyping = question.mode === 'kana-typing';
    const script = question.target?.script === 'katakana' ? 'katakana' : 'hiragana';
    const placeholder = isKanaTyping ? 'Digite romaji: ka, shi, kya...' : 'Digite a resposta...';

    return '<form class="quiz-answer-form">' +
      '<input name="quiz-answer" autocomplete="off" placeholder="' + placeholder + '"' +
        (isKanaTyping ? ' data-kana-input="' + script + '"' : '') +
        (question.answered ? ' disabled' : '') + ' />' +
      '<button class="quiz-next-btn" type="submit"' + (question.answered ? ' disabled' : '') + '>Verificar</button>' +
    '</form>' +
    (isKanaTyping ? '<p class="kana-input-hint">Digite em romaji no teclado f\u00edsico. Ex.: ka vira ' + (script === 'katakana' ? '\u30ab' : '\u304b') + '.</p>' : '');
  }

  function renderKanaKeyboard(question) {
    const script = question.target?.script === 'katakana' ? 'katakana' : 'hiragana';
    const rows = getKanaKeyboardRows(script);

    return '<div class="kana-keyboard" aria-label="Teclado japon\u00eas virtual">' +
      '<div class="kana-keyboard-header">' +
        '<span>Teclado ' + getScriptLabel(script) + '</span>' +
        '<div class="kana-keyboard-actions">' +
          '<button type="button" data-kana-action="backspace">Apagar</button>' +
          '<button type="button" data-kana-action="clear">Limpar</button>' +
        '</div>' +
      '</div>' +
      rows.map(row =>
        '<div class="kana-keyboard-row">' + row.map(kana =>
          kana
            ? '<button type="button" class="kana-key" data-kana-key="' + kana + '">' + kana + '</button>'
            : '<span class="kana-key spacer"></span>'
        ).join('') + '</div>'
      ).join('') +
    '</div>';
  }

  function getKanaKeyboardRows(script) {
    if (script === 'katakana') {
      return [
        ['ア', 'イ', 'ウ', 'エ', 'オ'],
        ['カ', 'キ', 'ク', 'ケ', 'コ'],
        ['サ', 'シ', 'ス', 'セ', 'ソ'],
        ['タ', 'チ', 'ツ', 'テ', 'ト'],
        ['ナ', 'ニ', 'ヌ', 'ネ', 'ノ'],
        ['ハ', 'ヒ', 'フ', 'ヘ', 'ホ'],
        ['マ', 'ミ', 'ム', 'メ', 'モ'],
        ['ヤ', '', 'ユ', '', 'ヨ'],
        ['ラ', 'リ', 'ル', 'レ', 'ロ'],
        ['ワ', '', 'ヲ', '', 'ン'],
        ['ガ', 'ギ', 'グ', 'ゲ', 'ゴ'],
        ['ザ', 'ジ', 'ズ', 'ゼ', 'ゾ'],
        ['ダ', 'ヂ', 'ヅ', 'デ', 'ド'],
        ['バ', 'ビ', 'ブ', 'ベ', 'ボ'],
        ['パ', 'ピ', 'プ', 'ペ', 'ポ'],
        ['ャ', 'ュ', 'ョ', 'ッ', 'ー']
      ];
    }

    return [
      ['あ', 'い', 'う', 'え', 'お'],
      ['か', 'き', 'く', 'け', 'こ'],
      ['さ', 'し', 'す', 'せ', 'そ'],
      ['た', 'ち', 'つ', 'て', 'と'],
      ['な', 'に', 'ぬ', 'ね', 'の'],
      ['は', 'ひ', 'ふ', 'へ', 'ほ'],
      ['ま', 'み', 'む', 'め', 'も'],
      ['や', '', 'ゆ', '', 'よ'],
      ['ら', 'り', 'る', 'れ', 'ろ'],
      ['わ', '', 'を', '', 'ん'],
      ['が', 'ぎ', 'ぐ', 'げ', 'ご'],
      ['ざ', 'じ', 'ず', 'ぜ', 'ぞ'],
      ['だ', 'ぢ', 'づ', 'で', 'ど'],
      ['ば', 'び', 'ぶ', 'べ', 'ぼ'],
      ['ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ'],
      ['ゃ', 'ゅ', 'ょ', 'っ', 'ー']
    ];
  }

  function renderFlashcardQuestion(question) {
    if (question.revealed) {
      return '<div class="quiz-flash-answer">' + question.answer + '</div>';
    }
    return '<button class="quiz-reveal-btn" data-quiz-action="reveal">Revelar resposta</button>';
  }

  function renderQuizFeedback(result) {
    if (result.empty) {
      return '<div class="quiz-feedback warning">Digite uma resposta antes de verificar.</div>';
    }
    const cls = result.correct ? 'correct' : 'wrong';
    const text = result.correct ? 'Correto!' : 'Resposta correta: ' + result.expected;
    return '<div class="quiz-feedback ' + cls + '">' + text + '</div>';
  }

  function renderTyping(state = {}) {
    if (!elements.typingCard) return;
    updateTypingScore(state.summary);

    if (state.error) {
      elements.typingCard.innerHTML = '<div class="empty-state"><p>' + escapeHtml(state.error) + '</p></div>';
      return;
    }

    if (!state.started) {
      elements.typingCard.innerHTML =
        '<div class="typing-empty">' +
          '<strong>Escolha uma sessao curta para comecar.</strong>' +
          '<p>O MVP usa conteudo local revisado, escrita em hiragana e copia guiada.</p>' +
        '</div>';
      return;
    }

    if (state.complete) {
      elements.typingCard.innerHTML = renderTypingSummary(state.summary);
      return;
    }

    const exercise = state.exercise;
    if (!exercise) {
      elements.typingCard.innerHTML = '<div class="empty-state"><p>Nenhum exercicio disponivel para estes filtros.</p></div>';
      return;
    }

    const feedback = state.feedback || JapaneseTypingEvaluator.getLiveFeedback(state.currentValue || '', exercise);
    const result = state.result ? renderTypingResult(state.result) : renderTypingLiveFeedback(feedback, exercise);
    elements.typingCard.innerHTML =
      '<div class="typing-progress-row">' +
        '<span>Exercicio ' + ((state.summary?.answered || 0) + 1) + ' de ' + (state.summary?.total || 0) + '</span>' +
        '<span>' + escapeHtml(getTypingCategoryLabel(exercise.category)) + '</span>' +
      '</div>' +
      '<div class="typing-reference">' +
        '<span>Portugues</span>' +
        '<strong>' + escapeHtml(exercise.promptPt) + '</strong>' +
      '</div>' +
      '<div class="typing-reference japanese">' +
        '<span>Japones esperado</span>' +
        '<strong>' + escapeHtml(exercise.referenceJapanese) + '</strong>' +
      '</div>' +
      '<form class="typing-answer-form">' +
        '<label for="typing-answer-input">Entrada convertida</label>' +
        '<input id="typing-answer-input" name="typing-answer" autocomplete="off" data-typing-input="' + escapeHtml(exercise.script) + '" value="' + escapeHtml(state.currentValue || '') + '" placeholder="Digite em romaji...">' +
        '<button class="typing-primary-btn" type="submit">Verificar</button>' +
      '</form>' +
      result +
      renderTypingNotes(exercise) +
      '<div class="typing-actions">' +
        '<button class="typing-secondary-btn" data-typing-action="reset" type="button">Reiniciar</button>' +
      '</div>';

    const input = elements.typingCard.querySelector('[data-typing-input]');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  function renderTypingLiveFeedback(feedback, exercise) {
    if (!feedback || (!feedback.correctPrefixLength && feedback.firstErrorIndex === -1)) {
      return '<div class="typing-feedback neutral">Digite em romaji. A conversao acontece no proprio campo.</div>';
    }
    if (feedback.complete) {
      return '<div class="typing-feedback correct">A frase esta completa. Pressione Enter para verificar.</div>';
    }
    if (feedback.firstErrorIndex >= 0) {
      const expected = JapaneseTypingEvaluator.normalizeAnswer(exercise.answer)[feedback.firstErrorIndex] || '';
      return '<div class="typing-feedback wrong">Primeiro ponto para revisar: posicao ' + (feedback.firstErrorIndex + 1) + (expected ? ', esperado "' + escapeHtml(expected) + '".' : '.') + '</div>';
    }
    return '<div class="typing-feedback neutral">Prefixo correto ate agora.</div>';
  }

  function renderTypingResult(result) {
    if (result.empty) return '<div class="typing-feedback warning">Digite uma resposta antes de verificar.</div>';
    if (result.correct) return '<div class="typing-feedback correct">Resposta anterior correta.</div>';
    return '<div class="typing-feedback wrong">Resposta anterior esperada: ' + escapeHtml(result.expected) + '</div>';
  }

  function renderTypingNotes(exercise) {
    const tokens = Array.isArray(exercise.tokens) ? exercise.tokens : [];
    const tokenHtml = tokens.length
      ? '<div class="typing-tokens">' + tokens.map(token =>
          '<span><strong>' + escapeHtml(token.surface) + '</strong>' + (token.meaning ? ' ' + escapeHtml(token.meaning) : '') + '</span>'
        ).join('') + '</div>'
      : '';
    return '<div class="typing-note">' + escapeHtml(exercise.notes || 'Conteudo revisado localmente.') + '</div>' + tokenHtml;
  }

  function renderTypingSummary(summary = {}) {
    return '<div class="typing-summary">' +
      '<div class="quiz-complete-title">Sessao concluida</div>' +
      '<div class="typing-summary-grid">' +
        renderTypingSummaryMetric('Frases', (summary.correct || 0) + '/' + (summary.total || 0)) +
        renderTypingSummaryMetric('Precisao', (summary.accuracy || 0) + '%') +
        renderTypingSummaryMetric('Kana/min', summary.kanaPerMinute || 0) +
        renderTypingSummaryMetric('Erros', summary.errors || 0) +
      '</div>' +
      '<p>Proximo foco: ' + escapeHtml(getTypingNextFocus(summary)) + '</p>' +
      '<div class="typing-actions">' +
        '<button class="typing-primary-btn" data-typing-action="reset" type="button">Nova sessao</button>' +
      '</div>' +
    '</div>';
  }

  function renderTypingSummaryMetric(label, value) {
    return '<div class="typing-summary-metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function updateTypingScore(summary = {}) {
    if (!elements.typingScore) return;
    if (!summary || !summary.total) {
      elements.typingScore.textContent = 'Pronto';
      return;
    }
    elements.typingScore.textContent = (summary.answered || 0) + '/' + (summary.total || 0) + ' - ' + (summary.accuracy || 0) + '%';
  }

  function getTypingNextFocus(summary = {}) {
    if ((summary.errors || 0) === 0) return 'repita a sessao com mais ritmo antes de aumentar o tamanho.';
    if ((summary.accuracy || 0) >= 60) return 'repita apenas as palavras que tiveram erro.';
    return 'volte para frases curtas e confira o primeiro caractere divergente.';
  }

  function getTypingCategoryLabel(category) {
    const labels = {
      greetings: 'cumprimentos',
      classroom: 'sala de aula',
      people: 'pessoas',
      places: 'lugares',
      objects: 'objetos',
      phrases: 'frases'
    };
    return labels[category] || category || 'geral';
  }

  function updateViewTabs() {
    elements.viewTabs.querySelectorAll('[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === currentView);
    });
  }

  function updateViewVisibility() {
    const homeOpen = currentView === 'home';
    const charactersOpen = currentView === 'characters';
    const dictionaryOpen = currentView === 'dictionary';
    const quizOpen = currentView === 'quiz';
    const typingOpen = currentView === 'typing';
    const dataOpen = currentView === 'data';
    elements.dashboard.style.display = homeOpen ? '' : 'none';
    elements.charactersSection.style.display = charactersOpen ? '' : 'none';
    elements.dictionarySection.style.display = dictionaryOpen ? '' : 'none';
    elements.quizSection.style.display = quizOpen ? '' : 'none';
    elements.typingSection.style.display = typingOpen ? '' : 'none';
    elements.dataSection.style.display = dataOpen ? '' : 'none';
  }

  function updateDictionaryControls() {
    elements.dictionaryToolbar.querySelectorAll('[data-dictionary-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.dictionaryTab === dictionaryFilters.tab);
    });
    elements.dictionaryToolbar.querySelectorAll('[data-dictionary-script]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.dictionaryScript === dictionaryFilters.script);
    });
  }

  function updateCardFavoriteState(charId) {
    const isFav = JapaneseStorage.isFavorite(charId);
    const btn = elements.grid.querySelector('.favorite-btn[data-id="' + charId + '"]');
    if (btn) {
      btn.classList.toggle('active', isFav);
      btn.textContent = isFav ? '\u2605' : '\u2606';
    }
  }

  function toggleCardFavorite(btn, id) {
    const result = JapaneseStorage.toggleFavorite(id);
    btn.classList.toggle('active', result.added);
    btn.textContent = result.added ? '\u2605' : '\u2606';
    JapaneseStorage.emitChange(
      result.added ? 'favorite-added' : 'favorite-removed',
      { charId: id }
    );
    sendHostMessage(result.added ? 'favorite-added' : 'favorite-removed', { charId: id });
  }

  function renderFilters(categories, activeCategory) {
    const bar = elements.filtersBar;
    bar.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = 'filter-btn ' + (activeCategory === '' ? 'active' : '');
    allBtn.dataset.filter = '';
    allBtn.textContent = 'Todos';
    allBtn.addEventListener('click', () => {
      currentFilters.category = '';
      updateFilterButtons();
      if (typeof onFilterChange === 'function') onFilterChange();
    });
    bar.appendChild(allBtn);

    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'filter-btn ' + (activeCategory === cat ? 'active' : '');
      btn.dataset.filter = cat;
      btn.textContent = getCategoryLabel(cat);
      btn.addEventListener('click', () => {
        currentFilters.category = cat;
        updateFilterButtons();
        if (typeof onFilterChange === 'function') onFilterChange();
      });
      bar.appendChild(btn);
    });

    const favFilterBtn = document.createElement('button');
    favFilterBtn.className = 'filter-btn fav-btn ' + (currentFilters.onlyFavorites ? 'active' : '');
    favFilterBtn.textContent = '\u2605 Favoritos';
    favFilterBtn.addEventListener('click', () => {
      currentFilters.onlyFavorites = !currentFilters.onlyFavorites;
      updateFilterButtons();
      if (typeof onFilterChange === 'function') onFilterChange();
    });
    bar.appendChild(favFilterBtn);

    const dueFilterBtn = document.createElement('button');
    dueFilterBtn.className = 'filter-btn review-btn ' + (currentFilters.dueReview ? 'active' : '');
    dueFilterBtn.textContent = 'Revisar hoje';
    dueFilterBtn.addEventListener('click', () => {
      currentFilters.dueReview = !currentFilters.dueReview;
      updateFilterButtons();
      if (typeof onFilterChange === 'function') onFilterChange();
    });
    bar.appendChild(dueFilterBtn);

    const scriptBtn = document.createElement('button');
    scriptBtn.className = 'filter-btn';
    scriptBtn.dataset.scriptToggle = 'true';
    scriptBtn.textContent = getNextScriptToggleLabel();
    scriptBtn.addEventListener('click', () => {
      currentFilters.script = getNextScript(currentFilters.script);
      updateFilterButtons();
      if (typeof onFilterChange === 'function') onFilterChange();
    });
    bar.appendChild(scriptBtn);
  }

  function getNextScript(script) {
    if (script === 'hiragana') return 'katakana';
    if (script === 'katakana') return 'kanji';
    return 'hiragana';
  }

  function getNextScriptToggleLabel() {
    const next = getNextScript(currentFilters.script);
    return '\u2192 ' + getScriptLabel(next);
  }

  let onFilterChange = null;
  let onViewChange = null;
  let onDictionaryFilterChange = null;
  let onQuizSettingsChange = null;
  let onQuizAnswer = null;
  let onQuizNext = null;
  let onQuizReveal = null;
  let onQuizReset = null;
  let onTypingSettingsChange = null;
  let onTypingStart = null;
  let onTypingInput = null;
  let onTypingSubmit = null;
  let onTypingNext = null;
  let onTypingReset = null;
  let onBackupExport = null;
  let onBackupFileSelected = null;
  let onBackupImport = null;
  let onClearData = null;
  let onKanaExport = null;
  let onStudyNow = null;
  let onDiagnostic = null;
  let onGuidedTrail = null;
  let onQuickSession = null;
  let onGamificationGoalsChange = null;
  let onErrorPractice = null;

  function onFilterChangeCallback(cb) {
    onFilterChange = cb;
  }

  function onViewChangeCallback(cb) {
    onViewChange = cb;
  }

  function onDictionaryFilterChangeCallback(cb) {
    onDictionaryFilterChange = cb;
  }

  function onQuizSettingsChangeCallback(cb) {
    onQuizSettingsChange = cb;
  }

  function onQuizAnswerCallback(cb) {
    onQuizAnswer = cb;
  }

  function onQuizNextCallback(cb) {
    onQuizNext = cb;
  }

  function onQuizRevealCallback(cb) {
    onQuizReveal = cb;
  }

  function onQuizResetCallback(cb) {
    onQuizReset = cb;
  }

  function onTypingSettingsChangeCallback(cb) {
    onTypingSettingsChange = cb;
  }

  function onTypingStartCallback(cb) {
    onTypingStart = cb;
  }

  function onTypingInputCallback(cb) {
    onTypingInput = cb;
  }

  function onTypingSubmitCallback(cb) {
    onTypingSubmit = cb;
  }

  function onTypingNextCallback(cb) {
    onTypingNext = cb;
  }

  function onTypingResetCallback(cb) {
    onTypingReset = cb;
  }

  function onBackupExportCallback(cb) {
    onBackupExport = cb;
  }

  function onBackupFileSelectedCallback(cb) {
    onBackupFileSelected = cb;
  }

  function onBackupImportCallback(cb) {
    onBackupImport = cb;
  }

  function onClearDataCallback(cb) {
    onClearData = cb;
  }

  function onKanaExportCallback(cb) {
    onKanaExport = cb;
  }

  function onStudyNowCallback(cb) {
    onStudyNow = cb;
  }

  function onDiagnosticCallback(cb) {
    onDiagnostic = cb;
  }

  function onGuidedTrailCallback(cb) {
    onGuidedTrail = cb;
  }

  function onQuickSessionCallback(cb) {
    onQuickSession = cb;
  }

  function onGamificationGoalsChangeCallback(cb) {
    onGamificationGoalsChange = cb;
  }

  function onErrorPracticeCallback(cb) {
    onErrorPractice = cb;
  }

  function updateBackupPreview(validation, fileName = '') {
    if (!elements.backupPreview) return;
    elements.backupPreview.textContent = '';

    if (!validation) {
      elements.backupPreview.textContent = 'Nenhum arquivo selecionado.';
      elements.backupMergeBtn.disabled = true;
      elements.backupReplaceBtn.disabled = true;
      return;
    }

    if (!validation.ok) {
      const title = document.createElement('strong');
      title.textContent = 'Backup inválido';
      const list = document.createElement('ul');
      validation.errors.forEach(error => {
        const item = document.createElement('li');
        item.textContent = error;
        list.appendChild(item);
      });
      elements.backupPreview.append(title, list);
      elements.backupMergeBtn.disabled = true;
      elements.backupReplaceBtn.disabled = true;
      return;
    }

    const summary = validation.summary || {};
    const title = document.createElement('strong');
    title.textContent = fileName || 'Backup válido';
    const details = document.createElement('div');
    details.className = 'backup-summary';
    [
      (summary.favorites || 0) + ' favoritos',
      (summary.dictionaryFavorites || 0) + ' palavras favoritas',
      (summary.progress || 0) + ' registros',
      (summary.srs || 0) + ' itens SRS'
    ].forEach(text => {
      const pill = document.createElement('span');
      pill.textContent = text;
      details.appendChild(pill);
    });
    elements.backupPreview.append(title, details);
    elements.backupMergeBtn.disabled = false;
    elements.backupReplaceBtn.disabled = false;
  }

  function showBackupStatus(message, type = 'info') {
    if (!elements.backupPreview) return;
    elements.backupPreview.textContent = '';
    const status = document.createElement('div');
    status.className = 'backup-status ' + type;
    status.textContent = message;
    elements.backupPreview.appendChild(status);
    if (type === 'success') {
      elements.backupFileInput.value = '';
      elements.backupMergeBtn.disabled = true;
      elements.backupReplaceBtn.disabled = true;
    }
  }

  function resetClearDataConfirmation() {
    if (!elements.clearDataConfirm || !elements.clearDataBtn) return;
    elements.clearDataConfirm.checked = false;
    elements.clearDataBtn.disabled = true;
  }

  function showClearDataStatus(message, type = 'info') {
    if (!elements.clearDataStatus) return;
    elements.clearDataStatus.textContent = '';
    const status = document.createElement('div');
    status.className = 'backup-status ' + type;
    status.textContent = message;
    elements.clearDataStatus.appendChild(status);
  }

  function updateFirebaseSyncStatus(detail = {}) {
    if (!elements.firebaseSyncStatus) return;

    const state = normalizeSyncState(detail.state);
    const label = getSyncStatusLabel(state);
    const message = detail.message || getSyncStatusMessage(state, detail);

    elements.firebaseSyncStatus.dataset.state = state;
    elements.firebaseSyncStatus.innerHTML =
      '<span class="sync-dot" aria-hidden="true"></span>' +
      '<div>' +
        '<strong>' + escapeHtml(label) + '</strong>' +
        '<span>' + escapeHtml(message) + '</span>' +
      '</div>';
  }

  function updateFilterButtons() {
    const bar = elements.filtersBar;
    bar.querySelectorAll('.filter-btn').forEach(btn => {
      if (btn.dataset.filter !== undefined) {
        btn.classList.toggle('active', btn.dataset.filter === currentFilters.category);
      }
      if (btn.classList.contains('fav-btn')) {
        btn.classList.toggle('active', currentFilters.onlyFavorites);
      }
      if (btn.classList.contains('review-btn')) {
        btn.classList.toggle('active', currentFilters.dueReview);
      }
      if (btn.dataset.scriptToggle) {
        btn.textContent = getNextScriptToggleLabel();
      }
    });
  }

  function getCardSubtitle(char) {
    if (char?.script === 'kanji') {
      return (char.meanings || []).slice(0, 2).join(', ') || char.level || 'Kanji';
    }
    return char.romaji || '';
  }

  function getReadingSummary(char) {
    if (char?.script !== 'kanji') return char.romaji || '';
    const readings = [
      ...(char.onyomi || []),
      ...(char.kunyomi || [])
    ];
    return readings.length ? readings.join(' / ') : (char.meanings || []).join(', ');
  }

  function getMeaningSummary(char) {
    return (char.meanings || []).join(', ');
  }

  function getCategoryLabel(cat) {
    const labels = {
      'gojuuon': 'Gojuuon',
      'dakuon': 'Dakuon',
      'handakuon': 'Handakuon',
      'youon': 'Youon',
      'N5': 'Kanji N5'
    };
    return labels[cat] || cat;
  }

  function getScriptLabel(script) {
    if (script === 'hiragana') return 'Hiragana';
    if (script === 'katakana') return 'Katakana';
    if (script === 'kanji') return 'Kanji';
    return script || 'Geral';
  }

  async function openModal(char, index) {
    currentIndex = index;
    modalOpen = true;
    elements.modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    markCharacterViewed(char);
    sendHostMessage('study-progress', {
      charId: JapaneseSearch.buildId(char),
      char: char.char,
      romaji: char.romaji
    });

    const header = elements.modalContent.querySelector('.modal-header');
    if (!header) {
      const h = document.createElement('div');
      h.className = 'modal-header';
      elements.modalContent.insertBefore(h, elements.strokeArea);
    }
    renderModalDetails(char);

    renderMnemonicSection(char);
    renderExamplesSection(char);

    let nav = elements.modalContent.querySelector('.modal-nav');
    if (!nav) {
      nav = document.createElement('div');
      nav.className = 'modal-nav';
      elements.modalContent.appendChild(nav);
    }
    nav.innerHTML =
      '<button class="modal-nav-btn" data-nav="prev">\u2039 Anterior</button>' +
      '<button class="modal-nav-btn" data-nav="practice">\u270D Praticar</button>' +
      '<button class="modal-nav-btn" data-nav="next">Pr\u00f3ximo \u203A</button>';

    renderSrsSection(char);

    nav.querySelector('[data-nav="prev"]').addEventListener('click', () => navigateModal(-1));
    nav.querySelector('[data-nav="next"]').addEventListener('click', () => navigateModal(1));
    nav.querySelector('[data-nav="practice"]').addEventListener('click', () => openPractice());

    currentStrokeModel = await JapaneseStrokePlayer.loadCharacter(char.unicode);
  }

  async function navigateModal(direction) {
    currentIndex += direction;
    if (currentIndex < 0) currentIndex = currentCharacters.length - 1;
    if (currentIndex >= currentCharacters.length) currentIndex = 0;
    const char = currentCharacters[currentIndex];
    if (char) {
      elements.practiceArea.style.display = 'none';
      renderModalDetails(char);
      renderMnemonicSection(char);
      renderExamplesSection(char);
      renderSrsSection(char);
      markCharacterViewed(char);
      sendHostMessage('study-progress', {
        charId: JapaneseSearch.buildId(char),
        char: char.char,
        romaji: char.romaji
      });
      currentStrokeModel = await JapaneseStrokePlayer.loadCharacter(char.unicode);
    }
  }

  function renderModalDetails(char) {
    const header = elements.modalContent.querySelector('.modal-header');
    if (header) {
      header.innerHTML =
        '<div class="modal-char">' + char.char + '</div>' +
        '<div class="modal-romaji">' + getReadingSummary(char) + '</div>' +
        (char.script === 'kanji' ? '<div class="modal-kanji-meaning">' + getMeaningSummary(char) + '</div>' : '');
    }

    let meta = elements.modalContent.querySelector('.modal-meta');
    if (!meta) {
      meta = document.createElement('div');
      meta.className = 'modal-meta';
      elements.modalContent.insertBefore(meta, elements.strokeArea);
    }

    if (char.script === 'kanji') {
      meta.innerHTML =
        '<div class="modal-meta-item"><strong>' + (char.level || 'N5') + '</strong>Nível</div>' +
        '<div class="modal-meta-item"><strong>' + char.strokes + '</strong>Tra\u00e7os</div>' +
        '<div class="modal-meta-item"><strong>' + (char.radical || '-') + '</strong>Radical</div>' +
        '<div class="modal-meta-item"><strong>' + (char.components || []).join(' ') + '</strong>Componentes</div>';
      renderKanjiReadings(char);
      return;
    }

    removeKanjiReadings();
    meta.innerHTML =
      '<div class="modal-meta-item"><strong>' + getCategoryLabel(char.category) + '</strong>Categoria</div>' +
      '<div class="modal-meta-item"><strong>' + char.strokes + '</strong>Tra\u00e7os</div>';
  }

  function renderKanjiReadings(char) {
    let section = elements.modalContent.querySelector('.kanji-readings-section');
    if (!section) {
      section = document.createElement('div');
      section.className = 'kanji-readings-section';
      elements.modalContent.insertBefore(section, elements.strokeArea);
    }

    section.innerHTML =
      '<div class="kanji-reading-row"><strong>Onyomi</strong><span>' + ((char.onyomi || []).join(' / ') || '-') + '</span></div>' +
      '<div class="kanji-reading-row"><strong>Kunyomi</strong><span>' + ((char.kunyomi || []).join(' / ') || '-') + '</span></div>' +
      '<div class="kanji-reading-row"><strong>Tags</strong><span>' + ((char.tags || []).join(', ') || '-') + '</span></div>';
  }

  function removeKanjiReadings() {
    const section = elements.modalContent.querySelector('.kanji-readings-section');
    if (section) section.remove();
  }

  function renderExamplesSection(char) {
    let examples = elements.modalContent.querySelector('.examples-section');
    if (char.examples && char.examples.length > 0) {
      if (!examples) {
        examples = document.createElement('div');
        examples.className = 'examples-section';
        elements.modalContent.appendChild(examples);
      }
      examples.innerHTML =
        '<h3>\uD83D\uDCD6 Palavras de Exemplo</h3>' +
        char.examples.map(ex =>
          '<div class="example-item"><span class="example-word">' + ex.word + '</span><span class="example-meaning">' + getExampleDetail(ex, char) + '</span></div>'
        ).join('');
    } else if (examples) {
      examples.remove();
    }
  }

  function getExampleDetail(example, char) {
    if (char.script === 'kanji') {
      return [example.reading, example.romaji, example.meaning].filter(Boolean).join(' - ');
    }
    return example.meaning || '';
  }

  function renderMnemonicSection(char) {
    let section = elements.modalContent.querySelector('.mnemonic-section');
    if (!section) {
      section = document.createElement('div');
      section.className = 'mnemonic-section';
      elements.modalContent.insertBefore(section, elements.strokeArea);
    }

    const charId = JapaneseSearch.buildId(char);
    const mnemonic = JapaneseStorage.getMnemonic(charId);
    section.innerHTML =
      '<label class="mnemonic-label" for="mnemonic-note">Mnem\u00f4nico pessoal</label>' +
      '<textarea id="mnemonic-note" class="mnemonic-note" maxlength="500" rows="2" placeholder="Ex.: parece com...">' + escapeHtml(mnemonic) + '</textarea>';

    const textarea = section.querySelector('.mnemonic-note');
    const save = () => {
      JapaneseStorage.setMnemonic(charId, textarea.value);
      JapaneseStorage.emitChange('mnemonic-updated', { charId });
    };
    textarea.addEventListener('input', save);
    textarea.addEventListener('change', save);
    textarea.addEventListener('blur', save);
  }

  function openPractice() {
    const char = currentCharacters[currentIndex];
    if (!char) return;

    elements.practiceArea.style.display = 'block';
    JapanesePractice.init(elements.practiceCanvas);
    JapanesePractice.startPractice({
      char: char.char,
      romaji: char.romaji || getMeaningSummary(char),
      unicode: char.unicode,
      strokes: char.strokes
    }, currentStrokeModel);

    const existingResult = elements.practiceResult;
    existingResult.textContent = '';
    existingResult.className = 'practice-result';
    existingResult.style.display = 'none';

    let controls = elements.practiceArea.querySelector('.practice-controls');
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'practice-controls';
      elements.practiceArea.appendChild(controls);
    }
    controls.innerHTML =
      '<button class="practice-btn" data-action="clear">Limpar</button>' +
      '<button class="practice-btn primary" data-action="check">Verificar</button>';

    controls.querySelector('[data-action="clear"]').addEventListener('click', () => {
      JapanesePractice.clearCanvas();
      existingResult.style.display = 'none';
    });

    controls.querySelector('[data-action="check"]').addEventListener('click', () => {
      const result = JapanesePractice.compare();
      existingResult.textContent = result.message;
      existingResult.className = 'practice-result ' + result.rating;
      existingResult.style.display = 'block';
    });
  }
  function renderSrsSection(char) {
    let section = elements.modalContent.querySelector('.srs-section');
    if (!section) {
      section = document.createElement('div');
      section.className = 'srs-section';
    }

    const nav = elements.modalContent.querySelector('.modal-nav');
    if (nav) {
      elements.modalContent.insertBefore(section, nav);
    } else {
      elements.modalContent.appendChild(section);
    }

    const charId = JapaneseSearch.buildId(char);
    const status = JapaneseStorage.getSrsStatus(charId);
    section.innerHTML =
      '<div class="srs-header">' +
        '<div><h3>SRS</h3><p>' + getSrsStateLabel(status.state) + ' \u00b7 pr\u00f3xima revis\u00e3o: ' + formatSrsDate(status.nextReview) + '</p></div>' +
        '<span class="srs-pill">' + (status.interval || 0) + 'd</span>' +
      '</div>' +
      '<div class="srs-controls">' +
        '<button class="srs-btn" data-srs-rating="hard">Dif\u00edcil</button>' +
        '<button class="srs-btn primary" data-srs-rating="good">Bom</button>' +
        '<button class="srs-btn" data-srs-rating="easy">F\u00e1cil</button>' +
      '</div>';

    section.querySelectorAll('[data-srs-rating]').forEach(btn => {
      btn.addEventListener('click', () => {
        const next = JapaneseStorage.reviewSrs({
          id: charId,
          char: char.char,
          romaji: char.romaji,
          script: char.script,
          category: char.category,
          meanings: char.meanings,
          onyomi: char.onyomi,
          kunyomi: char.kunyomi,
          level: char.level
        }, btn.dataset.srsRating);
        JapaneseStorage.emitChange('srs-updated', { charId, status: next });
        renderSrsSection(char);
      });
    });
  }

  function getSrsStateLabel(state) {
    const labels = {
      new: 'Novo',
      learning: 'Aprendendo',
      review: 'Revis\u00e3o',
      mastered: 'Dominado'
    };
    return labels[state] || 'Novo';
  }

  function formatSrsDate(dateKey) {
    if (!dateKey) return 'hoje';
    const today = getDayKey(new Date());
    if (dateKey <= today) return 'hoje';
    const parts = dateKey.split('-');
    return parts.length === 3 ? parts[2] + '/' + parts[1] : dateKey;
  }

  function closeModal() {
    modalOpen = false;
    elements.modal.classList.remove('open');
    document.body.style.overflow = '';
    elements.practiceArea.style.display = 'none';
  }

  function sendHostMessage(type, payload) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type, payload }, '*');
      }
    } catch {}
  }

  function markCharacterViewed(char) {
    JapaneseStorage.markAsViewed({
      id: JapaneseSearch.buildId(char),
      char: char.char,
      romaji: char.romaji,
      script: char.script,
      category: char.category,
      meanings: char.meanings,
      onyomi: char.onyomi,
      kunyomi: char.kunyomi,
      level: char.level
    }).then(() => {
      JapaneseStorage.emitChange('progress-updated', { charId: JapaneseSearch.buildId(char) });
    }).catch(() => {});
  }

  function updateStats(stats) {
    const bar = document.getElementById('stats-bar');
    if (!bar) return;
    bar.innerHTML =
      '<div class="stat-item">\uD83D\uDCDA <span class="stat-value">' + (stats.totalChars || 0) + '</span> caracteres</div>' +
      '<div class="stat-item">\u2B50 <span class="stat-value">' + (stats.favorites || 0) + '</span> favoritos</div>' +
      '<div class="stat-item">\uD83D\uDCD6 <span class="stat-value">' + (stats.studied || 0) + '</span> estudados</div>';
  }

  function updateDashboard(data) {
    if (!elements.dashboard) return;

    const stats = data.stats || {};
    const srsStats = data.srsStats || {};
    const typingStats = data.typingStats || {};
    const completion = data.completion || {};
    const recent = stats.recent || [];
    const activity = stats.activity || {};
    const level = data.level || {};
    const recommendation = data.recommendation || {};
    const difficulty = data.difficulty || [];
    const syllabus = data.syllabus || [];
    const guidedTrails = data.guidedTrails || [];
    const quickSessions = data.quickSessions || [];
    const gamificationStats = data.gamificationStats || level;

    elements.dashboardMetrics.innerHTML =
      renderMetric('XP total', level.xp || 0, 'nivel ' + (level.level || 1)) +
      renderMetric('Estudados', stats.totalStudied || 0, 'caracteres unicos') +
      renderMetric('Tempo total', formatStudyTime(stats.studyTime || 0), 'minutos registrados') +
      renderMetric('Revis\u00f5es hoje', srsStats.due || 0, 'pendentes no SRS') +
      renderMetric('Dominados', srsStats.mastered || 0, 'caracteres') +
      renderMetric('Digitacao', typingStats.sessions || 0, 'sessoes guiadas');

    elements.dashboardProgress.innerHTML =
      renderProgressRow('Hiragana', completion.hiragana || {}) +
      renderProgressRow('Katakana', completion.katakana || {}) +
      renderProgressRow('Kanji N5 inicial', completion.kanji || {});

    elements.activityCalendar.innerHTML = renderActivityCalendar(activity);
    elements.recentCharacters.innerHTML = renderRecentCharacters(recent);
    elements.adaptiveDashboard.innerHTML = renderAdaptiveDashboard(level, recommendation, difficulty, syllabus, guidedTrails, quickSessions, gamificationStats);
  }

  function renderAdaptiveDashboard(level, recommendation, difficulty, syllabus, guidedTrails, quickSessions, gamificationStats = {}) {
    const dimensions = gamificationStats.dimensions || level.dimensions || {};
    return (
      '<section class="adaptive-card assistant-card">' +
        '<div class="adaptive-label">Assistente diario</div>' +
        '<h3>' + escapeHtml(recommendation.title || 'Comecar por hiragana basico') + '</h3>' +
        '<p>' + escapeHtml(recommendation.description || 'Faca uma sessao curta para iniciar seu historico.') + '</p>' +
        renderAssistantEvidence(recommendation) +
        '<div class="assistant-reason"><strong>Motivo</strong><span>' + escapeHtml(recommendation.reason || 'Sessao curta escolhida pelo seu progresso atual.') + '</span></div>' +
        '<button class="dashboard-primary-btn assistant-action" type="button" data-assistant-action="study-now">' + escapeHtml(recommendation.actionLabel || 'Estudar agora') + '</button>' +
      '</section>' +
      '<section class="adaptive-card level-card">' +
        '<div class="adaptive-label">Nível atual</div>' +
        '<h3>Nível ' + (level.level || 1) + ' — ' + (level.title || 'Aprendiz de Kana') + '</h3>' +
        '<div class="level-xp">' + (level.xp || 0) + ' XP' + (level.next ? ' / proximo: ' + level.next.minXp + ' XP' : '') + '</div>' +
        '<div class="progress-track"><div class="progress-fill" style="width:' + (level.progress || 0) + '%"></div></div>' +
        renderLevelBreakdown(dimensions) +
        '<p>' + (level.hint || 'Comece pelo Gojuuon de hiragana.') + '</p>' +
      '</section>' +
      '<section class="adaptive-card quest-card">' +
        '<div class="adaptive-label">Missoes ativas</div>' +
        renderQuestList(gamificationStats.quests || level.quests || []) +
      '</section>' +
      '<section class="adaptive-card goals-card">' +
        '<div class="adaptive-label">Metas</div>' +
        renderGoalsEditor(gamificationStats.goals || level.goals || {}) +
      '</section>' +
      '<section class="adaptive-card achievement-card">' +
        '<div class="adaptive-label">Conquistas</div>' +
        renderAchievementList(gamificationStats.achievements || level.achievements || []) +
      '</section>' +
      '<section class="adaptive-card next-step-card">' +
        '<div class="adaptive-label">Próximo passo</div>' +
        '<h3>' + (recommendation.title || 'Começar por hiragana básico') + '</h3>' +
        '<p>' + escapeHtml(recommendation.nextStep || recommendation.description || 'Faca uma sessao curta para iniciar seu historico.') + '</p>' +
      '</section>' +
      '<section class="adaptive-card syllabus-card">' +
        '<div class="adaptive-label">Ementa</div>' +
        '<ol>' + syllabus.slice(0, 9).map(item => '<li>' + item.title + '</li>').join('') + '</ol>' +
      '</section>' +
      '<section class="adaptive-card difficulty-card">' +
        '<div class="adaptive-label">Mapa de dificuldades</div>' +
        renderDifficultyList(difficulty) +
      '</section>' +
      '<section class="adaptive-card error-notebook-card">' +
        '<div class="adaptive-label">Caderno de erros</div>' +
        renderErrorNotebook(gamificationStats.errorNotebook || level.errorNotebook || []) +
      '</section>' +
      '<section class="adaptive-card guided-card">' +
        '<div class="adaptive-label">Trilhas guiadas</div>' +
        renderGuidedTrails(guidedTrails) +
      '</section>' +
      '<section class="adaptive-card quick-card">' +
        '<div class="adaptive-label">Sess\u00f5es r\u00e1pidas</div>' +
        renderQuickSessions(quickSessions) +
      '</section>'
    );
  }

  function renderLevelBreakdown(dimensions = {}) {
    const habit = Number(dimensions.habit || 0);
    const mastery = Number(dimensions.mastery || 0);
    const practice = Number(dimensions.practice || 0);

    return '<div class="level-breakdown">' +
      '<span>Habito <strong>' + habit + '</strong></span>' +
      '<span>Dominio <strong>' + mastery + '</strong></span>' +
      '<span>Pratica <strong>' + practice + '</strong></span>' +
    '</div>';
  }

  function renderQuestList(items) {
    if (!items || items.length === 0) return '<p>Nenhuma missao ativa.</p>';
    return '<div class="quest-list">' + items.slice(0, 4).map(item => {
      const target = Math.max(Number(item.target || 0), 1);
      const progress = Math.min(Number(item.progress || 0), target);
      const percent = Math.round((progress / target) * 100);
      return '<div class="quest-item">' +
        '<div class="quest-row"><strong>' + escapeHtml(item.title || 'Missao') + '</strong><span>' + progress + '/' + target + '</span></div>' +
        '<div class="progress-track mini"><div class="progress-fill" style="width:' + percent + '%"></div></div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function renderGoalsEditor(goals = {}) {
    const safe = {
      dailyReviewTarget: Number(goals.dailyReviewTarget || 10),
      quizAnswerTarget: Number(goals.quizAnswerTarget || 10),
      weeklyStreakTarget: Number(goals.weeklyStreakTarget || 7),
      typingSessionTarget: Number(goals.typingSessionTarget || 1)
    };

    return '<div class="goals-editor">' +
      renderGoalInput('Revisoes', 'dailyReviewTarget', safe.dailyReviewTarget, 1, 50) +
      renderGoalInput('Quiz', 'quizAnswerTarget', safe.quizAnswerTarget, 5, 50) +
      renderGoalInput('Streak', 'weeklyStreakTarget', safe.weeklyStreakTarget, 1, 14) +
      renderGoalInput('Digitacao', 'typingSessionTarget', safe.typingSessionTarget, 1, 10) +
    '</div>';
  }

  function renderGoalInput(label, field, value, min, max) {
    return '<label class="goal-input">' +
      '<span>' + escapeHtml(label) + '</span>' +
      '<input type="number" min="' + min + '" max="' + max + '" value="' + value + '" data-goal-field="' + field + '">' +
    '</label>';
  }

  function renderAchievementList(items) {
    if (!items || items.length === 0) return '<p>Conquistas aparecem conforme voce estuda.</p>';
    return '<div class="achievement-list">' + items.slice(0, 8).map(item =>
      '<span class="achievement-pill' + (item.unlocked ? ' unlocked' : '') + '">' +
        escapeHtml(item.title || 'Conquista') +
        (item.isNew ? '<small>Novo</small>' : '') +
      '</span>'
    ).join('') + '</div>';
  }

  function renderErrorNotebook(items) {
    if (!items || items.length === 0) {
      return '<p>Nenhum erro recorrente registrado ainda.</p>';
    }

    return '<div class="error-notebook-list">' + items.slice(0, 5).map(item =>
      '<article class="error-note">' +
        '<div class="error-note-main">' +
          '<strong>' + escapeHtml(item.char || '?') + '</strong>' +
          '<div>' +
            '<span>' + escapeHtml(item.romaji || item.charId || '') + '</span>' +
            '<small>' + (item.accuracy || 0) + '% · ' + (item.errors || 0) + ' erro(s) · ' + escapeHtml(item.state || 'Atencao') + '</small>' +
          '</div>' +
        '</div>' +
        (item.lastAnswered || item.lastExpected
          ? '<div class="error-note-detail">Ultimo: ' + escapeHtml(item.lastAnswered || '-') + ' / esperado: ' + escapeHtml(item.lastExpected || '-') + '</div>'
          : '') +
        '<p>' + escapeHtml(item.recommendation || 'Inclua em uma revisao curta.') + '</p>' +
        '<button class="quick-session-btn" type="button" data-error-practice data-error-char="' + escapeHtml(item.char || '') + '" data-error-script="' + escapeHtml(item.script || 'all') + '" data-error-category="' + escapeHtml(item.category || '') + '">Treinar</button>' +
      '</article>'
    ).join('') + '</div>';
  }

  function renderGuidedTrails(items) {
    if (!items || items.length === 0) return '<p>Nenhuma trilha dispon\u00edvel.</p>';
    return '<div class="guided-list">' + items.slice(0, 5).map(item =>
      '<button class="guided-action" type="button" data-guided-trail="' + item.id + '">' +
        '<strong>' + item.title + '</strong>' +
        '<span>' + (item.description || 'Sess\u00e3o guiada curta.') + '</span>' +
      '</button>'
    ).join('') + '</div>';
  }

  function renderAssistantEvidence(recommendation = {}) {
    const evidence = Array.isArray(recommendation.evidence) ? recommendation.evidence : [];
    if (!evidence.length) return '';
    return '<div class="assistant-evidence">' + evidence.slice(0, 4).map(item =>
      '<span>' + escapeHtml(item) + '</span>'
    ).join('') + '</div>';
  }

  function renderQuickSessions(items) {
    if (!items || items.length === 0) return '<p>Nenhuma sess\u00e3o dispon\u00edvel.</p>';
    return '<div class="quick-session-list">' + items.slice(0, 6).map(item =>
      '<button class="quick-session-btn" type="button" data-quick-session="' + item.id + '">' + item.title + '</button>'
    ).join('') + '</div>';
  }

  function renderDifficultyList(items) {
    if (!items || items.length === 0) {
      return '<p>Responda quizzes para revelar caracteres que merecem reforço.</p>';
    }
    return '<div class="difficulty-list">' + items.slice(0, 5).map(item =>
      '<div class="difficulty-item">' +
        '<strong>' + (item.char || '?') + '</strong>' +
        '<span>' + (item.romaji || item.charId || '') + ' · ' + (item.accuracy || 0) + '% · ' + (item.state || 'Atenção') + '</span>' +
      '</div>'
    ).join('') + '</div>';
  }

  function renderMetric(label, value, detail) {
    return '<div class="metric-card">' +
      '<span class="metric-label">' + label + '</span>' +
      '<strong class="metric-value">' + value + '</strong>' +
      '<span class="metric-detail">' + detail + '</span>' +
    '</div>';
  }

  function renderProgressRow(label, data) {
    const total = data.total || 0;
    const studied = data.studied || 0;
    const percent = total > 0 ? Math.round((studied / total) * 100) : 0;

    return '<div class="progress-row">' +
      '<div class="progress-row-header">' +
        '<span>' + label + '</span>' +
        '<strong>' + percent + '%</strong>' +
      '</div>' +
      '<div class="progress-track"><div class="progress-fill" style="width:' + percent + '%"></div></div>' +
      '<div class="progress-caption">' + studied + ' de ' + total + ' caracteres</div>' +
    '</div>';
  }

  function renderActivityCalendar(activity) {
    const days = [];
    const today = new Date();

    for (let i = 13; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const key = getDayKey(date);
      const count = activity[key] || 0;
      const level = count === 0 ? 0 : count < 3 ? 1 : count < 7 ? 2 : 3;
      days.push(
        '<div class="activity-day level-' + level + '" title="' + formatDate(date) + ': ' + count + ' estudos">' +
          '<span>' + date.getDate() + '</span>' +
        '</div>'
      );
    }

    return days.join('');
  }

  function renderRecentCharacters(recent) {
    if (!recent || recent.length === 0) {
      return '<div class="recent-empty">Abra um caractere para iniciar o historico.</div>';
    }

    return recent.map(item =>
      '<div class="recent-character">' +
        '<strong>' + (item.char || '?') + '</strong>' +
        '<span>' + (item.romaji || item.charId || '') + '</span>' +
      '</div>'
    ).join('');
  }

  function formatStudyTime(minutes) {
    const rounded = Math.round(minutes || 0);
    if (rounded < 60) return rounded + ' min';
    const hours = Math.floor(rounded / 60);
    const mins = rounded % 60;
    return mins > 0 ? hours + 'h ' + mins + 'min' : hours + 'h';
  }

  function getDayKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function formatDate(date) {
    return String(date.getDate()).padStart(2, '0') + '/' + String(date.getMonth() + 1).padStart(2, '0');
  }

  function normalizeSyncState(state) {
    return ['checking', 'disabled', 'pending', 'hydrating', 'syncing', 'synced', 'error'].includes(state)
      ? state
      : 'checking';
  }

  function getSyncStatusLabel(state) {
    return {
      checking: 'Verificando conexao',
      disabled: 'Sincronizacao desativada',
      pending: 'Aguardando aprovacao',
      hydrating: 'Baixando dados',
      syncing: 'Sincronizando',
      synced: 'Sincronizado',
      error: 'Falha na sincronizacao'
    }[state] || 'Verificando conexao';
  }

  function getSyncStatusMessage(state, detail = {}) {
    if (state === 'synced' && detail.lastSyncedAt) {
      return 'Ultima sincronizacao: ' + new Date(detail.lastSyncedAt).toLocaleString('pt-BR');
    }
    return {
      checking: 'Preparando sincronizacao...',
      disabled: 'Este ambiente esta usando apenas dados locais.',
      pending: 'A conta precisa estar aprovada para sincronizar.',
      hydrating: 'Mesclando dados remotos com o cache local.',
      syncing: 'Enviando alteracoes para sua conta.',
      synced: 'Dados locais e remotos estao atualizados.',
      error: 'Nao foi possivel concluir a ultima operacao.'
    }[state] || 'Preparando sincronizacao...';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  return {
    init,
    setCharacters,
    getFilters,
    getCurrentView,
    setCurrentView,
    getDictionaryFilters,
    getQuizSettings,
    applyQuizSettings,
    getTypingSettings,
    applyTypingSettings,
    setFilters,
    renderGrid,
    renderDictionary,
    renderQuiz,
    renderTyping,
    renderFilters,
    onFilterChangeCallback,
    onViewChangeCallback,
    onDictionaryFilterChangeCallback,
    onQuizSettingsChangeCallback,
    onQuizAnswerCallback,
    onQuizNextCallback,
    onQuizRevealCallback,
    onQuizResetCallback,
    onTypingSettingsChangeCallback,
    onTypingStartCallback,
    onTypingInputCallback,
    onTypingSubmitCallback,
    onTypingNextCallback,
    onTypingResetCallback,
    onBackupExportCallback,
    onBackupFileSelectedCallback,
    onBackupImportCallback,
    onClearDataCallback,
    onKanaExportCallback,
    onStudyNowCallback,
    onDiagnosticCallback,
    onGuidedTrailCallback,
    onQuickSessionCallback,
    onGamificationGoalsChangeCallback,
    onErrorPracticeCallback,
    updateBackupPreview,
    showBackupStatus,
    resetClearDataConfirmation,
    showClearDataStatus,
    updateFirebaseSyncStatus,
    updateCardFavoriteState,
    updateStats,
    updateDashboard,
    closeModal,
    getElements: () => elements
  };
})();


