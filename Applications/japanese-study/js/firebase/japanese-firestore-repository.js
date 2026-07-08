import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import {
  collection,
  doc,
  getDocFromServer,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';

import { initFirebase } from '../../../../src/firebase/firebase-client.js';
import { firestorePaths } from '../../../../src/firebase/firestore-paths.js';
import {
  buildAchievementEntries,
  buildGamificationEventEntries,
  buildProgressionSummary,
  buildRemoteBackup,
  buildSettingsPayload,
  buildSrsEntries,
} from './sync-utils.js';

const BATCH_LIMIT = 450;
const JAPANESE_STUDY_MIGRATION_ID = 'japanese-study-local-first-sync-v1';

export class JapaneseFirestoreRepository {
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
    const settingsSnap = await getDocFromServer(doc(firestore, firestorePaths.japaneseSettings(uid)));
    const srsSnap = await getDocs(collection(firestore, `${firestorePaths.japaneseBase(uid)}/srs`));

    return buildRemoteBackup({
      settingsDoc: settingsSnap.exists() ? settingsSnap.data() : null,
      srsDocs: srsSnap.docs.map((item) => ({ id: item.id, ...item.data() })),
    });
  }

  async saveSnapshot(uid, backup) {
    const { firestore } = await this._init();
    const operations = [
      {
        path: firestorePaths.japaneseSettings(uid),
        data: withTimestamp(buildSettingsPayload(backup)),
      },
      {
        path: firestorePaths.japaneseProgression(uid),
        data: withTimestamp(buildProgressionSummary(backup)),
      },
      ...buildSrsEntries(backup?.data?.srs).map(([id, data]) => ({
        path: firestorePaths.japaneseSrs(uid, id),
        data: withTimestamp(data),
      })),
      ...buildGamificationEventEntries(backup?.data?.progress).map(([id, data]) => ({
        path: firestorePaths.japaneseEvent(uid, id),
        data: withTimestamp(data),
      })),
      ...buildAchievementEntries(backup?.data?.settings).map(([id, data]) => ({
        path: firestorePaths.japaneseAchievement(uid, id),
        data: withTimestamp(data),
      })),
    ];

    await commitOperations(firestore, operations);
    return {
      settings: 1,
      srs: buildSrsEntries(backup?.data?.srs).length,
      events: buildGamificationEventEntries(backup?.data?.progress).length,
      achievements: buildAchievementEntries(backup?.data?.settings).length,
    };
  }

  async markMigration(uid, details = {}) {
    const { firestore } = await this._init();
    await commitOperations(firestore, [
      {
        path: firestorePaths.userMigration(uid, JAPANESE_STUDY_MIGRATION_ID),
        data: withTimestamp({
          appId: 'japanese-study',
          migrationId: JAPANESE_STUDY_MIGRATION_ID,
          schemaVersion: 1,
          status: details.status || 'completed',
          reason: details.reason || 'initial-sync',
          counts: details.counts || {},
          completedAt: serverTimestamp(),
        }),
      },
    ]);
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

async function commitOperations(firestore, operations) {
  for (let index = 0; index < operations.length; index += BATCH_LIMIT) {
    const batch = writeBatch(firestore);
    operations.slice(index, index + BATCH_LIMIT).forEach(({ path, data }) => {
      batch.set(doc(firestore, path), data, { merge: true });
    });
    await batch.commit();
  }
}

function withTimestamp(data) {
  return {
    ...data,
    updatedAt: serverTimestamp(),
  };
}
