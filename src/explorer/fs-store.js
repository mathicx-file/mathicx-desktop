/**
 * mathicx-file · explorer/fs-store.js
 * Filesystem virtual persistido em IndexedDB (store "fs").
 *
 * Modelo de nó:
 *   { id, parentId, type: 'folder'|'doc', name, content?, starred, createdAt, updatedAt }
 * Raiz: parentId = 'root'.
 *
 * Provê API de leitura + notifica via bus a cada mutação (FS_CHANGE),
 * para que explorer, launcher (busca global) e desktop se atualizem.
 */

import { db } from '../storage/indexeddb.js';
import { bus, EVT } from '../core/event-bus.js';
import { uid } from '../core/utils.js';

const ROOT = 'root';
const store = () => db.store('fs');

class FsProvider {
  constructor() {
    this._seeded = false;
  }

  /** Cria a estrutura inicial numa primeira execução. */
  async seed() {
    const all = await store().all();
    if (all.length > 0) { this._seeded = true; return; }
    const now = Date.now();
    const initial = [
      { id: uid('dir'), parentId: ROOT, type: 'folder', name: 'Documentos',  starred: false, createdAt: now, updatedAt: now },
      { id: uid('dir'), parentId: ROOT, type: 'folder', name: 'Projetos',    starred: true,  createdAt: now, updatedAt: now },
      { id: uid('dir'), parentId: ROOT, type: 'folder', name: 'Imagens',     starred: false, createdAt: now, updatedAt: now },
      { id: uid('doc'), parentId: ROOT, type: 'doc', name: 'Bem-vindo.txt', content: 'Bem-vindo ao mathicx-file Explorer!\n\nCrie pastas, documentos e organize como preferir.', starred: true, createdAt: now, updatedAt: now },
    ];
    await store().putMany(initial);
    this._notify();
  }

  _notify(detail) { bus.emit(EVT.FS_CHANGE, detail); }

  async getChildren(parentId = ROOT) {
    return (await store().all({ index: 'parentId' }))
      .filter((n) => n.parentId === parentId)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1; // pastas primeiro
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  }

  async getById(id) { return store().get(id); }

  /** Caminho completo (breadcrumb) até o nó. */
  async getPath(id) {
    const path = [];
    let cur = id && id !== ROOT ? await store().get(id) : null;
    while (cur) {
      path.unshift(cur);
      cur = cur.parentId && cur.parentId !== ROOT ? await store().get(cur.parentId) : null;
    }
    return path;
  }

  async create({ parentId = ROOT, type = 'folder', name, content = '' }) {
    const now = Date.now();
    const node = { id: uid(type === 'folder' ? 'dir' : 'doc'), parentId, type, name, content, starred: false, createdAt: now, updatedAt: now };
    await store().put(node);
    this._notify({ action: 'create', node });
    return node;
  }

  async rename(id, name) {
    const node = await store().get(id);
    if (!node) return;
    node.name = name;
    node.updatedAt = Date.now();
    await store().put(node);
    this._notify({ action: 'rename', node });
    return node;
  }

  async update(id, patch) {
    const node = await store().get(id);
    if (!node) return;
    Object.assign(node, patch, { updatedAt: Date.now() });
    await store().put(node);
    this._notify({ action: 'update', node });
    return node;
  }

  async remove(id) {
    // Remove recursivamente (pastas)
    const toDelete = [];
    const collect = async (nid) => {
      const children = (await store().all({ index: 'parentId' })).filter((n) => n.parentId === nid);
      for (const c of children) await collect(c.id);
      toDelete.push(nid);
    };
    await collect(id);
    for (const nid of toDelete) await store().delete(nid);
    this._notify({ action: 'remove', id });
  }

  async duplicate(id) {
    const node = await store().get(id);
    if (!node) return;
    const copyName = node.name.replace(/(\.[^.]+)?$/, ' (cópia)$1');
    const now = Date.now();
    const copy = { ...node, id: uid('dup'), name: copyName, createdAt: now, updatedAt: now };
    await store().put(copy);
    this._notify({ action: 'duplicate', node: copy });
    return copy;
  }

  async move(id, newParentId) {
    const node = await store().get(id);
    if (!node || node.parentId === newParentId) return;
    // Evita mover uma pasta para dentro de si mesma
    if (id === newParentId) return;
    if (node.type === 'folder') {
      const path = await this.getPath(newParentId);
      if (path.some((p) => p.id === id)) return; // ciclo
    }
    node.parentId = newParentId;
    node.updatedAt = Date.now();
    await store().put(node);
    this._notify({ action: 'move', node });
    return node;
  }

  async copy(id, newParentId) {
    const node = await store().get(id);
    if (!node) return;
    const now = Date.now();
    const copy = { ...node, id: uid('cpy'), parentId: newParentId, createdAt: now, updatedAt: now };
    await store().put(copy);
    this._notify({ action: 'copy', node: copy });
    return copy;
  }

  async toggleStar(id) {
    const node = await store().get(id);
    if (!node) return;
    node.starred = !node.starred;
    node.updatedAt = Date.now();
    await store().put(node);
    this._notify({ action: 'star', node });
    return node;
  }

  async starred() {
    return (await store().all({ index: 'starred' })).filter((n) => n.starred);
  }

  async recent(limit = 10) {
    return (await store().all({ index: 'updatedAt' }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }

  async search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const all = await store().all();
    return all.filter((n) => n.name.toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q));
  }

  async all() { return store().all(); }
}

export const explorerProvider = new FsProvider();
