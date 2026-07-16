import {
  APP_DATA_ACTIONS,
  APP_DATA_PROTOCOL_VERSION,
  createProtocolError,
} from './app-data-contract.js';

const APP_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;
const IMPORT_MODES = new Set(['merge', 'replace']);

export const DESKTOP_INTEGRATION_DEFINITION = Object.freeze({
  appId: 'desktop',
  name: 'Mathicx Desktop',
  version: '1.0.0',
  shortName: 'M',
  canOpen: false,
  financial: false,
  order: 0,
});

export function defineIntegratedAppManifest(manifest) {
  if (!manifest || !APP_ID_PATTERN.test(String(manifest.id || ''))) {
    throw new Error('Integrated app manifest requires a canonical app id.');
  }
  const integration = manifest.integration;
  if (!integration || integration.appData !== true) {
    throw new Error(`Integrated app manifest must enable appData: ${manifest.id}`);
  }
  return Object.freeze({
    ...manifest,
    integration: Object.freeze({
      appData: true,
      version: normalizeVersion(integration.version),
      canOpen: integration.canOpen !== false,
      shortName: String(integration.shortName || manifest.name || manifest.id).slice(0, 3),
      financial: integration.financial === true,
      userScoped: integration.userScoped !== false,
      order: normalizeOrder(integration.order),
    }),
  });
}

export function listIntegratedAppDefinitions(manifests, options = {}) {
  const definitions = (Array.isArray(manifests) ? manifests : [])
    .filter((manifest) => manifest?.integration?.appData === true)
    .map((manifest) => ({
      appId: manifest.id,
      name: String(manifest.name || manifest.id),
      version: normalizeVersion(manifest.integration.version),
      shortName: String(manifest.integration.shortName || manifest.name || manifest.id).slice(0, 3),
      canOpen: manifest.integration.canOpen !== false,
      financial: manifest.integration.financial === true,
      userScoped: manifest.integration.userScoped !== false,
      order: normalizeOrder(manifest.integration.order),
    }));
  if (options.includeDesktop !== false) definitions.push({ ...DESKTOP_INTEGRATION_DEFINITION });
  return definitions.sort((left, right) => (
    left.order - right.order
    || left.name.localeCompare(right.name, 'pt-BR')
  ));
}

export function createIntegratedAppDataHandlers(options = {}) {
  const appId = String(options.appId || '');
  if (!APP_ID_PATTERN.test(appId)) throw new Error('Integrated app data handlers require a canonical app id.');

  const handlers = {};
  if (typeof options.getSyncStatus === 'function') {
    handlers[APP_DATA_ACTIONS.syncStatus] = async () => clone(options.getSyncStatus());
  }
  if (typeof options.syncNow === 'function') {
    handlers[APP_DATA_ACTIONS.syncNow] = async () => options.syncNow();
  }

  const backup = options.backup ? normalizeBackupContract(options.backup) : null;
  if (backup) {
    assertBackupFunctions(options);
    handlers[APP_DATA_ACTIONS.backupExport] = async () => options.exportBackup();
    handlers[APP_DATA_ACTIONS.backupValidate] = async ({ backup: value } = {}) => options.validateBackup(value);
    handlers[APP_DATA_ACTIONS.backupImport] = async ({ backup: value, mode, confirmed } = {}) => {
      if (confirmed !== true) {
        throw createProtocolError('confirmation-required', 'Backup import requires explicit confirmation.');
      }
      if (!backup.modes.includes(mode)) {
        throw createProtocolError('invalid-import-mode', `Unsupported backup import mode: ${mode}`);
      }
      const validation = await options.validateBackup(value);
      if (!validation?.ok) {
        throw createProtocolError('invalid-backup', (validation?.errors || ['Invalid backup.']).join(' '));
      }
      const result = await options.importBackup(value, mode, validation);
      await options.afterImport?.(mode, result);
      return {
        imported: true,
        mode,
        ...(result && typeof result === 'object' ? result : { result: result ?? null }),
      };
    };
    handlers[APP_DATA_ACTIONS.restoreBegin] = async () => (
      options.beginRestore?.() || { ok: true, supported: false }
    );
    handlers[APP_DATA_ACTIONS.restoreEnd] = async (payload = {}) => (
      options.endRestore?.(payload) || { ok: true, supported: false }
    );
  }

  handlers[APP_DATA_ACTIONS.capabilities] = async () => ({
    appId,
    appVersion: normalizeVersion(options.appVersion),
    protocolVersion: APP_DATA_PROTOCOL_VERSION,
    actions: Object.keys(handlers),
    sync: {
      status: typeof handlers[APP_DATA_ACTIONS.syncStatus] === 'function',
      manual: typeof handlers[APP_DATA_ACTIONS.syncNow] === 'function',
    },
    ...(backup ? { backup } : {}),
  });
  return handlers;
}

export function validateIntegratedAppCapabilities(value, expectedAppId = '', expectedVersion = '') {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, errors: ['Capabilities must be an object.'] };
  }
  if (!APP_ID_PATTERN.test(String(value.appId || ''))) errors.push('Capabilities require a canonical app id.');
  if (expectedAppId && value.appId !== expectedAppId) errors.push('Capabilities app id does not match the manifest.');
  if (!isVersion(value.appVersion)) errors.push('Capabilities require a semantic app version.');
  if (expectedVersion && value.appVersion !== expectedVersion) errors.push('Capabilities app version does not match the manifest.');
  if (value.protocolVersion !== APP_DATA_PROTOCOL_VERSION) errors.push('Unsupported app data protocol version.');
  if (!Array.isArray(value.actions) || value.actions.some((action) => !Object.values(APP_DATA_ACTIONS).includes(action))) {
    errors.push('Capabilities contain invalid actions.');
  }
  if (value.backup) {
    try {
      normalizeBackupContract(value.backup);
    } catch (error) {
      errors.push(error.message);
    }
  }
  return { ok: errors.length === 0, errors };
}

function normalizeBackupContract(value) {
  const format = String(value?.format || '').trim();
  const schemaVersion = Number(value?.schemaVersion);
  const modes = [...new Set(Array.isArray(value?.modes) ? value.modes : [])];
  if (!format || !Number.isSafeInteger(schemaVersion) || schemaVersion < 1) {
    throw new Error('Backup capabilities require format and schemaVersion.');
  }
  if (modes.length === 0 || modes.some((mode) => !IMPORT_MODES.has(mode))) {
    throw new Error('Backup capabilities require supported import modes.');
  }
  return Object.freeze({
    format,
    schemaVersion,
    modes: Object.freeze(modes),
    containsFinancialData: value.containsFinancialData === true,
  });
}

function assertBackupFunctions(options) {
  if (typeof options.exportBackup !== 'function'
    || typeof options.validateBackup !== 'function'
    || typeof options.importBackup !== 'function') {
    throw new Error('Backup integration requires export, validation and import functions.');
  }
}

function normalizeOrder(value) {
  const order = Number(value);
  return Number.isFinite(order) ? order : 100;
}

function normalizeVersion(value) {
  return isVersion(value) ? String(value) : '1.0.0';
}

function isVersion(value) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(String(value || ''));
}

function clone(value) {
  return value && typeof value === 'object' ? structuredClone(value) : value;
}
