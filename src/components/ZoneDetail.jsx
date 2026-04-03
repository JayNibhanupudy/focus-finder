import React from 'react';
import { getNoiseColor, getNoiseTint, getNoiseLabel, getNoiseCategory } from '../utils/noiseUtils.js';
import './ZoneDetail.css';

export default function ZoneDetail({ zone, db, node, onClose }) {
  const isOffline = node?.status === 'offline';
  const isTamper  = !isOffline && node?.tamper;
  const color     = getNoiseColor(db, isTamper, isOffline);
  const label     = getNoiseLabel(db, isTamper, isOffline);
  const tint      = getNoiseTint(db, isTamper, isOffline);

  return (
    <div className="zone-detail-overlay" onClick={onClose}>
      <div className="zone-detail-sheet" onClick={e => e.stopPropagation()}>
        <div className="zone-detail-handle" />

        <div className="zone-detail-header">
          <div>
            <h2 className="zone-name">{zone.name}</h2>
            <p className="zone-loc">{zone.building} &middot; Floor {zone.floor}</p>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {isTamper && (
          <div className="alert-banner tamper">
            Tamper detected — sensor data may be unreliable
          </div>
        )}
        {isOffline && (
          <div className="alert-banner offline">
            Sensor offline — last reading unavailable
          </div>
        )}

        {/* Main dB display */}
        <div className="db-display" style={{ background: tint }}>
          {!isOffline && !isTamper ? (
            <>
              <span className="db-value" style={{ color }}>{db}</span>
              <span className="db-unit" style={{ color }}>dB</span>
              <span className="db-badge" style={{ background: color }}>{label}</span>
            </>
          ) : (
            <span className="db-na" style={{ color }}>{label}</span>
          )}
        </div>

        {/* Node metadata */}
        {node && (
          <div className="node-meta">
            <div className="meta-row">
              <span className="meta-label">Node ID</span>
              <span className="meta-value mono">{node.id}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Status</span>
              <span className={`status-pill ${node.status}`}>{node.status}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Battery</span>
              <BatteryBar pct={node.battery} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BatteryBar({ pct }) {
  const color = pct > 50 ? '#43A047' : pct > 20 ? '#FB8C00' : '#E53935';
  return (
    <div className="battery-wrap">
      <div className="battery-track">
        <div className="battery-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="battery-pct" style={{ color }}>{pct}%</span>
    </div>
  );
}
