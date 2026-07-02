/**
 * mathicx-file · explorer/operations.js
 * Camada fina de operações de UI do explorer: pede confirmação, valida
 * nomes, chama o fs-store e exibe toasts. Mantém o explorer.js mais enxuto.
 */

import { explorerProvider as fs } from './fs-store.js';
import { toast } from '../ui/toast.js';
import { confirmModal, promptModal } from '../ui/modal.js';

const ICON_FOR = { folder: '📁', doc: '📄' };

export async function createFolder(parentId) {
  const name = await promptModal({
    title: 'Nova pasta', label: 'Nome', value: 'Nova pasta',
    validate: (v) => (!v.trim() ? 'Informe um nome' : null),
  });
  if (!name) return;
  await fs.create({ parentId, type: 'folder', name: name.trim() });
  toast.success('Pasta criada');
}

export async function createDoc(parentId) {
  const name = await promptModal({
    title: 'Novo documento', label: 'Nome', value: 'Novo documento.txt',
    validate: (v) => (!v.trim() ? 'Informe um nome' : null),
  });
  if (!name) return;
  await fs.create({ parentId, type: 'doc', name: name.trim() });
  toast.success('Documento criado');
}

export async function renameNode(node) {
  const name = await promptModal({
    title: 'Renomear', label: 'Novo nome', value: node.name,
    validate: (v) => (!v.trim() ? 'Informe um nome' : null),
  });
  if (!name) return;
  await fs.rename(node.id, name.trim());
  toast.success('Renomeado');
}

export async function deleteNode(node) {
  const ok = await confirmModal({
    title: node.type === 'folder' ? 'Excluir pasta?' : 'Excluir documento?',
    message: node.type === 'folder'
      ? `"${node.name}" e todo o seu conteúdo serão removidos.`
      : `"${node.name}" será removido.`,
    okText: 'Excluir', danger: true,
  });
  if (!ok) return;
  await fs.remove(node.id);
  toast.success('Excluído');
}

export async function duplicateNode(node) {
  await fs.duplicate(node.id);
  toast.success('Duplicado');
}

export async function toggleStar(node) {
  await fs.toggleStar(node.id);
}

/** Move um nó para parentId (usado por drag-and-drop ou menu). */
export async function moveNode(node, parentId) {
  await fs.move(node.id, parentId);
  toast.success('Movido');
}
