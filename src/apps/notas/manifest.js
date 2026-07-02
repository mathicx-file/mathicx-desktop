/** mathicx-file · apps/notas/manifest.js */
export default {
  id: 'notas',
  name: 'Notas',
  icon: '📝',
  category: 'pessoal',
  description: 'Bloco de notas rápido com auto-save local.',
  defaultSize: { width: 520, height: 460 },
  resizable: true,
  loader: () => import('./view.js'),
};
