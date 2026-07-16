export const GUEST_MIGRATION_READY_KEY = 'mathicx.auth.guest-migration-ready.v1';

export function markGuestMigrationReady(storage = globalThis.localStorage, now = Date.now()) {
  const marker = { schemaVersion: 1, preparedAt: new Date(now).toISOString() };
  try {
    storage?.setItem(GUEST_MIGRATION_READY_KEY, JSON.stringify(marker));
    return marker;
  } catch {
    return null;
  }
}

export function getGuestMigrationReady(storage = globalThis.localStorage) {
  try {
    const marker = JSON.parse(storage?.getItem(GUEST_MIGRATION_READY_KEY) || 'null');
    return marker?.schemaVersion === 1 && !Number.isNaN(Date.parse(marker.preparedAt))
      ? marker
      : null;
  } catch {
    return null;
  }
}

export function clearGuestMigrationReady(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(GUEST_MIGRATION_READY_KEY);
  } catch {
    // O arquivo de backup continua sendo a fonte da migracao.
  }
}
