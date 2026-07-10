export const FINANCES_APP_ID = 'finances';
export const FINANCES_SYNC_SCHEMA_VERSION = 1;
export const FINANCES_BACKUP_FORMAT = 'finances-backup';

const COLLECTION_KEYS = [
  'profiles',
  'categories',
  'transactions',
  'installments',
  'recurring',
  'cards',
  'goals',
  'budgets',
  'transfers',
];

export function sanitizeFirestoreId(value, fallback = 'item') {
  const text = String(value || fallback)
    .trim()
    .replace(/[/.#[\]$]/g, '_')
    .slice(0, 260);
  return text || fallback;
}

export function buildSnapshotPayload(state, metadata = {}) {
  const snapshot = normalizeState(state);
  return cleanObject({
    appId: FINANCES_APP_ID,
    format: FINANCES_BACKUP_FORMAT,
    schemaVersion: FINANCES_SYNC_SCHEMA_VERSION,
    sourceSchemaVersion: snapshot.meta?.schema || 1,
    exportedAt: metadata.exportedAt || new Date().toISOString(),
    source: metadata.source || 'local-first',
    state: snapshot,
    counts: countStateRecords(snapshot),
  });
}

export function buildRemoteState(snapshotDoc) {
  if (!snapshotDoc || typeof snapshotDoc !== 'object') return null;
  const state = snapshotDoc.state;
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  return normalizeState(state);
}

export function buildRemoteSnapshot(snapshotDoc) {
  const state = buildRemoteState(snapshotDoc);
  if (!state) return null;
  return {
    state,
    revision: normalizeRevision(snapshotDoc.revision),
    updatedAt: normalizeTimestamp(snapshotDoc.updatedAt),
    source: String(snapshotDoc.source || 'remote'),
    counts: countStateRecords(state),
  };
}

export function normalizeRevision(value) {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

export function countStateRecords(state = {}) {
  return COLLECTION_KEYS.reduce((acc, key) => {
    acc[key] = Array.isArray(state[key]) ? state[key].length : 0;
    return acc;
  }, {
    settings: state.settings && typeof state.settings === 'object' ? 1 : 0,
  });
}

export function hasMeaningfulRemoteState(state) {
  if (!state || typeof state !== 'object') return false;
  return COLLECTION_KEYS.some((key) => Array.isArray(state[key]) && state[key].length > 0)
    || Boolean(state.settings && Object.keys(state.settings).length > 0);
}

export function normalizeState(state = {}) {
  const source = state && typeof state === 'object' ? state : {};
  return cleanObject({
    meta: source.meta || {},
    settings: source.settings || {},
    profiles: normalizeArray(source.profiles),
    categories: normalizeArray(source.categories),
    transactions: normalizeArray(source.transactions),
    installments: normalizeArray(source.installments),
    recurring: normalizeArray(source.recurring),
    cards: normalizeArray(source.cards),
    goals: normalizeArray(source.goals),
    budgets: normalizeArray(source.budgets),
    transfers: normalizeArray(source.transfers),
  });
}

export function cleanObject(value) {
  if (Array.isArray(value)) return value.map(cleanObject).filter((item) => item !== undefined);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, cleanObject(item)]),
  );
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.map(cleanObject) : [];
}

function normalizeTimestamp(value) {
  if (!value) return '';
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  return '';
}
