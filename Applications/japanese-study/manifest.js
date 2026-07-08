const JapaneseStudyManifest = {
  id: 'japanese-study',
  name: 'Japanese Study',
  shortName: 'Japonês',
  description: 'Aprenda Hiragana, Katakana e Kanji N5 com SRS, quiz, escrita, backup e estudo adaptativo',
  version: '2.0.0',
  type: 'app',
  icon: '🇯🇵',
  author: 'Mathicx-File',
  path: '/Applications/japanese-study/',
  src: '/src/apps/japanese-study/',
  permissions: ['storage', 'indexeddb', 'downloads'],
  capabilities: {
    themes: true,
    postMessage: true,
    widgets: false
  },
  screenshots: [],
  categories: ['education', 'language']
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = JapaneseStudyManifest;
}
