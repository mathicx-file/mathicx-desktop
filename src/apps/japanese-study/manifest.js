export default {
  id: 'japanese-study',
  name: 'Japanese Study',
  icon: 'JP',
  category: 'pessoal',
  description: 'Estudo de hiragana, katakana e Kanji N5 com SRS, quiz, escrita e gamificacao.',
  defaultSize: { width: 1100, height: 760 },
  resizable: true,
  minSize: { width: 760, height: 520 },
  loader: () => import('./view.js'),
};
