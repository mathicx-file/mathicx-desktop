/**
 * mathicx-file - launcher/search.js
 * Busca global: apps, acoes, atalhos, documentos e categorias.
 */

import { appRegistry, CATEGORIES } from '../apps/registry.js';
import { explorerProvider as fs } from '../explorer/fs-store.js';
import { norm } from '../core/utils.js';

export const SEARCH_TYPES = {
  app: { label: 'App', icon: 'APP' },
  action: { label: 'Acao', icon: 'ACT' },
  shortcut: { label: 'Atalho', icon: 'PIN' },
  folder: { label: 'Pasta', icon: 'DIR' },
  doc: { label: 'Documento', icon: 'DOC' },
  category: { label: 'Categoria', icon: 'TAG' },
};

const JAPANESE_ACTIONS = [
  {
    id: 'japanese-study:home',
    icon: 'JP',
    name: 'Abrir Japanese Study',
    keywords: 'japanese japones nihongo estudar estudo kana hiragana katakana kanji',
    appId: 'japanese-study',
    view: 'home',
  },
  {
    id: 'japanese-study:quiz',
    icon: 'JP',
    name: 'Japanese Study: Quiz',
    keywords: 'quiz teste pratica revisar revisao pergunta japones japanese',
    appId: 'japanese-study',
    view: 'quiz',
  },
  {
    id: 'japanese-study:dictionary',
    icon: 'JP',
    name: 'Japanese Study: Dicionario',
    keywords: 'dicionario dictionary palavra vocabulario traducao significado japones japanese',
    appId: 'japanese-study',
    view: 'dictionary',
  },
  {
    id: 'japanese-study:typing',
    icon: 'JP',
    name: 'Japanese Study: Digitacao guiada',
    keywords: 'digitacao typing romaji kana treino japones japanese',
    appId: 'japanese-study',
    view: 'typing',
  },
  {
    id: 'japanese-study:data',
    icon: 'JP',
    name: 'Japanese Study: Sincronizacao',
    keywords: 'sync sincronizacao firebase backup dados configuracoes japones japanese',
    appId: 'japanese-study',
    view: 'data',
  },
];

/** Busca global assincrona. */
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

  appRegistry.list().forEach((app) => {
    if (norm(app.name).includes(q) || norm(app.description || '').includes(q)) {
      add('app', app.id, app.icon, app.name, app.category);
    }
  });

  CATEGORIES.forEach((cat) => {
    if (norm(cat.label).includes(q) || norm(cat.id).includes(q)) {
      add('category', cat.id, 'TAG', cat.label);
    }
  });

  JAPANESE_ACTIONS.forEach((action) => {
    if (norm(`${action.name} ${action.keywords}`).includes(q)) {
      add('action', action.id, action.icon, action.name, action.view);
    }
  });

  try {
    const nodes = await fs.search(q);
    nodes.forEach((n) => {
      add(
        n.type === 'folder' ? 'folder' : 'doc',
        n.id,
        n.type === 'folder' ? 'DIR' : 'DOC',
        n.name,
        n.type === 'folder' ? 'Pasta' : 'Documento',
      );
    });
  } catch {
    // IndexedDB pode nao estar disponivel.
  }

  return results;
}

export function resolveAction(id) {
  const action = JAPANESE_ACTIONS.find((item) => item.id === id);
  if (!action) return null;
  return {
    appId: action.appId,
    action: 'navigate',
    payload: { view: action.view },
  };
}
