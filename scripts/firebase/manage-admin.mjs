import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import {
  assertSafeAdminRevocation,
  buildAdminClaims,
  parseAdminCommand,
} from './lib/admin-claims.mjs';

const USAGE = `
Uso:
  npm run firebase:admin -- show --email usuario@exemplo.com
  npm run firebase:admin -- grant --email usuario@exemplo.com [--apply]
  npm run firebase:admin -- revoke --uid UID [--apply] [--allow-no-admin]

Opcoes:
  --project ID    Projeto Firebase (padrao: mathicx-file-desktop)
  --actor NOME    Identificacao registrada na auditoria
  --apply         Executa a alteracao; sem esta flag, grant/revoke sao simulados
`;

async function main() {
  const options = parseAdminCommand(process.argv.slice(2));
  const app = getApps()[0] || initializeApp({
    credential: applicationDefault(),
    projectId: options.projectId,
  });
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const user = options.uid
    ? await auth.getUser(options.uid)
    : await auth.getUserByEmail(options.email);
  const currentClaims = user.customClaims || {};

  if (options.command === 'show') {
    printResult({ options, user, currentClaims, nextClaims: currentClaims, applied: false });
    return;
  }

  const shouldBeAdmin = options.command === 'grant';
  const nextClaims = buildAdminClaims(currentClaims, shouldBeAdmin);
  if (!shouldBeAdmin) {
    const adminUids = await listAdminUids(auth);
    assertSafeAdminRevocation({
      targetIsAdmin: currentClaims.admin === true,
      adminCount: adminUids.length,
      allowNoAdmin: options.allowNoAdmin,
    });
  }

  if (options.apply) {
    await auth.setCustomUserClaims(user.uid, nextClaims);
    await updateRoleProjection(firestore, user.uid, shouldBeAdmin);
    await firestore.collection('adminAudit').add({
      action: shouldBeAdmin ? 'admin.grant' : 'admin.revoke',
      actor: options.actor,
      targetUid: user.uid,
      targetEmail: user.email || null,
      previousAdmin: currentClaims.admin === true,
      nextAdmin: shouldBeAdmin,
      projectId: options.projectId,
      executedAt: FieldValue.serverTimestamp(),
      source: 'scripts/firebase/manage-admin.mjs',
    });
  }

  printResult({ options, user, currentClaims, nextClaims, applied: options.apply });
}

async function listAdminUids(auth) {
  const result = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    page.users.forEach((user) => {
      if (user.customClaims?.admin === true) result.push(user.uid);
    });
    pageToken = page.pageToken;
  } while (pageToken);
  return result;
}

async function updateRoleProjection(firestore, uid, shouldBeAdmin) {
  const profileRef = firestore.doc(`users/${uid}`);
  const profile = await profileRef.get();
  if (!profile.exists) return;
  await profileRef.update({
    role: shouldBeAdmin ? 'admin' : 'user',
    updatedAt: FieldValue.serverTimestamp(),
  });
}

function printResult({ options, user, currentClaims, nextClaims, applied }) {
  const changed = currentClaims.admin !== nextClaims.admin;
  const mode = options.command === 'show' ? 'consulta' : (applied ? 'aplicado' : 'simulacao');
  console.log(JSON.stringify({
    ok: true,
    mode,
    projectId: options.projectId,
    uid: user.uid,
    email: user.email || null,
    previousAdmin: currentClaims.admin === true,
    nextAdmin: nextClaims.admin === true,
    changed,
    tokenRefreshRequired: applied && changed,
  }, null, 2));
  if (!applied && options.command !== 'show') {
    console.log('\nNenhuma alteracao foi feita. Repita com --apply depois de revisar a simulacao.');
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  console.error(USAGE);
  process.exitCode = 1;
});
