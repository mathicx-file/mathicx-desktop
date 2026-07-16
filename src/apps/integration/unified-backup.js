import {
  APP_DATA_ACTIONS,
  APP_DATA_PROTOCOL_VERSION,
  createProtocolError,
} from './app-data-contract.js';

export const UNIFIED_BACKUP_FORMAT = 'mathicx-unified-backup';
export const UNIFIED_BACKUP_SCHEMA_VERSION = 1;
export const GUEST_BACKUP_SOURCE = 'guest-local';

export async function collectUnifiedBackup(host, apps, options = {}) {
  if (!Array.isArray(apps) || apps.length === 0) {
    throw createProtocolError('empty-backup-selection', 'Select at least one app for backup.');
  }

  const entries = [];
  for (const app of apps) {
    const backupContract = app?.capabilities?.backup;
    if (!backupContract) {
      throw createProtocolError('backup-unavailable', `Backup is unavailable for: ${app?.appId || 'unknown'}`);
    }
    if (backupContract.containsFinancialData && options.encrypted !== true) {
      throw createProtocolError('financial-data-requires-encryption', 'Financial data requires an encrypted package.');
    }

    const backup = await requestApp(host, app.appId, APP_DATA_ACTIONS.backupExport, {}, options);
    const validation = await requestApp(host, app.appId, APP_DATA_ACTIONS.backupValidate, { backup }, options);
    if (!validation?.ok) {
      throw createProtocolError('invalid-app-backup', `App rejected its exported backup: ${app.appId}`);
    }
    entries.push({ appId: app.appId, capabilities: app.capabilities, backup });
  }

  return createUnifiedBackupPackage(entries, options);
}

export async function createUnifiedBackupPackage(entries, options = {}) {
  const now = options.now || (() => new Date());
  const cryptoImpl = options.cryptoImpl || globalThis.crypto;
  if (!cryptoImpl?.subtle?.digest) throw new Error('SHA-256 is unavailable in this browser.');

  const apps = [];
  for (const entry of entries || []) {
    const contract = entry?.capabilities?.backup;
    assertBackupEntry(entry, contract, options.encrypted === true);
    const backup = structuredClone(entry.backup);
    apps.push({
      appId: entry.appId,
      format: contract.format,
      schemaVersion: contract.schemaVersion,
      containsFinancialData: contract.containsFinancialData === true,
      sha256: await sha256Hex(canonicalJson(backup), cryptoImpl),
      backup,
    });
  }
  if (apps.length === 0) throw createProtocolError('empty-backup-selection', 'Select at least one app for backup.');

  const source = normalizeBackupSource(options.source);
  return {
    format: UNIFIED_BACKUP_FORMAT,
    schemaVersion: UNIFIED_BACKUP_SCHEMA_VERSION,
    protocolVersion: APP_DATA_PROTOCOL_VERSION,
    exportedAt: now().toISOString(),
    encrypted: options.encrypted === true,
    ...(source ? { source } : {}),
    apps,
  };
}

