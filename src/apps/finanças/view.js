import { authProvider } from '../../auth/provider.js';
import { mountIframeApp } from '../integration/iframe-app.js';

const APP_ID = 'finances';

export function mount(host, context = {}) {
  const userScope = getDesktopUserScope();
  const appPath = `./Applications/finances/index.html?desktopUserScope=${encodeURIComponent(userScope)}`;

  return mountIframeApp(host, {
    appId: 'finanças',
    appPath,
    title: 'Finanças',
    className: 'mxc-finances',
    styleId: 'mxc-finances-style',
    loadingText: 'Carregando Finanças...',
    errorText: 'A aplicação de finanças não pôde ser carregada.',
    context,
    actionType: 'navigate',
    onLoad: ({ post }) => {
      post('user-scope', {
        appId: APP_ID,
        scope: userScope,
      });
    },
  });
}

function getDesktopUserScope() {
  const user = authProvider.getCurrentUser?.();
  return user?.uid || user?.id || user?.email || 'local';
}
