// ─────────────────────────────────────────────────────────────────────────────
// LED colour decision: each ESP32 node shows green or red based on its dB
// *relative* to the other online nodes, not against an absolute threshold.
// Nodes at or below the cohort median are green; nodes above are red.
//
// A small hysteresis deadband keeps nodes that hover near the median from
// flipping on every reading. When fewer than two nodes are active there's
// nothing to compare against, so we fall back to an absolute quiet threshold.
//
// The result is written to /nodes/{firebaseId}/led_color in Firebase; the
// ESP32 GETs its own path and drives its LED accordingly.
// ─────────────────────────────────────────────────────────────────────────────

// Nodes within ± this many dB of the median keep their previous colour.
const HYSTERESIS_DB = 2;

// Minimum number of qualifying nodes before we use a relative comparison.
const MIN_NODES_FOR_COMPARISON = 2;

// Absolute-threshold fallback used when relative comparison isn't meaningful.
const QUIET_THRESHOLD_DB = 45;

// Compute the desired LED colour for every qualifying node.
//
//   nodes          — array with { firebaseId, zoneId, status, tamper }
//   noiseValues    — map of zoneId → current dB
//   previousColors — map of firebaseId → last-assigned colour (for hysteresis)
//
// Returns firebaseId → "green" | "red" for every node that currently qualifies.
// Nodes that do not qualify (offline, tampered, or missing a dB value) are
// omitted; callers leave their stored colour alone.
export function computeLedColors(nodes, noiseValues, previousColors = {}) {
  const qualifying = nodes
    .filter(n => n.firebaseId && n.status === 'online' && !n.tamper)
    .map(n => ({ firebaseId: n.firebaseId, db: noiseValues[n.zoneId] }))
    .filter(n => typeof n.db === 'number');

  if (qualifying.length === 0) return {};

  // Not enough nodes for a meaningful relative comparison — use absolute threshold.
  if (qualifying.length < MIN_NODES_FOR_COMPARISON) {
    const colors = {};
    qualifying.forEach(n => {
      colors[n.firebaseId] = n.db < QUIET_THRESHOLD_DB ? 'green' : 'red';
    });
    return colors;
  }

  const sortedDbs = qualifying.map(n => n.db).sort((a, b) => a - b);
  const mid = Math.floor(sortedDbs.length / 2);
  const median = sortedDbs.length % 2 === 0
    ? (sortedDbs[mid - 1] + sortedDbs[mid]) / 2
    : sortedDbs[mid];

  const colors = {};
  qualifying.forEach(n => {
    const diff = n.db - median;
    const prev = previousColors[n.firebaseId];
    if (Math.abs(diff) <= HYSTERESIS_DB && prev) {
      colors[n.firebaseId] = prev;
    } else {
      colors[n.firebaseId] = diff <= 0 ? 'green' : 'red';
    }
  });

  return colors;
}
