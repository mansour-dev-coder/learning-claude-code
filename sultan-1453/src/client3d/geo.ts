// Geography for the 3D map. Coastlines are hand-drawn approximations (lon, lat in degrees) sampled onto a
// 0.25° grid, which is coarse enough that small islands and straits are drawn explicitly.

export const EXTENT = { lonMin: 12, lonMax: 46, latMin: 32, latMax: 49 };
export const CELL = 0.25; // degrees
export const COLS = Math.round((EXTENT.lonMax - EXTENT.lonMin) / CELL);
export const ROWS = Math.round((EXTENT.latMax - EXTENT.latMin) / CELL);

/** World units per degree of latitude; longitude is scaled by cos(40.5°) so shapes are not stretched. */
export const UNIT = 4;
const LON_SCALE = Math.cos((40.5 * Math.PI) / 180);
const LON0 = 29;
const LAT0 = 40.5;

export function toWorld(lon: number, lat: number): { x: number; z: number } {
  return { x: (lon - LON0) * UNIT * LON_SCALE, z: -(lat - LAT0) * UNIT };
}
export function toLonLat(x: number, z: number): [number, number] {
  return [x / (UNIT * LON_SCALE) + LON0, -z / UNIT + LAT0];
}
/** Width of one grid cell in world units (x, z). */
export const CELL_W = { x: CELL * UNIT * LON_SCALE, z: CELL * UNIT };

type Poly = [number, number][];

