/** mathicx-file · apps/formularios/manifest.js */
export default {
  id: 'formularios',
  name: 'Formulários',
  icon: '🗂️',
  category: 'trabalho',
  description: 'Central de atalhos do sistema — acesse rapidamente todas as aplicações.',
  defaultSize: { width: 800, height: 600 },
  resizable: true,
  loader: () => import('./view.js'),
};
