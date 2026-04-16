import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import { predictNoise, getNoiseColor, getNoiseTint, getNoiseLabel, getChartColor } from '../utils/noiseUtils.js';
import { predictFromBuckets, totalSampleCount } from '../utils/predictionModel.js';
import './PredictView.css';

const ZONE_COLORS = ['#1a3a6b', '#FA4616', '#43A047', '#7B1FA2', '#0288D1'];

export default function PredictView({ noiseValues, nodes, nodeByZone, zones, buckets }) {
  const currentHour = new Date().getHours();

  // Predict dB for a zone N hours from now. Uses real bucket averages when
  // the (day, hour) cell has enough samples, otherwise falls back to the
  // hardcoded time-of-day heuristic.
  function predictFor(zone, hoursFromNow) {
    const target = new Date();
    target.setHours(target.getHours() + hoursFromNow);
    const heuristic = predictNoise(zone, hoursFromNow);
    return predictFromBuckets(buckets?.[zone.id], target, heuristic).db;
  }

  // Total real readings across all zones, for the "based on N readings" note.
  const totalReadings = Object.values(buckets || {})
    .reduce((sum, b) => sum + totalSampleCount(b), 0);

  // Only show zones with an online, non-tampered node
  const activeZones = zones.filter(z => {
    const node = nodeByZone[z.id];
    return node?.status === 'online' && !node?.tamper;
  });

  const [selectedZoneIds, setSelectedZoneIds] = useState(
    activeZones.slice(0, 3).map(z => z.id)
  );

  function toggleZone(id) {
    setSelectedZoneIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  // Build next-6-hours prediction data
  const chartData = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const hour = (currentHour + i) % 24;
      const label = i === 0 ? 'Now'
                  : hour === 0 ? '12a'
                  : hour === 12 ? '12p'
                  : hour < 12 ? `${hour}a` : `${hour - 12}p`;
      const entry = { label, hoursFromNow: i };
      zones.forEach(z => {
        entry[z.id] = i === 0
          ? (noiseValues[z.id] ?? predictFor(z, 0))
          : predictFor(z, i);
      });
      return entry;
    });
  }, [currentHour, noiseValues, zones, buckets]);

  // Best zone right now
  const bestNow = activeZones
    .sort((a, b) => (noiseValues[a.id] ?? 99) - (noiseValues[b.id] ?? 99))[0];

  // Zone that will be quietest in 2 hours
  const bestIn2 = activeZones
    .sort((a, b) => predictFor(a, 2) - predictFor(b, 2))[0];

  return (
    <div className="predict-view">
      <div className="view-header">
        <h2>Noise Predictions</h2>
        <p>Based on historical patterns for today</p>
      </div>

      {/* Recommendation cards */}
      <div className="rec-row">
        {bestNow && <RecommendCard
          label="Best right now"
          zone={bestNow}
          db={noiseValues[bestNow.id] ?? 45}
          hoursLabel="now"
        />}
        {bestIn2 && bestIn2.id !== bestNow?.id && <RecommendCard
          label="Best in 2 hrs"
          zone={bestIn2}
          db={predictFor(bestIn2, 2)}
          hoursLabel="in 2 hrs"
        />}
      </div>

      {/* Zone toggle pills */}
      <p className="section-label">Select zones to compare</p>
      <div className="zone-pills">
        {activeZones.map((z, i) => {
          const on = selectedZoneIds.includes(z.id);
          return (
            <button
              key={z.id}
              className={`zone-pill ${on ? 'on' : 'off'}`}
              style={on ? { background: ZONE_COLORS[i % ZONE_COLORS.length], borderColor: ZONE_COLORS[i % ZONE_COLORS.length] } : {}}
              onClick={() => toggleZone(z.id)}
            >
              {z.name}
            </button>
          );
        })}
      </div>

      {/* Line chart */}
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9E9E9E' }} axisLine={false} tickLine={false} />
            <YAxis domain={[20, 90]} tick={{ fontSize: 10, fill: '#9E9E9E' }} axisLine={false} tickLine={false} />
            <Tooltip content={<PredictTooltip zones={zones} />} />
            <ReferenceLine y={45} stroke="#43A047" strokeDasharray="4 3" strokeWidth={1.5} />
            <ReferenceLine y={65} stroke="#E53935" strokeDasharray="4 3" strokeWidth={1.5} />
            {activeZones.map((z, i) =>
              selectedZoneIds.includes(z.id) ? (
                <Line
                  key={z.id}
                  type="monotone"
                  dataKey={z.id}
                  stroke={ZONE_COLORS[i % ZONE_COLORS.length]}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: ZONE_COLORS[i % ZONE_COLORS.length], strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                  name={z.name}
                />
              ) : null
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="chart-note">
        Dashed lines: Quiet threshold (45 dB) &amp; Loud threshold (65 dB)
      </p>
      <p className="chart-note">
        {totalReadings > 0
          ? `Based on ${totalReadings.toLocaleString()} historical readings, with typical-pattern fallback for empty time slots`
          : 'Based on typical patterns — collecting data to train the model'}
      </p>

      {/* Per-zone next-hour summary */}
      <p className="section-label" style={{ marginTop: 20 }}>Zone outlook</p>
      <div className="outlook-list">
        {activeZones.map(z => {
          const now   = noiseValues[z.id] ?? predictFor(z, 0);
          const in1   = predictFor(z, 1);
          const trend = in1 > now + 3 ? 'up' : in1 < now - 3 ? 'down' : 'flat';
          return (
            <div key={z.id} className="outlook-row">
              <div className="outlook-info">
                <span className="outlook-name">{z.name}</span>
                <span className="outlook-loc">
                  {z.building === 'Marston Science Library' ? 'Marston' : 'Lib West'} F{z.floor}
                </span>
              </div>
              <div className="outlook-right">
                <span className="outlook-db" style={{ color: getNoiseColor(now) }}>{now} dB</span>
                <TrendArrow trend={trend} />
                <span className="outlook-label"
                  style={{
                    background: getNoiseTint(now),
                    color: getNoiseColor(now),
                  }}
                >
                  {getNoiseLabel(now)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecommendCard({ label, zone, db, hoursLabel }) {
  const color = getNoiseColor(db);
  const tint  = getNoiseTint(db);
  return (
    <div className="rec-card" style={{ background: tint }}>
      <span className="rec-label">{label}</span>
      <span className="rec-db" style={{ color }}>{db} dB</span>
      <span className="rec-name">{zone.name}</span>
      <span className="rec-loc">
        {zone.building === 'Marston Science Library' ? 'Marston' : 'Lib West'} · F{zone.floor}
      </span>
    </div>
  );
}

function TrendArrow({ trend }) {
  if (trend === 'up')   return <span className="trend up">&#x2191;</span>;
  if (trend === 'down') return <span className="trend down">&#x2193;</span>;
  return <span className="trend flat">&#x2192;</span>;
}

function PredictTooltip({ active, payload, label, zones }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="tooltip-time">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="tooltip-row">
          <span className="tooltip-dot" style={{ background: p.color }} />
          <span className="tooltip-name">{zones.find(z => z.id === p.dataKey)?.name}</span>
          <span className="tooltip-db" style={{ color: getChartColor(p.value) }}>{p.value} dB</span>
        </div>
      ))}
    </div>
  );
}
