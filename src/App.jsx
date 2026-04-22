import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ref, onValue, query, limitToLast, get, set } from 'firebase/database';
import { db } from './firebase.js';
import Header from './components/Header.jsx';
import NavBar from './components/NavBar.jsx';
import MapView from './components/MapView.jsx';
import HistoryView from './components/HistoryView.jsx';
import PredictView from './components/PredictView.jsx';
import NodesView from './components/NodesView.jsx';
import { zones, nodes } from './data/mockData.js';
import { computeInitialNoise, walkNoise } from './utils/noiseUtils.js';
import { buildZoneBuckets } from './utils/predictionModel.js';
import { computeLedColors } from './utils/ledColor.js';
import './App.css';

// Build a lookup: firebaseId -> static node definition
const FB_ID_TO_NODE = {};
nodes.forEach(n => { if (n.firebaseId) FB_ID_TO_NODE[n.firebaseId] = n; });

// Cap on how many historical readings we pull per node for bucket computation.
const HISTORY_LIMIT = 10000;

const LED_WRITABLE_NODE_IDS = new Set(['node_01', 'node_02']);

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
  const [buckets, setBuckets]         = useState({}); // zoneId -> prediction buckets

  // Last LED colour written to Firebase per firebaseId — used to skip redundant writes.
  const lastLedColorsRef = useRef({});

  useEffect(() => {
    // ── Firebase listeners — one per node at nodes/$nodeId ─────────────────
    // The DB rules allow reading individual nodes but not the whole /nodes tree,
    // so we subscribe to each path separately.
    const nodesWithFirebase = nodes.filter(n => n.firebaseId);
    const fbNodeIds = new Set(nodesWithFirebase.map(n => n.firebaseId));

    const unsubscribers = nodesWithFirebase.map(node => {
      // /validated_data/{firebaseId} holds push-key children; grab the latest one.
      const readingsRef = query(ref(db, `validated_data/${node.firebaseId}`), limitToLast(1));
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

    // ── One-shot history fetch: build prediction buckets per zone ─────────
    nodesWithFirebase.forEach(async (node) => {
      try {
        const snap = await get(query(
          ref(db, `validated_data/${node.firebaseId}`),
          limitToLast(HISTORY_LIMIT),
        ));
        if (!snap.exists()) return;
        const zoneBuckets = buildZoneBuckets(snap.val());
        setBuckets(prev => ({ ...prev, [node.zoneId]: zoneBuckets }));
      } catch (err) {
        console.warn(`History fetch failed for ${node.firebaseId}:`, err);
      }
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

  // ── LED colour: compute median-split colours and push changes to Firebase ─
  // Runs whenever a node's dB or status changes. Only nodes whose desired
  // colour differs from the last-written value are pushed, so Firebase writes
  // stay proportional to actual colour flips (not every reading update).
  useEffect(() => {
    const ledWritableNodes = liveNodes.filter(n => LED_WRITABLE_NODE_IDS.has(n.firebaseId));
    const colors = computeLedColors(ledWritableNodes, noiseValues, lastLedColorsRef.current);
    Object.entries(colors).forEach(([firebaseId, color]) => {
      if (lastLedColorsRef.current[firebaseId] === color) return;
      set(ref(db, `nodes/${firebaseId}/led_color`), color)
        .then(() => { lastLedColorsRef.current[firebaseId] = color; })
        .catch(err => console.warn(`LED colour write failed (${firebaseId}):`, err));
    });
  }, [liveNodes, noiseValues]);

  // Derive nodeByZone from live (possibly Firebase-updated) node list
  const nodeByZone = useMemo(() => {
    const map = {};
    liveNodes.forEach(n => { map[n.zoneId] = n; });
    return map;
  }, [liveNodes]);

  const sharedProps = { noiseValues, nodes: liveNodes, nodeByZone, zones, buckets };

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
