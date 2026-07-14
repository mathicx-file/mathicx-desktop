import { APP_DATA_ACTIONS, createProtocolError } from './app-data-contract.js';
import {
  ENCRYPTED_BACKUP_FORMAT,
  decryptUnifiedBackup,
  encryptUnifiedBackup,
  validateEncryptedBackupEnvelope,
} from './encrypted-backup.js';
import {
  UNIFIED_BACKUP_FORMAT,
  createUnifiedBackupPackage,
  validateUnifiedBackupPackage,
} from './unified-backup.js';

export function parseBackupFile(text) {
  let value;
  try {
    value = JSON.parse(String(text || ''));
  } catch {
    throw createProtocolError('invalid-backup-file', 'O arquivo selecionado nao contem JSON valido.');
  }
  if (value?.format === ENCRYPTED_BACKUP_FORMAT) {
    const validation = validateEncryptedBackupEnvelope(value);
    if (!validation.ok) throw createProtocolError('invalid-encrypted-backup', validation.errors.join(' '));
    return { encrypted: true, envelope: value, unified: null };
  }
  if (value?.format !== UNIFIED_BACKUP_FORMAT) {
    throw createProtocolError('invalid-backup-file', 'Formato de backup nao reconhecido.');
  }
  return { encrypted: false, envelope: null, unified: value };
}

export async function unlockBackupFile(parsed, password, options = {}) {
  const unified = parsed?.encrypted
    ? await decryptUnifiedBackup(parsed.envelope, password, options)
    : parsed?.unified;
  const validation = await validateUnifiedBackupPackage(unified, options);
  if (!validation.ok) throw createProtocolError('invalid-unified-backup', validation.errors.join(' '));
  return { unified, encrypted: parsed?.encrypted === true };
}

export async function restoreBackupPackage(host, unified, selections, options = {}) {
  const packageValidation = await validateUnifiedBackupPackage(unified, options);
  if (!packageValidation.ok) {
    throw createProtocolError('invalid-unified-backup', packageValidation.errors.join(' '));
  }
  if (typeof options.saveRecoveryBackup !== 'function') {
    throw createProtocolError('recovery-backup-required', 'A recovery backup must be saved before restore.');
  }

  const packageEntries = new Map(unified.apps.map((entry) => [entry.appId, entry]));
  const selected = (Array.isArray(selections) ? selections : []).map((selection) => ({
    ...selection,
    entry: packageEntries.get(selection.appId),
  }));
  if (selected.length === 0 || selected.some((item) => !item.entry)) {
    throw createProtocolError('invalid-restore-selection', 'Selecione ao menos um aplicativo presente no backup.');
  }
  selected.forEach(assertRestoreContract);

  for (const item of selected) {
    const validation = await requestApp(host, item.appId, APP_DATA_ACTIONS.backupValidate, {
      backup: item.entry.backup,
    }, options);
    if (!validation?.ok) throw createProtocolError('invalid-app-backup', `O aplicativo recusou o backup: ${item.appId}`);
  }

  const begun = [];
  const touched = [];
  const snapshots = new Map();
  let committed = false;
  let activeAppId = '';
  let activeStage = 'preparacao';
  try {
    for (const item of selected) {
      activeAppId = item.appId;
      activeStage = 'pausa da sincronizacao';
      await requestApp(host, item.appId, APP_DATA_ACTIONS.restoreBegin, {}, options);
      begun.push(item);
    }
    for (const item of selected) {
      activeAppId = item.appId;
      activeStage = 'backup preventivo';
      const backup = await requestApp(host, item.appId, APP_DATA_ACTIONS.backupExport, {}, options);
      const validation = await requestApp(host, item.appId, APP_DATA_ACTIONS.backupValidate, { backup }, options);
      if (!validation?.ok) throw createProtocolError('invalid-recovery-snapshot', `Snapshot preventivo invalido: ${item.appId}`);
      snapshots.set(item.appId, backup);
    }

    const recovery = await createRecoveryBackup(selected, snapshots, options);
    await options.saveRecoveryBackup(recovery);

    for (const item of selected) {
      activeAppId = item.appId;
      activeStage = `importacao (${normalizeMode(item.mode)})`;
      touched.push(item);
      await requestApp(host, item.appId, APP_DATA_ACTIONS.backupImport, {
        backup: item.entry.backup,
        mode: normalizeMode(item.mode),
        confirmed: true,
      }, options);
    }
    committed = true;
    return {
      ok: true,
      restored: selected.map((item) => ({ appId: item.appId, mode: normalizeMode(item.mode) })),
      recoveryEncrypted: recovery.encrypted,
    };
  } catch (error) {
    const rollbackErrors = [];
    for (const item of [...touched].reverse()) {
      try {
        await requestApp(host, item.appId, APP_DATA_ACTIONS.backupImport, {
          backup: snapshots.get(item.appId),
          mode: 'replace',
          confirmed: true,
        }, options);
      } catch (rollbackError) {
        rollbackErrors.push({ appId: item.appId, message: rollbackError?.message || String(rollbackError) });
      }
    }
    const wrapped = createProtocolError(
      rollbackErrors.length ? 'restore-failed-rollback-incomplete' : 'restore-failed-rolled-back',
      rollbackErrors.length
        ? `A restauracao falhou em ${activeAppId || 'aplicativo desconhecido'} durante ${activeStage}; parte do rollback tambem falhou.`
        : `A restauracao falhou em ${activeAppId || 'aplicativo desconhecido'} durante ${activeStage}; o estado anterior foi recuperado.`,
    );
    wrapped.cause = error;
    wrapped.failedAppId = activeAppId;
    wrapped.failedStage = activeStage;
    wrapped.rollbackErrors = rollbackErrors;
    throw wrapped;
  } finally {
    for (const item of [...begun].reverse()) {
      try {
        await requestApp(host, item.appId, APP_DATA_ACTIONS.restoreEnd, { commit: committed }, options);
      } catch (error) {
        console.warn(`[restore-backup] failed to resume ${item.appId}`, error);
      }
    }
  }
}

async function createRecoveryBackup(selected, snapshots, options) {
  const encrypted = options.forceEncryptedRecovery === true
    || selected.some((item) => item.capabilities.backup.containsFinancialData === true);
  const entries = selected.map((item) => ({
    appId: item.appId,
    capabilities: item.capabilities,
    backup: snapshots.get(item.appId),
  }));
  const unified = await createUnifiedBackupPackage(entries, {
    ...options,
    encrypted,
  });
  if (!encrypted) return { encrypted: false, backup: unified };
  const backup = await encryptUnifiedBackup(unified, options.recoveryPassword, options);
  return { encrypted: true, backup };
}

function assertRestoreContract(item) {
  const contract = item.capabilities?.backup;
  if (!contract || !item.capabilities.actions?.includes(APP_DATA_ACTIONS.backupImport)) {
    throw createProtocolError('restore-unavailable', `Restauracao indisponivel: ${item.appId}`);
  }
  if (item.entry.format !== contract.format || item.entry.schemaVersion > contract.schemaVersion) {
    throw createProtocolError('incompatible-app-backup', `Backup incompativel: ${item.appId}`);
  }
}

function normalizeMode(mode) {
  return mode === 'replace' ? 'replace' : 'merge';
}

function requestApp(host, appId, action, payload, options) {
  const iframe = options.resolveIframe?.(appId) || null;
  const requestOptions = { timeoutMs: options.timeoutMs ?? 30_000 };
  return iframe
    ? host.requestFromIframe(appId, iframe, action, payload, requestOptions)
    : host.request(appId, action, payload, requestOptions);
}
