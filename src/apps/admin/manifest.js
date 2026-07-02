export default {
  id: 'admin',
  name: 'Painel Admin',
  icon: '🛡️',
  category: 'sistema',
  description: 'Estatísticas e gestão de usuários (admin).',
  defaultSize: { width: 960, height: 680 },
  resizable: true,
  loader: () => import('./view.js'),
};
