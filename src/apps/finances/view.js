import { authProvider } from '../../auth/provider.js';
import { mountIframeApp } from '../integration/iframe-app.js';
import {
  appendUserScope,
  createUserScopeMessage,
  resolveAuthenticatedUserScope,
} from '../integration/user-scope.js';

const APP_ID = 'finances';

export function mount(host, context = {}) {
  const userScope = getDesktopUserScope();
  const appPath = appendUserScope('./Applications/finances/index.html', userScope);

  return mountIframeApp(host, {
    appId: APP_ID,
    appPath,
    title: 'Finanças',
    className: 'mxc-finances',
    styleId: 'mxc-finances-style',
    loadingText: 'Carregando Finanças...',
    errorText: 'A aplicação de finanças não pôde ser carregada.',
    context,
    actionType: 'navigate',
    onLoad: ({ post }) => {
      post('user-scope', createUserScopeMessage(APP_ID, userScope));
    },
  });
}

function getDesktopUserScope() {
  return resolveAuthenticatedUserScope(authProvider);
}
