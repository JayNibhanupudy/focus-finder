// Noise level multipliers by hour of day (0–23).
// 1.0 = base peak level. Values <1 represent quieter periods.
const TIME_MULTIPLIERS = [
  0.38, 0.35, 0.33, 0.32, 0.33, 0.40, // 12am–5am
  0.55, 0.72, 0.92, 1.10, 1.22, 1.28, // 6am–11am
  1.32, 1.25, 1.18, 1.22, 1.18, 1.05, // 12pm–5pm
  0.92, 0.85, 0.75, 0.65, 0.55, 0.45, // 6pm–11pm
];

export function getTimeMultiplier(hour) {
  return TIME_MULTIPLIERS[hour] ?? 0.5;
}

// Deterministic pseudo-random using a seed value.
// Used for historical data so charts look the same every page load.
function seededRandom(seed) {
  let t = (seed ^ 0x6D2B79F5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Compute initial noise for a zone based on the current hour.
export function computeInitialNoise(zone) {
  const hour = new Date().getHours();
  const mult = getTimeMultiplier(hour);
  const base = zone.baseNoise * mult;
  const rand = (Math.random() - 0.5) * zone.variance;
  return Math.round(Math.max(22, Math.min(90, base + rand)));
}

// Drift noise value slightly each 15-second tick — simulates live sensor data.
// The value slowly pulls toward the expected level for the current time.
export function walkNoise(current, zone) {
  const hour = new Date().getHours();
  const expected = zone.baseNoise * getTimeMultiplier(hour);
  const drift = (expected - current) * 0.15;
  const randomWalk = (Math.random() - 0.5) * 5;
  return Math.round(Math.max(22, Math.min(90, current + drift + randomWalk)));
}

// Predict average noise for a zone N hours from now using historical baseline.
export function predictNoise(zone, hoursFromNow) {
  const now = new Date();
  const targetHour = (now.getHours() + hoursFromNow) % 24;
  const isWeekend = [0, 6].includes(now.getDay());
  const weekendFactor = isWeekend ? 0.73 : 1.0;
  const mult = getTimeMultiplier(targetHour) * weekendFactor;
  return Math.round(Math.max(22, Math.min(90, zone.baseNoise * mult)));
}

// Generate a full week of deterministic hourly averages for a zone.
// Used by the History and Predict views.
export function generateHistoricalData(zone) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const zoneHash = zone.id.split('').reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 7);

  return days.map((day, dayIndex) => {
    const isWeekend = dayIndex >= 5;
    const weekendFactor = isWeekend ? 0.73 : 1.0;
    return {
      day,
      hours: Array.from({ length: 24 }, (_, hour) => {
        const mult = getTimeMultiplier(hour) * weekendFactor;
        const base = zone.baseNoise * mult;
        const seed = zoneHash + dayIndex * 1000 + hour * 37;
        const variation = (seededRandom(seed) - 0.5) * zone.variance;
        return Math.round(Math.max(22, Math.min(90, base + variation)));
      }),
    };
  });
}

// ─── Colour helpers ────────────────────────────────────────────────────────────

export function getNoiseCategory(db) {
  if (db < 45) return 'quiet';
  if (db < 65) return 'moderate';
  return 'loud';
}

// SVG fill colour for floor-plan zones
export function getZoneFill(db, tamper = false, offline = false) {
  if (offline) return '#B0B0B0';
  if (tamper)  return '#9E9E9E';
  if (db < 45) return '#43A047';
  if (db < 65) return '#FB8C00';
  return '#E53935';
}

// Lighter background tint used in cards
export function getNoiseTint(db, tamper = false, offline = false) {
  if (offline || tamper) return '#F5F5F5';
  if (db < 45) return '#E8F5E9';
  if (db < 65) return '#FFF3E0';
  return '#FFEBEE';
}

// Text / badge colour
export function getNoiseColor(db, tamper = false, offline = false) {
  if (offline) return '#757575';
  if (tamper)  return '#616161';
  if (db < 45) return '#2E7D32';
  if (db < 65) return '#E65100';
  return '#B71C1C';
}

export function getNoiseLabel(db, tamper = false, offline = false) {
  if (offline) return 'Offline';
  if (tamper)  return 'Unreliable';
  if (db < 45) return 'Quiet';
  if (db < 65) return 'Moderate';
  return 'Loud';
}

// Colour for recharts bars / lines
export function getChartColor(db) {
  if (db < 45) return '#43A047';
  if (db < 65) return '#FB8C00';
  return '#E53935';
}
