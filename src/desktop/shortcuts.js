/**
 * mathicx-file · desktop/shortcuts.js
 * CRUD de atalhos do desktop (criar, renomear, excluir, alterar ícone/cat).
 * Persiste em LocalStorage via store. Notifica via bus (DESKTOP_REFRESH).
 */

import { bus, EVT } from '../core/event-bus.js';
import { store } from '../core/state.js';
import { uid, norm } from '../core/utils.js';
import { toast } from '../ui/toast.js';
import { formModal, confirmModal, promptModal } from '../ui/modal.js';

const DEFAULT_SHORTCUTS = [
  { id: 'sc-calculadora', appId: 'calculadora', icon: '🧮', name: 'Calculadora', category: 'ferramenta' },
  { id: 'sc-notas',        appId: 'notas',        icon: '📝', name: 'Notas',        category: 'pessoal' },
  { id: 'sc-arquivos',     appId: 'arquivos',     icon: '📁', name: 'Arquivos',     category: 'sistema' },
  { id: 'sc-formularios',  appId: 'formularios',  icon: '🗂️', name: 'Formulários',  category: 'trabalho' },
  { id: 'sc-config',       appId: 'configuracoes', icon: '⚙️', name: 'Configurações', category: 'sistema' },
];

function ensureDefaults() {
  let shortcuts = store.get('shortcuts');
  if (!shortcuts || !shortcuts.length) {
    store.set('shortcuts', DEFAULT_SHORTCUTS);
  }
  return store.get('shortcuts');
}

export function getShortcuts() { return ensureDefaults(); }

export function getShortcutById(id) {
  return getShortcuts().find((s) => s.id === id);
}

/** Cria um novo atalho via modal. */
export async function createShortcut(opts = {}) {
  const categories = ['pessoal', 'trabalho', 'ferramenta', 'sistema', 'midia'];
  const data = await formModal({
    title: 'Novo atalho',
    fields: [
      { key: 'name', label: 'Nome', value: opts.name || '' },
      { key: 'icon', label: 'Ícone', type: 'icon', value: opts.icon || '📌' },
      { key: 'category', label: 'Categoria', type: 'select', value: opts.category || 'pessoal',
        options: categories.map((c) => ({ value: c, label: c })) },
      { key: 'appId', label: 'App (opcional)', value: opts.appId || '', placeholder: 'Deixe vazio para atalho genérico' },
    ],
  });
  if (!data) return;
  const s = { id: uid('sc'), name: data.name, icon: data.icon, category: data.category, appId: data.appId || null };
  const shortcuts = [...getShortcuts(), s];
  store.set('shortcuts', shortcuts);
  toast.success(`Atalho "${s.name}" criado`);
  bus.emit(EVT.DESKTOP_REFRESH);
  return s;
}

/** Renomear um atalho. */
export async function renameShortcut(id) {
  const sc = getShortcutById(id);
  if (!sc) return;
  const name = await promptModal({ title: 'Renomear atalho', label: 'Nome', value: sc.name });
  if (!name) return;
  const shortcuts = getShortcuts().map((s) => s.id === id ? { ...s, name } : s);
  store.set('shortcuts', shortcuts);
  toast.success('Atalho renomeado');
  bus.emit(EVT.DESKTOP_REFRESH);
}

/** Excluir um atalho. */
export async function deleteShortcut(id) {
  const ok = await confirmModal({ title: 'Excluir atalho?', okText: 'Excluir', danger: true });
  if (!ok) return;
  store.set('shortcuts', getShortcuts().filter((s) => s.id !== id));
  toast.success('Atalho removido');
  bus.emit(EVT.DESKTOP_REFRESH);
}

/** Editar propriedades do atalho (ícone, categoria). */
export async function editShortcut(id) {
  const sc = getShortcutById(id);
  if (!sc) return;
  const categories = ['pessoal', 'trabalho', 'ferramenta', 'sistema', 'midia'];
  const data = await formModal({
    title: 'Editar atalho',
    fields: [
      { key: 'name', label: 'Nome', value: sc.name },
      { key: 'icon', label: 'Ícone', type: 'icon', value: sc.icon },
      { key: 'category', label: 'Categoria', type: 'select', value: sc.category,
        options: categories.map((c) => ({ value: c, label: c })) },
    ],
  });
  if (!data) return;
  const shortcuts = getShortcuts().map((s) => s.id === id ? { ...s, ...data } : s);
  store.set('shortcuts', shortcuts);
  toast.success('Atalho atualizado');
  bus.emit(EVT.DESKTOP_REFRESH);
}

/** Reordena atalhos (drag-and-drop). */
export function reorderShortcut(id, newIndex) {
  const shortcuts = [...getShortcuts()];
  const idx = shortcuts.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const [item] = shortcuts.splice(idx, 1);
  shortcuts.splice(newIndex, 0, item);
  store.set('shortcuts', shortcuts);
  bus.emit(EVT.DESKTOP_REFRESH);
}

/** Busca atalhos por texto normalizado. */
export function searchShortcuts(query) {
  const q = norm(query);
  if (!q) return getShortcuts();
  return getShortcuts().filter((s) => norm(s.name).includes(q));
}
