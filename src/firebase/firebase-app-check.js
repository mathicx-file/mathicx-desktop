const APP_CHECK_SDK_URL = 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app-check.js';
const ENTERPRISE_PROVIDER = 'recaptcha-enterprise';

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

  const debug = settings.debug === true;
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
    if (runtime.debug) globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true;

    const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import(APP_CHECK_SDK_URL);
    const instance = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(runtime.siteKey),
      isTokenAutoRefreshEnabled: true,
    });

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

function isLocalHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';
}
