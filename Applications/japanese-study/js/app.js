import { JapaneseStorage } from './storage.js';
import { JapaneseSearch } from './search.js';
import { JapaneseStrokePlayer } from './stroke-player.js';
import { JapanesePractice } from './practice.js';
import { JapaneseUI } from './ui.js?v=15.7';
import { JapaneseDictionary } from './dictionary.js';
import { JapaneseQuiz } from './quiz.js';
import { JapaneseStudyEngine } from './study-engine.js';
import { JapaneseLearningLevels } from './learning-levels.js';
import { JapaneseRecommendationEngine } from './recommendation-engine.js';
import { JapaneseTypingContentProvider } from './typing-content-provider.js';
import { JapaneseTypingEvaluator } from './typing-evaluator.js';
import { createTypingSession } from './typing-session.js';
import { JapaneseKanaPrintExport } from './kana-print-export.js';
import { createDictionaryRuntime } from './dictionary/dictionary-runtime.js?v=15.7';
import { DictionaryCacheRepository } from './dictionary/dictionary-cache-repository.js';
import { LazyDictionarySource } from './dictionary/lazy-dictionary-source.js?v=15.9';
import { DictionaryReleaseClient } from './dictionary/dictionary-release-client.js';
import { DictionaryUpdateManager } from './dictionary/dictionary-update-manager.js';
import { DictionaryPackageManager } from './dictionary/dictionary-package-manager.js';
import { DictionaryStorageManager } from './dictionary/dictionary-storage-manager.js';
import { JapaneseAppShellManager } from './pwa-manager.js?v=15.7';
import {
  InstalledDictionaryPackagesSource,
  LayeredDictionarySource,
} from './dictionary/installed-dictionary-packages-source.js?v=15.9';

