/** mathicx-file · apps/arquivos/manifest.js — atalho para o Explorer */
export default {
  id: 'arquivos',
  name: 'mathicx-file Explorer',
  icon: '📁',
  category: 'sistema',
  description: 'Explorador de arquivos: navegue pastas, crie documentos, organize.',
  defaultSize: { width: 880, height: 560 },
  resizable: true,
  loader: () => import('./view.js'),
};