/** Land masses. */
export const LAND: Poly[] = [
  // Europe north of the seas, the Balkans and Greece (Peloponnese joined at the Isthmus), the Black Sea's north
  // shore, Crimea and the Caucasus coast. The Sea of Azov is carved out below.
  [
    [12, 45.75], [13.7, 45.65], [13.6, 45.1], [14.2, 44.95], [15.0, 44.2], [15.9, 43.55], [16.5, 43.4], [17.5, 43.0],
    [18.5, 42.45], [19.1, 42.0], [19.5, 41.8], [19.4, 41.2], [19.4, 40.4], [20.0, 39.7], [20.6, 39.1], [21.0, 38.45],
    [21.3, 38.3], [21.1, 37.85], [21.65, 37.1], [21.9, 36.75], [22.4, 36.45], [22.8, 36.8], [23.15, 36.45], [23.1, 37.3],
    [22.75, 37.6], [23.0, 37.9], [23.45, 37.95], [23.95, 37.65], [24.1, 38.15], [23.6, 38.5], [22.95, 38.85],
    [22.75, 39.3], [23.3, 39.2], [22.85, 39.65], [22.55, 40.1], [22.6, 40.5], [22.95, 40.6], [23.3, 40.25],
    [23.75, 40.15], [23.9, 40.6], [24.4, 40.92], [25.1, 40.95], [25.9, 40.85], [26.05, 40.6], [26.15, 40.1],
    [26.7, 40.45], [27.5, 40.95], [28.5, 41.0], [29.0, 41.05], [29.1, 41.2], [28.3, 41.5], [28.0, 41.95],
    [27.8, 42.5], [27.6, 43.2], [28.6, 43.75], [28.8, 44.5], [29.65, 45.2], [30.3, 45.9], [30.8, 46.5], [31.6, 46.6],
    [32.5, 46.1], [33.2, 46.1], [33.5, 45.25], [33.5, 44.6], [34.2, 44.45], [35.1, 44.8], [35.45, 45.05], [36.4, 45.1],
    [36.6, 45.4], [37.0, 45.2], [37.4, 44.7], [38.5, 44.2], [39.7, 43.5], [40.6, 43.0], [41.6, 42.2], [41.75, 41.6],
    [46, 41.6], [46, 49], [12, 49],
  ],
  // Anatolia, the Levant coast and the lands east
  [
    [29.15, 41.25], [30.5, 41.2], [31.4, 41.3], [32.4, 41.8], [33.4, 42.0], [34.9, 42.05], [35.15, 42.0], [36.0, 41.7],
    [36.6, 41.3], [37.5, 41.1], [38.4, 40.95], [39.7, 41.0], [40.6, 41.0], [41.75, 41.6], [46, 41.6], [46, 32],
    [34.95, 32], [35.0, 33.0], [35.5, 33.9], [35.9, 34.9], [35.8, 35.8], [36.2, 36.6], [35.8, 36.8], [35.3, 36.6],
    [34.6, 36.8], [33.6, 36.2], [32.8, 36.1], [32.0, 36.5], [31.0, 36.85], [30.6, 36.8], [30.5, 36.3], [29.6, 36.2],
    [28.9, 36.7], [28.1, 36.6], [27.4, 37.0], [27.3, 37.5], [27.0, 38.0], [26.3, 38.3], [26.9, 38.5], [26.7, 38.9],
    [26.9, 39.5], [26.1, 39.5], [26.2, 40.0], [26.7, 40.35], [27.5, 40.35], [29.0, 40.4], [29.9, 40.75], [29.15, 41.0],
  ],
  // Italy and Sicily (context only)
  [
    [12, 45.4], [12.3, 45.4], [12.3, 44.4], [13.5, 43.6], [14.2, 42.4], [15.2, 41.9], [16.0, 41.4], [17.2, 40.9],
    [18.0, 40.6], [18.5, 40.1], [18.3, 39.8], [17.2, 40.4], [16.6, 39.7], [17.1, 39.0], [16.6, 38.4], [15.7, 37.95],
    [15.6, 38.3], [16.0, 39.5], [15.7, 40.0], [14.9, 40.3], [14.0, 40.8], [12.9, 41.3], [12, 41.8],
  ],
  [[12.4, 38.05], [13.4, 38.2], [15.6, 38.3], [15.1, 37.1], [14.3, 36.7], [12.6, 37.6]],
  // Cyrenaica
  [[19.9, 32], [20.1, 32.5], [21.0, 32.9], [22.2, 32.95], [23.1, 32.6], [24.0, 32]],
  // Islands
  [[22.9, 38.85], [23.6, 38.75], [24.2, 38.4], [24.6, 38.05], [24.3, 37.95], [23.5, 38.35]], // Euboea
  [[23.5, 35.3], [24.3, 35.38], [25.0, 35.45], [26.3, 35.3], [26.1, 34.95], [24.7, 34.9], [23.6, 35.15]], // Crete
  [[27.7, 36.05], [28.25, 36.5], [28.15, 36.0]], // Rhodes
  [[25.8, 39.25], [26.45, 39.45], [26.65, 39.05], [26.1, 38.95]], // Lesbos
  [[25.85, 38.65], [26.2, 38.65], [26.15, 38.15], [25.85, 38.25]], // Chios
  [[32.25, 34.65], [32.35, 35.1], [33.0, 35.4], [34.65, 35.7], [34.0, 35.0], [33.0, 34.55]], // Cyprus
  [[25.3, 37.2], [25.6, 37.2], [25.6, 36.95], [25.3, 36.95]], // Naxos
  [[19.75, 39.85], [20.1, 39.8], [19.95, 39.4]], // Corfu
  [[25.05, 40.05], [25.45, 40.05], [25.4, 39.75], [25.05, 39.8]], // Lemnos
];

/** Seas carved out of the land polygons (applied after them). */
export const SEA: Poly[] = [
  [[26.7, 40.42], [27.5, 40.97], [28.5, 41.02], [28.95, 41.02], [29.9, 40.72], [29.0, 40.38], [27.5, 40.33], [26.85, 40.3]], // Marmara
  [[26.05, 40.0], [26.35, 39.9], [26.8, 40.3], [26.6, 40.5]], // Dardanelles
  [[29.0, 41.02], [29.25, 41.02], [29.25, 41.3], [29.0, 41.3]], // Bosporus
  [[35.2, 45.35], [35.5, 46.3], [37.0, 47.05], [38.8, 47.2], [39.25, 47.0], [38.3, 46.2], [37.6, 45.6], [36.8, 45.45], [36.0, 45.35]], // Azov
  [[21.4, 38.35], [22.9, 38.1], [23.2, 37.95], [22.4, 38.25], [21.6, 38.45]], // Gulf of Corinth
];

