import {
  createAppDataRequest,
  createProtocolError,
  isAppDataResponse,
} from './app-data-contract.js';

const DEFAULT_TIMEOUT_MS = 15_000;

export class AppDataHostRegistry {
  constructor(options = {}) {
    this.MessageChannelClass = options.MessageChannelClass || globalThis.MessageChannel;
    this.now = options.now || (() => Date.now());
    this.sequence = 0;
    this.apps = new Map();
    this.localHandlers = new Map();
    this.listeners = new Set();
  }

  register(appId, iframe) {
    if (!appId || !iframe?.contentWindow) throw new Error('Cannot register an unavailable app iframe.');
    this.apps.set(appId, iframe);
    this._notify({ type: 'registered', appId });
    return () => {
      if (this.apps.get(appId) !== iframe) return;
      this.apps.delete(appId);
      this._notify({ type: 'unregistered', appId });
    };
  }

  announceReady(appId, iframe) {
    if (this.apps.get(appId) !== iframe) return false;
    this._notify({ type: 'ready', appId });
    return true;
  }

  isMounted(appId) {
    return this.apps.has(appId) || this.localHandlers.has(appId);
  }

  listMounted() {
    return [...this.apps.keys()].sort();
  }

  listAvailable() {
    return [...new Set([...this.localHandlers.keys(), ...this.apps.keys()])].sort();
  }

  registerLocal(appId, handlers) {
    if (!appId || !handlers || typeof handlers !== 'object') {
      throw new Error('Cannot register an invalid local app data adapter.');
    }
    this.localHandlers.set(appId, handlers);
    this._notify({ type: 'registered', appId, local: true });
    return () => {
      if (this.localHandlers.get(appId) !== handlers) return;
      this.localHandlers.delete(appId);
      this._notify({ type: 'unregistered', appId, local: true });
    };
  }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new Error('App data listener must be a function.');
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  request(appId, action, payload = {}, options = {}) {
    const localHandler = this.localHandlers.get(appId)?.[action];
    if (typeof localHandler === 'function') return Promise.resolve().then(() => localHandler(payload));
    const iframe = this.apps.get(appId);
    if (!iframe) return Promise.reject(createProtocolError('app-not-mounted', `App is not mounted: ${appId}`));
    return this.requestFromIframe(appId, iframe, action, payload, options);
  }

  requestFromIframe(appId, iframe, action, payload = {}, options = {}) {
    if (!iframe?.contentWindow) {
      return Promise.reject(createProtocolError('app-not-mounted', `App is not mounted: ${appId}`));
    }
    if (typeof this.MessageChannelClass !== 'function') {
      return Promise.reject(createProtocolError('message-channel-unavailable', 'MessageChannel is unavailable.'));
    }

    const request = createAppDataRequest({
      requestId: `${appId}-${this.now().toString(36)}-${(++this.sequence).toString(36)}`,
      appId,
      action,
      payload,
    });
    const channel = new this.MessageChannelClass();
    const timeoutMs = normalizeTimeout(options.timeoutMs);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        channel.port1.close?.();
        reject(createProtocolError('request-timeout', `App data request timed out: ${appId}/${action}`));
      }, timeoutMs);

      channel.port1.onmessage = (event) => {
        clearTimeout(timeout);
        channel.port1.close?.();
        if (!isAppDataResponse(event.data, request)) {
          reject(createProtocolError('invalid-response', `Invalid app data response: ${appId}/${action}`));
          return;
        }
        if (!event.data.ok) {
          reject(createProtocolError(event.data.error?.code || 'operation-failed', event.data.error?.message || 'App data operation failed.'));
          return;
        }
        resolve(event.data.data);
      };
      channel.port1.start?.();

      try {
        iframe.contentWindow.postMessage(request, globalThis.location?.origin || '*', [channel.port2]);
      } catch (error) {
        clearTimeout(timeout);
        channel.port1.close?.();
        reject(error);
      }
    });
  }

  _notify(event) {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.warn('[app-data-host] listener failed', error);
      }
    });
  }
}

function normalizeTimeout(value) {
  const timeout = Number(value);
  return Number.isSafeInteger(timeout) && timeout >= 100 && timeout <= 120_000
    ? timeout
    : DEFAULT_TIMEOUT_MS;
}

export const appDataHost = new AppDataHostRegistry();
