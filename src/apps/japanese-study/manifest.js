import { defineIntegratedAppManifest } from '../integration/integrated-app.js';

export default defineIntegratedAppManifest({
  id: 'japanese-study',
  name: 'Japanese Study',
  icon: 'JP',
  category: 'pessoal',
  description: 'Estudo de hiragana, katakana e Kanji N5 com SRS, quiz, escrita e gamificacao.',
  defaultSize: { width: 1100, height: 760 },
  resizable: true,
  minSize: { width: 760, height: 520 },
  integration: {
    appData: true,
    version: '2.0.0',
    shortName: 'JP',
    canOpen: true,
    financial: false,
    userScoped: true,
    order: 10,
  },
  loader: () => import('./view.js'),
});
