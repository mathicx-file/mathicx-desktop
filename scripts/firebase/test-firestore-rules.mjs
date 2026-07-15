import fs from 'node:fs';
import assert from 'node:assert/strict';
import process from 'node:process';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'mathicx-file-desktop';
const RULES = fs.readFileSync('firestore.rules', 'utf8');

const now = new Date();

const profile = (uid, accessStatus = 'pending') => ({
  uid,
  displayName: `User ${uid}`,
  email: `${uid}@example.com`,
  photoURL: '',
  accessStatus,
  role: 'user',
  createdAt: now,
  updatedAt: now,
  lastLoginAt: now,
  schemaVersion: 1,
});

const desktopSettings = {
  theme: 'dark',
  widgets: null,
  widgetLayout: null,
  shortcuts: null,
  favorites: ['notas'],
  pinned: ['calculadora'],
  updatedAt: now,
  schemaVersion: 1,
};

const financesSettings = {
  schemaVersion: 1,
  currency: 'BRL',
  activeProfileId: 'prof-main',
  updatedAt: now,
};

const financesSnapshot = {
  appId: 'finances',
  format: 'finances-backup',
  schemaVersion: 1,
  revision: 1,
  sourceSchemaVersion: 1,
  source: 'test',
  state: {
    settings: financesSettings,
    profiles: [{ id: 'prof-main', name: 'Pessoal' }],
    transactions: [{
      schemaVersion: 1,
      type: 'expense',
      description: 'Mercado',
      amount: 125.5,
      dueDate: '2026-07-09',
      status: 'paid',
      profileId: 'prof-main',
    }],
    cards: [],
    goals: [],
  },
  counts: {
    settings: 1,
    profiles: 1,
    transactions: 1,
    cards: 0,
    goals: 0,
  },
  updatedAt: now,
};

const financesTransaction = {
  schemaVersion: 1,
  type: 'expense',
  description: 'Mercado',
  amount: 125.5,
  dueDate: '2026-07-09',
  status: 'paid',
  profileId: 'prof-main',
  updatedAt: now,
};

const financesGoal = {
  schemaVersion: 1,
  name: 'Reserva',
  targetAmount: 10000,
  currentAmount: 1500,
  profileId: 'prof-main',
  updatedAt: now,
};

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function userDb(env, uid, claims = {}) {
  return env.authenticatedContext(uid, claims).firestore();
}

function anonDb(env) {
  return env.unauthenticatedContext().firestore();
}

async function seed(env, records) {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all(
      Object.entries(records).map(([path, data]) => setDoc(doc(db, path), data)),
    );
  });
}

test('owner can create own pending user profile', async (env) => {
  const db = userDb(env, 'alice');
  await assertSucceeds(setDoc(doc(db, 'users/alice'), profile('alice', 'pending')));
});

test('owner cannot create approved user profile', async (env) => {
  const db = userDb(env, 'alice');
  await assertFails(setDoc(doc(db, 'users/alice'), profile('alice', 'approved')));
});

test('anonymous cannot create or read personal profile', async (env) => {
  const db = anonDb(env);
  await assertFails(setDoc(doc(db, 'users/anon'), profile('anon', 'pending')));
  await assertFails(getDoc(doc(db, 'users/alice')));
});

test('other user cannot read or update profile', async (env) => {
  await seed(env, { 'users/alice': profile('alice', 'approved') });
  const bob = userDb(env, 'bob');
  await assertFails(getDoc(doc(bob, 'users/alice')));
  await assertFails(updateDoc(doc(bob, 'users/alice'), { displayName: 'Bob edit' }));
});

test('owner can update only safe profile fields', async (env) => {
  await seed(env, { 'users/alice': profile('alice', 'pending') });
  const alice = userDb(env, 'alice');
  await assertSucceeds(updateDoc(doc(alice, 'users/alice'), {
    displayName: 'Alice',
    updatedAt: now,
  }));
  await assertFails(updateDoc(doc(alice, 'users/alice'), {
    accessStatus: 'approved',
    updatedAt: now,
  }));
  await assertFails(updateDoc(doc(alice, 'users/alice'), {
    role: 'admin',
    updatedAt: now,
  }));
});

test('admin claim can list profiles and manage whitelist status', async (env) => {
  await seed(env, {
    'users/alice': profile('alice', 'pending'),
    'users/bob': profile('bob', 'approved'),
  });
  const admin = userDb(env, 'owner', { admin: true });
  const snapshot = await assertSucceeds(getDocs(collection(admin, 'users')));
  assert.equal(snapshot.size, 2);
  await assertSucceeds(updateDoc(doc(admin, 'users/alice'), {
    accessStatus: 'approved',
    updatedAt: now,
  }));
  await assertSucceeds(updateDoc(doc(admin, 'users/bob'), {
    accessStatus: 'rejected',
    updatedAt: now,
  }));
});

test('admin audit is server-only even for an admin claim', async (env) => {
  const admin = userDb(env, 'owner', { admin: true });
  await assertFails(getDocs(collection(admin, 'adminAudit')));
  await assertFails(setDoc(doc(admin, 'adminAudit/client-write'), { action: 'forged' }));
});

