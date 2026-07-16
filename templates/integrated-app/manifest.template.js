import { defineIntegratedAppManifest } from '../integration/integrated-app.js';

export default defineIntegratedAppManifest({
  id: '__APP_ID__',
  name: '__APP_NAME__',
  icon: '__APP_SHORT_NAME__',
  category: 'pessoal',
  description: '__APP_DESCRIPTION__',
  defaultSize: { width: 1000, height: 700 },
  resizable: true,
  minSize: { width: 640, height: 480 },
  integration: {
    appData: true,
    version: '1.0.0',
    shortName: '__APP_SHORT_NAME__',
    canOpen: true,
    financial: false,
    userScoped: true,
    order: 100,
  },
  loader: () => import('./view.js'),
});
