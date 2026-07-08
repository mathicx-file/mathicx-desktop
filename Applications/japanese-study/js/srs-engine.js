export const SRS_MAX_INTERVAL = 90;
export const SRS_MAX_EASE = 3;
export const SRS_MIN_EASE = 1.3;

export function createSrsRecord(charId, now = Date.now()) {
  return {
    schemaVersion: 1,
    entityType: 'srs-record',
    charId,
    state: 'new',
    nextReview: getDayKey(now),
    interval: 0,
    easeFactor: 2.5,
    repetitions: 0,
    lapses: 0,
    reviewBase: null,
    lastReviewedDay: null,
    lastReviewed: null,
    updatedAt: now
  };
}

export function calculateNextSrs(current, rating, now = Date.now()) {
  const quality = rating === 'easy' ? 5 : rating === 'good' ? 4 : 2;
  let easeFactor = clampNumber(current?.easeFactor || 2.5, SRS_MIN_EASE, SRS_MAX_EASE);
  let repetitions = clampInteger(current?.repetitions || 0, 0, 100);
  let interval = clampInteger(current?.interval || 0, 0, SRS_MAX_INTERVAL);
  let lapses = clampInteger(current?.lapses || 0, 0, 100);
  let state = current?.state || 'new';

  if (quality < 3) {
    repetitions = 0;
    interval = 1;
    lapses += 1;
    state = 'learning';
    easeFactor = clampNumber(easeFactor - 0.2, SRS_MIN_EASE, SRS_MAX_EASE);
  } else {
    repetitions += 1;
    easeFactor = clampNumber(
      easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
      SRS_MIN_EASE,
      SRS_MAX_EASE
    );

    if (rating === 'good') {
      interval = repetitions === 1 ? 1 : repetitions === 2 ? 3 : Math.round(interval * easeFactor);
    } else {
      interval = repetitions === 1 ? 3 : repetitions === 2 ? 7 : Math.round(interval * easeFactor * 1.25);
    }

    interval = clampInteger(interval, 1, SRS_MAX_INTERVAL);
    state = repetitions >= 5 && interval >= 21 ? 'mastered' : 'review';
  }

  return {
    state,
    nextReview: addDaysKey(interval, now),
    interval,
    easeFactor: Number(easeFactor.toFixed(2)),
    repetitions,
    lapses
  };
}

export function normalizeSrsRecord(record, charId, now = Date.now()) {
  const safe = record || createSrsRecord(charId, now);
  const state = ['new', 'learning', 'review', 'mastered'].includes(safe.state) ? safe.state : 'new';
  const interval = clampInteger(safe.interval || 0, 0, SRS_MAX_INTERVAL);
  const easeFactor = clampNumber(safe.easeFactor || 2.5, SRS_MIN_EASE, SRS_MAX_EASE);
  const repetitions = clampInteger(safe.repetitions || 0, 0, 100);
  const lapses = clampInteger(safe.lapses || 0, 0, 100);
  const nextReview = isValidDayKey(safe.nextReview) ? safe.nextReview : addDaysKey(interval, now);

  return {
    ...safe,
    schemaVersion: 1,
    entityType: 'srs-record',
    charId: safe.charId || charId,
    state,
    nextReview,
    interval,
    easeFactor,
    repetitions,
    lapses,
    reviewBase: safe.reviewBase ? pickSrsBase(safe.reviewBase, now) : null,
    lastReviewedDay: isValidDayKey(safe.lastReviewedDay) ? safe.lastReviewedDay : getDayKey(safe.lastReviewed, now),
    updatedAt: Number.isFinite(Number(safe.updatedAt)) ? Number(safe.updatedAt) : now
  };
}

export function pickSrsBase(record, now = Date.now()) {
  return {
    state: record?.state || 'new',
    nextReview: isValidDayKey(record?.nextReview) ? record.nextReview : getDayKey(now),
    interval: clampInteger(record?.interval || 0, 0, SRS_MAX_INTERVAL),
    easeFactor: clampNumber(record?.easeFactor || 2.5, SRS_MIN_EASE, SRS_MAX_EASE),
    repetitions: clampInteger(record?.repetitions || 0, 0, 100),
    lapses: clampInteger(record?.lapses || 0, 0, 100)
  };
}

export function calculateStreak(records, now = Date.now()) {
  const days = new Set((records || []).map(record => getDayKey(record.timestamp, now)));
  let streak = 0;
  const current = new Date(now);

  while (days.has(getDayKey(current.getTime(), now))) {
    streak++;
    current.setDate(current.getDate() - 1);
  }

  return streak;
}

export function clampInteger(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.round(number)));
}

export function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

export function isValidDayKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const time = new Date(value + 'T00:00:00').getTime();
  return Number.isFinite(time);
}

export function addDaysKey(days, now = Date.now()) {
  const date = new Date(now);
  date.setDate(date.getDate() + clampInteger(days, 0, SRS_MAX_INTERVAL));
  return getDayKey(date.getTime(), now);
}

export function getDayKey(timestamp, fallback = Date.now()) {
  const date = new Date(timestamp || fallback);
  if (!Number.isFinite(date.getTime())) {
    return getDayKey(fallback, Date.now());
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
