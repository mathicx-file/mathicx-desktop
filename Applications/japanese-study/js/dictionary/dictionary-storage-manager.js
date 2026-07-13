const DEFAULT_RESERVE_BYTES = 10 * 1024 * 1024;

export class DictionaryStorageManager {
  constructor(options = {}) {
    if (!options.repository) throw new Error('Dictionary storage repository is required.');
    this.repository = options.repository;
    this.storage = options.storage || globalThis.navigator?.storage || null;
    this.minimumReserveBytes = normalizeBytes(
      options.minimumReserveBytes ?? DEFAULT_RESERVE_BYTES,
      'minimum storage reserve',
    );
  }

  async snapshot() {
    const dictionary = await this.repository.getTotalCacheUsage();
    const estimateSupported = typeof this.storage?.estimate === 'function';
    const persistenceSupported = typeof this.storage?.persist === 'function';
    let estimate = null;
    let persisted = null;

    if (estimateSupported) {
      try {
        const result = await this.storage.estimate();
        const usage = optionalBytes(result?.usage);
        const quota = optionalBytes(result?.quota);
        if (usage !== null && quota !== null) {
          estimate = {
            usage,
            quota,
            available: Math.max(0, quota - usage),
            usageRatio: quota > 0 ? Math.min(1, usage / quota) : 0,
          };
        }
      } catch {
        estimate = null;
      }
    }

    if (typeof this.storage?.persisted === 'function') {
      try {
        persisted = await this.storage.persisted() === true;
      } catch {
        persisted = null;
      }
    }

    return {
      dictionary,
      estimate,
      estimateSupported,
      persistenceSupported,
      persisted,
      minimumReserveBytes: this.minimumReserveBytes,
    };
  }

  async assertCapacity(requiredBytes, options = {}) {
    const required = normalizeBytes(requiredBytes, 'required dictionary storage');
    const cached = await this.cachedBytes(options);
    const additionalBytes = Math.max(0, required - cached);
    const state = await this.snapshot();
    if (!state.estimate) {
      return { ...state, requiredBytes: required, cachedBytes: cached, additionalBytes, canInstall: null };
    }
    const canInstall = additionalBytes + this.minimumReserveBytes <= state.estimate.available;
    const result = { ...state, requiredBytes: required, cachedBytes: cached, additionalBytes, canInstall };
    if (!canInstall) throw createQuotaError(result);
    return result;
  }

  async requestPersistence() {
    if (typeof this.storage?.persist !== 'function') {
      return { granted: false, supported: false, state: await this.snapshot() };
    }
    const granted = await this.storage.persist() === true;
    return { granted, supported: true, state: await this.snapshot() };
  }

  async cachedBytes(options) {
    if (options.version && options.packageId) {
      return (await this.repository.getPackageUsage(options.version, options.packageId)).byteLength;
    }
    if (options.version) return (await this.repository.getCacheUsage(options.version)).byteLength;
    return 0;
  }
}

function createQuotaError(state) {
  const error = new Error(
    'Espaco insuficiente para este pacote. Remova conteudo offline opcional ou libere armazenamento do navegador.',
  );
  error.name = 'QuotaExceededError';
  error.code = 'dictionary-quota-preflight';
  error.requiredBytes = state.additionalBytes;
  error.availableBytes = state.estimate.available;
  error.reserveBytes = state.minimumReserveBytes;
  return error;
}

function normalizeBytes(value, label) {
  const bytes = Number(value);
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error(`Invalid ${label}: ${value}`);
  return bytes;
}

function optionalBytes(value) {
  const bytes = Number(value);
  return Number.isFinite(bytes) && bytes >= 0 ? Math.floor(bytes) : null;
}
