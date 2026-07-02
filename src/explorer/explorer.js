/**
 * mathicx-file · explorer/explorer.js
 * mathicx-file Explorer — app principal de navegação de arquivos.
 *
 * Recursos: sidebar (locais + árvore), breadcrumb, toolbar (busca, filtros,
 * novo), grid/lista, menu de contexto, edição inline de nome, drag para
 * mover, e seções especiais (Favoritos, Recentes).
 *
 * Re-renderiza em SSE-like via event bus (FS_CHANGE) — só quando o FS muda.
 */

import { explorerProvider as fs } from './fs-store.js';
import * as ops from './operations.js';
import { bus, EVT } from '../core/event-bus.js';
import { escapeHTML, formatDate, debounce, WEEKDAYS_SHORT } from '../core/utils.js';
import { showContextMenu } from '../ui/context-menu.js';
import { toast } from '../ui/toast.js';

const SPECIAL = {
  home: { label: 'Início', icon: '🏠', parentId: 'root' },
  starred: { label: 'Favoritos', icon: '⭐', special: 'starred' },
  recent: { label: 'Recentes', icon: '🕒', special: 'recent' },
};

/**
 * @param {HTMLElement} host  conteúdo da janela
 * @param {object} ctx        { win, wm, bus }
 */
export function mountExplorer(host, ctx) {
  const state = { parentId: 'root', special: null, query: '', view: 'grid', selection: null, tree: [] };

  host.innerHTML = `
    <div class="explorer">
      <aside class="explorer-sidebar" data-el="sidebar"></aside>
      <section class="explorer-main">
        <div class="explorer-toolbar">
          <button class="explorer-tool-btn" data-act="back" title="Voltar">←</button>
          <nav class="explorer-breadcrumb" data-el="crumb"></nav>
          <input class="explorer-search" data-el="search" type="search" placeholder="Buscar nesta pasta..." />
          <button class="explorer-tool-btn" data-act="view" title="Alternar exibição">▦</button>
          <button class="explorer-tool-btn" data-act="new-folder" title="Nova pasta">📁＋</button>
          <button class="explorer-tool-btn" data-act="new-doc" title="Novo documento">📄＋</button>
        </div>
        <div class="explorer-content" data-el="content"></div>
      </section>
    </div>`;

  const sidebarEl = host.querySelector('[data-el="sidebar"]');
  const crumbEl = host.querySelector('[data-el="crumb"]');
  const contentEl = host.querySelector('[data-el="content"]');
  const searchEl = host.querySelector('[data-el="search"]');
  const backBtn = host.querySelector('[data-act="back"]');

  // --- Render sidebar ---
  async function renderSidebar() {
    const tree = await fs.getChildren('root');
    state.tree = tree.filter((n) => n.type === 'folder');
    sidebarEl.innerHTML = `
      <div class="explorer-side-title">Acesso rápido</div>
      ${Object.entries(SPECIAL).map(([k, v]) =>
        `<button class="explorer-side-item ${state.special === v.special || (k === 'home' && !state.special && state.parentId === 'root') ? 'is-active' : ''}" data-side="${k}">
          <span class="esi-ico">${v.icon}</span>${v.label}
        </button>`).join('')}
      <div class="explorer-side-title" style="margin-top:12px;">Pastas</div>
      ${state.tree.map((f) =>
        `<button class="explorer-side-item ${state.parentId === f.id && !state.special ? 'is-active' : ''}" data-folder="${f.id}">
          <span class="esi-ico">📁</span>${escapeHTML(f.name)}
        </button>`).join('')}`;
  }

  // --- Render breadcrumb ---
  async function renderBreadcrumb() {
    if (state.special === 'starred') {
      crumbEl.innerHTML = `<span class="crumb is-current">⭐ Favoritos</span>`;
      return;
    }
    if (state.special === 'recent') {
      crumbEl.innerHTML = `<span class="crumb is-current">🕒 Recentes</span>`;
      return;
    }
    const path = await fs.getPath(state.parentId);
    const items = [`<button class="crumb" data-crumb="root">🏠 Início</button>`];
    path.forEach((p) => {
      items.push(`<span class="sep">›</span>`);
      items.push(`<button class="crumb ${p.id === state.parentId ? 'is-current' : ''}" data-crumb="${p.id}">${escapeHTML(p.name)}</button>`);
    });
    crumbEl.innerHTML = items.join('');
  }

  // --- Render content (grid/lista) ---
  async function renderContent() {
    let nodes;
    let emptyMsg;
    if (state.special === 'starred') {
      nodes = await fs.starred();
      emptyMsg = 'Nenhum favorito ainda. Marque itens com ⭐.';
    } else if (state.special === 'recent') {
      nodes = await fs.recent();
      emptyMsg = 'Nada por aqui ainda.';
    } else {
      nodes = await fs.getChildren(state.parentId);
      emptyMsg = 'Pasta vazia. Crie uma pasta ou documento.';
    }

    // Filtro de busca local
    if (state.query) {
      const q = state.query.toLowerCase();
      nodes = nodes.filter((n) => n.name.toLowerCase().includes(q));
      if (!nodes.length) {
        contentEl.innerHTML = emptyState('🔍', 'Nenhum resultado', 'Tente outro termo de busca.');
        return;
      }
    }

    if (!nodes.length) {
      contentEl.innerHTML = emptyState('📂', 'Vazio', emptyMsg);
      return;
    }

    if (state.view === 'list') renderList(nodes);
    else renderGrid(nodes);
  }

  const emptyState = (icon, title, sub) => `
    <div class="explorer-empty"><div class="ee-ico">${icon}</div>
    <div style="font-weight:700;color:var(--text)">${title}</div>
    <div style="font-size:12px;margin-top:4px">${sub}</div></div>`;

  function renderGrid(nodes) {
    contentEl.innerHTML = `<div class="explorer-grid">${nodes.map(nodeCard).join('')}</div>`;
  }

  function renderList(nodes) {
    const head = `<div class="explorer-list-head"><span>Nome</span><span>Tipo</span><span>Tamanho</span><span>Modificado</span><span></span></div>`;
    const rows = nodes.map((n) => `
      <div class="explorer-list-row ${state.selection === n.id ? 'selected' : ''}" data-node="${n.id}">
        <span class="el-name"><span class="el-ico">${n.type === 'folder' ? '📁' : '📄'}</span>${escapeHTML(n.name)}</span>
        <span class="el-meta">${n.type === 'folder' ? 'Pasta' : 'Documento'}</span>
        <span class="el-meta">${n.type === 'folder' ? '—' : (n.content?.length || 0) + ' car.'}</span>
        <span class="el-meta">${formatDate(n.updatedAt)}</span>
        <span class="el-meta">${n.starred ? '⭐' : ''}</span>
      </div>`).join('');
    contentEl.innerHTML = `<div class="explorer-list">${head}${rows}</div>`;
  }

  const nodeCard = (n) => `
    <div class="explorer-item ${n.type === 'folder' ? 'is-folder' : ''} ${state.selection === n.id ? 'selected' : ''}" data-node="${n.id}">
      <div class="ei-ico">${n.type === 'folder' ? '📁' : '📄'}${n.starred ? '<span style="position:absolute;font-size:12px;">⭐</span>' : ''}</div>
      <div class="ei-name" data-name="${n.id}">${escapeHTML(n.name)}</div>
    </div>`;

  // --- Event delegation no conteúdo ---
  contentEl.addEventListener('click', (e) => {
    const item = e.target.closest('[data-node]');
    if (!item) return;
    const id = item.dataset.node;
    state.selection = id;
    fs.getById(id).then((node) => {
      if (node.type === 'folder') navigate(id);
      else { renderContent(); openDoc(node); }
    });
  });

  contentEl.addEventListener('dblclick', (e) => {
    const item = e.target.closest('[data-node]');
    if (!item) return;
    fs.getById(item.dataset.node).then((node) => {
      if (node.type === 'doc') openDoc(node);
    });
  });

  // Menu de contexto
  contentEl.addEventListener('contextmenu', (e) => {
    const item = e.target.closest('[data-node]');
    const id = item?.dataset.node;
    if (!id) {
      // Menu do fundo (pasta atual)
      showContextMenu(e, [
        { icon: '📁', label: 'Nova pasta', onSelect: () => ops.createFolder(state.parentId).then(refresh) },
        { icon: '📄', label: 'Novo documento', onSelect: () => ops.createDoc(state.parentId).then(refresh) },
      ]);
      return;
    }
    fs.getById(id).then((node) => {
      showContextMenu(e, [
        { icon: node.type === 'folder' ? '📂' : '👁️', label: node.type === 'folder' ? 'Abrir' : 'Visualizar', onSelect: () => (node.type === 'folder' ? navigate(id) : openDoc(node)) },
        { icon: '⭐', label: node.starred ? 'Remover favorito' : 'Favoritar', onSelect: () => ops.toggleStar(node).then(refresh) },
        { icon: '✏️', label: 'Renomear', kbd: 'F2', onSelect: () => startRename(node) },
        { icon: '⧉', label: 'Duplicar', onSelect: () => ops.duplicateNode(node).then(refresh) },
        { type: 'separator' },
        { icon: '🗑️', label: 'Excluir', kbd: 'Del', danger: true, onSelect: () => ops.deleteNode(node).then(refresh) },
      ]);
    });
  });

  // Renomear inline
  async function startRename(node) {
    const card = contentEl.querySelector(`[data-name="${node.id}"]`);
    if (!card) return;
    card.innerHTML = `<input class="ei-name-edit" value="${escapeHTML(node.name)}" />`;
    const input = card.querySelector('input');
    input.focus(); input.select();
    const commit = async () => {
      const v = input.value.trim();
      if (v && v !== node.name) { await fs.rename(node.id, v); toast.success('Renomeado'); }
      refresh();
    };
    input.addEventListener('blur', commit, { once: true });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = node.name; input.blur(); }
    });
  }

  // Abrir documento (preview/editável simples)
  async function openDoc(node) {
    const fresh = await fs.getById(node.id);
    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop';
    overlay.innerHTML = `
      <div class="modal" style="width:min(640px,90vw)">
        <h3>${escapeHTML(fresh.name)}</h3>
        <div class="field">
          <textarea data-el="doc" rows="12" style="width:100%;font-family:var(--font-mono);font-size:13px;line-height:1.6">${escapeHTML(fresh.content || '')}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-act="close">Fechar</button>
          <button class="btn btn-primary" data-act="save">Salvar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const ta = overlay.querySelector('[data-el="doc"]');
    overlay.querySelector('[data-act="close"]').onclick = () => overlay.remove();
    overlay.querySelector('[data-act="save"]').onclick = async () => {
      await fs.update(fresh.id, { content: ta.value });
      toast.success('Documento salvo');
      overlay.remove();
    };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    setTimeout(() => ta.focus(), 30);
  }

  // --- Navegação ---
  function navigate(parentId) {
    state.parentId = parentId;
    state.special = null;
    state.selection = null;
    state.query = '';
    searchEl.value = '';
    refresh();
  }
  function goSpecial(kind) {
    state.special = SPECIAL[kind].special;
    state.parentId = 'root';
    state.selection = null;
    refresh();
  }

  // Sidebar delegation
  sidebarEl.addEventListener('click', (e) => {
    const side = e.target.closest('[data-side]');
    const folder = e.target.closest('[data-folder]');
    if (side) {
      if (side.dataset.side === 'home') navigate('root');
      else goSpecial(side.dataset.side);
    } else if (folder) navigate(folder.dataset.folder);
  });

  // Breadcrumb delegation
  crumbEl.addEventListener('click', (e) => {
    const cr = e.target.closest('[data-crumb]');
    if (cr) navigate(cr.dataset.crumb);
  });

  // Toolbar
  host.querySelector('[data-act="new-folder"]').addEventListener('click', () => ops.createFolder(state.parentId).then(refresh));
  host.querySelector('[data-act="new-doc"]').addEventListener('click', () => ops.createDoc(state.parentId).then(refresh));
  host.querySelector('[data-act="view"]').addEventListener('click', () => {
    state.view = state.view === 'grid' ? 'list' : 'grid';
    renderContent();
  });
  backBtn.addEventListener('click', async () => {
    if (state.special) { navigate('root'); return; }
    const path = await fs.getPath(state.parentId);
    const parent = path[path.length - 2];
    navigate(parent ? parent.id : 'root');
  });

  // Busca com debounce
  searchEl.addEventListener('input', debounce(() => {
    state.query = searchEl.value;
    renderContent();
  }, 180));

  // Atalhos locais
  host.tabIndex = 0;
  host.addEventListener('keydown', (e) => {
    if (e.key === 'F2' && state.selection) {
      fs.getById(state.selection).then(startRename);
    }
    if (e.key === 'Delete' && state.selection) {
      fs.getById(state.selection).then((n) => ops.deleteNode(n).then(refresh));
    }
  });

  // --- Re-render quando FS muda (de qualquer origem) ---
  const unsub = bus.on(EVT.FS_CHANGE, () => refresh());

  async function refresh() {
    await Promise.all([renderSidebar(), renderBreadcrumb(), renderContent()]);
  }

  refresh();
  return () => unsub();
}
