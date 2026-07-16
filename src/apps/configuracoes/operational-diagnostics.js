export const OPERATIONAL_DIAGNOSTICS_FORMAT = 'mathicx-operational-diagnostics';
export const OPERATIONAL_DIAGNOSTICS_SCHEMA_VERSION = 1;
export const MAX_DIAGNOSTIC_HISTORY_ENTRIES = 12;

const FAILURE_STATES = new Set(['error', 'conflict']);

export function createOperationalDiagnostics(options = {}) {
  const generatedAt = toIsoString(options.now?.() || new Date());
  const apps = (Array.isArray(options.apps) ? options.apps : []).map(normalizeApp);
  const firebase = options.firebase || null;
  const appCheck = firebase?.appCheck || null;
  const summary = apps.reduce((result, app) => {
    result.total += 1;
    if (app.state === 'synced') result.synced += 1;
    else if (app.state === 'closed') result.closed += 1;
    else result.attention += 1;
    if (FAILURE_STATES.has(app.state)) result.failures += 1;
    return result;
  }, { total: 0, synced: 0, attention: 0, closed: 0, failures: 0 });

  return Object.freeze({
    format: OPERATIONAL_DIAGNOSTICS_FORMAT,
    schemaVersion: OPERATIONAL_DIAGNOSTICS_SCHEMA_VERSION,
    generatedAt,
    runtime: Object.freeze({
      channel: normalizeChannel(options.runtime?.channel),
      online: options.runtime?.online !== false,
      secureContext: options.runtime?.secureContext === true,
    }),
    auth: Object.freeze({
      mode: ['firebase', 'guest'].includes(options.auth?.mode) ? options.auth.mode : 'local',
      authenticated: options.auth?.authenticated === true,
      approved: options.auth?.approved === true,
      admin: options.auth?.admin === true,
    }),
    firebase: Object.freeze({
      initialized: Boolean(firebase),
      projectId: firebase?.config?.projectId || '',
      emulatorsEnabled: options.firebaseEmulatorsEnabled === true,
      appCheck: Object.freeze({
        enabled: appCheck?.enabled === true,
        status: normalizeAppCheckStatus(appCheck?.status),
        provider: appCheck?.provider || '',
        debug: appCheck?.debug === true,
      }),
    }),
    summary: Object.freeze(summary),
    apps: Object.freeze(apps),
  });
}

export function updateDiagnosticHistory(report, previous = {}) {
  validateReport(report);
  const priorStates = isRecord(previous.lastStates) ? previous.lastStates : {};
  const entries = Array.isArray(previous.entries)
    ? previous.entries.map(normalizeHistoryEntry).filter(Boolean)
    : [];
  const nextEntries = [...entries];
  const lastStates = {};

  report.apps.forEach((app) => {
    lastStates[app.appId] = app.state;
    if (FAILURE_STATES.has(app.state) && priorStates[app.appId] !== app.state) {
      nextEntries.unshift({ occurredAt: report.generatedAt, appId: app.appId, state: app.state });
    }
  });

  return {
    entries: nextEntries.slice(0, MAX_DIAGNOSTIC_HISTORY_ENTRIES),
    lastStates,
  };
}

export function downloadOperationalDiagnostics(report, options = {}) {
  validateReport(report);
  const documentRef = options.document || globalThis.document;
  const urlApi = options.urlApi || globalThis.URL;
  const BlobClass = options.BlobClass || globalThis.Blob;
  if (!documentRef?.createElement || !urlApi?.createObjectURL || !BlobClass) {
    throw new Error('File download is unavailable in this browser.');
  }
  const blob = new BlobClass([`${JSON.stringify(report, null, 2)}\n`], { type: 'application/json' });
  const link = documentRef.createElement('a');
  const url = urlApi.createObjectURL(blob);
  link.href = url;
  link.download = options.fileName || createDiagnosticsFileName(report.generatedAt);
  link.click();
  urlApi.revokeObjectURL(url);
  return { fileName: link.download, byteLength: blob.size };
}

export function createDiagnosticsFileName(value) {
  const date = new Date(value || Date.now());
  const stamp = (Number.isNaN(date.getTime()) ? new Date() : date)
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('Z', '');
  return `mathicx-diagnostics-${stamp}.json`;
}

export function resolveRuntimeChannel(hostname = '') {
  const host = String(hostname).toLowerCase();
  if (!host || host === 'localhost' || host === '127.0.0.1') return 'local';
  if (host.endsWith('.github.io')) return 'github-pages';
  return 'web';
}

function normalizeApp(app = {}) {
  const capabilities = app.capabilities || null;
  return Object.freeze({
    appId: String(app.appId || ''),
    name: String(app.name || app.appId || ''),
    appVersion: String(capabilities?.appVersion || app.version || 'unknown'),
    state: String(app.state || 'checking'),
    connection: app.appId === 'desktop'
      ? 'host'
      : (app.connectedViaWindow ? 'iframe' : (app.state === 'closed' ? 'closed' : 'adapter')),
    protocolVersion: Number.isSafeInteger(capabilities?.protocolVersion)
      ? capabilities.protocolVersion
      : null,
    actions: Object.freeze(Array.isArray(capabilities?.actions)
      ? [...capabilities.actions].map(String).sort()
      : []),
    sync: Object.freeze({
      status: capabilities?.sync?.status === true,
      manual: capabilities?.sync?.manual === true,
    }),
    backup: capabilities?.backup ? Object.freeze({
      format: String(capabilities.backup.format || ''),
      schemaVersion: Number(capabilities.backup.schemaVersion) || null,
      protectedRequired: capabilities.backup.containsFinancialData === true,
    }) : null,
  });
}

function normalizeHistoryEntry(value) {
  if (!isRecord(value) || !FAILURE_STATES.has(value.state) || !value.appId) return null;
  return {
    occurredAt: toIsoString(value.occurredAt),
    appId: String(value.appId),
    state: value.state,
  };
}

function validateReport(report) {
  if (report?.format !== OPERATIONAL_DIAGNOSTICS_FORMAT
    || report.schemaVersion !== OPERATIONAL_DIAGNOSTICS_SCHEMA_VERSION
    || !Array.isArray(report.apps)) {
    throw new Error('Invalid operational diagnostics report.');
  }
}

function normalizeChannel(value) {
  return ['local', 'github-pages', 'web'].includes(value) ? value : 'web';
}

function normalizeAppCheckStatus(value) {
  return ['active', 'debug', 'disabled', 'error', 'misconfigured', 'ready'].includes(value)
    ? value
    : 'unavailable';
}

function toIsoString(value) {
  const date = new Date(value || Date.now());
  return (Number.isNaN(date.getTime()) ? new Date() : date).toISOString();
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
