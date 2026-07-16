import { GUEST_USER_SCOPE } from '../../auth/guest-session.js';

export const LOCAL_USER_SCOPE = 'local';
export { GUEST_USER_SCOPE };
export const USER_SCOPE_QUERY_PARAM = 'desktopUserScope';

export function normalizeUserScope(value, fallback = LOCAL_USER_SCOPE) {
  const scope = String(value || '').trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 96);
  return scope || fallback;
}

export function resolveAuthenticatedUserScope(auth) {
  const user = auth?.getCurrentUser?.();
  return normalizeUserScope(user?.uid || user?.id || user?.email);
}

export function appendUserScope(appPath, scope) {
  const value = String(appPath || '');
  const hashIndex = value.indexOf('#');
  const hash = hashIndex >= 0 ? value.slice(hashIndex) : '';
  const path = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}${USER_SCOPE_QUERY_PARAM}=${encodeURIComponent(normalizeUserScope(scope))}${hash}`;
}

export function createUserScopeMessage(appId, scope) {
  return {
    appId: String(appId || ''),
    scope: normalizeUserScope(scope),
  };
}

export function isRemoteUserScope(scope) {
  const normalized = normalizeUserScope(scope);
  return normalized !== LOCAL_USER_SCOPE && normalized !== GUEST_USER_SCOPE;
}
