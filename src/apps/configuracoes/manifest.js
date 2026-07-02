/** mathicx-file · apps/configuracoes/manifest.js */
export default {
  id: 'configuracoes',
  name: 'Configurações',
  icon: '⚙️',
  category: 'sistema',
  description: 'Preferências de tema, atalhos e dados do sistema.',
  defaultSize: { width: 600, height: 520 },
  resizable: true,
  loader: () => import('./view.js'),
};
