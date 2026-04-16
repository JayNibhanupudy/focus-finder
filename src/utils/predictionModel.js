// ─────────────────────────────────────────────────────────────────────────────
// Prediction model: hourly noise averages bucketed by (day-of-week, hour).
//
// Each reading is grouped by the day-of-week and hour it was taken. The mean
// dB for each of the 168 (7 × 24) buckets becomes the prediction for that
// time slot. When a bucket has too few samples to trust, callers fall back to
// the hardcoded time-of-day heuristic in noiseUtils.js.
//
// Inspired by Google's "popular times" / "usually busy" feature.
// ─────────────────────────────────────────────────────────────────────────────

// A bucket needs at least this many samples before its average is used.
export const MIN_SAMPLES_PER_BUCKET = 3;

// Firebase push-key charset — the first 8 chars of a push key encode
// milliseconds-since-epoch as a base-64 number.
const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';

export function pushKeyToTimestamp(key) {
  if (!key || key.length < 8) return 0;
  let ts = 0;
  for (let i = 0; i < 8; i++) {
    const idx = PUSH_CHARS.indexOf(key[i]);
    if (idx < 0) return 0;
    ts = ts * 64 + idx;
  }
  return ts;
}

// Build a bucket grid [dayOfWeek 0-6][hour 0-23] = { sum, count } from a map
// of Firebase push-key → reading object. Readings without a noise_db value
// are ignored.
export function buildZoneBuckets(readingsMap) {
  const buckets = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ sum: 0, count: 0 }))
  );
  if (!readingsMap) return buckets;

  Object.entries(readingsMap).forEach(([key, reading]) => {
    if (reading?.noise_db == null) return;
    const ts = pushKeyToTimestamp(key);
    if (!ts) return;
    const date = new Date(ts);
    const dow = date.getDay();
    const hour = date.getHours();
    buckets[dow][hour].sum += reading.noise_db;
    buckets[dow][hour].count += 1;
  });

  return buckets;
}

export function bucketAverage(buckets, dayOfWeek, hour) {
  const cell = buckets?.[dayOfWeek]?.[hour];
  if (!cell || cell.count < MIN_SAMPLES_PER_BUCKET) return null;
  return cell.sum / cell.count;
}

// Return { db, source } for a zone at the given target time.
// source is 'historical' when the bucket had enough samples, 'heuristic' otherwise.
export function predictFromBuckets(zoneBuckets, targetDate, heuristicFallback) {
  const dow = targetDate.getDay();
  const hour = targetDate.getHours();
  const avg = bucketAverage(zoneBuckets, dow, hour);
  if (avg != null) {
    return { db: Math.round(avg), source: 'historical' };
  }
  return { db: heuristicFallback, source: 'heuristic' };
}

export function totalSampleCount(buckets) {
  if (!buckets) return 0;
  let total = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) total += buckets[d][h].count;
  }
  return total;
}
