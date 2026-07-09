import { mountIframeApp } from '../integration/iframe-app.js';

export function mount(host, context = {}) {
  return mountIframeApp(host, {
    appId: 'japanese-study',
    appPath: './Applications/japanese-study/index.html',
    title: 'Japanese Study',
    className: 'mxc-japanese-study',
    styleId: 'mxc-japanese-study-style',
    loadingText: 'Carregando Japanese Study...',
    errorText: 'O Japanese Study nao pode ser carregado.',
    context,
    actionType: 'navigate',
  });
}
