export default {
  id: '<app-id>',
  name: '<Nome do App>',
  icon: '<emoji>',
  category: '<categoria>',
  description: '<Descrição curta>',
  defaultSize: { width: 1000, height: 700 },
  resizable: true,
  minSize: { width: 600, height: 400 },
  loader: () => import('./view.js'),
};
