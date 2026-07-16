import { APP_DATA_ACTIONS } from '../integration/app-data-contract.js';
import {
  listIntegratedAppDefinitions,
  validateIntegratedAppCapabilities,
} from '../integration/integrated-app.js';
import { appRegistry } from '../registry.js';

export function getSyncCenterApps(registry = appRegistry) {
  return listIntegratedAppDefinitions(registry.list());
}

const STATUS_META = Object.freeze({
  synced: { label: 'Sincronizado', tone: 'success' },
  syncing: { label: 'Sincronizando', tone: 'progress' },
  hydrating: { label: 'Carregando', tone: 'progress' },
  checking: { label: 'Verificando', tone: 'progress' },
  restoring: { label: 'Restaurando', tone: 'progress' },
  conflict: { label: 'Conflito', tone: 'warning' },
  pending: { label: 'Pendente', tone: 'warning' },
  error: { label: 'Erro', tone: 'danger' },
  disabled: { label: 'Desativado', tone: 'neutral' },
  closed: { label: 'Fechado', tone: 'neutral' },
});

export async function loadSyncCenterState(host, options = {}) {
  const timeoutMs = options.timeoutMs ?? 3_000;
  const definitions = options.apps || getSyncCenterApps(options.registry);
  return Promise.all(definitions.map(async (definition) => {
    const iframe = options.resolveIframe?.(definition.appId) || null;
    if (!host.isMounted(definition.appId) && !iframe) {
      return normalizeSyncApp(definition, {
        state: 'closed',
        message: 'Abra o aplicativo para consultar a sincronizacao.',
      });
    }

    try {
      const request = (action) => iframe
        ? host.requestFromIframe(definition.appId, iframe, action, {}, { timeoutMs })
        : host.request(definition.appId, action, {}, { timeoutMs });
      const [capabilities, status] = await Promise.all([
        request(APP_DATA_ACTIONS.capabilities),
        request(APP_DATA_ACTIONS.syncStatus),
      ]);
      const validation = validateIntegratedAppCapabilities(
        capabilities,
        definition.appId,
        definition.version,
      );
      if (!validation.ok) throw new Error(validation.errors.join(' '));
      return normalizeSyncApp(definition, status, capabilities, Boolean(iframe));
    } catch (error) {
      return normalizeSyncApp(definition, {
        state: 'error',
        message: error?.message || 'Nao foi possivel consultar a sincronizacao.',
      });
    }
  }));
}

export async function syncCenterApp(host, appId, options = {}) {
  const iframe = options.iframe || null;
  if (!host.isMounted(appId) && !iframe) {
    const error = new Error(`App is not mounted: ${appId}`);
    error.code = 'app-not-mounted';
    throw error;
  }
  const requestOptions = { timeoutMs: options.timeoutMs ?? 15_000 };
  return iframe
    ? host.requestFromIframe(appId, iframe, APP_DATA_ACTIONS.syncNow, {}, requestOptions)
    : host.request(appId, APP_DATA_ACTIONS.syncNow, {}, requestOptions);
}

export function summarizeSyncCenter(apps) {
  return apps.reduce((summary, app) => {
    if (app.state === 'synced') summary.synced += 1;
    else if (app.state === 'closed') summary.closed += 1;
    else summary.attention += 1;
    return summary;
  }, { synced: 0, attention: 0, closed: 0 });
}

function normalizeSyncApp(definition, status = {}, capabilities = null, connectedViaWindow = false) {
  const state = STATUS_META[status?.state] ? status.state : 'checking';
  const meta = STATUS_META[state];
  return {
    ...definition,
    state,
    statusLabel: meta.label,
    tone: meta.tone,
    message: String(status?.message || meta.label),
    lastSyncedAt: status?.lastSyncedAt || '',
    capabilities,
    connectedViaWindow,
    canSync: Boolean(capabilities?.actions?.includes(APP_DATA_ACTIONS.syncNow)),
  };
}
