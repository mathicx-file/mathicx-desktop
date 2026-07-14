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

  async saveSnapshot(uid, backup, options = {}) {
    const { firestore } = await this._init();
    const operations = options.replaceRemote
      ? await buildReplacementDeletes(firestore, uid, backup)
      : [];
    operations.push(
      {
        path: firestorePaths.japaneseSettings(uid),
        data: withTimestamp(buildSettingsPayload(backup)),
        merge: options.replaceRemote !== true,
      },
      {
        path: firestorePaths.japaneseProgression(uid),
        data: withTimestamp(buildProgressionSummary(backup)),
        merge: options.replaceRemote !== true,
      },
      ...buildSrsEntries(backup?.data?.srs).map(([id, data]) => ({
        path: firestorePaths.japaneseSrs(uid, id),
        data: withTimestamp(data),
        merge: options.replaceRemote !== true,
      })),
      ...buildGamificationEventEntries(backup?.data?.progress).map(([id, data]) => ({
        path: firestorePaths.japaneseEvent(uid, id),
        data: withTimestamp(data),
        merge: options.replaceRemote !== true,
      })),
      ...buildAchievementEntries(backup?.data?.settings).map(([id, data]) => ({
        path: firestorePaths.japaneseAchievement(uid, id),
        data: withTimestamp(data),
        merge: options.replaceRemote !== true,
      })),
    );

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
    operations.slice(index, index + BATCH_LIMIT).forEach(({ path, data, merge = true, delete: remove }) => {
      if (remove) {
        batch.delete(doc(firestore, path));
        return;
      }
      batch.set(doc(firestore, path), data, { merge });
    });
    await batch.commit();
  }
}

async function buildReplacementDeletes(firestore, uid, backup) {
  const collectionNames = ['srs', 'events', 'achievements'];
  const retainedPaths = new Set([
    ...buildSrsEntries(backup?.data?.srs).map(([id]) => firestorePaths.japaneseSrs(uid, id)),
    ...buildGamificationEventEntries(backup?.data?.progress).map(([id]) => firestorePaths.japaneseEvent(uid, id)),
    ...buildAchievementEntries(backup?.data?.settings).map(([id]) => firestorePaths.japaneseAchievement(uid, id)),
  ]);
  const snapshots = await Promise.all(collectionNames.map((name) => (
    getDocs(collection(firestore, `${firestorePaths.japaneseBase(uid)}/${name}`))
  )));
  return snapshots.flatMap((snapshot) => snapshot.docs
    .filter((item) => !retainedPaths.has(item.ref.path))
    .map((item) => ({ path: item.ref.path, delete: true })));
}

function withTimestamp(data) {
  return {
    ...data,
    updatedAt: serverTimestamp(),
  };
}
