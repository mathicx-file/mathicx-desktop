import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const checks = [];

const [config, flags, appCheck, client, rules, workflow] = await Promise.all([
  read('src/firebase/firebase-config.prod.js'),
  read('src/firebase/feature-flags.js'),
  read('src/firebase/firebase-app-check.js'),
  read('src/firebase/firebase-client.js'),
  read('firestore.rules'),
  read('.github/workflows/deploy-pages.yml'),
]);

check('production App Check is enabled', /appCheck:\s*\{[\s\S]*?enabled:\s*true/u.test(config));
check('production uses reCAPTCHA Enterprise', /provider:\s*['"]recaptcha-enterprise['"]/u.test(config));
check('production debug mode is disabled', /debug:\s*false/u.test(config));
check('production site key is configured', /siteKey:\s*['"]6L[A-Za-z0-9_-]{38}['"]/u.test(config));
check('App Check tokens auto-refresh', /isTokenAutoRefreshEnabled:\s*true/u.test(appCheck));
check('Firebase emulators are disabled in production', /firebaseEmulatorsEnabled:\s*false/u.test(flags));
check('Firebase Auth mode is active', /authMode:\s*['"]firebase['"]/u.test(flags));
check('App Check initializes before Auth', order(client, 'initializeFirebaseAppCheck(', 'getAuth(app)'));
check('App Check initializes before Firestore', order(client, 'initializeFirebaseAppCheck(', 'getFirestore(app)'));
check('admin authorization remains claim-based', /request\.auth\.token\.admin\s*==\s*true/u.test(rules));
check('admin audit remains server-only', /match \/adminAudit\/\{document=\*\*\}[\s\S]{0,100}allow read, write: if false/u.test(rules));
check('Pages workflow runs App Check tests', /npm run test:app-check/u.test(workflow));
check('Pages workflow runs admin claim tests', /npm run test:admin-claims/u.test(workflow));
check('Pages workflow runs the security baseline', /npm run test:security-baseline/u.test(workflow));
check('Pages artifact exists', await exists('_site/index.html'));
check('production Firebase config exists in Pages', await exists('_site/src/firebase/firebase-config.prod.js'));
check('privileged admin script is absent from Pages', !(await exists('_site/scripts/firebase/manage-admin.mjs')));
check('Firebase Admin SDK is absent from Pages', !(await exists('_site/node_modules/firebase-admin')));

const failures = checks.filter((item) => !item.ok);
console.log(JSON.stringify({
  phase: '17.5',
  technicalReady: failures.length === 0,
  checks,
  manualGates: [
    'Review App Check metrics for Cloud Firestore and Authentication.',
    'Confirm deliberate production sessions are verified and not invalid.',
    'Approve Cloud Firestore enforcement before changing the Console.',
    'Validate login and all three sync modules after propagation.',
    'Approve Authentication enforcement only after the Firestore stage is stable.',
  ],
}, null, 2));

assert.equal(failures.length, 0, `Rollout readiness failed: ${failures.map((item) => item.name).join(', ')}`);

function check(name, ok) {
  checks.push({ name, ok: ok === true });
}

function order(source, first, second) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  return firstIndex >= 0 && secondIndex > firstIndex;
}

function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}
