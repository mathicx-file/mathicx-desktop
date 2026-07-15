import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RUNTIME_ROOTS = ['src', 'Applications'];
const SOURCE_EXTENSIONS = new Set(['.html', '.js', '.json', '.mjs', '.yaml', '.yml']);
const IGNORED_PARTS = new Set(['data', 'node_modules', 'test', 'tests', 'vendor']);

test('Firestore rules keep approval, ownership and admin claims server-enforced', async () => {
  const rules = await read('firestore.rules');
  assert.match(rules, /request\.auth\.token\.admin\s*==\s*true/u);
  assert.match(rules, /request\.auth\.uid\s*==\s*userId/u);
  assert.match(rules, /request\.resource\.data\.accessStatus\s*==\s*'pending'/u);
  assert.match(rules, /request\.resource\.data\.role\s*==\s*'user'/u);
  assert.match(rules, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/u);
});

test('production baseline cannot silently select local auth or Firebase emulators', async () => {
  const flags = await read('src/firebase/feature-flags.js');
  assert.match(flags, /authMode:\s*'firebase'/u);
  assert.match(flags, /firebaseEmulatorsEnabled:\s*false/u);
  assert.match(flags, /firestoreDesktopReadEnabled:\s*true/u);
  assert.match(flags, /firestoreJapaneseReadEnabled:\s*true/u);
  assert.match(flags, /firestoreFinancesReadEnabled:\s*true/u);
});

test('runtime postMessage calls do not use a wildcard target origin', async () => {
  const files = await runtimeFiles();
  const violations = [];
  for (const file of files) {
    const source = await readAbsolute(file);
    if (/postMessage\s*\([\s\S]{0,300}?,\s*['"]\*['"]\s*(?:,|\))/u.test(source)) {
      violations.push(relative(file));
    }
  }
  assert.deepEqual(violations, []);
});

test('integrated iframes use the supported storage-access sandbox token', async () => {
  const source = await read('src/apps/integration/iframe-app.js');
  assert.match(source, /['"]allow-storage-access-by-user-activation['"]/u);
  assert.doesNotMatch(source, /['"]allow-storage['"]/u);
});

test('runtime sources contain no private keys or assigned App Check debug tokens', async () => {
  const files = await runtimeFiles();
  const violations = [];
  const secretPatterns = [
    /-----BEGIN (?:RSA |EC |)PRIVATE KEY-----/u,
    /["']private_key["']\s*:/u,
    /FIREBASE_APPCHECK_DEBUG_TOKEN\s*[:=]\s*["'][^"']+["']/u,
  ];
  for (const file of files) {
    const source = await readAbsolute(file);
    if (secretPatterns.some((pattern) => pattern.test(source))) violations.push(relative(file));
  }
  assert.deepEqual(violations, []);
});

test('gitignore protects privileged Firebase and local environment files', async () => {
  const ignore = await read('.gitignore');
  for (const expected of [
    'serviceAccountKey.json',
    '*-firebase-adminsdk-*.json',
    'app-check-debug-token*',
    '.env.*',
  ]) {
    assert.ok(ignore.includes(expected), `Missing .gitignore protection: ${expected}`);
  }
});

async function runtimeFiles() {
  const files = [];
  for (const root of RUNTIME_ROOTS) await walk(path.join(ROOT, root), files);
  return files;
}

async function walk(directory, files) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_PARTS.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(target, files);
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(target);
  }
}

function read(file) {
  return readAbsolute(path.join(ROOT, file));
}

function readAbsolute(file) {
  return readFile(file, 'utf8');
}

function relative(file) {
  return path.relative(ROOT, file).replaceAll('\\', '/');
}
