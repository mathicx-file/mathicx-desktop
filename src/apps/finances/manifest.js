/**
 * mathicx-file · apps/finances/manifest.js
 * Aplicação de Finanças Pessoais integrada via iframe
 * 
 * A aplicação roda isolada em um iframe para máxima performance e
 * isolamento de memória, evitando conflitos de CSS/JS com o host.
 */
import { defineIntegratedAppManifest } from '../integration/integrated-app.js';

export default defineIntegratedAppManifest({
  id: 'finances',
  legacyIds: ['finanças'],
  name: 'Finanças',
  icon: '💰',
  category: 'trabalho',
  description: 'Gerenciador de finanças pessoais com análise completa.',
  defaultSize: { width: 1000, height: 700 },
  resizable: true,
  minSize: { width: 600, height: 400 },
  integration: {
    appData: true,
    version: '1.0.0',
    shortName: '$',
    canOpen: true,
    financial: true,
    userScoped: true,
    order: 20,
  },
  
  /** 
   * Carrega a view sob demanda (lazy import).
   * Otimizado para performance: apenas uma pequena função load + iframe.
   */
  loader: () => import('./view.js'),
});
