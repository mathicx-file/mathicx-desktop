/**
 * mathicx-file · apps/calculadora/manifest.js
 * Manifesto do app Calculadora.
 * A view é carregada sob demanda (lazy import) pelo window-manager.
 */
export default {
  id: 'calculadora',
  name: 'Calculadora',
  icon: '🧮',
  category: 'ferramenta',
  description: 'Calculadora simples e rápida para uso diário.',
  defaultSize: { width: 340, height: 520 },
  resizable: true,
  /** Carrega o controller da view só quando a janela é aberta. */
  loader: () => import('./view.js'),
};