export async function validateUnifiedBackupPackage(value, options = {}) {
  const cryptoImpl = options.cryptoImpl || globalThis.crypto;
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, errors: ['O pacote de backup nao e um objeto valido.'], apps: [] };
  }
  if (value.format !== UNIFIED_BACKUP_FORMAT) errors.push('Formato de backup unificado nao reconhecido.');
  if (value.schemaVersion !== UNIFIED_BACKUP_SCHEMA_VERSION) errors.push('Versao do backup unificado nao suportada.');
  if (value.protocolVersion !== APP_DATA_PROTOCOL_VERSION) errors.push('Versao do protocolo de aplicativos nao suportada.');
  if (typeof value.encrypted !== 'boolean') errors.push('Estado de criptografia invalido para este formato.');
  if (!Array.isArray(value.apps) || value.apps.length === 0) errors.push('O pacote nao possui aplicativos.');
  if (value.source !== undefined && !isValidBackupSource(value.source)) {
    errors.push('Procedencia do backup invalida.');
  }

  const seen = new Set();
  const summaries = [];
  for (const entry of Array.isArray(value.apps) ? value.apps : []) {
    if (!entry?.appId || seen.has(entry.appId)) {
      errors.push(`Aplicativo ausente ou duplicado: ${entry?.appId || 'desconhecido'}.`);
      continue;
    }
    seen.add(entry.appId);
    if (entry.containsFinancialData && value.encrypted !== true) {
      errors.push(`Dados financeiros sem criptografia: ${entry.appId}.`);
    }
    if (!entry.backup || entry.backup.format !== entry.format || entry.backup.schemaVersion !== entry.schemaVersion) {
      errors.push(`Contrato de backup inconsistente: ${entry.appId}.`);
      continue;
    }
    const expectedHash = await sha256Hex(canonicalJson(entry.backup), cryptoImpl);
    if (entry.sha256 !== expectedHash) errors.push(`Checksum invalido: ${entry.appId}.`);
    summaries.push({ appId: entry.appId, format: entry.format, schemaVersion: entry.schemaVersion });
  }

  return { ok: errors.length === 0, errors, apps: summaries };
}

export function isGuestMigrationBackup(value) {
  return value?.source?.kind === GUEST_BACKUP_SOURCE && value.source.schemaVersion === 1;
}

export function downloadUnifiedBackup(backup, options = {}) {
  if (backup?.encrypted !== false) {
    throw createProtocolError('protected-package-required', 'Protected backup content cannot be downloaded as plain JSON.');
  }
  const documentRef = options.documentRef || globalThis.document;
  const URLImpl = options.URLImpl || globalThis.URL;
  if (!documentRef?.createElement || !URLImpl?.createObjectURL) {
    throw new Error('File download is unavailable in this browser.');
  }
  const json = `${JSON.stringify(backup, null, 2)}\n`;
  const blob = new Blob([json], { type: 'application/json' });
  const url = URLImpl.createObjectURL(blob);
  const link = documentRef.createElement('a');
  link.href = url;
  link.download = options.fileName || createUnifiedBackupFileName(backup.exportedAt);
  link.hidden = true;
  documentRef.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URLImpl.revokeObjectURL(url), 0);
  return { fileName: link.download, byteLength: blob.size };
}

export function createUnifiedBackupFileName(exportedAt) {
  const date = new Date(exportedAt || Date.now());
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return `mathicx-backup-${safe.toISOString().replace(/[:.]/g, '-').replace('Z', '')}.json`;
}

async function requestApp(host, appId, action, payload, options) {
  const iframe = options.resolveIframe?.(appId) || null;
  const requestOptions = { timeoutMs: options.timeoutMs ?? 15_000 };
  return iframe
    ? host.requestFromIframe(appId, iframe, action, payload, requestOptions)
    : host.request(appId, action, payload, requestOptions);
}

function assertBackupEntry(entry, contract, allowFinancialData) {
  if (!entry?.appId || !contract || !entry.backup) {
    throw createProtocolError('invalid-app-backup', 'Invalid app backup entry.');
  }
  if (contract.containsFinancialData && !allowFinancialData) {
    throw createProtocolError('financial-data-requires-encryption', 'Financial data requires an encrypted package.');
  }
  if (entry.backup.format !== contract.format || entry.backup.schemaVersion !== contract.schemaVersion) {
    throw createProtocolError('invalid-app-backup', `Backup contract mismatch: ${entry.appId}`);
  }
}

function normalizeBackupSource(source) {
  if (source?.kind !== GUEST_BACKUP_SOURCE) return null;
  return { kind: GUEST_BACKUP_SOURCE, schemaVersion: 1 };
}

function isValidBackupSource(source) {
  return source?.kind === GUEST_BACKUP_SOURCE
    && source.schemaVersion === 1
    && Object.keys(source).every((key) => key === 'kind' || key === 'schemaVersion');
}

async function sha256Hex(value, cryptoImpl) {
  const digest = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item ?? null));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort()
    .filter((key) => value[key] !== undefined)
    .map((key) => [key, canonicalize(value[key])]));
}
