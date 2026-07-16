import { authProvider } from '../../auth/provider.js';
import { mountIframeApp } from '../integration/iframe-app.js';
import {
  appendUserScope,
  createUserScopeMessage,
  resolveAuthenticatedUserScope,
} from '../integration/user-scope.js';

const APP_ID = '__APP_ID__';

export function mount(host, context = {}) {
  const userScope = resolveAuthenticatedUserScope(authProvider);
  const appPath = appendUserScope('./Applications/__APP_ID__/index.html', userScope);
  return mountIframeApp(host, {
    appId: APP_ID,
    appPath,
    title: '__APP_NAME__',
    context,
    actionType: 'navigate',
    onLoad: ({ post }) => post('user-scope', createUserScopeMessage(APP_ID, userScope)),
  });
}
