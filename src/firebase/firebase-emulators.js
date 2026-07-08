/**
 * mathicx-file · firebase/firebase-emulators.js
 * Emulator wiring kept separate so Phase 1 can prepare local testing without
 * changing production behavior.
 */

import { connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import { connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';

let connected = false;

export function connectFirebaseEmulators({ auth, firestore }) {
  if (connected) return;

  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(firestore, '127.0.0.1', 8081);

  connected = true;
  console.info('[firebase] connected to local emulators');
}
