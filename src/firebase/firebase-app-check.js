const APP_CHECK_SDK_URL = 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app-check.js';
const ENTERPRISE_PROVIDER = 'recaptcha-enterprise';
const DEBUG_DATABASE = 'firebase-app-check-database';
const DEBUG_STORE = 'firebase-app-check-store';
const DEBUG_TOKEN_KEY = 'debug-token';

let initializationPromise = null;

export function resolveAppCheckRuntime(
  config,
  {
    hostname = globalThis.location?.hostname || '',
    emulatorsEnabled = false,
  } = {},
) {
  const settings = config?.appCheck || {};

  if (emulatorsEnabled) return disabled('emulators');
  if (settings.enabled !== true) return disabled('configuration');
  if (settings.provider !== ENTERPRISE_PROVIDER) return invalid('unsupported-provider');
  if (!hasSiteKey(settings.siteKey)) return invalid('missing-site-key');

  const configuredDebugToken = normalizeConfiguredDebugToken(settings.debugToken);
  const debug = settings.debug === true || Boolean(configuredDebugToken);
  const local = isLocalHostname(hostname);
  if (debug && !local) return invalid('debug-outside-localhost');

  return Object.freeze({
    enabled: true,
    status: 'ready',
    provider: settings.provider,
    siteKey: settings.siteKey.trim(),
    debug,
  });
}

export function initializeFirebaseAppCheck(app, config, options = {}) {
  if (initializationPromise) return initializationPromise;

  initializationPromise = initialize(app, config, options);
  return initializationPromise;
}

async function initialize(app, config, options) {
  const runtime = resolveAppCheckRuntime(config, options);
  if (!runtime.enabled) return runtime;

  try {
    if (runtime.debug) {
      const configuredDebugToken = normalizeConfiguredDebugToken(config?.appCheck?.debugToken);
      globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = configuredDebugToken || true;
      if (!configuredDebugToken) await ensureAppCheckDebugTokenStore();
    }

    const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import(APP_CHECK_SDK_URL);
    const instance = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(runtime.siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    if (runtime.debug) void logStoredDebugToken();

    return Object.freeze({
      ...runtime,
      status: runtime.debug ? 'debug' : 'active',
      instance,
    });
  } catch (error) {
    console.warn('[firebase] App Check indisponivel; seguindo sem enforcement.', error);
    return Object.freeze({
      enabled: false,
      status: 'error',
      reason: 'initialization-failed',
      error,
    });
  }
}

export async function readStoredAppCheckDebugToken(indexedDBImpl = globalThis.indexedDB) {
  if (!indexedDBImpl?.open) return null;
  const database = await openDebugDatabase(indexedDBImpl);
  if (!database.objectStoreNames.contains(DEBUG_STORE)) {
    database.close();
    return null;
  }
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(DEBUG_STORE, 'readonly');
      const request = transaction.objectStore(DEBUG_STORE).get(DEBUG_TOKEN_KEY);
      request.onsuccess = () => resolve(request.result?.value || null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function ensureAppCheckDebugTokenStore(indexedDBImpl = globalThis.indexedDB) {
  if (!indexedDBImpl?.open) return false;
  const database = await openDebugDatabase(indexedDBImpl);
  const valid = database.objectStoreNames.contains(DEBUG_STORE);
  database.close();
  if (valid) return true;

  const deleted = await deleteDebugDatabase(indexedDBImpl);
  if (!deleted) return false;
  const repaired = await openDebugDatabase(indexedDBImpl);
  const repairedSuccessfully = repaired.objectStoreNames.contains(DEBUG_STORE);
  repaired.close();
  return repairedSuccessfully;
}

async function logStoredDebugToken() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const token = await readStoredAppCheckDebugToken();
      if (token) {
        console.info(`[firebase] App Check debug token local: ${token}`);
        return;
      }
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function openDebugDatabase(indexedDBImpl) {
  return new Promise((resolve, reject) => {
    const request = indexedDBImpl.open(DEBUG_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DEBUG_STORE)) {
        request.result.createObjectStore(DEBUG_STORE, { keyPath: 'compositeKey' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function deleteDebugDatabase(indexedDBImpl) {
  return new Promise((resolve) => {
    const request = indexedDBImpl.deleteDatabase(DEBUG_DATABASE);
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
    request.onblocked = () => resolve(false);
  });
}

function disabled(reason) {
  return Object.freeze({ enabled: false, status: 'disabled', reason });
}

function invalid(reason) {
  return Object.freeze({ enabled: false, status: 'misconfigured', reason });
}

function hasSiteKey(value) {
  return typeof value === 'string'
    && value.trim().length > 0
    && !value.includes('YOUR_');
}

function normalizeConfiguredDebugToken(value) {
  const token = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(token)
    ? token
    : '';
}

function isLocalHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';
}
