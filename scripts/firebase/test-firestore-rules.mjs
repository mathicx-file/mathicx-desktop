import fs from 'node:fs';
import process from 'node:process';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
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

test('pending owner cannot access desktop/app/migration subcollections', async (env) => {
  await seed(env, { 'users/alice': profile('alice', 'pending') });
  const alice = userDb(env, 'alice');
  await assertFails(setDoc(doc(alice, 'users/alice/desktop/settings'), desktopSettings));
  await assertFails(setDoc(doc(alice, 'users/alice/apps/japanese-study/settings/main'), desktopSettings));
  await assertFails(setDoc(doc(alice, 'users/alice/migrations/local-v1'), { done: true }));
});

test('approved owner can access own desktop/app/migration subcollections', async (env) => {
  await seed(env, { 'users/alice': profile('alice', 'approved') });
  const alice = userDb(env, 'alice');
  await assertSucceeds(setDoc(doc(alice, 'users/alice/desktop/settings'), desktopSettings));
  await assertSucceeds(setDoc(doc(alice, 'users/alice/apps/japanese-study/settings/main'), desktopSettings));
  await assertSucceeds(setDoc(doc(alice, 'users/alice/migrations/local-v1'), { done: true }));
});

test('approved user cannot access another user subcollections', async (env) => {
  await seed(env, {
    'users/alice': profile('alice', 'approved'),
    'users/bob': profile('bob', 'approved'),
    'users/alice/desktop/settings': desktopSettings,
  });
  const bob = userDb(env, 'bob');
  await assertFails(getDoc(doc(bob, 'users/alice/desktop/settings')));
  await assertFails(setDoc(doc(bob, 'users/alice/desktop/settings'), desktopSettings));
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
