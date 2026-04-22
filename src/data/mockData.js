const BUILDING = 'Marston Science Library';

// ─── Zones ────────────────────────────────────────────────────────────────────
export const zones = [
  // Floor 1
  { id: 'MS-1-CL',  name: 'Computer Lab',         building: BUILDING, floor: 1, baseNoise: 56, variance: 10 },
  { id: 'MS-1-CC',  name: 'Commons (North)',       building: BUILDING, floor: 1, baseNoise: 58, variance: 11 },
  { id: 'MS-1-CC2', name: 'Commons (South)',       building: BUILDING, floor: 1, baseNoise: 60, variance: 12 },
  { id: 'MS-1-MK',  name: 'Maker Space',           building: BUILDING, floor: 1, baseNoise: 60, variance: 11 },
  { id: 'MS-1-SR',  name: 'Study Rooms',           building: BUILDING, floor: 1, baseNoise: 40, variance:  8 },
  // Floor 2
  { id: 'MS-2-OA',  name: 'Open Study Area',       building: BUILDING, floor: 2, baseNoise: 52, variance: 11 },
  { id: 'MS-2-EA',  name: 'East Study Area',        building: BUILDING, floor: 2, baseNoise: 50, variance: 10 },
  { id: 'MS-2-CL',  name: 'Computer Lab',          building: BUILDING, floor: 2, baseNoise: 55, variance:  9 },
  { id: 'MS-2-SR',  name: 'Study Rooms 201',       building: BUILDING, floor: 2, baseNoise: 38, variance:  7 },
  // Floor 3
  { id: 'MS-3-PC',  name: 'Periodical Collection', building: BUILDING, floor: 3, baseNoise: 32, variance:  5 },
  { id: 'MS-3-OA',  name: 'Reading Area',          building: BUILDING, floor: 3, baseNoise: 44, variance:  8 },
  { id: 'MS-3-TD',  name: 'Stacks & Collections',  building: BUILDING, floor: 3, baseNoise: 28, variance:  4 },
];

// ─── Nodes ────────────────────────────────────────────────────────────────────
// node_01–03 are live Firebase nodes; node_04+ are not yet deployed (mock only)
export const nodes = [
  { id: 'NODE-001', firebaseId: 'node_01', zoneId: 'MS-2-OA',  status: 'online', tamper: false, battery: 87 },
  { id: 'NODE-002', firebaseId: 'node_02', zoneId: 'MS-2-EA',  status: 'online', tamper: false, battery: 92 },
  { id: 'NODE-003', firebaseId: 'node_03', zoneId: 'MS-3-PC',  status: 'online', tamper: false, battery: 78 },
  { id: 'NODE-004', firebaseId: 'node_04', zoneId: 'MS-1-CL',  status: 'online', tamper: false, battery: 71 },
  { id: 'NODE-005', firebaseId: 'node_05', zoneId: 'MS-1-MK',  status: 'online', tamper: false, battery: 65 },
  { id: 'NODE-006', firebaseId: 'node_06', zoneId: 'MS-1-SR',  status: 'online', tamper: false, battery: 83 },
  { id: 'NODE-007', firebaseId: 'node_07', zoneId: 'MS-1-CC2', status: 'online', tamper: false, battery: 76 },
  { id: 'NODE-008', firebaseId: 'node_08', zoneId: 'MS-2-CL',  status: 'online', tamper: false, battery: 88 },
  { id: 'NODE-009', firebaseId: 'node_09', zoneId: 'MS-2-SR',  status: 'online', tamper: false, battery: 73 },
  { id: 'NODE-010', firebaseId: 'node_10', zoneId: 'MS-3-OA',  status: 'online', tamper: false, battery: 80 },
  { id: 'NODE-011', firebaseId: 'node_11', zoneId: 'MS-3-TD',  status: 'online', tamper: false, battery: 85 },
  { id: 'NODE-012', firebaseId: 'node_12', zoneId: 'MS-1-CC',  status: 'online', tamper: false, battery: 82 },
];

// ─── Floor metadata ───────────────────────────────────────────────────────────
export const FLOORS = [
  { number: 1, label: '1st Floor', shortLabel: '1st Fl.' },
  { number: 2, label: '2nd Floor', shortLabel: '2nd Fl.' },
  { number: 3, label: '3rd Floor', shortLabel: '3rd Fl.' },
];

