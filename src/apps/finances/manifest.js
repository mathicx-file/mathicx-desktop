/**
 * mathicx-file · apps/finances/manifest.js
 * Aplicação de Finanças Pessoais integrada via iframe
 * 
 * A aplicação roda isolada em um iframe para máxima performance e
 * isolamento de memória, evitando conflitos de CSS/JS com o host.
 */

export default {
  id: 'finances',
  legacyIds: ['finanças'],
  name: 'Finanças',
  icon: '💰',
  category: 'trabalho',
  description: 'Gerenciador de finanças pessoais com análise completa.',
  defaultSize: { width: 1000, height: 700 },
  resizable: true,
  minSize: { width: 600, height: 400 },
  
  /** 
   * Carrega a view sob demanda (lazy import).
   * Otimizado para performance: apenas uma pequena função load + iframe.
   */
  loader: () => import('./view.js'),
};
