export const JAPANESE_SHELL_CACHE_PREFIX = 'mathicx-japanese-shell-';
export const JAPANESE_SHELL_PREFERENCE_KEY = 'mathicx.japanese.shell-offline';

export class JapaneseAppShellManager {
  constructor(options = {}) {
    this.serviceWorker = options.serviceWorker || globalThis.navigator?.serviceWorker;
    this.cacheStorage = options.cacheStorage || globalThis.caches;
    this.storage = options.storage || globalThis.localStorage;
    this.MessageChannelClass = options.MessageChannelClass || globalThis.MessageChannel;
    this.scriptUrl = String(options.scriptUrl || new URL('../service-worker.js', import.meta.url));
    this.scopeUrl = String(options.scopeUrl || new URL('../', import.meta.url));
  }

  isSupported() {
    return Boolean(this.serviceWorker?.register && this.cacheStorage?.keys);
  }

  isEnabledByUser() {
    return this.storage?.getItem(JAPANESE_SHELL_PREFERENCE_KEY) === '1';
  }

  async initialize() {
    if (!this.isSupported()) return this.snapshot('unsupported');
    if (!this.isEnabledByUser()) {
      await this.removeRegistrationsAndCaches();
      return this.snapshot('disabled');
    }
    return this.enable({ persistPreference: false });
  }

  async enable(options = {}) {
    if (!this.isSupported()) throw new Error('Aplicativo offline nao suportado por este navegador.');
    const registration = await this.serviceWorker.register(this.scriptUrl, {
      scope: this.scopeUrl,
      updateViaCache: 'none',
    });
    await registration.update?.();
    await waitForActiveWorker(registration);
    if (options.persistPreference !== false) {
      this.storage?.setItem(JAPANESE_SHELL_PREFERENCE_KEY, '1');
    }
    return this.snapshot('ready', registration);
  }

  async disable(options = {}) {
    await this.removeRegistrationsAndCaches();
    if (options.preservePreference !== true) {
      this.storage?.removeItem(JAPANESE_SHELL_PREFERENCE_KEY);
    }
    return this.snapshot('disabled');
  }

  async repair() {
    if (!this.isSupported()) throw new Error('Aplicativo offline nao suportado por este navegador.');
    const registration = await this.serviceWorker.register(this.scriptUrl, {
      scope: this.scopeUrl,
      updateViaCache: 'none',
    });
    await registration.update?.();
    await waitForActiveWorker(registration);
    const worker = registration.active || registration.waiting;
    if (!worker || typeof this.MessageChannelClass !== 'function') {
      throw new Error('Service Worker ativo nao encontrado para reparar o cache.');
    }
    await requestShellCacheRebuild(worker, this.MessageChannelClass);
    this.storage?.setItem(JAPANESE_SHELL_PREFERENCE_KEY, '1');
    return this.snapshot('ready', registration);
  }

  async snapshot(state = '') {
    if (!this.isSupported()) return { supported: false, enabled: false, state: 'unsupported' };
    const registration = await this.findRegistration();
    const cacheNames = await this.cacheStorage.keys();
    const shellCaches = cacheNames.filter((name) => name.startsWith(JAPANESE_SHELL_CACHE_PREFIX));
    const enabled = Boolean(registration && shellCaches.length);
    return {
      supported: true,
      enabled,
      state: state || (enabled ? 'ready' : 'disabled'),
      scope: registration?.scope || this.scopeUrl,
      caches: shellCaches.length,
    };
  }

  async findRegistration() {
    if (typeof this.serviceWorker.getRegistration === 'function') {
      return this.serviceWorker.getRegistration(this.scopeUrl);
    }
    const registrations = await this.serviceWorker.getRegistrations?.() || [];
    return registrations.find((item) => item.scope === this.scopeUrl);
  }

  async removeRegistrationsAndCaches() {
    const registrations = await this.serviceWorker?.getRegistrations?.() || [];
    await Promise.all(registrations
      .filter((item) => item.scope === this.scopeUrl)
      .map((item) => item.unregister()));
    const cacheNames = await this.cacheStorage?.keys?.() || [];
    await Promise.all(cacheNames
      .filter((name) => name.startsWith(JAPANESE_SHELL_CACHE_PREFIX))
      .map((name) => this.cacheStorage.delete(name)));
  }
}

async function waitForActiveWorker(registration) {
  const worker = registration.installing || registration.waiting || registration.active;
  if (!worker || worker.state === 'activated') return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Tempo esgotado ao preparar o aplicativo offline.')), 15000);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') {
        clearTimeout(timeout);
        resolve();
      }
      if (worker.state === 'redundant') {
        clearTimeout(timeout);
        reject(new Error('Falha ao instalar o cache do aplicativo.'));
      }
    });
  });
}

async function requestShellCacheRebuild(worker, MessageChannelClass) {
  await new Promise((resolve, reject) => {
    const channel = new MessageChannelClass();
    const timeout = setTimeout(() => {
      channel.port1.close?.();
      reject(new Error('Tempo esgotado ao reconstruir o cache do aplicativo.'));
    }, 15000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      channel.port1.close?.();
      if (event.data?.ok) resolve();
      else reject(new Error(event.data?.error || 'Falha ao reconstruir o cache do aplicativo.'));
    };
    worker.postMessage({ type: 'REBUILD_SHELL_CACHE' }, [channel.port2]);
  });
}
