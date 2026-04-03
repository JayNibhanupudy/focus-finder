import React, { useState, useEffect, useMemo } from 'react';
import { ref, onValue, query, limitToLast } from 'firebase/database';
import { db } from './firebase.js';
import Header from './components/Header.jsx';
import NavBar from './components/NavBar.jsx';
import MapView from './components/MapView.jsx';
import HistoryView from './components/HistoryView.jsx';
import PredictView from './components/PredictView.jsx';
import NodesView from './components/NodesView.jsx';
import { zones, nodes } from './data/mockData.js';
import { computeInitialNoise, walkNoise } from './utils/noiseUtils.js';
import './App.css';

// Build a lookup: firebaseId -> static node definition
const FB_ID_TO_NODE = {};
nodes.forEach(n => { if (n.firebaseId) FB_ID_TO_NODE[n.firebaseId] = n; });

function buildInitialNoise() {
  const result = {};
  zones.forEach(zone => { result[zone.id] = computeInitialNoise(zone); });
  return result;
}

export default function App() {
  const [activeTab, setActiveTab]     = useState('map');
  const [noiseValues, setNoiseValues] = useState(buildInitialNoise);
  const [liveNodes, setLiveNodes]     = useState([...nodes]);
  const [secondsSince, setSecondsSince] = useState(0);

  useEffect(() => {
    // ── Firebase listeners — one per node at nodes/$nodeId ─────────────────
    // The DB rules allow reading individual nodes but not the whole /nodes tree,
    // so we subscribe to each path separately.
    const nodesWithFirebase = nodes.filter(n => n.firebaseId);
    const fbNodeIds = new Set(nodesWithFirebase.map(n => n.firebaseId));

    const unsubscribers = nodesWithFirebase.map(node => {
      // /readings/{firebaseId} holds push-key children; grab the latest one.
      const readingsRef = query(ref(db, `readings/${node.firebaseId}`), limitToLast(1));
      return onValue(readingsRef, (snapshot) => {
        if (!snapshot.exists()) return;
        // limitToLast(1) returns a single child; grab its value.
        let reading;
        snapshot.forEach(child => { reading = child.val(); });
        if (!reading) return;

        if (reading.noise_db != null) {
          setNoiseValues(prev => ({
            ...prev,
            [node.zoneId]: Math.round(reading.noise_db),
          }));
        }

        setLiveNodes(prev => prev.map(n =>
          n.id !== node.id ? n : {
            ...n,
            battery: reading.battery_pct ?? n.battery,
            tamper:  reading.tamper      ?? n.tamper,
            status:  'online',
          }
        ));

        setSecondsSince(0);
      });
    });

    // ── Mock walk for nodes not yet in Firebase (keeps demo looking alive) ─
    const mockTimer = setInterval(() => {
      setNoiseValues(prev => {
        const next = { ...prev };
        nodes.forEach(node => {
          if (!fbNodeIds.has(node.firebaseId)) {
            const zone = zones.find(z => z.id === node.zoneId);
            if (zone) next[node.zoneId] = walkNoise(prev[node.zoneId], zone);
          }
        });
        return next;
      });
    }, 15000);

    // ── Tick the "X seconds ago" counter ──────────────────────────────────
    const tickTimer = setInterval(() => setSecondsSince(s => s + 1), 1000);

    return () => {
      unsubscribers.forEach(unsub => unsub());
      clearInterval(mockTimer);
      clearInterval(tickTimer);
    };
  }, []);

  // Derive nodeByZone from live (possibly Firebase-updated) node list
  const nodeByZone = useMemo(() => {
    const map = {};
    liveNodes.forEach(n => { map[n.zoneId] = n; });
    return map;
  }, [liveNodes]);

  const sharedProps = { noiseValues, nodes: liveNodes, nodeByZone, zones };

  return (
    <div className="app">
      <Header secondsSince={secondsSince} />
      <main className="app-content">
        {activeTab === 'map'     && <MapView     {...sharedProps} />}
        {activeTab === 'history' && <HistoryView {...sharedProps} />}
        {activeTab === 'predict' && <PredictView {...sharedProps} />}
        {activeTab === 'nodes'   && <NodesView   {...sharedProps} />}
      </main>
      <NavBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
