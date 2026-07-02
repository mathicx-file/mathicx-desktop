/**
 * mathicx-file · launcher/search.js
 * Busca global: apps, atalhos, documentos (IndexedDB), categorias.
 * Resultados em tempo real com debounce.
 *
 * O launcher consome esta API; não tem UI própria.
 */

import { appRegistry, CATEGORIES } from '../apps/registry.js';
import { explorerProvider as fs } from '../explorer/fs-store.js';
import { norm } from '../core/utils.js';

export const SEARCH_TYPES = {
  app:      { label: 'App',      icon: '📱' },
  shortcut: { label: 'Atalho',   icon: '📌' },
  folder:   { label: 'Pasta',    icon: '📁' },
  doc:      { label: 'Documento', icon: '📄' },
  category: { label: 'Categoria', icon: '🏷️' },
};

/** Busca global assíncrona — retorna resultados agrupados. */
export async function globalSearch(query) {
  const q = norm(query).trim();
  if (!q) return [];

  const results = [];
  const seen = new Set();

  const add = (type, id, icon, name, meta) => {
    const key = `${type}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ type, id, icon, name, meta });
  };

  // 1. Apps
  appRegistry.list().forEach((app) => {
    if (norm(app.name).includes(q) || norm(app.description || '').includes(q)) {
      add('app', app.id, app.icon, app.name, app.category);
    }
  });

  // 2. Categorias
  CATEGORIES.forEach((cat) => {
    if (norm(cat.label).includes(q) || norm(cat.id).includes(q)) {
      add('category', cat.id, '🏷️', cat.label);
    }
  });

  // 3. Documentos e pastas (IndexedDB)
  try {
    const nodes = await fs.search(q);
    nodes.forEach((n) => {
      add(n.type === 'folder' ? 'folder' : 'doc', n.id, n.type === 'folder' ? '📁' : '📄', n.name, n.type === 'folder' ? 'Pasta' : 'Documento');
    });
  } catch { /* IndexedDB pode não estar disponível */ }

  return results;
}
