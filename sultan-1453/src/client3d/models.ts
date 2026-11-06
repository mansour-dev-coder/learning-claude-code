// Procedural low-poly models. Every model is built from boxes, prisms and cones with per-vertex colour and
// merged into one geometry, so each model is a single draw call. No third-party assets.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

class Builder {
  parts: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, ry = 0) {
    const geo = g.index ? g.toNonIndexed() : g.clone();
    if (ry) geo.rotateY(ry);
    geo.translate(x, y, z);
    const c = new THREE.Color(color);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    const normal = geo.attributes.normal;
    for (let i = 0; i < n; i++) {
      const shade = normal ? (normal.getY(i) > 0.5 ? 1 : normal.getY(i) < -0.5 ? 0.5 : 0.8) : 1;
      arr[i * 3] = c.r * shade; arr[i * 3 + 1] = c.g * shade; arr[i * 3 + 2] = c.b * shade;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'color'].includes(k)) geo.deleteAttribute(k);
    this.parts.push(geo);
    return this;
  }
  box(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0, ry = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z, ry);
  }
  cone(r: number, h: number, seg: number, color: string, x = 0, y = 0, z = 0) {
    return this.add(new THREE.ConeGeometry(r, h, seg), color, x, y + h / 2, z);
  }
  cyl(r: number, h: number, seg: number, color: string, x = 0, y = 0, z = 0) {
    return this.add(new THREE.CylinderGeometry(r, r, h, seg), color, x, y + h / 2, z);
  }
  dome(r: number, color: string, x = 0, y = 0, z = 0) {
    return this.add(new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), color, x, y, z);
  }
  mesh() {
    const m = new THREE.Mesh(mergeGeometries(this.parts), MAT);
    m.castShadow = false;
    return m;
  }
}

const WALL = '#d8d2c4', ROOF = '#b5502f', WHITE = '#efeae0', STONE = '#a59e90', DARK = '#4a4a4a', LEAD = '#8d99a6';

/** A town: houses, walls if fortified, and a minaret (Ottoman) or church dome (Christian). Size 1–3. */
export function cityModel(opts: { size: number; walls: number; ottoman: boolean; capital: boolean; color: string }) {
  const b = new Builder();
  const s = 0.13;
  const n = 2 + opts.size * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4;
    const r = 0.16 + (i % 2) * 0.1;
    const h = s * (0.8 + (i % 3) * 0.25);
    b.box(s, h, s, WHITE, Math.cos(a) * r, 0, Math.sin(a) * r, a);
    b.add(new THREE.ConeGeometry(s * 0.8, s * 0.5, 4), ROOF, Math.cos(a) * r, h + s * 0.25, Math.sin(a) * r);
  }
  if (opts.walls >= 50) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.box(0.24, 0.12, 0.05, STONE, Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42, -a + Math.PI / 2);
      b.box(0.08, 0.18, 0.08, STONE, Math.cos(a + 0.39) * 0.42, 0, Math.sin(a + 0.39) * 0.42);
    }
  }
  if (opts.ottoman) {
    b.box(0.22, 0.14, 0.22, WHITE, 0, 0, 0).dome(0.12, LEAD, 0, 0.14, 0);
    b.cyl(0.025, 0.42, 6, WHITE, 0.16, 0, -0.1).cone(0.035, 0.1, 6, LEAD, 0.16, 0.42, -0.1);
  } else {
    b.box(0.2, 0.16, 0.26, WHITE, 0, 0, 0).dome(0.09, opts.color === '#7b1fa2' ? '#c9a227' : ROOF, 0, 0.16, 0);
  }
  // banner in the owner's colour
  b.cyl(0.012, 0.5, 4, DARK, -0.08, 0, 0.12).box(0.14, 0.09, 0.01, opts.color, -0.01, 0.4, 0.12);
  if (opts.capital) b.box(0.05, 0.05, 0.05, '#f2c94c', -0.08, 0.5, 0.12);
  const m = b.mesh();
  m.scale.setScalar(2.0 + opts.size * 0.3);
  return m;
}

/** Constantinople: the Theodosian land walls, sea walls and Hagia Sophia. */
export function constantinopleModel(color: string, ottoman: boolean) {
  const b = new Builder();
  for (let i = 0; i < 7; i++) {
    const z = -0.6 + i * 0.2;
    b.box(0.08, 0.26, 0.2, STONE, -0.55, 0, z).box(0.13, 0.36, 0.11, STONE, -0.55, 0, z);
    b.box(0.06, 0.16, 0.2, STONE, -0.68, 0, z); // outer wall
  }
  for (let i = 0; i < 6; i++) b.box(0.2, 0.12, 0.05, STONE, -0.4 + i * 0.2, 0, -0.68);
  for (let i = 0; i < 14; i++) {
    const x = -0.35 + (i % 5) * 0.17, z = -0.45 + Math.floor(i / 5) * 0.28;
    b.box(0.11, 0.1 + (i % 3) * 0.04, 0.11, WHITE, x, 0, z, i).add(new THREE.ConeGeometry(0.09, 0.06, 4), ROOF, x, 0.16 + (i % 3) * 0.04, z);
  }
  b.box(0.36, 0.22, 0.32, '#d9c9a8', 0.25, 0, 0.25).dome(0.2, LEAD, 0.25, 0.22, 0.25);
  if (ottoman) for (const [x, z] of [[0.05, 0.05], [0.45, 0.05], [0.05, 0.45], [0.45, 0.45]]) b.cyl(0.025, 0.6, 6, WHITE, x, 0, z).cone(0.035, 0.12, 6, LEAD, x, 0.6, z);
  b.cyl(0.015, 0.75, 4, DARK, 0.6, 0, -0.5).box(0.22, 0.13, 0.01, color, 0.72, 0.6, -0.5);
  const m = b.mesh();
  m.scale.setScalar(1.6);
  return m;
}

