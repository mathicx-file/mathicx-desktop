import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import {
  doc,
  getDocFromServer,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';

import { initFirebase } from '../../../../src/firebase/firebase-client.js';
import { firestorePaths } from '../../../../src/firebase/firestore-paths.js';
import {
  buildRemoteSnapshot,
  buildSnapshotPayload,
  countStateRecords,
  normalizeRevision,
} from './sync-utils.js';

const FINANCES_MIGRATION_ID = 'finances-local-first-snapshot-v1';

export class FinancesFirestoreRepository {
  constructor() {
    this.services = null;
  }

  async getApprovedUser() {
    const { auth, firestore } = await this._init();
    const firebaseUser = await waitForAuthUser(auth);
    if (!firebaseUser?.uid) return null;

    const profileRef = doc(firestore, firestorePaths.user(firebaseUser.uid));
    const profileSnap = await getDocFromServer(profileRef);
    const profile = profileSnap.exists() ? profileSnap.data() : null;

    if (profile?.accessStatus !== 'approved') return null;
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email || profile.email || '',
      displayName: firebaseUser.displayName || profile.displayName || '',
    };
  }

  async loadSnapshot(uid) {
    const { firestore } = await this._init();
    const snapshotRef = doc(firestore, firestorePaths.financesSnapshot(uid));
    const snapshotSnap = await getDocFromServer(snapshotRef);
    return buildRemoteSnapshot(snapshotSnap.exists() ? snapshotSnap.data() : null);
  }

  async saveSnapshot(uid, state, reason = 'manual', options = {}) {
    const { firestore } = await this._init();
    const snapshot = buildSnapshotPayload(state, { source: reason });
    const snapshotRef = doc(firestore, firestorePaths.financesSnapshot(uid));
    const expectedRevision = normalizeRevision(options.expectedRevision);

    return runTransaction(firestore, async (transaction) => {
      const currentSnap = await transaction.get(snapshotRef);
      const currentData = currentSnap.exists() ? currentSnap.data() : null;
      const currentRevision = normalizeRevision(currentData?.revision);

      if (!options.force && currentRevision !== expectedRevision) {
        return {
          ok: false,
          conflict: true,
          remote: buildRemoteSnapshot(currentData),
        };
      }

      const revision = currentRevision + 1;
      transaction.set(snapshotRef, {
        ...snapshot,
        revision,
        updatedAt: serverTimestamp(),
      });
      return {
        ok: true,
        revision,
        counts: countStateRecords(snapshot.state),
      };
    });
  }

  async markMigration(uid, details = {}) {
    const { firestore } = await this._init();
    await setDoc(doc(firestore, firestorePaths.userMigration(uid, FINANCES_MIGRATION_ID)), {
      appId: 'finances',
      migrationId: FINANCES_MIGRATION_ID,
      schemaVersion: 1,
      status: details.status || 'completed',
      reason: details.reason || 'initial-sync',
      counts: details.counts || {},
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  async _init() {
    if (this.services) return this.services;
    this.services = await initFirebase({ force: true });
    return this.services;
  }
}

async function waitForAuthUser(auth) {
  if (auth.currentUser) return auth.currentUser;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, 5000);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      clearTimeout(timeout);
      unsubscribe();
      resolve(user || null);
    }, () => {
      clearTimeout(timeout);
      unsubscribe();
      resolve(null);
    });
  });
}
