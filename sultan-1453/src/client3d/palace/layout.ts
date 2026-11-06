// Procedural palace. Two styles share one plan:
//   the Gate (first court) → second court → Divan hall (throne room), Treasury, and through the
//   Gate of Felicity to the Harem.
// Topkapı (capital at Constantinople): stone and lead domes, the twin octagonal towers of the Gate of Salutation,
//   the Tower of Justice beside the Divan hall, cypresses.
// Edirne (before the move): the New Palace on the Tunca: timber pavilions with tiled roofs, the river along the
//   east side, a single gate tower, plane trees.
import * as THREE from 'three';
import { Builder } from '../models';

export type PalaceStyle = 'topkapi' | 'edirne';
export type RoomId = 'gate' | 'court' | 'divan' | 'treasury' | 'harem';

export interface Rect { x0: number; z0: number; x1: number; z1: number }
export interface Room {
  id: RoomId;
  name: string;
  rect: Rect;
  spawn: THREE.Vector3;
  roof?: THREE.Object3D; // hidden while the Sultan stands inside
}

export interface PalaceLayout {
  group: THREE.Group;
  colliders: Rect[];
  rooms: Room[];
  floor: THREE.Mesh; // walkable surface for click-to-move
  /** standing places for characters */
  spots: {
    throne: THREE.Vector3;
    ministers: THREE.Vector3[]; // semicircle facing the throne
    treasury: THREE.Vector3;
    chests: THREE.Vector3[];
    harem: THREE.Vector3[];
    eunuch: THREE.Vector3;
    gate: THREE.Vector3[];
    guards: THREE.Vector3[];
  };
}

const H = 4; // wall height

/** Cutaway: while the Sultan is inside a room, everything above this plane is trimmed so walls never hide him. */
export const CUT = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1000);
export const PALACE_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, clippingPlanes: [CUT] });
export function setCutaway(on: boolean) { CUT.constant = on ? 2.3 : 1000; }
const T = 0.5; // wall thickness

interface StyleSet {
  wall: string; trim: string; roof: string; floorCourt: string; floorDivan: string; floorHarem: string; floorTreasury: string; floorGate: string; tree: string;
}
const STYLE: Record<PalaceStyle, StyleSet> = {
  topkapi: { wall: '#e6dfd0', trim: '#b9ab8e', roof: '#8d99a6', floorCourt: '#9cb07a', floorDivan: '#9b2a22', floorHarem: '#2f7f7c', floorTreasury: '#b9a37a', floorGate: '#b7ab96', tree: '#2f5d36' },
  edirne: { wall: '#e9dcc0', trim: '#8a6a45', roof: '#a8502f', floorCourt: '#93ad6c', floorDivan: '#8e2f24', floorHarem: '#356f8a', floorTreasury: '#b29a70', floorGate: '#b3a387', tree: '#4f7a3a' },
};

/** A rectangular room's walls with door gaps. `doors` lists [side, centre offset, width]. */
function walls(b: Builder, cols: Rect[], r: Rect, color: string, doors: ['n' | 's' | 'e' | 'w', number, number][]) {
  const seg = (x0: number, z0: number, x1: number, z1: number) => {
    if (z0 === z1) {
      if (x1 - x0 < 0.05) return;
      b.box(x1 - x0, H, T, color, (x0 + x1) / 2, 0, z0);
      cols.push({ x0, z0: z0 - T / 2, x1, z1: z0 + T / 2 });
    } else {
      if (z1 - z0 < 0.05) return;
      b.box(T, H, z1 - z0, color, x0, 0, (z0 + z1) / 2);
      cols.push({ x0: x0 - T / 2, z0, x1: x0 + T / 2, z1 });
    }
  };
  const side = (s: 'n' | 's' | 'e' | 'w') => {
    const horizontal = s === 'n' || s === 's';
    const fixed = s === 'n' ? r.z0 : s === 's' ? r.z1 : s === 'w' ? r.x0 : r.x1;
    const a = horizontal ? r.x0 : r.z0, bEnd = horizontal ? r.x1 : r.z1;
    const gaps = doors.filter((d) => d[0] === s).map((d) => [(a + bEnd) / 2 + d[1] - d[2] / 2, (a + bEnd) / 2 + d[1] + d[2] / 2]).sort((p, q) => p[0] - q[0]);
    let cur = a;
    for (const [g0, g1] of [...gaps, [bEnd, bEnd]]) {
      if (g0 > cur) horizontal ? seg(cur, fixed, g0, fixed) : seg(fixed, cur, fixed, g0);
      cur = g1;
    }
  };
  (['n', 's', 'e', 'w'] as const).forEach(side);
}

