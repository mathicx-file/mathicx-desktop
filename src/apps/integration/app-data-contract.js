export const APP_DATA_PROTOCOL = 'mathicx-app-data';
export const APP_DATA_PROTOCOL_VERSION = 1;

export const APP_DATA_MESSAGE_TYPES = Object.freeze({
  request: 'mathicx:app-data:request',
  response: 'mathicx:app-data:response',
});

export const APP_DATA_ACTIONS = Object.freeze({
  capabilities: 'capabilities',
  syncStatus: 'sync-status',
  syncNow: 'sync-now',
  backupExport: 'backup-export',
  backupValidate: 'backup-validate',
  backupImport: 'backup-import',
  restoreBegin: 'restore-begin',
  restoreEnd: 'restore-end',
});

const APP_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;
const ACTIONS = new Set(Object.values(APP_DATA_ACTIONS));

export function createAppDataRequest({ requestId, appId, action, payload = {} }) {
  assertRequestIdentity({ requestId, appId, action });
  return {
    type: APP_DATA_MESSAGE_TYPES.request,
    protocol: APP_DATA_PROTOCOL,
    protocolVersion: APP_DATA_PROTOCOL_VERSION,
    requestId,
    appId,
    action,
    payload: normalizePayload(payload),
  };
}

export function createAppDataResponse(request, options = {}) {
  assertRequestIdentity(request);
  const ok = options.ok !== false;
  return {
    type: APP_DATA_MESSAGE_TYPES.response,
    protocol: APP_DATA_PROTOCOL,
    protocolVersion: APP_DATA_PROTOCOL_VERSION,
    requestId: request.requestId,
    appId: request.appId,
    action: request.action,
    ok,
    ...(ok ? { data: options.data ?? null } : { error: serializeAppDataError(options.error) }),
  };
}

export function isAppDataRequest(value, expectedAppId = '') {
  return value?.type === APP_DATA_MESSAGE_TYPES.request
    && value.protocol === APP_DATA_PROTOCOL
    && value.protocolVersion === APP_DATA_PROTOCOL_VERSION
    && typeof value.requestId === 'string'
    && APP_ID_PATTERN.test(String(value.appId || ''))
    && (!expectedAppId || value.appId === expectedAppId)
    && ACTIONS.has(value.action)
    && value.payload && typeof value.payload === 'object' && !Array.isArray(value.payload);
}

export function isAppDataResponse(value, request) {
  return value?.type === APP_DATA_MESSAGE_TYPES.response
    && value.protocol === APP_DATA_PROTOCOL
    && value.protocolVersion === APP_DATA_PROTOCOL_VERSION
    && value.requestId === request.requestId
    && value.appId === request.appId
    && value.action === request.action
    && typeof value.ok === 'boolean';
}

export function createAppDataResponder(options = {}) {
  const target = options.target || globalThis.window;
  const appId = String(options.appId || '');
  const handlers = options.handlers || {};
  if (!target?.addEventListener || !APP_ID_PATTERN.test(appId)) {
    throw new Error('App data responder requires a valid target and appId.');
  }

  const listener = async (event) => {
    const request = event.data;
    if (!isAppDataRequest(request, appId) || !isAllowedAppDataEvent(event, target, options)) return;
    const port = event.ports?.[0];
    if (!port?.postMessage) return;
    const handler = handlers[request.action];
    if (typeof handler !== 'function') {
      port.postMessage(createAppDataResponse(request, {
        ok: false,
        error: createProtocolError('unsupported-action', `Unsupported app data action: ${request.action}`),
      }));
      return;
    }

    try {
      const data = await handler(request.payload, { request, event });
      port.postMessage(createAppDataResponse(request, { data }));
    } catch (error) {
      port.postMessage(createAppDataResponse(request, { ok: false, error }));
    }
  };

  target.addEventListener('message', listener);
  return () => target.removeEventListener('message', listener);
}

export function serializeAppDataError(error) {
  return {
    code: String(error?.code || 'operation-failed'),
    message: String(error?.message || error || 'App data operation failed.'),
  };
}

export function createProtocolError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isAllowedAppDataEvent(event, target, options) {
  const expectedSource = options.source || (target.parent !== target ? target.parent : null);
  if (expectedSource && event.source !== expectedSource) return false;
  if (typeof options.isAllowedOrigin === 'function') return options.isAllowedOrigin(event.origin);
  const origin = target.location?.origin || '';
  return event.origin === origin || (origin === 'null' && event.origin === 'null');
}

function assertRequestIdentity({ requestId, appId, action }) {
  if (!String(requestId || '').trim() || !APP_ID_PATTERN.test(String(appId || '')) || !ACTIONS.has(action)) {
    throw new Error('Invalid app data request identity.');
  }
}

function normalizePayload(payload) {
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
}
