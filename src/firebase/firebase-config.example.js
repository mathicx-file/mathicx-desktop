/**
 * Example Firebase Web App configuration.
 *
 * Copy this shape to `firebase-config.local.js` for local development.
 * The local file is ignored by Git.
 */

export const firebaseConfig = {
  apiKey: 'YOUR_FIREBASE_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId: 'YOUR_FIREBASE_APP_ID',
  appCheck: {
    enabled: false,
    provider: 'recaptcha-enterprise',
    siteKey: 'YOUR_RECAPTCHA_ENTERPRISE_SITE_KEY',
    debug: false,
  },
};
