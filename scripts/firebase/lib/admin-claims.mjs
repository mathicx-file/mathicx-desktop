export function buildAdminClaims(currentClaims, shouldBeAdmin) {
  const nextClaims = { ...(currentClaims || {}) };
  if (shouldBeAdmin) nextClaims.admin = true;
  else delete nextClaims.admin;
  return nextClaims;
}

export function assertSafeAdminRevocation({ targetIsAdmin, adminCount, allowNoAdmin }) {
  if (targetIsAdmin && adminCount <= 1 && !allowNoAdmin) {
    throw new Error(
      'Operacao recusada: este e o ultimo administrador. '
      + 'Conceda o papel a outra conta antes ou use --allow-no-admin conscientemente.',
    );
  }
}

export function parseAdminCommand(argv) {
  const [command, ...tokens] = argv;
  const options = {
    command,
    apply: false,
    allowNoAdmin: false,
    projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'mathicx-file-desktop',
    actor: process.env.USERNAME || process.env.USER || 'local-admin-script',
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--apply') options.apply = true;
    else if (token === '--allow-no-admin') options.allowNoAdmin = true;
    else if (['--uid', '--email', '--project', '--actor'].includes(token)) {
      const value = tokens[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Valor ausente para ${token}.`);
      index += 1;
      if (token === '--uid') options.uid = value;
      if (token === '--email') options.email = value.trim().toLowerCase();
      if (token === '--project') options.projectId = value;
      if (token === '--actor') options.actor = value;
    } else {
      throw new Error(`Opcao desconhecida: ${token}`);
    }
  }

  if (!['show', 'grant', 'revoke'].includes(command)) {
    throw new Error('Comando invalido. Use show, grant ou revoke.');
  }
  if (!!options.uid === !!options.email) {
    throw new Error('Informe exatamente um identificador: --uid ou --email.');
  }
  return options;
}