/** Mountain ranges: polyline, peak height (blocks), half-width (degrees). */
export const RIDGES: { pts: [number, number][]; h: number; w: number }[] = [
  { pts: [[13.5, 46.6], [15.5, 47.2]], h: 7, w: 0.8 }, // eastern Alps
  { pts: [[15.0, 45.0], [17.0, 43.8], [19.5, 42.3]], h: 5, w: 0.7 }, // Dinaric Alps
  { pts: [[22.3, 43.4], [24.5, 42.8], [27.0, 42.8]], h: 5, w: 0.45 }, // Balkan range (Stara Planina)
  { pts: [[23.3, 41.9], [25.6, 41.5]], h: 5, w: 0.5 }, // Rhodopes
  { pts: [[20.6, 41.0], [21.5, 39.7], [22.0, 38.7]], h: 5, w: 0.45 }, // Pindus
  { pts: [[21.9, 37.8], [22.4, 37.0]], h: 4, w: 0.35 }, // Peloponnese
  { pts: [[19.0, 49.0], [22.5, 48.6], [25.0, 47.6], [26.2, 46.4], [25.3, 45.5], [22.7, 45.4]], h: 6, w: 0.55 }, // Carpathians
  { pts: [[12.6, 43.6], [14.6, 41.6], [16.0, 39.6]], h: 4, w: 0.5 }, // Apennines
  { pts: [[29.4, 37.0], [32.0, 37.0], [34.0, 37.3], [36.5, 37.9], [38.6, 38.3], [41.2, 38.7]], h: 6, w: 0.5 }, // Taurus
  { pts: [[31.0, 40.9], [35.0, 40.85], [38.0, 40.5], [41.6, 40.8]], h: 5, w: 0.45 }, // Pontic mountains
  { pts: [[37.6, 44.3], [41.0, 43.3], [45.8, 42.3]], h: 8, w: 0.5 }, // Caucasus
  { pts: [[35.8, 33.4], [36.4, 34.6]], h: 4, w: 0.3 }, // Lebanon
  { pts: [[29.1, 40.0], [29.6, 39.9]], h: 4, w: 0.25 }, // Uludağ (Bithynian Olympus)
];

/** Uplands: a flat raise over a broad area (Anatolian plateau, Armenian highland). */
export const PLATEAUS: { lon: number; lat: number; rx: number; ry: number; h: number }[] = [
  { lon: 33.5, lat: 39.0, rx: 4.5, ry: 1.6, h: 2 },
  { lon: 42.5, lat: 39.5, rx: 3.5, ry: 2.0, h: 3 },
  { lon: 23.0, lat: 42.6, rx: 1.4, ry: 0.9, h: 1 },
];

/** Province seats (lon, lat) and a size weight that shapes the province's share of the land. */
export const SEATS: Record<string, { lon: number; lat: number; w: number }> = {
  edirne: { lon: 26.55, lat: 41.68, w: 1.0 },
  gelibolu: { lon: 26.67, lat: 40.41, w: 0.55 },
  filibe: { lon: 24.75, lat: 42.15, w: 0.9 },
  sofia: { lon: 23.32, lat: 42.7, w: 0.85 },
  vidin: { lon: 22.88, lat: 43.99, w: 0.8 },
  nikopol: { lon: 24.9, lat: 43.7, w: 0.85 },
  uskup: { lon: 21.43, lat: 42.0, w: 0.85 },
  selanik: { lon: 22.94, lat: 40.64, w: 0.85 },
  tirhala: { lon: 21.77, lat: 39.55, w: 0.9 },
  bursa: { lon: 29.06, lat: 40.18, w: 0.9 },
  kutahya: { lon: 29.98, lat: 39.42, w: 0.9 },
  aydin: { lon: 27.8, lat: 38.0, w: 1.0 },
  ankara: { lon: 32.86, lat: 39.93, w: 1.2 },
  amasya: { lon: 35.83, lat: 40.65, w: 1.3 },
  constantinople: { lon: 28.97, lat: 41.01, w: 0.32 },
  morea: { lon: 22.2, lat: 37.55, w: 0.8 },
  modon: { lon: 21.7, lat: 36.85, w: 0.4 },
  negroponte: { lon: 23.8, lat: 38.5, w: 0.5 },
  smederevo: { lon: 20.95, lat: 44.4, w: 0.75 },
  novobrdo: { lon: 21.43, lat: 42.62, w: 0.55 },
  belgrade: { lon: 20.46, lat: 44.82, w: 0.6 },
  buda: { lon: 19.04, lat: 47.5, w: 1.7 },
  wallachia: { lon: 25.45, lat: 44.93, w: 1.3 },
  kruje: { lon: 19.79, lat: 41.51, w: 0.65 },
  konya: { lon: 32.49, lat: 37.87, w: 1.1 },
  larende: { lon: 33.8, lat: 36.9, w: 1.0 },
  aleppo: { lon: 37.16, lat: 36.2, w: 1.5 },
  diyarbakir: { lon: 40.22, lat: 37.91, w: 1.5 },
};