// ─── Floor plan SVG data ──────────────────────────────────────────────────────
// viewBox for all plans: "0 0 420 300"
// buildingPath: SVG path defining the building outline
// rooms: array of room/zone rectangles
//   interactive:true  → sensor zone, color-coded by dB
//   interactive:false → non-sensor area (landmark, staff, hallway, etc.)
//   showStats:false   → secondary rect sharing a zone; skip the dB label
//   rotateLabel:true  → narrow column; rotate label + dB text 90°
//   dividers          → draw internal lines to indicate individual rooms
//     dividerOrientation: 'horizontal' | 'vertical'
//     dividerCount: number of rooms (lines = count - 1)
export const floorPlans = {
  1: {
    buildingPath: 'M 5,5 L 148,5 L 148,88 L 415,88 L 415,295 L 5,295 Z',
    rooms: [
      // ── Upper wing – Computer Lab (full wing, no strip) ───────────────────
      { roomId: 'ms1-cl',     zoneId: 'MS-1-CL',  x: 11,  y: 11,  w: 130, h: 70,  label: 'Computer Lab',     interactive: true,  showStats: true  },

      // ── Left column – orientation landmark ───────────────────────────────
      { roomId: 'ms1-elev',                        x: 30,  y: 100, w: 88,  h: 22,  label: 'Elevator · Stairs', interactive: false, fill: '#DCDCDC'  },

      // ── Left column – Maker Space ─────────────────────────────────────────
      { roomId: 'ms1-mk',     zoneId: 'MS-1-MK',  x: 11,  y: 132, w: 130, h: 88,  label: 'Maker Space',      interactive: true,  showStats: true  },

      // ── Left column – Conference & Meeting Rooms ──────────────────────────
      { roomId: 'ms1-conf',                        x: 11,  y: 228, w: 130, h: 61,  label: 'Conf. Rooms',      interactive: false, fill: '#E0E0E0'  },

      // ── Center – Collaboration Commons (split into two zones) ─────────────
      { roomId: 'ms1-cc-n',   zoneId: 'MS-1-CC',  x: 153, y: 94,  w: 197, h: 70,  label: 'Commons (N)',      interactive: true,  showStats: true  },
      { roomId: 'ms1-cc-s',   zoneId: 'MS-1-CC2', x: 153, y: 172, w: 197, h: 48,  label: 'Commons (S)',      interactive: true,  showStats: true  },

      // ── South row – Study Rooms L129–L135 ────────────────────────────────
      { roomId: 'ms1-sr-row', zoneId: 'MS-1-SR',  x: 153, y: 228, w: 197, h: 61,  label: '',                 interactive: true,  showStats: false, dividers: true, dividerOrientation: 'vertical',   dividerCount: 7  },

      // ── East column – Study Rooms L119–L128 ──────────────────────────────
      { roomId: 'ms1-sr-col', zoneId: 'MS-1-SR',  x: 358, y: 94,  w: 51,  h: 195, label: 'Study Rooms',      interactive: true,  showStats: true,  rotateLabel: true, dividers: true, dividerOrientation: 'horizontal', dividerCount: 10 },
    ],
  },

  2: {
    buildingPath: 'M 115,5 L 415,5 L 415,295 L 5,295 L 5,148 L 115,148 Z',
    rooms: [
      // ── Starbucks wing – landmark only, no sensor ─────────────────────────
      { roomId: 'ms2-sb',  x: 11,  y: 154, w: 98,  h: 134, label: 'Starbucks',    interactive: false, fill: '#FDE8C8' },

      // ── Upper area – West of Service Desk (Open Study, node_01 live) ──────
      { roomId: 'ms2-oa',  zoneId: 'MS-2-OA', x: 121, y: 11, w: 72,  h: 130, label: 'Open Study',   interactive: true, showStats: true },

      // ── Upper area – Service Desk (central landmark) ───────────────────────
      { roomId: 'ms2-svc', x: 199, y: 11, w: 90,  h: 130, label: 'Service Desk', interactive: false, fill: '#DCDCDC' },

      // ── Upper area – East of Service Desk (East Study, node_02 live) ──────
      { roomId: 'ms2-ea',  zoneId: 'MS-2-EA', x: 295, y: 11, w: 64,  h: 130, label: 'East Study',   interactive: true, showStats: true },

      // ── Upper area – Study Rooms 201 (far right, rotated) ─────────────────
      { roomId: 'ms2-sr',  zoneId: 'MS-2-SR', x: 365, y: 11, w: 40,  h: 130, label: 'Study Rooms',  interactive: true, showStats: true, rotateLabel: true, dividers: true, dividerOrientation: 'horizontal', dividerCount: 5 },

      // ── Lower half – Computer Lab (south of service desk) ─────────────────
      { roomId: 'ms2-cl',  zoneId: 'MS-2-CL', x: 121, y: 149, w: 288, h: 139, label: 'Computer Lab', interactive: true, showStats: true },
    ],
  },

  3: {
    buildingPath: 'M 5,80 L 80,80 L 80,5 L 415,5 L 415,295 L 5,295 Z',
    rooms: [
      // ── Upper band – Periodical Collection ────────────────────────────────
      { roomId: 'ms3-pc',   zoneId: 'MS-3-PC', x: 86,  y: 11,  w: 321, h: 63,  label: 'Periodical Collection', interactive: true,  showStats: true,  dividers: true, dividerOrientation: 'vertical', dividerCount: 2 },

      // ── Mid-left – L308 (stairwell / staff area) ──────────────────────────
      { roomId: 'ms3-l308',                    x: 11,  y: 86,  w: 63,  h: 115, label: 'L308',                  interactive: false, fill: '#E0E0E0' },

      // ── Mid-center/right – Reading Area ───────────────────────────────────
      { roomId: 'ms3-oa',   zoneId: 'MS-3-OA', x: 86,  y: 82,  w: 320, h: 115, label: 'Reading Area',          interactive: true,  showStats: true  },

      // ── Lower section – Archive Collections ───────────────────────────────
      { roomId: 'ms3-td',   zoneId: 'MS-3-TD', x: 11,  y: 209, w: 195, h: 80,  label: 'Thesis & Diss.',        interactive: true,  showStats: true  },
      { roomId: 'ms3-ag',   zoneId: 'MS-3-TD', x: 213, y: 209, w: 196, h: 80,  label: 'Agriculture Coll.',     interactive: true,  showStats: false },
    ],
  },
};

export const BUILDING_NAME = BUILDING;
