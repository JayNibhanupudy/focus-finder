import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import { generateHistoricalData, getChartColor } from '../utils/noiseUtils.js';
import { MIN_SAMPLES_PER_BUCKET, totalSampleCount } from '../utils/predictionModel.js';
import './HistoryView.css';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// UI index (0=Mon..6=Sun) -> JS getDay() index (0=Sun..6=Sat)
const DOW_UI_TO_JS = [1, 2, 3, 4, 5, 6, 0];

// Returns the current JS day (0=Sun…6=Sat) mapped to our Mon-first DAYS array index
function currentDayIndex() {
  const jsDay = new Date().getDay(); // 0=Sun
  return jsDay === 0 ? 6 : jsDay - 1; // Mon=0 … Sun=6
}

// Merge real bucket averages with the synthetic baseline: use real data when
// a bucket has enough samples, otherwise fall back to the heuristic so the
// chart stays complete.
function mergedHistoricalData(zone, zoneBuckets) {
  const synthetic = generateHistoricalData(zone);
  if (!zoneBuckets) return synthetic;

  return synthetic.map((dayEntry, uiDayIdx) => {
    const jsDow = DOW_UI_TO_JS[uiDayIdx];
    return {
      day: dayEntry.day,
      hours: dayEntry.hours.map((syntheticDb, hour) => {
        const cell = zoneBuckets[jsDow][hour];
        if (cell.count >= MIN_SAMPLES_PER_BUCKET) {
          return Math.round(cell.sum / cell.count);
        }
        return syntheticDb;
      }),
    };
  });
}

export default function HistoryView({ zones, buckets }) {
  const [selectedZoneId, setSelectedZoneId] = useState(zones[0]?.id ?? '');
  const [selectedDayIdx, setSelectedDayIdx] = useState(currentDayIndex());

  const zone = zones.find(z => z.id === selectedZoneId) ?? zones[0];

  const histData = useMemo(
    () => mergedHistoricalData(zone, buckets?.[zone.id]),
    [zone?.id, buckets],
  );

  const zoneSamples = totalSampleCount(buckets?.[zone.id]);

  const dayData = histData[selectedDayIdx];

  // Build chart data — label every other hour for readability
  const chartData = dayData.hours.map((db, hour) => ({
    hour: hour % 2 === 0 ? `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}${hour < 12 ? 'a' : 'p'}` : '',
    db,
    rawHour: hour,
  }));

  const currentHour = new Date().getHours();
  const isToday = selectedDayIdx === currentDayIndex();

  // Annotation: peak hour
  const peakHour = dayData.hours.reduce(
    (best, db, i) => db > best.db ? { db, i } : best,
    { db: 0, i: 0 }
  );

  return (
    <div className="history-view">
      <div className="view-header">
        <h2>Typical Noise Levels</h2>
        <p>Historical averages — same data used for predictions</p>
      </div>

      {/* Zone selector */}
      <div className="zone-selector-wrap">
        <select
          className="zone-select"
          value={selectedZoneId}
          onChange={e => setSelectedZoneId(e.target.value)}
        >
          {zones.map(z => (
            <option key={z.id} value={z.id}>
              {z.name} — {z.building === 'Marston Science Library' ? 'Marston' : 'Lib West'} F{z.floor}
            </option>
          ))}
        </select>
      </div>

      {/* Day tabs */}
      <div className="day-tabs">
        {DAYS.map((day, i) => (
          <button
            key={day}
            className={`day-tab ${selectedDayIdx === i ? 'active' : ''} ${i === currentDayIndex() ? 'today' : ''}`}
            onClick={() => setSelectedDayIdx(i)}
          >
            {day}
          </button>
        ))}
      </div>

      {/* Peak info */}
      <div className="peak-info">
        <div className="peak-stat">
          <span className="peak-label">Peak hour</span>
          <span className="peak-value">{formatHour(peakHour.i)}</span>
        </div>
        <div className="peak-stat">
          <span className="peak-label">Avg peak noise</span>
          <span className="peak-value" style={{ color: getChartColor(peakHour.db) }}>{peakHour.db} dB</span>
        </div>
        <div className="peak-stat">
          <span className="peak-label">Quietest period</span>
          <span className="peak-value">{getQuietPeriod(dayData.hours)}</span>
        </div>
      </div>

      {/* Bar chart */}
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} barCategoryGap="20%" margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 10, fill: '#9E9E9E' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[20, 90]}
              tick={{ fontSize: 10, fill: '#9E9E9E' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            {/* Threshold lines */}
            <ReferenceLine y={45} stroke="#43A047" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: 'Quiet', position: 'right', fontSize: 10, fill: '#43A047' }} />
            <ReferenceLine y={65} stroke="#E53935" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: 'Loud', position: 'right', fontSize: 10, fill: '#E53935' }} />
            {/* Current hour marker */}
            {isToday && (
              <ReferenceLine x={chartData[currentHour]?.hour || ''} stroke="#1a3a6b" strokeWidth={2} label={{ value: 'Now', position: 'top', fontSize: 10, fill: '#1a3a6b' }} />
            )}
            <Bar dataKey="db" radius={[3, 3, 0, 0]} maxBarSize={18}>
              {chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={getChartColor(entry.db)}
                  opacity={isToday && i > currentHour ? 0.35 : 0.9}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="chart-note">
        {zoneSamples > 0
          ? `Based on ${zoneSamples.toLocaleString()} readings from this zone — empty time slots filled with typical patterns`
          : 'Based on typical patterns — no sensor data yet for this zone'}
      </p>
      <p className="chart-note">
        Hours after current time shown at reduced opacity
      </p>
    </div>
  );
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { db, rawHour } = payload[0].payload;
  const color = getChartColor(db);
  return (
    <div className="chart-tooltip">
      <div className="tooltip-time">{formatHour(rawHour)}</div>
      <div className="tooltip-db" style={{ color }}>{db} dB</div>
    </div>
  );
}

function formatHour(h) {
  if (h === 0)  return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function getQuietPeriod(hours) {
  // Find the longest contiguous run of hours under 45 dB
  let best = { start: 0, len: 0 };
  let cur  = { start: 0, len: 0 };
  hours.forEach((db, i) => {
    if (db < 45) {
      if (cur.len === 0) cur.start = i;
      cur.len++;
      if (cur.len > best.len) best = { ...cur };
    } else {
      cur = { start: 0, len: 0 };
    }
  });
  if (best.len === 0) return 'None today';
  return `${formatHour(best.start)} – ${formatHour(best.start + best.len)}`;
}
