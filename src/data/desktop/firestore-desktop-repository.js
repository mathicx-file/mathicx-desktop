/**
 * Firestore repository for lightweight desktop preferences.
 */

import {
  doc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';

import { initFirebase } from '../../firebase/firebase-client.js';
import { firestorePaths } from '../../firebase/firestore-paths.js';

export class FirestoreDesktopRepository {
  constructor({ uid }) {
    this.uid = uid;
  }

  async loadSettings() {
    const { firestore } = await initFirebase({ force: true });
    const ref = doc(firestore, firestorePaths.userDesktopSettings(this.uid));
    const snap = await getDocFromServer(ref);
    return snap.exists() ? snap.data() : null;
  }

  async saveSettings(settings) {
    const { firestore } = await initFirebase({ force: true });
    const ref = doc(firestore, firestorePaths.userDesktopSettings(this.uid));
    await setDoc(ref, {
      ..._clean(settings),
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    }, { merge: true });
  }
}

function _clean(value) {
  if (Array.isArray(value)) return value.map(_clean);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, _clean(item)]),
  );
}