test('pending owner cannot access desktop/app/migration subcollections', async (env) => {
  await seed(env, { 'users/alice': profile('alice', 'pending') });
  const alice = userDb(env, 'alice');
  await assertFails(setDoc(doc(alice, 'users/alice/desktop/settings'), desktopSettings));
  await assertFails(setDoc(doc(alice, 'users/alice/apps/japanese-study/settings/main'), desktopSettings));
  await assertFails(setDoc(doc(alice, 'users/alice/apps/finances/settings/main'), financesSettings));
  await assertFails(setDoc(doc(alice, 'users/alice/apps/finances/transactions/tx-1'), financesTransaction));
  await assertFails(setDoc(doc(alice, 'users/alice/migrations/local-v1'), { done: true }));
});

test('approved owner can access own desktop/app/migration subcollections', async (env) => {
  await seed(env, { 'users/alice': profile('alice', 'approved') });
  const alice = userDb(env, 'alice');
  await assertSucceeds(setDoc(doc(alice, 'users/alice/desktop/settings'), desktopSettings));
  await assertSucceeds(setDoc(doc(alice, 'users/alice/apps/japanese-study/settings/main'), desktopSettings));
  await assertSucceeds(setDoc(doc(alice, 'users/alice/apps/japanese-study/profile/progression'), {
    schemaVersion: 1,
    level: 2,
    xp: 120,
    updatedAt: now,
  }));
  await assertSucceeds(setDoc(doc(alice, 'users/alice/apps/japanese-study/events/event-1'), {
    schemaVersion: 1,
    eventType: 'quiz.correct',
    xp: 9,
    timestamp: now,
    updatedAt: now,
  }));
  await assertSucceeds(setDoc(doc(alice, 'users/alice/apps/japanese-study/srs/kana-a'), {
    schemaVersion: 1,
    charId: 'kana-a',
    state: 'review',
    updatedAt: now,
  }));
  await assertSucceeds(setDoc(doc(alice, 'users/alice/apps/japanese-study/achievements/first-steps'), {
    schemaVersion: 1,
    unlocked: true,
    updatedAt: now,
  }));
  await assertSucceeds(setDoc(doc(alice, 'users/alice/apps/finances/settings/main'), financesSettings));
  await assertSucceeds(setDoc(doc(alice, 'users/alice/apps/finances/profile/snapshot'), financesSnapshot));
  await assertSucceeds(setDoc(doc(alice, 'users/alice/apps/finances/transactions/tx-1'), financesTransaction));
  await assertSucceeds(setDoc(doc(alice, 'users/alice/apps/finances/goals/goal-1'), financesGoal));
  await assertSucceeds(setDoc(doc(alice, 'users/alice/migrations/local-v1'), { done: true }));
  await assertSucceeds(setDoc(doc(alice, 'users/alice/migrations/japanese-study-local-first-sync-v1'), {
    appId: 'japanese-study',
    status: 'completed',
    schemaVersion: 1,
    updatedAt: now,
  }));
});

test('approved user cannot access another user subcollections', async (env) => {
  await seed(env, {
    'users/alice': profile('alice', 'approved'),
    'users/bob': profile('bob', 'approved'),
    'users/alice/desktop/settings': desktopSettings,
    'users/alice/apps/finances/settings/main': financesSettings,
    'users/alice/apps/finances/profile/snapshot': financesSnapshot,
  });
  const bob = userDb(env, 'bob');
  await assertFails(getDoc(doc(bob, 'users/alice/desktop/settings')));
  await assertFails(setDoc(doc(bob, 'users/alice/desktop/settings'), desktopSettings));
  await assertFails(getDoc(doc(bob, 'users/alice/apps/finances/settings/main')));
  await assertFails(getDoc(doc(bob, 'users/alice/apps/finances/profile/snapshot')));
  await assertFails(setDoc(doc(bob, 'users/alice/apps/finances/transactions/tx-2'), financesTransaction));
});

test('signed-in users can read public metadata but only admins can write', async (env) => {
  const alice = userDb(env, 'alice');
  const admin = userDb(env, 'admin', { admin: true });
  const publicDoc = doc(alice, 'publicData/dictionary');
  await seed(env, { 'publicData/dictionary': { currentVersion: 'test' } });

  await assertSucceeds(getDoc(publicDoc));
  await assertFails(setDoc(publicDoc, { currentVersion: 'user-write' }));
  await assertSucceeds(setDoc(doc(admin, 'publicData/dictionary'), { currentVersion: 'admin-write' }));
});

test('unknown paths are denied', async (env) => {
  const alice = userDb(env, 'alice');
  await assertFails(setDoc(doc(alice, 'unknown/path'), { value: true }));
  await assertFails(deleteDoc(doc(alice, 'unknown/path')));
});

const env = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: {
    host: '127.0.0.1',
    port: 8081,
    rules: RULES,
  },
});

let failures = 0;

try {
  for (const { name, fn } of tests) {
    await env.clearFirestore();
    try {
      await fn(env);
      console.log(`PASS ${name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${name}`);
      console.error(error);
    }
  }
} finally {
  await env.cleanup();
}

if (failures > 0) {
  console.error(`${failures} Firestore rules test(s) failed.`);
  process.exit(1);
}

console.log(`${tests.length} Firestore rules tests passed.`);
