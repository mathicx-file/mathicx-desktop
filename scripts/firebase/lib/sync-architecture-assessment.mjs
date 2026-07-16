export const FIRESTORE_DOCUMENT_LIMIT_BYTES = 1_048_576;

export const DEFAULT_SYNC_THRESHOLDS = Object.freeze({
  snapshotReviewBytes: 524_288,
  snapshotCriticalBytes: 786_432,
  recordCount: 5_000,
  conflicts30d: 3,
  syncP95Ms: 1_500,
  collaborators: 2,
});

export const CURRENT_SYNC_MODULES = Object.freeze([
  {
    appId: 'desktop',
    model: 'single-settings-document',
    atomicity: 'settings-document',
    debounceMs: 600,
    alreadyGranular: false,
  },
  {
    appId: 'japanese-study',
    model: 'domain-documents',
    atomicity: 'batched-domain-write',
    debounceMs: 1_800,
    alreadyGranular: true,
  },
  {
    appId: 'finances',
    model: 'transactional-snapshot',
    atomicity: 'full-snapshot',
    debounceMs: 1_800,
    alreadyGranular: false,
    revisionProtected: true,
  },
]);

export function assessSyncArchitecture({
  modules = CURRENT_SYNC_MODULES,
  metrics = {},
  thresholds = DEFAULT_SYNC_THRESHOLDS,
} = {}) {
  const assessments = modules.map((module) => assessModule(module, metrics[module.appId], thresholds));
  return {
    decision: assessments.some((item) => item.reviewRequired)
      ? 'review-triggered'
      : 'keep-current-and-measure',
    firestoreDocumentLimitBytes: FIRESTORE_DOCUMENT_LIMIT_BYTES,
    thresholds: { ...thresholds },
    modules: assessments,
  };
}

function assessModule(module, rawMetrics, thresholds) {
  const measured = normalizeMetrics(rawMetrics);
  const triggers = [];

  if (measured.collaborators >= thresholds.collaborators) {
    triggers.push('collaboration-demand');
  }

  if (module.model === 'transactional-snapshot') {
    if (measured.payloadBytes >= thresholds.snapshotCriticalBytes) triggers.push('snapshot-critical-size');
    else if (measured.payloadBytes >= thresholds.snapshotReviewBytes) triggers.push('snapshot-review-size');
    if (measured.recordCount >= thresholds.recordCount) triggers.push('record-volume');
    if (measured.conflicts30d >= thresholds.conflicts30d) triggers.push('recurring-conflicts');
    if (measured.syncP95Ms >= thresholds.syncP95Ms) triggers.push('sync-latency');
  }

  const reviewRequired = triggers.length > 0;
  return {
    ...module,
    metricsAvailable: rawMetrics != null,
    metrics: measured,
    triggers,
    reviewRequired,
    recommendation: recommendationFor(module, triggers),
  };
}

function normalizeMetrics(value = {}) {
  return {
    payloadBytes: nonNegativeNumber(value?.payloadBytes),
    recordCount: nonNegativeNumber(value?.recordCount),
    conflicts30d: nonNegativeNumber(value?.conflicts30d),
    syncP95Ms: nonNegativeNumber(value?.syncP95Ms),
    collaborators: nonNegativeNumber(value?.collaborators),
  };
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function recommendationFor(module, triggers) {
  if (triggers.includes('collaboration-demand')) return 'review-realtime-and-collaboration';
  if (module.model === 'transactional-snapshot' && triggers.length > 0) {
    return 'review-finances-granularization';
  }
  if (module.alreadyGranular) return 'keep-domain-documents';
  return 'keep-current-model';
}