const JapaneseApp = (() => {
  let allData = [];
  let hiraganaData = [];
  let katakanaData = [];
  let kanjiData = [];
  let initialized = false;
  let sessionStartedAt = Date.now();
  let lastSavedMinute = 0;
  let dictionarySearchTimer = null;
  let selectedBackup = null;
  let activeQuizContext = null;
  let activeTypingSession = null;
  let currentTypingValue = '';
  let currentTypingResult = null;
  let firebaseSyncModule = null;
  let dictionaryRuntime = null;
  let dictionarySearchController = null;
  let dictionaryRenderSequence = 0;
  let dictionaryUpdateManager = null;
  let dictionaryPackageManager = null;
  let dictionaryStorageManager = null;
  let dictionaryReleaseCheck = null;
  let dictionaryCandidateVersion = '';
  let dictionaryPackages = [];
  let dictionaryBrowsePage = 1;
  const dictionaryBrowsePageSize = 50;
  let appShellManager = null;
  let appShellState = null;

  async function init() {
    if (initialized) return;
    initialized = true;

    JapaneseUI.init();
    setupHostListener();
    setupFirebaseSyncStatusListener();
    setupDictionaryUpdateControls();
    setupDictionaryPackageControls();
    setupDictionaryBrowseControls();
    setupAppShellControls();
    void initializeAppShell();
    const firebaseSyncReady = setupFirebaseSync();
    const dictionaryRuntimeReady = setupDictionaryRuntime();

    const loadingEl = document.getElementById('loading-state');
    const gridEl = document.getElementById('character-grid');

    Promise.all([
      loadJSON('data/hiragana.json'),
      loadJSON('data/katakana.json'),
      loadJSON('data/kanji.json'),
      dictionaryRuntimeReady,
      loadJSON('data/typing-exercises.json')
    ]).then(async ([hira, kata, kanji, _dictionaryState, typingExercises]) => {
      await firebaseSyncReady;

      hiraganaData = (hira.characters || hira).map(c => ({ ...c, script: 'hiragana' }));
      katakanaData = (kata.characters || kata).map(c => ({ ...c, script: 'katakana' }));
      kanjiData = (kanji.kanji || kanji.characters || kanji).map(c => ({ ...c, script: 'kanji', category: c.level || 'N5' }));
      allData = [...hiraganaData, ...katakanaData, ...kanjiData];

      if (loadingEl) loadingEl.style.display = 'none';
      gridEl.style.display = '';

      JapaneseSearch.setData(allData);
      JapaneseQuiz.setData(allData);
      JapaneseTypingContentProvider.setData(typingExercises);
      JapaneseUI.setCharacters(allData);
      JapaneseUI.applyQuizSettings(getSavedQuizSettings());
      JapaneseUI.applyTypingSettings(getSavedTypingSettings());

      const categories = [...new Set(allData.map(c => c.category))];
      JapaneseUI.renderFilters(categories, '');

      const initialChars = allData.filter(c => c.script === 'hiragana');
      JapaneseUI.renderGrid(initialChars);
      renderTyping();
      if (JapaneseUI.getCurrentView() === 'quiz') renderQuiz();
      if (JapaneseUI.getCurrentView() === 'dictionary') renderDictionary();
      if (JapaneseUI.getCurrentView() === 'typing') renderTyping();

      JapaneseSearch.onResults((results) => {
        JapaneseUI.renderGrid(results);
      });

      JapaneseUI.onFilterChangeCallback(() => {
        applyFilters();
      });

      JapaneseUI.onViewChangeCallback(() => {
        applyFilters();
      });

      JapaneseUI.onDictionaryFilterChangeCallback(() => {
        dictionaryBrowsePage = 1;
        renderDictionary();
      });

      JapaneseUI.onQuizSettingsChangeCallback(() => {
        activeQuizContext = null;
        persistQuizSettings();
        JapaneseQuiz.resetStats();
        renderQuiz();
      });

      JapaneseUI.onQuizAnswerCallback((answer) => {
        const result = JapaneseQuiz.checkAnswer(answer);
        JapaneseStorage.saveQuizAnswer(currentQuizQuestion, result).then(() => {
          if (!result.empty && !result.locked) JapaneseStorage.emitChange('quiz-updated', result);
        }).catch(() => {});
        JapaneseUI.renderQuiz(currentQuizQuestion, JapaneseQuiz.getStats(), result, activeQuizContext);
      });

      JapaneseUI.onQuizNextCallback(() => {
        renderQuiz();
      });

      JapaneseUI.onQuizRevealCallback(() => {
        currentQuizQuestion = JapaneseQuiz.revealFlashcard();
        JapaneseUI.renderQuiz(currentQuizQuestion, JapaneseQuiz.getStats(), undefined, activeQuizContext);
      });

      JapaneseUI.onQuizResetCallback(() => {
        activeQuizContext = null;
        JapaneseQuiz.resetStats();
        renderQuiz();
      });

      JapaneseUI.onTypingSettingsChangeCallback(() => {
        persistTypingSettings();
        resetTypingSession();
      });

      JapaneseUI.onTypingStartCallback((settings) => {
        startTypingSession(settings);
      });

      JapaneseUI.onTypingInputCallback((value) => {
        currentTypingValue = value;
        currentTypingResult = null;
        renderTyping();
      });

      JapaneseUI.onTypingSubmitCallback((value) => {
        submitTypingAnswer(value);
      });

      JapaneseUI.onTypingResetCallback(() => {
        resetTypingSession();
      });

      JapaneseUI.onBackupExportCallback(() => {
        exportBackup();
      });

      JapaneseUI.onBackupFileSelectedCallback((file) => {
        previewBackupFile(file);
      });

      JapaneseUI.onBackupImportCallback((mode) => {
        importSelectedBackup(mode);
      });

      JapaneseUI.onFirebaseSyncNowCallback(() => {
        syncFirebaseNow();
      });

      JapaneseUI.onClearDataCallback(() => {
        clearLocalData();
      });

      JapaneseUI.onKanaExportCallback((settings) => {
        exportKanaPrint(settings);
      });

      JapaneseUI.onStudyNowCallback(() => {
        startRecommendedSession();
      });

      JapaneseUI.onDiagnosticCallback(() => {
        startDiagnosticSession();
      });

      JapaneseUI.onGuidedTrailCallback((trailId) => {
        startGuidedTrail(trailId);
      });

      JapaneseUI.onQuickSessionCallback((sessionId) => {
        startQuickSession(sessionId);
      });

      JapaneseUI.onGamificationGoalsChangeCallback((goals) => {
        JapaneseStorage.setGamificationGoals(goals);
      });

      JapaneseUI.onErrorPracticeCallback((payload) => {
        startErrorPractice(payload);
      });

      setupSearch();
      setupStudyTimeTracking();
      setupStorageListener();
      loadStats();
    }).catch(err => {
      console.error('Failed to load character data:', err);
      if (loadingEl) {
        loadingEl.innerHTML = '<div class="empty-state"><p>Erro ao carregar dados. Tente novamente.</p></div>';
      }
    });
  }

  let currentQuizQuestion = null;

  function loadJSON(path) {
    return fetch(path).then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  async function setupDictionaryRuntime() {
    const providerEnabled = await isDictionaryProviderEnabled();
    const chunkLoadingEnabled = providerEnabled && await isDictionaryChunkLoadingEnabled();
    const offlinePacksEnabled = chunkLoadingEnabled && await isDictionaryOfflinePacksEnabled();
    const dictionaryRepository = chunkLoadingEnabled ? new DictionaryCacheRepository() : null;
    const baseSource = chunkLoadingEnabled
      ? new LazyDictionarySource({ repository: dictionaryRepository })
      : undefined;
    const source = baseSource && offlinePacksEnabled
      ? new LayeredDictionarySource({
        baseSource,
        installedSource: new InstalledDictionaryPackagesSource({ repository: dictionaryRepository }),
      })
      : baseSource;
    dictionaryStorageManager = dictionaryRepository
      ? new DictionaryStorageManager({ repository: dictionaryRepository })
      : null;
    dictionaryUpdateManager = dictionaryRepository
      ? new DictionaryUpdateManager({
        repository: dictionaryRepository,
        storageManager: dictionaryStorageManager,
      })
      : null;
    dictionaryPackageManager = dictionaryRepository && offlinePacksEnabled
      ? new DictionaryPackageManager({
        repository: dictionaryRepository,
        storageManager: dictionaryStorageManager,
      })
      : null;
    dictionaryRuntime = createDictionaryRuntime({
      providerEnabled,
      source,
      loadLegacyEntries: async () => {
        const payload = await loadJSON('data/dictionary.json');
        return payload.words || payload;
      },
    });
    const state = await dictionaryRuntime.init();
    if (state.fallback) {
      console.warn('[dictionary-runtime] provider unavailable; using legacy source', state.error);
    } else {
      console.info(`[dictionary-runtime] mode=${state.mode} lazy=${state.lazy}`);
    }
    await refreshDictionaryPackages();
    void checkDictionaryRelease(state.sourceVersion);
    return state;
  }

  async function checkDictionaryRelease(activeVersion) {
    try {
      const checked = dictionaryUpdateManager
        ? await dictionaryUpdateManager.check(activeVersion)
        : await new DictionaryReleaseClient().check({ activeVersion });
      const status = checked.status === 'update-available' && checked.candidateState?.status === 'ready'
        ? { ...checked, status: 'ready' }
        : checked;
      if (status.status === 'ready') dictionaryCandidateVersion = status.remoteVersion;
      dictionaryReleaseCheck = status;
      console.info(`[dictionary-release] status=${status.status} remote=${status.remoteVersion}`);
      renderDictionaryReleaseStatus(status);
      window.dispatchEvent(new CustomEvent('japanese-study:dictionary-release-status', {
        detail: status,
      }));
      return status;
    } catch (error) {
      const status = {
        status: 'unavailable',
        activeVersion: String(activeVersion || ''),
        error: error?.message || String(error),
        checkedAt: Date.now(),
      };
      console.warn('[dictionary-release] check unavailable', error);
      renderDictionaryReleaseStatus(status);
      window.dispatchEvent(new CustomEvent('japanese-study:dictionary-release-status', {
        detail: status,
      }));
      return status;
    }
  }

  function setupDictionaryUpdateControls() {
    document.getElementById('dictionary-check-update-btn')?.addEventListener('click', () => {
      void checkDictionaryRelease(dictionaryRuntime?.getState().sourceVersion || '');
    });
    document.getElementById('dictionary-download-update-btn')?.addEventListener('click', () => {
      void downloadDictionaryCandidate();
    });
    document.getElementById('dictionary-activate-update-btn')?.addEventListener('click', () => {
      void activateDictionaryCandidate();
    });
    document.getElementById('dictionary-rollback-btn')?.addEventListener('click', () => {
      void rollbackDictionaryVersion();
    });
  }

  function setupDictionaryPackageControls() {
    document.getElementById('dictionary-package-list')?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-package-action]');
      if (!button || button.disabled) return;
      const packageId = button.dataset.packageId;
      if (button.dataset.packageAction === 'install') void installDictionaryPackage(packageId);
      if (button.dataset.packageAction === 'remove') void removeDictionaryPackage(packageId);
      if (button.dataset.packageAction === 'prepare') void prepareEssentialDictionaryOffline(packageId);
    });
    document.getElementById('dictionary-refresh-storage-btn')?.addEventListener('click', () => {
      void refreshDictionaryStorage();
    });
    document.getElementById('dictionary-persist-storage-btn')?.addEventListener('click', () => {
      void requestDictionaryStoragePersistence();
    });
    window.addEventListener('online', () => renderDictionaryOfflineReadiness(dictionaryPackages));
    window.addEventListener('offline', () => renderDictionaryOfflineReadiness(dictionaryPackages));
  }

  function setupDictionaryBrowseControls() {
    document.getElementById('dictionary-package-filter')?.addEventListener('change', () => {
      dictionaryBrowsePage = 1;
      void renderDictionary();
    });
    document.querySelectorAll('[data-dictionary-page-action]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.dictionaryPageAction === 'previous') {
          if (dictionaryBrowsePage <= 1) return;
          dictionaryBrowsePage -= 1;
        } else {
          dictionaryBrowsePage += 1;
        }
        void renderDictionary();
      });
    });
  }

  function setupAppShellControls() {
    document.getElementById('app-shell-offline-toggle')?.addEventListener('change', (event) => {
      void setAppShellEnabled(event.target.checked);
    });
    document.getElementById('app-shell-repair-btn')?.addEventListener('click', () => {
      void repairAppShell();
    });
    window.addEventListener('online', renderAppShellState);
    window.addEventListener('offline', renderAppShellState);
  }

  async function initializeAppShell() {
    appShellManager = new JapaneseAppShellManager();
    renderAppShellState({ state: 'checking' });
    try {
      appShellState = await appShellManager.initialize();
      renderAppShellState();
    } catch (error) {
      appShellState = { supported: appShellManager.isSupported(), enabled: false, state: 'error' };
      renderAppShellState({ message: error?.message || String(error), state: 'error' });
    }
  }

  async function setAppShellEnabled(enabled) {
    if (!appShellManager) return;
    if (enabled && !isEssentialDictionaryOfflineReady()) {
      renderAppShellState({
        message: 'Prepare o pacote essencial antes de ativar o aplicativo offline.',
        state: 'error',
      });
      return;
    }
    setAppShellBusy(enabled ? 'Preparando aplicativo...' : 'Removendo cache...');
    try {
      appShellState = enabled
        ? await appShellManager.enable()
        : await appShellManager.disable();
      renderAppShellState();
    } catch (error) {
      appShellState = await appShellManager.snapshot('error');
      renderAppShellState({ message: error?.message || String(error), state: 'error' });
    }
  }

  async function repairAppShell() {
    if (!appShellManager || navigator.onLine === false) {
      renderAppShellState({ message: 'Reconecte-se para reparar o cache do aplicativo.', state: 'error' });
      return;
    }
    if (!isEssentialDictionaryOfflineReady()) {
      renderAppShellState({ message: 'Prepare o pacote essencial antes de reparar o aplicativo.', state: 'error' });
      return;
    }
    setAppShellBusy('Reconstruindo cache...');
    try {
      appShellState = await appShellManager.repair();
      renderAppShellState({ message: 'Cache do aplicativo reconstruido.', state: 'ready' });
    } catch (error) {
      appShellState = await appShellManager.snapshot('error');
      renderAppShellState({ message: error?.message || String(error), state: 'error' });
    }
  }

  function setAppShellBusy(message) {
    const toggle = document.getElementById('app-shell-offline-toggle');
    const repair = document.getElementById('app-shell-repair-btn');
    const status = document.getElementById('app-shell-offline-status');
    if (toggle) toggle.disabled = true;
    if (repair) repair.disabled = true;
    if (status) {
      status.dataset.state = 'checking';
      status.textContent = message;
    }
  }

  function renderAppShellState(options = {}) {
    const toggle = document.getElementById('app-shell-offline-toggle');
    const repair = document.getElementById('app-shell-repair-btn');
    const status = document.getElementById('app-shell-offline-status');
    if (!toggle || !repair || !status) return;

    const supported = appShellState?.supported !== false && appShellManager?.isSupported() !== false;
    const enabled = appShellState?.enabled === true;
    const essentialReady = isEssentialDictionaryOfflineReady();
    const online = navigator.onLine !== false;
    const state = options.state || (enabled ? 'ready' : 'pending');
    const defaultMessage = !supported
      ? 'Service Worker indisponivel neste navegador.'
      : enabled
        ? online ? 'Shell pronto para abrir sem conexao.' : 'Aplicativo carregado pelo cache offline.'
        : essentialReady ? 'Desativado neste navegador.' : 'Prepare primeiro o pacote essencial.';

    toggle.checked = enabled;
    toggle.disabled = !supported || (!enabled && !essentialReady);
    repair.disabled = !enabled || !online;
    status.dataset.state = options.state || (!supported ? 'error' : state);
    status.textContent = options.message || defaultMessage;
  }

  function isEssentialDictionaryOfflineReady() {
    return dictionaryPackages.some((item) => item.id === 'essential' && item.status === 'offline-ready');
  }

  async function refreshDictionaryPackages() {
    if (!dictionaryPackageManager) {
      renderDictionaryPackageError('Pacotes offline exigem o carregamento segmentado do dicionario.');
      return;
    }
    try {
      const packages = await dictionaryPackageManager.loadCatalog();
      renderDictionaryPackages(packages);
      await refreshDictionaryStorage();
    } catch (error) {
      console.warn('[dictionary-packages] catalog unavailable', error);
      renderDictionaryPackageError(error?.message || String(error));
    }
  }

  async function installDictionaryPackage(packageId) {
    if (!dictionaryPackageManager) return;
    setDictionaryPackageBusy(packageId, 'Instalando...');
    try {
      await dictionaryPackageManager.install(packageId, {
        onProgress: ({ path }) => setDictionaryPackageBusy(
          packageId,
          `Validando ${path.split('/').at(-1)}...`,
        ),
      });
      renderDictionaryPackages(await dictionaryPackageManager.listPackages());
      await refreshDictionaryStorage();
    } catch (error) {
      renderDictionaryPackageError(error?.message || String(error));
      renderDictionaryPackages(await dictionaryPackageManager.listPackages(), { preserveSummary: true });
      await refreshDictionaryStorage();
    }
  }

  async function removeDictionaryPackage(packageId) {
    if (!dictionaryPackageManager) return;
    setDictionaryPackageBusy(packageId, 'Removendo...');
    try {
      await dictionaryPackageManager.remove(packageId);
      renderDictionaryPackages(await dictionaryPackageManager.listPackages());
      await refreshDictionaryStorage();
    } catch (error) {
      renderDictionaryPackageError(error?.message || String(error));
      renderDictionaryPackages(await dictionaryPackageManager.listPackages(), { preserveSummary: true });
      await refreshDictionaryStorage();
    }
  }

  async function prepareEssentialDictionaryOffline(packageId) {
    if (!dictionaryUpdateManager || packageId !== 'essential') return;
    setDictionaryPackageBusy(packageId, 'Preparando pacote essencial...');
    try {
      const release = dictionaryReleaseCheck?.manifest
        ? dictionaryReleaseCheck
        : await checkDictionaryRelease(dictionaryRuntime?.getState().sourceVersion || '');
      if (!release?.manifest || !['current', 'update-available', 'ready'].includes(release.status)) {
        throw new Error('Conecte-se a internet para preparar ou recuperar o pacote essencial.');
      }
      await dictionaryUpdateManager.prepareOffline(release, {
        onProgress: ({ path, state }) => setDictionaryPackageBusy(
          packageId,
          `${state === 'reused' ? 'Verificando' : 'Baixando'} ${path.split('/').at(-1)}...`,
        ),
      });
      renderDictionaryPackages(await dictionaryPackageManager.listPackages());
      await refreshDictionaryStorage('Pacote essencial pronto para uso offline.', 'active');
    } catch (error) {
      renderDictionaryPackageError(error?.message || String(error));
      renderDictionaryPackages(await dictionaryPackageManager.listPackages(), { preserveSummary: true });
      await refreshDictionaryStorage();
    }
  }

  async function refreshDictionaryStorage(message = '', messageState = '') {
    if (!dictionaryStorageManager) {
      renderDictionaryStorage(null, 'Metrica de armazenamento indisponivel.');
      return;
    }
    try {
      renderDictionaryStorage(await dictionaryStorageManager.snapshot(), message, messageState);
    } catch (error) {
      renderDictionaryStorage(null, error?.message || String(error), 'error');
    }
  }

  async function requestDictionaryStoragePersistence() {
    if (!dictionaryStorageManager) return;
    const button = document.getElementById('dictionary-persist-storage-btn');
    if (button) {
      button.disabled = true;
      button.textContent = 'Solicitando...';
    }
    try {
      const result = await dictionaryStorageManager.requestPersistence();
      const message = !result.supported
        ? 'Persistencia nao suportada por este navegador.'
        : result.granted
          ? 'Armazenamento persistente concedido.'
          : 'O navegador nao concedeu persistencia; o cache continua disponivel normalmente.';
      renderDictionaryStorage(result.state, message, result.granted ? 'active' : 'pending');
    } catch (error) {
      await refreshDictionaryStorage(error?.message || String(error), 'error');
    }
  }

  function renderDictionaryStorage(state, message = '', messageState = '') {
    const cache = document.getElementById('dictionary-cache-usage');
    const origin = document.getElementById('dictionary-origin-usage');
    const available = document.getElementById('dictionary-available-storage');
    const meter = document.getElementById('dictionary-storage-meter');
    const persistence = document.getElementById('dictionary-persistence-status');
    const persistButton = document.getElementById('dictionary-persist-storage-btn');
    if (!cache || !origin || !available || !meter || !persistence || !persistButton) return;

    cache.textContent = state
      ? `${formatBytes(state.dictionary.byteLength)} em ${formatNumber(state.dictionary.artifacts)} arquivos`
      : 'Indisponivel';
    origin.textContent = state?.estimate
      ? `${formatBytes(state.estimate.usage)} de ${formatBytes(state.estimate.quota)}`
      : 'Estimativa indisponivel';
    available.textContent = state?.estimate ? formatBytes(state.estimate.available) : 'Indisponivel';
    meter.max = state?.estimate?.quota || 1;
    meter.value = state?.estimate?.usage || 0;

    const defaultMessage = state?.persisted === true
      ? 'Armazenamento persistente ativo.'
      : state?.persistenceSupported
        ? 'Persistencia ainda nao concedida.'
        : 'Persistencia nao suportada neste navegador.';
    persistence.textContent = message || defaultMessage;
    persistence.dataset.state = messageState || (state?.persisted ? 'active' : 'pending');
    persistButton.disabled = !state?.persistenceSupported || state?.persisted === true;
    persistButton.textContent = state?.persisted ? 'Protegido' : 'Manter offline';
  }

  function renderDictionaryPackages(packages, options = {}) {
    const list = document.getElementById('dictionary-package-list');
    const summary = document.getElementById('dictionary-package-status');
    if (!list || !summary) return;
    dictionaryPackages = packages;
    renderDictionaryPackageFilter(packages);
    list.replaceChildren(...packages.map(createDictionaryPackageRow));
    renderDictionaryOfflineReadiness(packages);
    renderAppShellState();
    if (!options.preserveSummary) {
      const installed = packages.filter((item) => item.installed).length;
      summary.dataset.state = 'ready';
      summary.textContent = `${installed} de ${packages.length} pacotes ${installed === 1 ? 'instalado' : 'instalados'} neste navegador.`;
    }
  }

  function renderDictionaryPackageFilter(packages) {
    const select = document.getElementById('dictionary-package-filter');
    if (!select) return;
    const previous = select.value || 'essential';
    const available = packages.filter((item) => item.id === 'essential' || item.installed);
    select.replaceChildren(...available.map((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.name} (${formatNumber(item.entryCount)})`;
      return option;
    }));
    const selected = available.some((item) => item.id === previous) ? previous : 'essential';
    if (selected !== previous) dictionaryBrowsePage = 1;
    select.value = selected;
  }

  function createDictionaryPackageRow(item) {
    const row = document.createElement('div');
    row.className = 'package-row';
    row.dataset.packageId = item.id;

    const copy = document.createElement('div');
    copy.className = 'package-copy';
    const heading = document.createElement('div');
    heading.className = 'package-heading';
    const name = document.createElement('strong');
    name.textContent = item.name;
    const version = document.createElement('span');
    version.textContent = item.version;
    heading.append(name, version);
    const description = document.createElement('p');
    description.className = 'package-description';
    description.textContent = item.description;
    const meta = document.createElement('div');
    meta.className = 'package-meta';
    meta.textContent = `${formatNumber(item.entryCount)} palavras | ${formatNumber(item.kanjiCount)} kanji | estimado: ${formatBytes(item.estimatedByteLength)}`;
    const state = document.createElement('div');
    state.className = 'package-state';
    state.textContent = packageStateLabel(item);
    copy.append(heading, description, meta, state);

    const action = document.createElement('button');
    action.className = `data-action${['available', 'interrupted', 'outdated'].includes(item.status) ? ' primary' : ''}`;
    action.type = 'button';
    action.dataset.packageId = item.id;
    if (item.required && item.status === 'offline-ready') {
      action.disabled = true;
      action.textContent = 'Pronto offline';
    } else if (item.required && item.status === 'installing') {
      action.disabled = true;
      action.textContent = 'Preparando';
    } else if (item.required) {
      action.classList.add('primary');
      action.dataset.packageAction = 'prepare';
      action.textContent = item.status === 'interrupted' ? 'Retomar' : item.status === 'outdated'
        ? 'Atualizar offline' : item.status === 'downloaded' ? 'Ativar offline' : 'Preparar offline';
    } else if (item.status === 'ready') {
      action.dataset.packageAction = 'remove';
      action.textContent = 'Remover';
    } else if (['available', 'interrupted', 'outdated'].includes(item.status)) {
      action.dataset.packageAction = 'install';
      action.textContent = item.status === 'interrupted' ? 'Retomar'
        : item.status === 'outdated' ? 'Atualizar' : 'Instalar';
    } else {
      action.disabled = true;
      action.textContent = 'Em breve';
    }
    row.append(copy, action);
    return row;
  }

  function packageStateLabel(item) {
    return {
      included: 'Incluido com o aplicativo',
      'online-only': 'Disponivel online; preparacao offline pendente',
      'offline-ready': 'Pacote essencial completo e validado no navegador',
      downloaded: 'Pacote baixado; ativacao offline pendente',
      outdated: 'Versao offline desatualizada',
      ready: 'Instalado neste navegador',
      available: 'Disponivel para instalar',
      planned: 'Aguardando publicacao da release',
      installing: 'Instalacao em andamento',
      interrupted: 'Download interrompido; pode ser retomado',
    }[item.status] || 'Estado indisponivel';
  }

  function renderDictionaryOfflineReadiness(packages) {
    const container = document.getElementById('dictionary-offline-readiness');
    if (!container) return;
    const essential = packages.find((item) => item.id === 'essential');
    const online = navigator.onLine !== false;
    let state = 'pending';
    let message = 'Pacote essencial ainda nao avaliado.';
    if (essential?.status === 'offline-ready') {
      state = 'ready';
      message = online
        ? 'Pronto para reabrir o dicionario sem rede.'
        : 'Sem conexao: pacote essencial carregado do cache.';
    } else if (essential?.status === 'interrupted') {
      state = 'error';
      message = 'Preparacao interrompida; use Retomar quando houver conexao.';
    } else if (essential?.status === 'outdated') {
      message = 'Pacote offline desatualizado; atualizacao recomendada.';
    } else if (!online) {
      state = 'error';
      message = 'Sem conexao e sem pacote essencial completo no cache.';
    } else if (essential) {
      message = 'Conectado; prepare o pacote essencial para reabrir sem rede.';
    }
    container.dataset.state = state;
    container.querySelector('span:not(.sync-dot)').textContent = message;
  }

  function setDictionaryPackageBusy(packageId, message) {
    const row = document.querySelector(`.package-row[data-package-id="${packageId}"]`);
    if (!row) return;
    const action = row.querySelector('button');
    const state = row.querySelector('.package-state');
    if (action) action.disabled = true;
    if (state) state.textContent = message;
  }

  function renderDictionaryPackageError(message) {
    const summary = document.getElementById('dictionary-package-status');
    if (!summary) return;
    summary.dataset.state = 'error';
    summary.textContent = message;
  }

  async function downloadDictionaryCandidate() {
    if (!dictionaryUpdateManager || !dictionaryReleaseCheck) return;
    setDictionaryReleaseBusy('Baixando e validando a nova versao...');
    try {
      const result = await dictionaryUpdateManager.downloadCandidate(dictionaryReleaseCheck, {
        onProgress: ({ path }) => setDictionaryReleaseBusy(`Validando ${path}...`),
      });
      dictionaryCandidateVersion = result.version;
      renderDictionaryReleaseStatus({
        ...dictionaryReleaseCheck,
        status: 'ready',
        candidateState: result,
      });
    } catch (error) {
      renderDictionaryReleaseStatus({
        ...dictionaryReleaseCheck,
        status: 'download-failed',
        error: error?.message || String(error),
      });
    }
  }

  async function activateDictionaryCandidate() {
    if (!dictionaryUpdateManager || !dictionaryCandidateVersion) return;
    setDictionaryReleaseBusy('Ativando versao validada...');
    try {
      await dictionaryUpdateManager.activateCandidate(dictionaryCandidateVersion);
      location.reload();
    } catch (error) {
      renderDictionaryReleaseStatus({ status: 'activation-failed', error: error?.message || String(error) });
    }
  }

  async function rollbackDictionaryVersion() {
    if (!dictionaryUpdateManager) return;
    setDictionaryReleaseBusy('Restaurando a versao anterior...');
    try {
      await dictionaryUpdateManager.rollback();
      location.reload();
    } catch (error) {
      renderDictionaryReleaseStatus({ status: 'rollback-failed', error: error?.message || String(error) });
    }
  }

  function setDictionaryReleaseBusy(message) {
    renderDictionaryReleaseStatus({ status: 'checking', message });
  }

  function renderDictionaryReleaseStatus(status = {}) {
    const container = document.getElementById('dictionary-release-status');
    const details = document.getElementById('dictionary-release-details');
    const download = document.getElementById('dictionary-download-update-btn');
    const activate = document.getElementById('dictionary-activate-update-btn');
    const rollback = document.getElementById('dictionary-rollback-btn');
    if (!container || !details) return;

    const labels = {
      checking: ['Verificando versao', status.message || 'Consultando a release publica...'],
      current: ['Dicionario atualizado', `Versao ${status.remoteVersion} em uso.`],
      'update-available': ['Atualizacao disponivel', `Versao ${status.remoteVersion} pronta para download.`],
      ready: ['Download concluido', `Versao ${status.remoteVersion} validada e aguardando ativacao.`],
      incompatible: ['Atualizacao incompativel', `Requer Japanese Study ${status.minimumAppVersion} ou superior.`],
      'remote-older': ['Release remota mais antiga', 'A versao ativa foi preservada.'],
      unavailable: ['Verificacao indisponivel', status.error || 'Nao foi possivel consultar a release.'],
      'download-failed': ['Download interrompido', `${status.error || 'Tente novamente.'} Os arquivos validos foram preservados.`],
      'activation-failed': ['Falha na ativacao', status.error || 'A versao atual foi preservada.'],
      'rollback-failed': ['Rollback indisponivel', status.error || 'Nao ha versao anterior pronta.'],
    };
    const [title, message] = labels[status.status] || labels.unavailable;
    container.dataset.state = ['current', 'ready'].includes(status.status) ? 'synced'
      : status.status === 'update-available' ? 'pending'
        : status.status === 'checking' ? 'checking' : 'error';
    container.querySelector('strong').textContent = title;
    container.querySelector('span:not(.sync-dot)').textContent = message;
    details.textContent = [
      status.activeVersion && `Ativa: ${status.activeVersion}`,
      status.remoteVersion && `Publicada: ${status.remoteVersion}`,
      status.candidateState?.byteLength && `Download: ${formatBytes(status.candidateState.byteLength)}`,
    ].filter(Boolean).join(' | ') || 'Nenhuma informacao de versao disponivel.';
    if (download) download.disabled = !['update-available', 'download-failed'].includes(status.status);
    if (activate) activate.disabled = status.status !== 'ready';
    if (rollback) rollback.disabled = !status.cacheState?.previousVersion;
  }

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
    return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('pt-BR');
  }

  async function isDictionaryProviderEnabled() {
    const override = getRuntimeOverride('dictionaryProviderV2');
    if (override === '1') return true;
    if (override === '0') return false;
    try {
      const module = await import('../../../src/firebase/feature-flags.js');
      return module.featureFlags?.dictionaryProviderV2Enabled === true;
    } catch {
      return false;
    }
  }

  async function isDictionaryChunkLoadingEnabled() {
    const override = getRuntimeOverride('dictionaryChunks');
    if (override === '1') return true;
    if (override === '0') return false;
    try {
      const module = await import('../../../src/firebase/feature-flags.js');
      return module.featureFlags?.dictionaryChunkLoadingEnabled === true;
    } catch {
      return false;
    }
  }

  async function isDictionaryOfflinePacksEnabled() {
    const override = getRuntimeOverride('dictionaryOfflinePacks');
    if (override === '1') return true;
    if (override === '0') return false;
    try {
      const module = await import('../../../src/firebase/feature-flags.js');
      return module.featureFlags?.dictionaryOfflinePacksEnabled === true;
    } catch {
      return false;
    }
  }

  function getRuntimeOverride(name) {
    const local = new URLSearchParams(location.search).get(name);
    if (local !== null) return local;
    try {
      if (window.parent && window.parent !== window) {
        return new URLSearchParams(window.parent.location.search).get(name);
      }
    } catch {
      return null;
    }
    return null;
  }

  function applyFilters() {
    if (JapaneseUI.getCurrentView() === 'dictionary') {
      renderDictionary();
      return;
    }
    if (JapaneseUI.getCurrentView() === 'quiz') {
      renderQuiz();
      return;
    }
    if (JapaneseUI.getCurrentView() === 'typing') {
      renderTyping();
      return;
    }
    if (JapaneseUI.getCurrentView() === 'data' || JapaneseUI.getCurrentView() === 'home') return;

    const query = document.getElementById('search-input').value;
    const filters = JapaneseUI.getFilters();
    const results = JapaneseSearch.search(query, filters);
    JapaneseUI.renderGrid(results);
  }

  function setupSearch() {
    const input = document.getElementById('search-input');
    const dictionaryInput = document.getElementById('dictionary-search-input');

    if (input) {
      input.addEventListener('input', () => {
        if (JapaneseUI.getCurrentView() !== 'characters') return;
        const filters = JapaneseUI.getFilters();
        JapaneseSearch.debouncedSearch(input.value, filters);
      });
    }

    if (dictionaryInput) {
      dictionaryInput.addEventListener('input', () => {
        dictionaryBrowsePage = 1;
        clearTimeout(dictionarySearchTimer);
        dictionarySearchTimer = setTimeout(renderDictionary, 150);
      });
    }
  }

  function setupHostListener() {
    window.addEventListener('message', (event) => {
      if (!isAllowedHostMessage(event)) return;

      const data = event.data || {};
      switch (data.type) {
        case 'theme':
          document.documentElement.dataset.theme = normalizeTheme(data.value || data.payload || '');
          break;
        case 'refresh':
          location.reload();
          break;
        case 'focus':
          window.focus();
          break;
        case 'navigate':
          handleHostNavigation(data.payload || data.value || {});
          break;
      }
    });
  }

  function isAllowedHostMessage(event) {
    if (!isTrustedHostSource(event.source)) return false;
    if (!isAllowedOrigin(event.origin)) return false;
    return isValidHostMessage(event.data);
  }

  function isTrustedHostSource(source) {
    return source === window.parent || source === window.opener || source === window;
  }

  function isAllowedOrigin(origin) {
    if (origin === window.location.origin) return true;
    if (origin === 'null' && window.location.protocol === 'file:') return true;
    return false;
  }

  function isValidHostMessage(data) {
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') return false;
    return ['theme', 'refresh', 'focus', 'navigate'].includes(data.type);
  }

  function handleHostNavigation(payload = {}) {
    const view = normalizeHostView(payload.view || payload.target || '');
    if (!view) return;
    JapaneseUI.setCurrentView(view);

    if (view === 'dictionary') {
      applyHostDictionaryQuery(payload);
      renderDictionary();
    }
    if (view === 'quiz') renderQuiz();
    if (view === 'typing') renderTyping();
    if (view === 'home') loadStats();
  }

  function applyHostDictionaryQuery(payload = {}) {
    const query = payload.query || payload.search || payload.term || '';
    if (!query) return;
    const input = document.getElementById('dictionary-search-input');
    if (!input) return;
    input.value = String(query);
  }

  function normalizeHostView(view) {
    const value = String(view || '').toLowerCase();
    const aliases = {
      sync: 'data',
      settings: 'data',
      config: 'data',
      dictionary: 'dictionary',
      dicionario: 'dictionary',
      quiz: 'quiz',
      typing: 'typing',
      digitacao: 'typing',
      home: 'home',
      inicio: 'home',
      characters: 'characters',
      caracteres: 'characters',
      data: 'data',
    };
    return aliases[value] || '';
  }

  function normalizeTheme(theme) {
    const value = String(theme || '').toLowerCase();
    if (['dark', 'escuro', 'night'].includes(value)) return 'dark';
    if (['light', 'claro', 'day'].includes(value)) return 'light';
    return '';
  }

  function setupStorageListener() {
    document.addEventListener('japanese:storage', (e) => {
      const { type, data } = e.detail;
      if (type === 'favorite-added' || type === 'favorite-removed') {
        if (JapaneseUI.getFilters().onlyFavorites) {
          applyFilters();
        } else {
          JapaneseUI.updateCardFavoriteState(data.charId);
        }
        loadStats();
      } else if (
        type === 'progress-updated' ||
        type === 'study-time-updated' ||
        type === 'quiz-updated' ||
        type === 'typing-updated' ||
        type === 'gamification-updated'
      ) {
        loadStats();
      } else if (type === 'srs-updated') {
        if (JapaneseUI.getFilters().dueReview) applyFilters();
        loadStats();
      } else if (
        type === 'dictionary-favorite-added' ||
        type === 'dictionary-favorite-removed' ||
        type === 'dictionary-history-updated'
      ) {
        if (JapaneseUI.getCurrentView() === 'dictionary') renderDictionary();
      } else if (type === 'backup-imported') {
        applyFilters();
        renderDictionary();
        JapaneseQuiz.resetStats();
        loadStats();
      } else if (type === 'data-cleared') {
        JapaneseUI.setFilters({ script: 'hiragana', category: '', onlyFavorites: false, dueReview: false });
        applyFilters();
        renderDictionary();
        JapaneseQuiz.resetStats();
        loadStats();
      }
    });
  }

  async function setupFirebaseSync() {
    try {
      const module = await import('./firebase/japanese-firebase-sync.js');
      firebaseSyncModule = module;
      const result = await module.japaneseFirebaseSync.init({ storage: JapaneseStorage });
      if (result?.enabled) {
        console.info('[japanese-firebase-sync] enabled for current user');
      } else if (result?.reason) {
        JapaneseUI.updateFirebaseSyncStatus({
          state: result.reason === 'user-not-approved' ? 'pending' : 'disabled',
          message: getFirebaseSyncDisabledMessage(result.reason)
        });
      }
    } catch (error) {
      console.info('[japanese-firebase-sync] unavailable in this runtime', error?.message || error);
      JapaneseUI.updateFirebaseSyncStatus({
        state: 'error',
        message: 'Nao foi possivel iniciar a sincronizacao Firebase.'
      });
    }
  }

  function setupFirebaseSyncStatusListener() {
    window.addEventListener('japanese:firebase-sync-status', (event) => {
      JapaneseUI.updateFirebaseSyncStatus(event.detail || {});
    });
  }

  function getFirebaseSyncDisabledMessage(reason) {
    return {
      'feature-disabled': 'Sincronizacao remota desativada por feature flag.',
      'user-not-approved': 'A conta precisa estar aprovada para sincronizar.',
      'already-ready-or-missing-storage': 'Sincronizacao ja inicializada ou armazenamento indisponivel.'
    }[reason] || 'Este ambiente esta usando apenas dados locais.';
  }

  async function syncFirebaseNow() {
    if (!firebaseSyncModule?.japaneseFirebaseSync) {
      JapaneseUI.updateFirebaseSyncStatus({
        state: 'error',
        message: 'Sincronizacao Firebase ainda nao inicializada.'
      });
      return;
    }

    await firebaseSyncModule.japaneseFirebaseSync.syncNow();
  }

  async function exportBackup() {
    try {
      const backup = await JapaneseStorage.exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `japanese-study-backup-${date}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      JapaneseUI.showBackupStatus('Backup exportado com sucesso.', 'success');
    } catch (error) {
      console.error('Failed to export backup:', error);
      JapaneseUI.showBackupStatus('Não foi possível exportar o backup.', 'error');
    }
  }

  async function previewBackupFile(file) {
    selectedBackup = null;

    if (!file) {
      JapaneseUI.updateBackupPreview(null);
      return;
    }

    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      const validation = JapaneseStorage.validateImportedBackup(backup);
      selectedBackup = validation.ok ? backup : null;
      JapaneseUI.updateBackupPreview(validation, file.name);
    } catch {
      JapaneseUI.updateBackupPreview({
        ok: false,
        errors: ['Não foi possível ler o arquivo JSON selecionado.'],
        summary: {}
      }, file.name);
    }
  }

  async function importSelectedBackup(mode) {
    if (!selectedBackup) {
      JapaneseUI.showBackupStatus('Selecione um backup válido antes de importar.', 'error');
      return;
    }

    if (mode === 'replace') {
      const confirmed = window.confirm('Substituir os dados atuais pelo backup selecionado? Esta ação remove progresso, favoritos e SRS atuais antes da importação.');
      if (!confirmed) return;
    }

    try {
      await JapaneseStorage.importBackup(selectedBackup, mode);
      selectedBackup = null;
      JapaneseUI.showBackupStatus(mode === 'replace'
        ? 'Backup importado substituindo os dados atuais.'
        : 'Backup importado e mesclado com os dados atuais.', 'success');
      applyFilters();
      renderDictionary();
      JapaneseQuiz.resetStats();
      loadStats();
    } catch (error) {
      console.error('Failed to import backup:', error);
      JapaneseUI.showBackupStatus(error.message || 'Não foi possível importar o backup.', 'error');
    }
  }

  async function clearLocalData() {
    const confirmation = document.getElementById('clear-data-confirm');
    if (confirmation && !confirmation.checked) {
      JapaneseUI.showClearDataStatus('Marque a confirmação antes de excluir os dados.', 'error');
      return;
    }

    try {
      await JapaneseStorage.clearAllUserData();
      selectedBackup = null;
      JapaneseUI.updateBackupPreview(null);
      JapaneseUI.resetClearDataConfirmation();
      JapaneseUI.showClearDataStatus('Dados locais excluídos com sucesso.', 'success');
      applyFilters();
      renderDictionary();
      JapaneseQuiz.resetStats();
      loadStats();
    } catch (error) {
      console.error('Failed to clear local data:', error);
      JapaneseUI.showClearDataStatus('Não foi possível excluir os dados locais.', 'error');
    }
  }

  async function exportKanaPrint(settings = {}) {
    await JapaneseKanaPrintExport.print({
      ...settings,
      characters: allData
    });
  }

  async function renderDictionary() {
    const sequence = ++dictionaryRenderSequence;
    dictionarySearchController?.abort();
    dictionarySearchController = new AbortController();
    const signal = dictionarySearchController.signal;
    const dictionaryInput = document.getElementById('dictionary-search-input');
    const query = dictionaryInput ? dictionaryInput.value : '';
    const filters = JapaneseUI.getDictionaryFilters();
    const packageId = document.getElementById('dictionary-package-filter')?.value || 'essential';
    let results = [];
    let browseResult = null;

    try {
      if (filters.tab === 'history') {
        const history = await JapaneseStorage.getDictionaryHistory(50);
        const ids = history.map(item => item.charId);
        results = await dictionaryRuntime.filterByIds(ids, { ...filters, signal });
        results = filterDictionaryWords(results, query);
      } else if (filters.tab === 'favorites') {
        const ids = JapaneseStorage.getDictionaryFavorites();
        results = await dictionaryRuntime.filterByIds(ids, { ...filters, signal });
        results = filterDictionaryWords(results, query);
      } else if (!query.trim() && typeof dictionaryRuntime.browse === 'function') {
        browseResult = await dictionaryRuntime.browse({
          ...filters,
          packageId,
          page: dictionaryBrowsePage,
          pageSize: dictionaryBrowsePageSize,
          signal,
        });
        if (!browseResult.entries.length && dictionaryBrowsePage > 1) {
          dictionaryBrowsePage -= 1;
          return renderDictionary();
        }
        results = browseResult.entries;
      } else {
        results = await dictionaryRuntime.search(query, { ...filters, packageId, signal });
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('[dictionary-runtime] search failed', error);
      return;
    }

    if (sequence === dictionaryRenderSequence && !signal.aborted) {
      JapaneseUI.renderDictionary(results, {
        countLabel: browseResult ? dictionaryBrowseCountLabel(browseResult) : '',
      });
      renderDictionaryPagination(browseResult, { query, tab: filters.tab, packageId });
    }
  }

  function dictionaryBrowseCountLabel(result) {
    if (!result.entries.length) return '0 palavras';
    const start = (result.page - 1) * result.pageSize + 1;
    const end = start + result.entries.length - 1;
    return Number.isSafeInteger(result.total)
      ? `${formatNumber(start)}-${formatNumber(end)} de ${formatNumber(result.total)} palavras`
      : `${formatNumber(start)}-${formatNumber(end)} palavras`;
  }

  function renderDictionaryPagination(result, context = {}) {
    const paginations = [...document.querySelectorAll('.dictionary-pagination')];
    const previousButtons = [...document.querySelectorAll('[data-dictionary-page-action="previous"]')];
    const nextButtons = [...document.querySelectorAll('[data-dictionary-page-action="next"]')];
    const numbers = [...document.querySelectorAll('[data-dictionary-page-number]')];
    const summary = document.getElementById('dictionary-page-summary');
    const packageFilter = document.getElementById('dictionary-package-filter');
    if (!paginations.length || !summary || !packageFilter) return;
    const browsing = Boolean(result) && !context.query.trim() && context.tab === 'all';
    packageFilter.disabled = context.tab !== 'all';
    paginations.forEach((pagination) => { pagination.hidden = !browsing; });
    const orderLabel = result?.order === 'romaji-asc-pages' ? ' | Romaji A-Z' : '';
    summary.textContent = browsing
      ? `${dictionaryPackageName(context.packageId)} | ${result.dictionaryVersion || 'base local'}${orderLabel}`
      : context.tab === 'all' ? `Pesquisa em ${dictionaryPackageName(context.packageId)}` : '';
    if (!browsing) return;
    previousButtons.forEach((button) => { button.disabled = !result.hasPrevious; });
    nextButtons.forEach((button) => { button.disabled = !result.hasNext; });
    numbers.forEach((number) => { number.textContent = `Pagina ${formatNumber(result.page)}`; });
  }

  function dictionaryPackageName(packageId) {
    return dictionaryPackages.find((item) => item.id === packageId)?.name || 'Essencial N5';
  }

  function renderQuiz() {
    currentQuizQuestion = JapaneseQuiz.nextQuestion(JapaneseUI.getQuizSettings());
    JapaneseUI.renderQuiz(currentQuizQuestion, JapaneseQuiz.getStats(), undefined, activeQuizContext);
    completeDiagnosticIfNeeded(currentQuizQuestion, JapaneseQuiz.getStats());
  }

  function renderTyping(extra = {}) {
    const exercise = activeTypingSession?.getCurrentExercise() || null;
    const summary = activeTypingSession?.getSummary() || null;
    JapaneseUI.renderTyping({
      started: Boolean(activeTypingSession),
      complete: Boolean(summary?.completed),
      exercise,
      summary,
      currentValue: currentTypingValue,
      feedback: exercise ? JapaneseTypingEvaluator.getLiveFeedback(currentTypingValue, exercise) : null,
      result: currentTypingResult,
      ...extra
    });
  }

  function startTypingSession(settings = JapaneseUI.getTypingSettings()) {
    const session = JapaneseTypingContentProvider.buildSession(settings);
    if (!session.exercises.length) {
      JapaneseUI.renderTyping({
        started: false,
        error: 'Nenhum exercicio local encontrado para estes filtros.'
      });
      return;
    }

    activeTypingSession = createTypingSession(session.exercises, session.settings);
    currentTypingValue = '';
    currentTypingResult = null;
    persistTypingSettings();
    renderTyping();
  }

  function submitTypingAnswer(value) {
    if (!activeTypingSession) {
      startTypingSession();
      return;
    }

    const exercise = activeTypingSession.getCurrentExercise();
    const preview = JapaneseTypingEvaluator.evaluateAnswer(value, exercise);
    if (preview.empty) {
      currentTypingResult = preview;
      currentTypingValue = value;
      renderTyping();
      return;
    }

    const submitted = activeTypingSession.submit(value);
    currentTypingResult = submitted.result;
    currentTypingValue = '';

    const summary = activeTypingSession.getSummary();
    if (summary.completed) {
      JapaneseStorage.saveTypingSession(summary).then(() => {
        JapaneseStorage.emitChange('typing-updated', summary);
      }).catch(() => {});
    }

    renderTyping();
  }

  function resetTypingSession() {
    activeTypingSession = null;
    currentTypingValue = '';
    currentTypingResult = null;
    renderTyping();
  }

  async function startRecommendedSession() {
    const context = await buildAdaptiveContext();
    const session = JapaneseStudyEngine.buildSession(context);
    activeQuizContext = {
      type: 'recommended',
      title: session.title || 'Sess\u00e3o recomendada',
      description: session.description || 'Sess\u00e3o montada com base no seu progresso atual.',
      assistant: session.assistant || null
    };
    JapaneseUI.applyQuizSettings(session.quiz);
    persistQuizSettings();
    JapaneseQuiz.resetStats(Number(session.quiz.limit || 10));
    JapaneseUI.setCurrentView('quiz');
    renderQuiz();
  }

  function startDiagnosticSession() {
    const settings = {
      mode: 'multiple-choice',
      script: 'all',
      categories: ['gojuuon'],
      limit: '10',
      includeMistakeReviews: false
    };
    activeQuizContext = {
      type: 'diagnostic',
      title: 'Diagn\u00f3stico inicial',
      description: 'Responda 10 perguntas de Gojuuon em hiragana e katakana. As revis\u00f5es de erro ficam desativadas nesta sess\u00e3o.'
    };
    JapaneseUI.applyQuizSettings(settings);
    persistDiagnostic({ skipped: false, startedAt: new Date().toISOString(), weakScript: null });
    JapaneseQuiz.resetStats(10);
    JapaneseUI.setCurrentView('quiz');
    renderQuiz();
  }

  function startGuidedTrail(trailId) {
    const trail = JapaneseRecommendationEngine.getGuidedTrail(trailId);
    if (!trail) return;
    startPresetSession(trail, 'guided');
  }

  function startQuickSession(sessionId) {
    const session = JapaneseRecommendationEngine.getQuickSession(sessionId);
    if (!session) return;
    startPresetSession(session, 'quick');
  }

  function startErrorPractice(payload = {}) {
    const script = ['hiragana', 'katakana', 'kanji'].includes(payload.script) ? payload.script : 'all';
    const categories = payload.category ? [payload.category] : ['gojuuon', 'dakuon', 'handakuon', 'youon', 'N5'];
    const settings = {
      mode: script === 'kanji' ? 'multiple-choice' : 'kana-typing',
      script,
      categories,
      limit: '10',
      includeMistakeReviews: true
    };

    activeQuizContext = {
      type: 'recommended',
      title: 'Treino focado em erros',
      description: payload.char
        ? 'Rodada curta para estabilizar ' + payload.char + ' e itens parecidos.'
        : 'Rodada curta montada a partir do caderno de erros.'
    };
    JapaneseUI.applyQuizSettings(settings);
    persistQuizSettings();
    JapaneseQuiz.resetStats(10);
    JapaneseUI.setCurrentView('quiz');
    renderQuiz();
  }

  function startPresetSession(preset, type) {
    const settings = {
      mode: preset.quiz?.mode || 'multiple-choice',
      script: preset.quiz?.script || 'all',
      categories: Array.isArray(preset.quiz?.categories) ? preset.quiz.categories : ['gojuuon'],
      limit: String(preset.quiz?.limit || 10),
      includeMistakeReviews: preset.quiz?.includeMistakeReviews !== false
    };

    activeQuizContext = {
      type: 'recommended',
      title: preset.title || 'Sess\u00e3o de estudo',
      description: type === 'guided'
        ? (preset.description || 'Trilha guiada de estudo.')
        : 'Sess\u00e3o r\u00e1pida configurada para estudar agora.'
    };
    JapaneseUI.applyQuizSettings(settings);
    persistQuizSettings();
    JapaneseQuiz.resetStats(Number(settings.limit || 10));
    JapaneseUI.setCurrentView('quiz');
    renderQuiz();
  }

  function filterDictionaryWords(words, query) {
    const q = String(query || '').toLowerCase().trim();
    if (!q) return words;

    return words.filter(word =>
      String(word.word || '').toLowerCase().includes(q) ||
      String(word.reading || '').toLowerCase().includes(q) ||
      String(word.romaji || '').toLowerCase().includes(q) ||
      String(word.definition || '').toLowerCase().includes(q) ||
      String(word.category || '').toLowerCase().includes(q)
    );
  }

  async function loadStats() {
    try {
      const favs = JapaneseStorage.getFavorites();
      const stats = await JapaneseStorage.getStats();
      const srsStats = JapaneseStorage.getSrsStats(allData);
      const quizStats = await JapaneseStorage.getQuizStats();
      const typingStats = await JapaneseStorage.getTypingStats();
      const difficulty = await JapaneseStorage.getDifficultyMap(8);
      const completion = getCompletion(stats.studiedIds || []);
      const settings = JapaneseStorage.getSettings();
      const gamificationGoals = JapaneseStorage.getGamificationGoals();
      const context = {
        characters: allData,
        stats,
        srsStats,
        quizStats,
        typingStats,
        completion,
        difficulty,
        studiedIds: stats.studiedIds || [],
        diagnostic: settings.diagnostic || {},
        goals: gamificationGoals,
        persistedAchievements: settings.gamificationAchievements || {}
      };
      const gamificationStats = await JapaneseStorage.getGamificationStats(context);
      const achievementSync = JapaneseStorage.syncGamificationAchievements(gamificationStats.achievements);
      if (achievementSync.newlyUnlocked.length > 0) {
        const unlocked = new Set(achievementSync.newlyUnlocked);
        gamificationStats.achievements = gamificationStats.achievements.map(item => ({
          ...item,
          isNew: unlocked.has(item.id)
        }));
      }
      context.gamificationStats = gamificationStats;
      context.gamificationEvents = gamificationStats.events;
      const level = JapaneseLearningLevels.calculate(context);
      const recommendation = JapaneseRecommendationEngine.recommend(context);
      JapaneseUI.updateStats({
        totalChars: allData.length,
        favorites: favs.length,
        studied: stats.totalStudied || 0
      });
      JapaneseUI.updateDashboard({
        stats,
        srsStats,
        quizStats,
        typingStats,
        gamificationStats,
        completion,
        favorites: favs.length,
        level,
        recommendation,
        difficulty,
        syllabus: JapaneseRecommendationEngine.SYLLABUS,
        guidedTrails: JapaneseRecommendationEngine.GUIDED_TRAILS,
        quickSessions: JapaneseRecommendationEngine.QUICK_SESSIONS
      });
    } catch {
      JapaneseUI.updateStats({
        totalChars: allData.length,
        favorites: JapaneseStorage.getFavorites().length,
        studied: 0
      });
      JapaneseUI.updateDashboard({
        stats: {},
        srsStats: JapaneseStorage.getSrsStats(allData),
        typingStats: { sessions: 0, errors: 0, totalKanaTyped: 0, averageAccuracy: 0, recentErrors: [] },
        gamificationStats: JapaneseLearningLevels.calculate({}),
        completion: getCompletion([]),
        favorites: JapaneseStorage.getFavorites().length,
        level: JapaneseLearningLevels.calculate({}),
        recommendation: JapaneseRecommendationEngine.recommend({ characters: allData }),
        difficulty: [],
        syllabus: JapaneseRecommendationEngine.SYLLABUS,
        guidedTrails: JapaneseRecommendationEngine.GUIDED_TRAILS,
        quickSessions: JapaneseRecommendationEngine.QUICK_SESSIONS
      });
    }
  }

  async function buildAdaptiveContext() {
    const stats = await JapaneseStorage.getStats();
    const srsStats = JapaneseStorage.getSrsStats(allData);
    const quizStats = await JapaneseStorage.getQuizStats();
    const typingStats = await JapaneseStorage.getTypingStats();
    const difficulty = await JapaneseStorage.getDifficultyMap(8);
    const completion = getCompletion(stats.studiedIds || []);
    const settings = JapaneseStorage.getSettings();
    const gamificationGoals = JapaneseStorage.getGamificationGoals();
    const context = {
      characters: allData,
      stats,
      srsStats,
      quizStats,
      typingStats,
      completion,
      difficulty,
      studiedIds: stats.studiedIds || [],
      diagnostic: settings.diagnostic || {},
      goals: gamificationGoals,
      persistedAchievements: settings.gamificationAchievements || {}
    };
    const gamificationStats = await JapaneseStorage.getGamificationStats(context);
    return {
      ...context,
      gamificationStats,
      gamificationEvents: gamificationStats.events
    };
  }

  function getSavedQuizSettings() {
    const settings = JapaneseStorage.getSettings();
    return {
      mode: settings.quiz?.mode || 'recognition',
      script: settings.quiz?.script || 'all',
      categories: Array.isArray(settings.quiz?.categories) ? settings.quiz.categories : ['gojuuon', 'dakuon', 'handakuon', 'youon'],
      limit: settings.quiz?.limit || '10',
      includeMistakeReviews: settings.quiz?.includeMistakeReviews !== false
    };
  }

  function getSavedTypingSettings() {
    const settings = JapaneseStorage.getSettings();
    return {
      script: settings.typing?.script || 'hiragana',
      size: settings.typing?.size || 'small',
      mode: settings.typing?.mode || 'copy',
      level: settings.typing?.level || 'beginner',
      category: settings.typing?.category || 'all',
      limit: settings.typing?.limit || '5'
    };
  }

  function persistQuizSettings() {
    const settings = JapaneseStorage.getSettings();
    JapaneseStorage.setSettings({
      ...settings,
      quiz: JapaneseUI.getQuizSettings()
    });
  }

  function persistTypingSettings() {
    const settings = JapaneseStorage.getSettings();
    JapaneseStorage.setSettings({
      ...settings,
      typing: JapaneseUI.getTypingSettings()
    });
  }

  function persistDiagnostic(diagnostic) {
    const settings = JapaneseStorage.getSettings();
    JapaneseStorage.setSettings({
      ...settings,
      diagnostic: {
        ...(settings.diagnostic || {}),
        ...diagnostic
      }
    });
  }

  function completeDiagnosticIfNeeded(question, stats) {
    if (!question || question.type !== 'complete') return;
    const settings = JapaneseStorage.getSettings();
    const diagnostic = settings.diagnostic || {};
    if (!diagnostic.startedAt || diagnostic.completedAt) return;

    const accuracy = stats.accuracy || 0;
    persistDiagnostic({
      completedAt: new Date().toISOString(),
      answered: stats.answered || 0,
      accuracy,
      level: accuracy >= 80 ? 'intermediario' : accuracy >= 50 ? 'iniciante-plus' : 'iniciante',
      weakScript: accuracy < 70 ? 'hiragana' : null
    });
    loadStats();
  }

  function getCompletion(studiedIds) {
    const studied = new Set(studiedIds);
    const countStudied = (items) => items.filter(c => studied.has(JapaneseSearch.buildId(c))).length;

    return {
      hiragana: {
        total: hiraganaData.length,
        studied: countStudied(hiraganaData)
      },
      katakana: {
        total: katakanaData.length,
        studied: countStudied(katakanaData)
      },
      kanji: {
        total: kanjiData.length,
        studied: countStudied(kanjiData)
      }
    };
  }

  function setupStudyTimeTracking() {
    setInterval(saveStudyTimeSnapshot, 60000);
    window.addEventListener('pagehide', saveStudyTimeSnapshot);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveStudyTimeSnapshot();
    });
  }

  function saveStudyTimeSnapshot() {
    const elapsedMinutes = Math.floor((Date.now() - sessionStartedAt) / 60000);
    const unsavedMinutes = elapsedMinutes - lastSavedMinute;
    if (unsavedMinutes <= 0) return;

    lastSavedMinute = elapsedMinutes;
    JapaneseStorage.saveStudyTime(unsavedMinutes).then(() => {
      JapaneseStorage.emitChange('study-time-updated', { minutes: unsavedMinutes });
    }).catch(() => {});
  }

  document.addEventListener('DOMContentLoaded', init);

  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    init();
  }

  return { init, applyFilters };
})();
