/**
 * mathicx-file · apps/arquivos/view.js
 * Bridge para o Explorer (implementado em /src/explorer/explorer.js).
 * Mantém o app "arquivos" independente enquanto reaproveita o módulo explorer.
 */
import { mountExplorer } from '../../explorer/explorer.js';

export function mount(host, ctx) {
  return mountExplorer(host, ctx);
}
