import process from 'node:process';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import fs from 'node:fs';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'mathicx-file-desktop';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8081';
const RULES = fs.readFileSync('firestore.rules', 'utf8');
const PASSWORD = 'Senha segura 17.2!';
const clients = [];
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function profile(uid, email, accessStatus = 'pending') {
  const now = new Date();
  return {
    uid,
    displayName: email.split('@')[0],
    email,
    photoURL: '',
    accessStatus,
    role: 'user',
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
    schemaVersion: 1,
  };
}

function createClient(name) {
  const app = initializeApp({
    apiKey: 'demo-api-key',
    authDomain: `${PROJECT_ID}.firebaseapp.com`,
    projectId: PROJECT_ID,
    appId: `demo-${name}`,
  }, `phase-17-2-${name}-${Date.now()}-${clients.length}`);
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const [host, port] = FIRESTORE_HOST.split(':');
  connectFirestoreEmulator(firestore, host, Number(port));
  const client = { app, auth, firestore };
  clients.push(client);
  return client;
}

async function expectDenied(operation) {
  await operation.then(
    () => { throw new Error('Expected Firestore permission denial.'); },
    (error) => {
      if (error?.code !== 'permission-denied') throw error;
    },
  );
}

async function seed(env, records) {
  await env.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    for (const [recordPath, data] of Object.entries(records)) {
      await setDoc(doc(firestore, recordPath), data);
    }
  });
}

async function clearAuthEmulator() {
  const response = await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error(`Auth Emulator cleanup failed: HTTP ${response.status}`);
}

test('real Auth user can create only a pending profile for its own UID', async ({ env }) => {
  const alice = createClient('alice');
  const credential = await createUserWithEmailAndPassword(alice.auth, 'alice@example.com', PASSWORD);
  const uid = credential.user.uid;

  await setDoc(doc(alice.firestore, `users/${uid}`), profile(uid, 'alice@example.com'));
  await expectDenied(setDoc(doc(alice.firestore, `users/${uid}`), profile(uid, 'alice@example.com', 'approved')));
  await expectDenied(updateDoc(doc(alice.firestore, `users/${uid}`), {
    role: 'admin',
    updatedAt: new Date(),
  }));

  const stored = await getDoc(doc(alice.firestore, `users/${uid}`));
  if (stored.data()?.accessStatus !== 'pending' || stored.data()?.role !== 'user') {
    throw new Error('Pending profile was unexpectedly elevated.');
  }
  await env.clearFirestore();
});

test('pending and rejected Auth users cannot access app data', async ({ env }) => {
  const pending = createClient('pending');
  const credential = await createUserWithEmailAndPassword(pending.auth, 'pending@example.com', PASSWORD);
  const uid = credential.user.uid;
  await setDoc(doc(pending.firestore, `users/${uid}`), profile(uid, 'pending@example.com'));
  await expectDenied(setDoc(doc(pending.firestore, `users/${uid}/desktop/settings`), { theme: 'dark' }));

  await seed(env, { [`users/${uid}`]: profile(uid, 'pending@example.com', 'rejected') });
  await expectDenied(setDoc(doc(pending.firestore, `users/${uid}/apps/japanese-study/settings/main`), { dailyGoal: 10 }));
});

test('approved Auth user keeps its UID across login and accesses only its own data', async ({ env }) => {
  const alice = createClient('approved-alice');
  const credential = await createUserWithEmailAndPassword(alice.auth, 'approved-alice@example.com', PASSWORD);
  const aliceUid = credential.user.uid;
  await seed(env, { [`users/${aliceUid}`]: profile(aliceUid, 'approved-alice@example.com', 'approved') });
  await setDoc(doc(alice.firestore, `users/${aliceUid}/desktop/settings`), { theme: 'dark' });
  await setDoc(doc(alice.firestore, `users/${aliceUid}/apps/finances/settings/main`), { currency: 'BRL' });

  await signOut(alice.auth);
  const restored = await signInWithEmailAndPassword(alice.auth, 'approved-alice@example.com', PASSWORD);
  if (restored.user.uid !== aliceUid) throw new Error('Auth Emulator changed UID across login.');
  await getDoc(doc(alice.firestore, `users/${aliceUid}/desktop/settings`));

  const bob = createClient('approved-bob');
  const bobCredential = await createUserWithEmailAndPassword(bob.auth, 'approved-bob@example.com', PASSWORD);
  const bobUid = bobCredential.user.uid;
  await seed(env, { [`users/${bobUid}`]: profile(bobUid, 'approved-bob@example.com', 'approved') });
  await expectDenied(getDoc(doc(bob.firestore, `users/${aliceUid}/desktop/settings`)));
  await expectDenied(setDoc(doc(bob.firestore, `users/${aliceUid}/apps/finances/settings/main`), { currency: 'USD' }));
});

test('signed-out clients lose Firestore access immediately', async ({ env }) => {
  const client = createClient('logout');
  const credential = await createUserWithEmailAndPassword(client.auth, 'logout@example.com', PASSWORD);
  const uid = credential.user.uid;
  await seed(env, {
    [`users/${uid}`]: profile(uid, 'logout@example.com', 'approved'),
    [`users/${uid}/desktop/settings`]: { theme: 'dark' },
  });
  await getDoc(doc(client.firestore, `users/${uid}/desktop/settings`));
  await signOut(client.auth);
  await expectDenied(getDoc(doc(client.firestore, `users/${uid}/desktop/settings`)));
});

const env = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: {
    host: FIRESTORE_HOST.split(':')[0],
    port: Number(FIRESTORE_HOST.split(':')[1]),
    rules: RULES,
  },
});

let failures = 0;
try {
  await clearAuthEmulator();
  await env.clearFirestore();
  for (const current of tests) {
    try {
      await current.fn({ env });
      console.log(`PASS ${current.name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${current.name}`);
      console.error(error);
    }
  }
} finally {
  await Promise.allSettled(clients.map(({ app }) => deleteApp(app)));
  await env.cleanup();
  await clearAuthEmulator().catch(() => {});
}

if (failures) {
  console.error(`${failures} Auth/Firestore integration test(s) failed.`);
  process.exit(1);
}
console.log(`${tests.length} Auth/Firestore integration tests passed.`);