function roofOver(r: Rect, color: string, dome: boolean, lead: string) {
  const b = new Builder();
  const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  b.box(w + 0.8, 0.3, d + 0.8, color, cx, H, cz);
  if (dome) b.dome(Math.min(w, d) * 0.32, lead, cx, H + 0.3, cz).cyl(0.08, 0.9, 6, '#c9a227', cx, H + 0.3 + Math.min(w, d) * 0.32, cz);
  else b.add(new THREE.ConeGeometry(Math.max(w, d) * 0.72, 2.2, 4).rotateY(Math.PI / 4).scale(w / Math.max(w, d), 1, d / Math.max(w, d)), color, cx, H + 1.4, cz);
  return b.mesh(PALACE_MAT);
}

export function buildPalace(style: PalaceStyle): PalaceLayout {
  const S = STYLE[style];
  const group = new THREE.Group();
  const b = new Builder();
  const cols: Rect[] = [];

  // plan (x east, z south); the Sultan enters from the south
  const gate: Rect = { x0: -10, z0: 16, x1: 10, z1: 30 };
  const court: Rect = { x0: -16, z0: -10, x1: 16, z1: 16 };
  const divan: Rect = { x0: -15, z0: -9, x1: -3, z1: 3 };
  const treasury: Rect = { x0: 5, z0: -9, x1: 15, z1: 1 };
  const harem: Rect = { x0: -12, z0: -26, x1: 6, z1: -12 };

  // floors
  const floorB = new Builder();
  floorB.box(80, 0.1, 80, '#7e9a62', 0, -0.1, 0);
  floorB.box(gate.x1 - gate.x0, 0.12, gate.z1 - gate.z0, S.floorGate, 0, 0, (gate.z0 + gate.z1) / 2);
  floorB.box(court.x1 - court.x0, 0.12, court.z1 - court.z0, S.floorCourt, 0, 0, (court.z0 + court.z1) / 2);
  floorB.box(divan.x1 - divan.x0, 0.14, divan.z1 - divan.z0, S.floorDivan, (divan.x0 + divan.x1) / 2, 0, (divan.z0 + divan.z1) / 2);
  floorB.box(treasury.x1 - treasury.x0, 0.14, treasury.z1 - treasury.z0, S.floorTreasury, (treasury.x0 + treasury.x1) / 2, 0, (treasury.z0 + treasury.z1) / 2);
  floorB.box(harem.x1 - harem.x0, 0.14, harem.z1 - harem.z0, S.floorHarem, (harem.x0 + harem.x1) / 2, 0, (harem.z0 + harem.z1) / 2);
  floorB.box(2.4, 0.13, 26, '#d8ccb0', 0, 0, 3); // paved path through the courts
  floorB.box(2.4, 0.13, 4, '#d8ccb0', -3, 0, -12); // to the Harem
  const floor = floorB.mesh();
  group.add(floor);

  // outer enclosure (the gate court and second court share it)
  walls(b, cols, { x0: -16, z0: -10, x1: 16, z1: 16 }, S.wall, [['s', 0, 3.2], ['n', -3, 2.4]]);
  walls(b, cols, gate, S.wall, [['s', 0, 3.2], ['n', 0, 3.2]]);
  walls(b, cols, divan, S.wall, [['e', 0, 2.4]]);
  walls(b, cols, treasury, S.wall, [['w', 0, 2.4]]);
  walls(b, cols, harem, S.wall, [['s', 0, 2.4]]);
  // corridor between the Gate of Felicity and the Harem door
  cols.push({ x0: -5.0, z0: -12, x1: -4.3, z1: -10 }, { x0: -1.7, z0: -12, x1: -1.0, z1: -10 });
  b.box(0.7, H, 2, S.wall, -4.65, 0, -11).box(0.7, H, 2, S.wall, -1.35, 0, -11);

  // gates and towers
  if (style === 'topkapi') {
    // Imperial Gate (Bab-ı Hümayun)
    b.box(9, 6, 2, S.wall, -5.7, 0, 30).box(9, 6, 2, S.wall, 5.7, 0, 30).box(3.4, 2, 2, S.wall, 0, 4, 30);
    // Gate of Salutation: twin octagonal towers with conical lead roofs
    for (const x of [-3.2, 3.2]) b.add(new THREE.CylinderGeometry(1.2, 1.2, 7, 8), S.wall, x, 3.5, 16).add(new THREE.ConeGeometry(1.4, 3, 8), S.roof, x, 8.5, 16);
    // Tower of Justice beside the Divan hall
    b.box(2.6, 11, 2.6, S.wall, -9, 0, -10.5).add(new THREE.CylinderGeometry(1.0, 1.2, 2, 8), S.trim, -9, 12, -10.5).add(new THREE.ConeGeometry(1.1, 3.5, 8), S.roof, -9, 14.7, -10.5);
    // cypresses
    for (const [x, z] of [[-12, 12], [-8, 12], [8, 12], [12, 12], [-12, 6], [12, 6], [1.5, 6], [-1.5, 6], [11, 25], [-11, 25]]) b.cyl(0.25, 0.8, 5, '#5d4037', x, 0, z).add(new THREE.ConeGeometry(0.75, 4.2, 6), S.tree, x, 2.9, z);
  } else {
    // Edirne: one gate tower, timber galleries, the Tunca along the east
    b.box(8, 4.6, 2, S.wall, -6, 0, 30).box(8, 4.6, 2, S.wall, 6, 0, 30).box(3.6, 6.5, 3.6, S.wall, 0, 0, 30).add(new THREE.ConeGeometry(2.8, 2.6, 4).rotateY(Math.PI / 4), S.roof, 0, 7.8, 30);
    for (let z = -8; z <= 14; z += 4) b.box(0.3, 3.2, 0.3, S.trim, 15.2, 0, z).box(0.3, 3.2, 0.3, S.trim, -15.2, 0, z);
    b.box(4, 0.15, 60, '#3d8fbf', 21, 0, 5); // the Tunca
    for (const [x, z] of [[-12, 11], [12, 11], [-12, 5], [12, 5], [10, 24], [-10, 24]]) b.cyl(0.35, 1.6, 5, '#6d4c41', x, 0, z).dome(1.5, S.tree, x, 1.6, z);
  }
  // Gate of Felicity (Bab-üs Saadet), with its eaves
  b.box(3.6, 0.4, 2.4, S.roof, -3, H, -10).box(0.5, H, 0.5, S.trim, -4.5, 0, -9).box(0.5, H, 0.5, S.trim, -1.5, 0, -9);

  // Divan hall interior: the raised sedir and canopy, low sofas around the walls, the grilled window (kafes)
  const throne = new THREE.Vector3(-13.6, 0, -3);
  b.box(2.4, 0.5, 3, '#6d2f1e', throne.x, 0, throne.z).box(1.4, 0.5, 1.8, '#c9a227', throne.x, 0.5, throne.z);
  for (const [x, z] of [[-14.6, -4.5], [-14.6, -1.5], [-12.6, -4.5], [-12.6, -1.5]]) b.cyl(0.08, 3, 6, '#c9a227', x, 0.5, z);
  b.box(2.4, 0.15, 3.2, '#9b2a22', throne.x, 3.5, throne.z);
  b.box(0.1, 1.2, 2.2, '#c9a227', -14.75, 2.4, -3); // the kafes window
  for (let x = -12; x <= -5; x += 1.8) b.box(1.5, 0.4, 0.8, '#7a3b2e', x, 0, -8.3).box(1.5, 0.4, 0.8, '#7a3b2e', x, 0, 2.3);
  // the Divan stands in a half-circle before the throne
  const ministers: THREE.Vector3[] = [];
  for (let i = 0; i < 9; i++) {
    const a = -1.25 + (i / 8) * 2.5;
    ministers.push(new THREE.Vector3(throne.x + 1.6 + Math.cos(a) * 4.6, 0, throne.z + Math.sin(a) * 4.6));
  }

  // Treasury interior: chests are added by the scene according to the treasury; shelves and coffers here
  for (let z = -8.2; z <= 0; z += 2) b.box(0.6, 2.2, 1.6, '#5d4037', 14.4, 0, z);
  const chests: THREE.Vector3[] = [];
  for (let i = 0; i < 30; i++) chests.push(new THREE.Vector3(7 + (i % 6) * 1.2, 0, -7.8 + Math.floor(i / 6) * 1.25));

  // Harem: a pool with a fountain, sofas, tiled walls
  b.box(4, 0.25, 3, '#2f7f7c', -3, 0, -19).box(0.6, 0.9, 0.6, '#e6dfd0', -3, 0.25, -19).box(3.6, 0.1, 2.6, '#7fd3e6', -3, 0.2, -19);
  for (let x = -11; x <= 4; x += 2.2) b.box(1.8, 0.45, 0.8, '#8e3a59', x, 0, -25.3);
  const haremSpots = [[-9, -22], [-6.5, -23], [-4, -23], [-1.5, -23], [1, -22], [-9, -16], [-7, -15], [1.5, -16], [3.5, -17]].map(([x, z]) => new THREE.Vector3(x, 0, z));

  group.add(b.mesh(PALACE_MAT));

  const rooms: Room[] = [
    { id: 'divan', name: style === 'topkapi' ? 'The Divan hall (Kubbealtı)' : 'The Divan pavilion', rect: divan, spawn: new THREE.Vector3(-4.6, 0, -3) },
    { id: 'treasury', name: 'The Treasury', rect: treasury, spawn: new THREE.Vector3(6.4, 0, -4) },
    { id: 'harem', name: 'The Harem', rect: harem, spawn: new THREE.Vector3(-3, 0, -14) },
    { id: 'gate', name: style === 'topkapi' ? 'The Imperial Gate' : 'The Palace Gate', rect: gate, spawn: new THREE.Vector3(0, 0, 25) },
    { id: 'court', name: 'The second court', rect: { x0: court.x0, z0: court.z0, x1: court.x1, z1: court.z1 }, spawn: new THREE.Vector3(0, 0, 8) },
  ];
  for (const r of rooms) {
    if (r.id === 'court' || r.id === 'gate') continue;
    r.roof = roofOver(r.rect, S.roof, style === 'topkapi' && r.id !== 'harem', '#8d99a6');
    group.add(r.roof);
  }

  return {
    group,
    colliders: cols,
    rooms,
    floor,
    spots: {
      throne,
      ministers,
      treasury: new THREE.Vector3(9, 0, -0.5),
      chests,
      harem: haremSpots,
      eunuch: new THREE.Vector3(-0.8, 0, -13.2),
      gate: [[-4, 21], [-2, 22.5], [0.5, 21.5], [2.8, 22.3], [4.5, 21]].map(([x, z]) => new THREE.Vector3(x, 0, z)),
      guards: [[-2.4, 28.5], [2.4, 28.5], [-2.4, 17.8], [2.4, 17.8], [-4.6, -8.6], [-1.4, -8.6]].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    },
  };
}

export function roomAt(rooms: Room[], x: number, z: number): Room | null {
  const order: RoomId[] = ['divan', 'treasury', 'harem', 'gate', 'court'];
  for (const id of order) {
    const r = rooms.find((q) => q.id === id)!;
    if (x > r.rect.x0 && x < r.rect.x1 && z > r.rect.z0 && z < r.rect.z1) return r;
  }
  return null;
}
