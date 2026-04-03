import React, { useState } from 'react';
import { FLOORS, BUILDING_NAME, floorPlans } from '../data/mockData.js';
import { getZoneFill, getNoiseColor, getNoiseTint, predictNoise } from '../utils/noiseUtils.js';
import ZoneDetail from './ZoneDetail.jsx';
import './MapView.css';

const TIME_OPTIONS = [
  { label: 'Now',   offset: 0 },
  { label: '+1 hr', offset: 1 },
  { label: '+2 hr', offset: 2 },
];

export default function MapView({ noiseValues, nodes, nodeByZone, zones }) {
  const [floor, setFloor]               = useState(FLOORS[0].number);
  const [timeOffset, setTimeOffset]     = useState(0);
  const [selectedZoneId, setSelectedZoneId] = useState(null);

  function getDisplayNoise(zoneId) {
    if (timeOffset === 0) return noiseValues[zoneId] ?? 45;
    const zone = zones.find(z => z.id === zoneId);
    return zone ? predictNoise(zone, timeOffset) : (noiseValues[zoneId] ?? 45);
  }

  // Top 3 quietest zones that are online and not tampered
  const bestSpots = [...zones]
    .filter(z => {
      const node = nodeByZone[z.id];
      return node?.status === 'online' && !node?.tamper;
    })
    .sort((a, b) => (noiseValues[a.id] ?? 99) - (noiseValues[b.id] ?? 99))
    .slice(0, 3);

  const plan = floorPlans[floor];
  const selectedZone = selectedZoneId ? zones.find(z => z.id === selectedZoneId) : null;

  return (
    <div className="map-view">
      {/* Best Spots */}
      <div className="best-spots">
        <p className="best-spots-title">Quiet right now</p>
        <div className="best-spots-row">
          {bestSpots.map(zone => {
            const db = noiseValues[zone.id] ?? 45;
            const floorMeta = FLOORS.find(f => f.number === zone.floor);
            return (
              <button
                key={zone.id}
                className="best-spot-card"
                style={{ background: getNoiseTint(db) }}
                onClick={() => {
                  setFloor(zone.floor);
                  setSelectedZoneId(zone.id);
                  setTimeOffset(0);
                }}
              >
                <span className="best-spot-db" style={{ color: getNoiseColor(db) }}>{db} dB</span>
                <span className="best-spot-name">{zone.name}</span>
                <span className="best-spot-loc">
                  {floorMeta ? floorMeta.shortLabel : `F${zone.floor}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Floor + time offset controls */}
      <div className="controls-row">
        <div className="floor-btns">
          {FLOORS.map(f => (
            <button
              key={f.number}
              className={`floor-btn ${floor === f.number ? 'active' : ''}`}
              onClick={() => { setFloor(f.number); setSelectedZoneId(null); }}
            >
              {f.shortLabel}
            </button>
          ))}
        </div>
        <div className="time-btns">
          {TIME_OPTIONS.map(opt => (
            <button
              key={opt.offset}
              className={`time-btn ${timeOffset === opt.offset ? 'active' : ''}`}
              onClick={() => setTimeOffset(opt.offset)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {timeOffset > 0 && (
        <div className="predict-banner">
          Showing predicted noise in {timeOffset} hour{timeOffset > 1 ? 's' : ''}
        </div>
      )}

      {/* Floor plan */}
      <div className="floorplan-wrap">
        {plan ? (
          <FloorPlanSVG
            plan={plan}
            getDisplayNoise={getDisplayNoise}
            nodeByZone={nodeByZone}
            selectedZoneId={selectedZoneId}
            onZoneSelect={setSelectedZoneId}
          />
        ) : (
          <p className="no-plan">Floor plan not available</p>
        )}
      </div>

      {/* Legend */}
      <div className="legend">
        <span className="legend-item"><span className="legend-dot" style={{ background: '#43A047' }} />Quiet &lt;45 dB</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: '#FB8C00' }} />Moderate 45–65</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: '#E53935' }} />Loud &gt;65 dB</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: '#9E9E9E' }} />No data</span>
      </div>

      {/* Zone detail panel */}
      {selectedZone && (
        <ZoneDetail
          zone={selectedZone}
          db={noiseValues[selectedZone.id] ?? 45}
          node={nodeByZone[selectedZone.id]}
          onClose={() => setSelectedZoneId(null)}
        />
      )}
    </div>
  );
}

// ─── SVG floor plan ────────────────────────────────────────────────────────────
function FloorPlanSVG({ plan, getDisplayNoise, nodeByZone, selectedZoneId, onZoneSelect }) {
  return (
    <svg viewBox="0 0 420 300" style={{ width: '100%', height: 'auto', display: 'block' }}>
      {/* Outer background */}
      <rect x="0" y="0" width="420" height="300" fill="#E4E8EE" />

      {/* Building footprint */}
      <path d={plan.buildingPath} fill="#F0F2F5" stroke="#B0BEC5" strokeWidth="1.5" />

      {plan.rooms.map(room => {
        // ── Non-interactive rooms (hallways, service areas) ────────────────
        if (!room.interactive) {
          return (
            <g key={room.roomId}>
              <rect
                x={room.x} y={room.y} width={room.w} height={room.h}
                rx="3" fill={room.fill || '#D8D8D8'}
                stroke="rgba(0,0,0,0.06)" strokeWidth="0.5"
              />
              {room.dividers && renderDividers(room, 'rgba(0,0,0,0.12)')}
              {room.label && (
                <text
                  x={room.x + room.w / 2}
                  y={room.y + room.h / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="9"
                  fill="#999"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {room.label}
                </text>
              )}
            </g>
          );
        }

        // ── Interactive (sensor) zones ─────────────────────────────────────
        const node      = nodeByZone[room.zoneId];
        const isOffline = node?.status === 'offline';
        const isTamper  = !isOffline && node?.tamper;
        const db        = getDisplayNoise(room.zoneId);
        const fill      = getZoneFill(db, isTamper, isOffline);
        const isSelected = room.zoneId === selectedZoneId;

        const cx = room.x + room.w / 2;
        const cy = room.y + room.h / 2;

        const statusText = isOffline ? 'OFFLINE'
                         : isTamper  ? 'UNRELIABLE'
                         : `${db} dB`;

        return (
          <g key={room.roomId} style={{ cursor: 'pointer' }} onClick={() => onZoneSelect(room.zoneId)}>
            {/* Selection glow */}
            {isSelected && (
              <rect
                x={room.x - 2} y={room.y - 2}
                width={room.w + 4} height={room.h + 4}
                rx="7" fill="none"
                stroke="#1a3a6b" strokeWidth="3" opacity="0.6"
              />
            )}

            <rect
              x={room.x} y={room.y} width={room.w} height={room.h}
              rx="5"
              fill={fill}
              fillOpacity="0.88"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1"
            />

            {/* Divider lines (study room partitions) */}
            {room.dividers && renderDividers(room, 'rgba(255,255,255,0.35)')}

            {/* Zone label */}
            {room.label && (
              room.rotateLabel ? (
                // For rotated narrow columns: offset label up by 30px to leave room for dB below
                <text
                  x={cx}
                  y={room.showStats ? cy - 30 : cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill="white"
                  transform={`rotate(-90, ${cx}, ${room.showStats ? cy - 30 : cy})`}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {room.label}
                </text>
              ) : (
                <text
                  x={cx}
                  y={room.showStats ? cy - 11 : cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={room.w < 80 ? 9 : 11}
                  fontWeight="600"
                  fill="white"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {room.label}
                </text>
              )
            )}

            {/* dB / status readout */}
            {room.showStats && !room.rotateLabel && (
              <text
                x={cx}
                y={cy + 10}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={isOffline || isTamper ? 9 : 14}
                fontWeight="700"
                fill="white"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {statusText}
              </text>
            )}

            {/* Rotated dB — offset down by 30px so it clears the label above */}
            {room.showStats && room.rotateLabel && (
              <text
                x={cx}
                y={cy + 30}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={isOffline || isTamper ? 8 : 11}
                fontWeight="700"
                fill="white"
                transform={`rotate(-90, ${cx}, ${cy + 30})`}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {statusText}
              </text>
            )}

            {/* Tamper badge */}
            {isTamper && (
              <g>
                <circle cx={room.x + room.w - 11} cy={room.y + 11} r="9" fill="#FF5722" />
                <text
                  x={room.x + room.w - 11} y={room.y + 11}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="11" fontWeight="800" fill="white"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >!</text>
              </g>
            )}

            {/* Offline badge */}
            {isOffline && (
              <g>
                <circle cx={room.x + room.w - 11} cy={room.y + 11} r="9" fill="#616161" />
                <line
                  x1={room.x + room.w - 15} y1={room.y + 11}
                  x2={room.x + room.w - 7}  y2={room.y + 11}
                  stroke="white" strokeWidth="2.5" strokeLinecap="round"
                />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Divider line renderer ─────────────────────────────────────────────────────
function renderDividers(room, stroke) {
  const count = room.dividerCount ?? 2;
  const lines = [];
  if (room.dividerOrientation === 'vertical') {
    const spacing = room.w / count;
    for (let i = 1; i < count; i++) {
      const lx = room.x + spacing * i;
      lines.push(
        <line
          key={`div-v-${i}`}
          x1={lx} y1={room.y + 1}
          x2={lx} y2={room.y + room.h - 1}
          stroke={stroke} strokeWidth="1"
        />
      );
    }
  } else {
    const spacing = room.h / count;
    for (let i = 1; i < count; i++) {
      const ly = room.y + spacing * i;
      lines.push(
        <line
          key={`div-h-${i}`}
          x1={room.x + 1} y1={ly}
          x2={room.x + room.w - 1} y2={ly}
          stroke={stroke} strokeWidth="1"
        />
      );
    }
  }
  return lines;
}
