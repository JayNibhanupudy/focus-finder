import React from 'react';
import './NodesView.css';

export default function NodesView({ nodes, noiseValues, nodeByZone, zones }) {
  const zoneById = Object.fromEntries(zones.map(z => [z.id, z]));

  const online  = nodes.filter(n => n.status === 'online' && !n.tamper).length;
  const tampered = nodes.filter(n => n.tamper).length;
  const offline = nodes.filter(n => n.status === 'offline').length;

  return (
    <div className="nodes-view">
      <div className="view-header">
        <h2>Sensor Network</h2>
        <p>Live health status of all deployed nodes</p>
      </div>

      {/* Summary stats */}
      <div className="stats-row">
        <div className="stat-card green">
          <span className="stat-value">{online}</span>
          <span className="stat-label">Online</span>
        </div>
        <div className="stat-card orange">
          <span className="stat-value">{tampered}</span>
          <span className="stat-label">Alert</span>
        </div>
        <div className="stat-card gray">
          <span className="stat-value">{offline}</span>
          <span className="stat-label">Offline</span>
        </div>
        <div className="stat-card blue">
          <span className="stat-value">{nodes.length}</span>
          <span className="stat-label">Total</span>
        </div>
      </div>

      {/* Alert banner if any tamper/offline */}
      {(tampered > 0 || offline > 0) && (
        <div className="nodes-alert">
          {tampered > 0 && <span>{tampered} node{tampered > 1 ? 's' : ''} reporting tamper activity</span>}
          {tampered > 0 && offline > 0 && <span> &middot; </span>}
          {offline  > 0 && <span>{offline} node{offline > 1 ? 's' : ''} offline</span>}
        </div>
      )}

      {/* Node list */}
      <div className="node-list">
        {nodes.map(node => {
          const zone = zoneById[node.zoneId];
          const db   = noiseValues[node.zoneId];
          const isOffline = node.status === 'offline';
          const isTamper  = !isOffline && node.tamper;

          return (
            <div
              key={node.id}
              className={`node-card ${isTamper ? 'tamper' : isOffline ? 'offline' : 'ok'}`}
            >
              <div className="node-status-dot-wrap">
                <span className={`node-dot ${isTamper ? 'tamper' : isOffline ? 'offline' : 'online'}`} />
              </div>

              <div className="node-info">
                <div className="node-id-row">
                  <span className="node-id">{node.id}</span>
                  {isTamper  && <span className="node-badge tamper">TAMPER</span>}
                  {isOffline && <span className="node-badge offline">OFFLINE</span>}
                </div>
                <div className="node-zone">
                  {zone ? `${zone.name} — ${zone.building === 'Marston Science Library' ? 'Marston' : 'Lib West'} F${zone.floor}` : node.zoneId}
                </div>
              </div>

              <div className="node-right">
                {!isOffline && db != null && (
                  <div className="node-db">{db} dB</div>
                )}
                <BatteryIndicator pct={node.battery} />
              </div>
            </div>
          );
        })}
      </div>

      <p className="nodes-note">
        Nodes report every 15 seconds via HTTP POST over HTTPS &middot; Data stored in Firebase
      </p>
    </div>
  );
}

function BatteryIndicator({ pct }) {
  const color = pct > 50 ? '#43A047' : pct > 20 ? '#FB8C00' : '#E53935';
  return (
    <div className="batt-wrap">
      <div className="batt-outline">
        <div className="batt-cap" />
        <div className="batt-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="batt-pct" style={{ color }}>{pct}%</span>
    </div>
  );
}
