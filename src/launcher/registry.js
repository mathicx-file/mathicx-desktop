/**
 * mathicx-file · launcher/registry.js
 * Favoritos, apps recentes e apps mais usados.
 * Persiste no store (→ LocalStorage). Lógica simples de ranking.
 */

import { store } from '../core/state.js';
import { appRegistry, canonicalAppId } from '../apps/registry.js';

const canonicalList = (items) => [...new Set(
  (Array.isArray(items) ? items : []).map(canonicalAppId).filter(Boolean)
)];

/** Lista de apps favoritos (ids). */
export function getFavorites() { return canonicalList(store.get('favorites', [])); }

/** Toggle favorito. */
export function toggleFavorite(appId) {
  appId = canonicalAppId(appId);
  const favs = getFavorites();
  const idx = favs.indexOf(appId);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(appId);
  store.set('favorites', favs);
  return favs.includes(appId);
}

export function isFavorite(appId) { return getFavorites().includes(canonicalAppId(appId)); }

/** Apps recentes (ordenados por última abertura). */
export function getRecents() {
  const ids = store.get('recents', []);
  return ids.map((id) => appRegistry.get(id)).filter(Boolean);
}

/** Apps mais usados (por contagem de aberturas). */
export function getTopUsed(limit = 5) {
  const usage = store.get('usage', {});
  return Object.entries(usage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => appRegistry.get(id))
    .filter(Boolean);
}

/** Apps fixados na taskbar. */
export function getPinned() { return canonicalList(store.get('pinned', [])); }

export function togglePinned(appId) {
  appId = canonicalAppId(appId);
  const pinned = getPinned();
  const idx = pinned.indexOf(appId);
  if (idx >= 0) pinned.splice(idx, 1);
  else pinned.push(appId);
  store.set('pinned', pinned);
}
