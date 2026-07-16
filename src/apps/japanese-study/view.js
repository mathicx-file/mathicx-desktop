import { authProvider } from '../../auth/provider.js';
import { mountIframeApp } from '../integration/iframe-app.js';
import {
  appendUserScope,
  resolveAuthenticatedUserScope,
} from '../integration/user-scope.js';

export function mount(host, context = {}) {
  const userScope = resolveAuthenticatedUserScope(authProvider);
  return mountIframeApp(host, {
    appId: 'japanese-study',
    appPath: appendUserScope('./Applications/japanese-study/index.html', userScope),
    title: 'Japanese Study',
    className: 'mxc-japanese-study',
    styleId: 'mxc-japanese-study-style',
    loadingText: 'Carregando Japanese Study...',
    errorText: 'O Japanese Study nao pode ser carregado.',
    context,
    actionType: 'navigate',
  });
}
