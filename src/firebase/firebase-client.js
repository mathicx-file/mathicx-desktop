/**
 * mathicx-file · firebase/firebase-client.js
 * Lazy Firebase initializer for the zero-build browser runtime.
 */

import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';

import { firebaseConfig as productionConfig } from './firebase-config.prod.js';
import { featureFlags, isFirebaseRuntimeEnabled } from './feature-flags.js';
import { connectFirebaseEmulators } from './firebase-emulators.js';

let firebaseServices = null;

export async function getFirebaseConfig() {
  if (_shouldPreferLocalConfig()) {
    try {
      const local = await import('./firebase-config.local.js');
      return local.firebaseConfig;
    } catch (err) {
      console.info('[firebase] local config unavailable; using production placeholder/config.', err?.message);
    }
  }
  return productionConfig;
}

export async function initFirebase({ force = false } = {}) {
  if (!force && !isFirebaseRuntimeEnabled()) {
    return null;
  }

  if (firebaseServices) return firebaseServices;

  const config = await getFirebaseConfig();
  validateFirebaseConfig(config);

  const app = getApps().length ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  const firestore = getFirestore(app);

  firebaseServices = { app, auth, firestore, config };

  if (featureFlags.firebaseEmulatorsEnabled) {
    connectFirebaseEmulators(firebaseServices);
  }

  return firebaseServices;
}

export function getInitializedFirebase() {
  return firebaseServices;
}

export function validateFirebaseConfig(config) {
  const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
  const missing = required.filter((key) => !_hasRealValue(config?.[key]));
  if (missing.length) {
    throw new Error(`Firebase config incompleta: ${missing.join(', ')}`);
  }
}

function _shouldPreferLocalConfig() {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '';
}

function _hasRealValue(value) {
  return typeof value === 'string'
    && value.trim().length > 0
    && !value.includes('YOUR_');
}