export function pointInPoly(lon: number, lat: number, poly: Poly): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function isLand(lon: number, lat: number) {
  return LAND.some((p) => pointInPoly(lon, lat, p)) && !SEA.some((p) => pointInPoly(lon, lat, p));
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  const cx = ax + t * dx - px, cy = ay + t * dy - py;
  return Math.hypot(cx, cy);
}

/** Deterministic value noise in [0,1). */
export function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Terrain height in blocks (1 = lowland) at a land point. */
export function heightAt(lon: number, lat: number): number {
  let h = 1;
  for (const r of RIDGES) {
    let d = Infinity;
    for (let i = 0; i < r.pts.length - 1; i++) d = Math.min(d, distToSegment(lon, lat, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]));
    h = Math.max(h, 1 + r.h * Math.exp(-(d * d) / (r.w * r.w)));
  }
  for (const p of PLATEAUS) {
    const q = ((lon - p.lon) / p.rx) ** 2 + ((lat - p.lat) / p.ry) ** 2;
    if (q < 1) h += p.h * (1 - q * q);
  }
  h += (hash(Math.floor(lon * 4), Math.floor(lat * 4)) - 0.5) * 1.1;
  return Math.max(1, Math.round(h));
}

const ASIA = new Set(['bursa', 'kutahya', 'aydin', 'ankara', 'amasya', 'konya', 'larende', 'aleppo', 'diyarbakir']);

/** 0 = Europe, 1 = Asia, -1 = island or elsewhere. */
export function landmassAt(lon: number, lat: number) {
  if (pointInPoly(lon, lat, LAND[1])) return 1;
  if (pointInPoly(lon, lat, LAND[0])) return 0;
  return -1;
}

/** Province a land cell belongs to (nearest seat on the same landmass, weighted), or null for land outside the game's provinces. */
export function provinceAt(lon: number, lat: number): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  const mass = landmassAt(lon, lat);
  for (const [id, s] of Object.entries(SEATS)) {
    if (mass === 0 && ASIA.has(id)) continue;
    if (mass === 1 && !ASIA.has(id)) continue;
    const d = Math.hypot((lon - s.lon) * Math.cos((lat * Math.PI) / 180), lat - s.lat) / s.w;
    if (d < bestD) { bestD = d; best = id; }
  }
  return bestD <= 2.0 ? best : null;
}

/** Smooth value noise in [0,1] for the relief view. */
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Continuous height (same ridges and plateaus as the voxel map, unrounded, with fractal detail). */
export function reliefHeight(lon: number, lat: number): number {
  let h = 1;
  for (const r of RIDGES) {
    let d = Infinity;
    for (let i = 0; i < r.pts.length - 1; i++) d = Math.min(d, distToSegment(lon, lat, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]));
    h = Math.max(h, 1 + r.h * Math.exp(-(d * d) / (r.w * r.w)));
  }
  for (const p of PLATEAUS) {
    const q = ((lon - p.lon) / p.rx) ** 2 + ((lat - p.lat) / p.ry) ** 2;
    if (q < 1) h += p.h * (1 - q * q);
  }
  // hills: three octaves, stronger where the land is already high
  const n = vnoise(lon * 1.3, lat * 1.3) * 0.6 + vnoise(lon * 3.1, lat * 3.1) * 0.3 + vnoise(lon * 7.3, lat * 7.3) * 0.15;
  h += (n - 0.5) * (0.9 + (h - 1) * 0.35);
  return Math.max(1, h);
}