/** An army: ranks of soldiers in the side's colour around a standard. `men` scales the ranks. */
export function armyModel(color: string, men: number, ottoman: boolean) {
  const b = new Builder();
  const ranks = Math.max(2, Math.min(5, Math.round(Math.log10(Math.max(1000, men)) * 1.6 - 3)));
  for (let r = 0; r < ranks; r++) {
    for (let c = 0; c < 4; c++) {
      const x = (c - 1.5) * 0.12, z = (r - ranks / 2) * 0.13;
      b.box(0.06, 0.1, 0.05, color, x, 0, z).box(0.045, 0.045, 0.045, '#e0c3a3', x, 0.1, z);
      b.box(0.05, 0.03, 0.05, ottoman ? WHITE : DARK, x, 0.145, z); // börk or helmet
    }
  }
  // horse-tail standard (tuğ) or banner
  b.cyl(0.012, 0.55, 4, DARK, 0.32, 0, 0);
  if (ottoman) b.dome(0.05, '#f2c94c', 0.32, 0.55, 0).cone(0.04, 0.14, 6, '#5d4037', 0.32, 0.42, 0);
  else b.box(0.16, 0.1, 0.01, color, 0.4, 0.44, 0);
  const m = b.mesh();
  m.scale.setScalar(2.4);
  return m;
}

/** A galley: hull, oars and a lateen sail. */
export function galleyModel(color: string) {
  const b = new Builder();
  b.box(0.7, 0.08, 0.16, '#6d4c33', 0, 0, 0).box(0.12, 0.05, 0.1, '#6d4c33', 0.38, 0.04, 0);
  for (let i = 0; i < 6; i++) b.box(0.015, 0.015, 0.34, '#3e2c1f', -0.25 + i * 0.1, 0.05, 0);
  b.cyl(0.012, 0.5, 4, DARK, 0, 0.08, 0).add(new THREE.ConeGeometry(0.18, 0.4, 3), WHITE, 0.05, 0.36, 0);
  b.box(0.12, 0.06, 0.01, color, 0, 0.6, 0);
  const m = b.mesh();
  m.scale.setScalar(2.2);
  return m;
}

/**
 * Siege works around a city: a ring of wall blocks whose facing side loses blocks as the breach grows,
 * bombards on the attacker's side and a camp of tents.
 */
export function siegeModel(breach: number, attackerColor: string) {
  const b = new Builder();
  const seg = 12;
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const facing = Math.cos(a) < -0.3; // the side facing the guns (−x)
    const lost = facing ? Math.round((breach / 100) * 3) : 0;
    for (let k = 0; k < 3 - lost; k++) b.box(0.22, 0.09, 0.09, STONE, Math.cos(a) * 0.55, k * 0.09, Math.sin(a) * 0.55, -a + Math.PI / 2);
    if (facing && lost > 0) b.box(0.18, 0.04, 0.12, '#7d746a', Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62, -a); // rubble
  }
  for (let i = 0; i < 3; i++) {
    const z = (i - 1) * 0.28;
    b.box(0.16, 0.04, 0.1, '#5d4037', -1.0, 0, z).add(new THREE.CylinderGeometry(0.035, 0.045, 0.24, 8).rotateZ(Math.PI / 2), '#555c63', -0.94, 0.08, z);
  }
  for (let i = 0; i < 5; i++) b.cone(0.07, 0.12, 4, i % 2 ? WHITE : attackerColor, -1.35 - (i % 2) * 0.18, 0, (i - 2) * 0.2);
  const m = b.mesh();
  m.scale.setScalar(1.8);
  return m;
}

/** A text label as a sprite (sharp at the map's zoom range). */
export function labelSprite(text: string, opts: { color?: string; bg?: string; size?: number } = {}) {
  const px = 44;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `600 ${px}px "Alegreya Sans", system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 28;
  canvas.width = w; canvas.height = px + 20;
  ctx.font = `600 ${px}px "Alegreya Sans", system-ui, sans-serif`;
  ctx.fillStyle = opts.bg ?? 'rgba(20,24,32,0.62)';
  ctx.beginPath(); ctx.roundRect(0, 0, w, px + 20, 12); ctx.fill();
  ctx.fillStyle = opts.color ?? '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 14, (px + 20) / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  // constant on-screen size: readable at every zoom level
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, depthTest: false, transparent: true, sizeAttenuation: false }));
  const s = (opts.size ?? 0.26) * 0.075;
  sprite.scale.set((s * w) / (px + 20), s, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/** A small progress bar sprite (e.g. siege breach). */
export function barSprite(value: number, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 20;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(20,24,32,0.75)'; ctx.fillRect(0, 0, 128, 20);
  ctx.fillStyle = color; ctx.fillRect(3, 3, Math.round(122 * Math.max(0, Math.min(1, value / 100))), 14);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, depthTest: false, transparent: true, sizeAttenuation: false }));
  sprite.scale.set(0.09, 0.014, 1);
  sprite.renderOrder = 10;
  return sprite;
}
