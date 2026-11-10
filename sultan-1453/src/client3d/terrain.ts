// Voxel terrain: one InstancedMesh of columns (one draw call). Each column's colour is its biome tinted by
// the owner of its province, with darker cells along province borders.
import * as THREE from 'three';
import { CELL, CELL_W, COLS, EXTENT, ROWS, hash, heightAt, isLand, provinceAt, reliefHeight, toLonLat, toWorld } from './geo';
import { OWNER_COLORS } from './palette';

export const BLOCK = 0.32; // world height of one block

export interface Cell {
  lon: number;
  lat: number;
  h: number;
  province: string | null;
  border: boolean;
  base: THREE.Color; // biome colour
  x: number;
  z: number;
}

function biome(h: number, lat: number, lon: number): THREE.Color {
  const c = new THREE.Color();
  if (h >= 8) c.set('#eef2f4');
  else if (h >= 6) c.set('#8e8577');
  else if (h >= 4) c.set('#8c7d5e');
  else if (h >= 3) c.set('#93995c');
  else if (h >= 2) c.set('#86a55a');
  else c.set('#78ab55');
  // drier south and east: blend toward steppe and desert tones
  const dry = Math.max(0, Math.min(1, (37.5 - lat) / 4 + (lon > 36 && lat < 38 ? 0.3 : 0)));
  if (h < 6 && dry > 0) c.lerp(new THREE.Color('#cdb57c'), dry * 0.8);
  if (h < 4 && lat > 38 && lat < 40.5 && lon > 31 && lon < 37) c.lerp(new THREE.Color('#b9b06e'), 0.35); // Anatolian steppe
  const n = (hash(lon * 7.1, lat * 3.3) - 0.5) * 0.08;
  c.offsetHSL(0, 0, n);
  return c;
}

/** Column geometry with baked shading: tops full brightness, sides darker (multiplied by instance colour). */
function columnGeometry() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  const colors: number[] = [];
  const normal = g.attributes.normal;
  for (let i = 0; i < normal.count; i++) {
    const ny = normal.getY(i), nx = normal.getX(i);
    const shade = ny > 0.5 ? 1 : ny < -0.5 ? 0.4 : nx !== 0 ? 0.72 : 0.82;
    colors.push(shade, shade, shade);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}

export type MapStyle = 'relief' | 'voxel';

/** Relief resolution: vertices per cell edge. */
const SUB = 3;

export class Terrain {
  cells: Cell[] = [];
  mesh: THREE.InstancedMesh;
  relief!: THREE.Mesh;
  group = new THREE.Group();
  style: MapStyle = 'relief';
  private grid: (number | null)[] = [];
  private rh!: Float32Array; // relief height (world y) per vertex
  private vcols = 0;
  private vrows = 0;
  byProvince = new Map<string, number[]>();
  private owners: Record<string, string> = {};
  private hovered: string | null = null;

  constructor() {
    const grid: (number | null)[] = new Array(COLS * ROWS).fill(null);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const lon = EXTENT.lonMin + (c + 0.5) * CELL;
        const lat = EXTENT.latMin + (r + 0.5) * CELL;
        if (!isLand(lon, lat)) continue;
        const h = heightAt(lon, lat);
        const { x, z } = toWorld(lon, lat);
        grid[r * COLS + c] = this.cells.length;
        this.cells.push({ lon, lat, h, province: provinceAt(lon, lat), border: false, base: biome(h, lat, lon), x, z });
      }
    }
    // borders: a cell touching a cell of another province
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = grid[r * COLS + c];
        if (i === null) continue;
        const me = this.cells[i];
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= ROWS || cc >= COLS) continue;
          const j = grid[rr * COLS + cc];
          if (j !== null && this.cells[j].province !== me.province) me.border = true;
        }
      }
    }
    this.cells.forEach((cell, i) => {
      if (!cell.province) return;
      const list = this.byProvince.get(cell.province) ?? [];
      list.push(i);
      this.byProvince.set(cell.province, list);
    });

    this.grid = grid;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh = new THREE.InstancedMesh(columnGeometry(), mat, this.cells.length);
    this.buildRelief();
    this.group.add(this.mesh, this.relief, this.forest);
    this.setStyle('relief');
    const m = new THREE.Matrix4();
    this.cells.forEach((cell, i) => {
      m.makeScale(CELL_W.x * 0.999, cell.h * BLOCK, CELL_W.z * 0.999);
      m.setPosition(cell.x, 0, cell.z);
      this.mesh.setMatrixAt(i, m);
      this.mesh.setColorAt(i, cell.base);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** A smooth heightfield over the same grid: continuous heights, soft coasts, lit normals. */
  private buildRelief() {
    const step = CELL / SUB;
    const vc = COLS * SUB + 1, vr = ROWS * SUB + 1;
    this.vcols = vc; this.vrows = vr;
    const raw = new Float32Array(vc * vr);
    for (let r = 0; r < vr; r++) {
      for (let c = 0; c < vc; c++) {
        const lon = EXTENT.lonMin + c * step, lat = EXTENT.latMin + r * step;
        const land = isLand(lon, lat);
        raw[r * vc + c] = land ? 0.34 + (reliefHeight(lon, lat) - 1) * BLOCK * 0.85 : -0.5;
      }
    }
    // two light blur passes soften the shoreline and the hills
    let h = new Float32Array(raw);
    for (let pass = 0; pass < 2; pass++) {
      const src = h;
      h = new Float32Array(src);
      for (let r = 1; r < vr - 1; r++) for (let c = 1; c < vc - 1; c++) {
        const i = r * vc + c;
        h[i] = src[i] * 0.4 + (src[i - 1] + src[i + 1] + src[i - vc] + src[i + vc]) * 0.1 + (src[i - vc - 1] + src[i - vc + 1] + src[i + vc - 1] + src[i + vc + 1]) * 0.05;
      }
    }
    this.rh = h;
    const pos = new Float32Array(vc * vr * 3);
    for (let r = 0; r < vr; r++) for (let c = 0; c < vc; c++) {
      const { x, z } = toWorld(EXTENT.lonMin + c * step, EXTENT.latMin + r * step);
      const i = r * vc + c;
      pos[i * 3] = x; pos[i * 3 + 1] = h[i]; pos[i * 3 + 2] = z;
    }
    const idx: number[] = [];
    for (let r = 0; r < vr - 1; r++) for (let c = 0; c < vc - 1; c++) {
      const a = r * vc + c, b = a + 1, d = a + vc, e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vc * vr * 3), 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // make sure faces point up (z grows southward, so the winding may be flipped)
    if (g.attributes.normal.getY(Math.floor(vc * vr / 2)) < 0) { idx.reverse(); g.setIndex(idx); g.computeVertexNormals(); }
    this.relief = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
    this.relief.castShadow = true;
    this.relief.receiveShadow = true;
    this.forest = this.plantForests(step);
  }

  forest!: THREE.InstancedMesh;

  /** Low-poly conifers and broadleaf clumps where the land is green and not too high. */
  private plantForests(step: number) {
    const spots: { x: number; y: number; z: number; s: number; dark: boolean }[] = [];
    const vc = this.vcols;
    for (let r = 1; r < this.vrows - 1; r++) for (let c = 1; c < vc - 1; c++) {
      const lon = EXTENT.lonMin + c * step, lat = EXTENT.latMin + r * step;
      const y = this.rh[r * vc + c];
      if (y < 0.45 || y > 2.1) continue;
      const wet = lat > 41.2 || (lat > 40.6 && lon > 30 && lon < 41) || (lat > 39 && lon < 23.5); // Balkans, Pontic coast, Epirus
      const n = hash(lon * 13.7, lat * 11.3);
      const density = (wet ? 0.5 : 0.12) * (y > 1.4 ? 1.2 : 1);
      if (n > density) continue;
      const jx = (hash(lon * 3.1, lat * 9.7) - 0.5) * step, jz = (hash(lon * 8.3, lat * 2.9) - 0.5) * step;
      const { x, z } = toWorld(lon + jx, lat + jz);
      spots.push({ x, y, z, s: 0.7 + hash(lon * 5.5, lat * 6.6) * 0.6, dark: y > 1.2 || lat > 43 });
    }
    const g = new THREE.ConeGeometry(0.11, 0.42, 6);
    g.translate(0, 0.19, 0);
    const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 1 }), spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    spots.forEach((t, i) => {
      sc.set(t.s, t.s * (t.dark ? 1.25 : 0.9), t.s);
      m.compose(p.set(t.x, t.y - 0.03, t.z), q, sc);
      im.setMatrixAt(i, m);
      im.setColorAt(i, col.set(t.dark ? '#2f5232' : '#4f7a3a').offsetHSL(0, 0, (hash(t.x, t.z) - 0.5) * 0.08));
    });
    im.castShadow = true;
    im.receiveShadow = true;
    return im;
  }

  setStyle(style: MapStyle) {
    this.style = style;
    this.mesh.visible = style === 'voxel';
    this.relief.visible = style === 'relief';
    this.forest.visible = style === 'relief';
  }

  /** The cell under a world point (for picking on the relief). */
  cellAtWorld(x: number, z: number): Cell | null {
    const [lon, lat] = toLonLat(x, z);
    const c = Math.floor((lon - EXTENT.lonMin) / CELL), r = Math.floor((lat - EXTENT.latMin) / CELL);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return null;
    const i = this.grid[r * COLS + c];
    return i === null ? null : this.cells[i];
  }

  /** Recolour by owner. `owners` maps province id → owner id. */
  setOwners(owners: Record<string, string>) {
    this.owners = owners;
    this.paint();
  }

  setHover(province: string | null) {
    if (province === this.hovered) return;
    this.hovered = province;
    this.paint();
  }

  private paint() {
    const c = new THREE.Color();
    const own = new THREE.Color();
    this.cells.forEach((cell, i) => {
      const owner = cell.province ? this.owners[cell.province] : undefined;
      if (owner) {
        // owned land takes the power's colour outright; height and a little noise only shade it,
        // so a power reads the same on plain and mountain
        own.set(OWNER_COLORS[owner] ?? '#999999');
        c.copy(own).offsetHSL(0, 0, (cell.h - 3) * 0.018 + (hash(cell.lon * 9.1, cell.lat * 5.7) - 0.5) * 0.05);
        c.lerp(cell.base, 0.12);
      } else {
        c.copy(cell.base).lerp(new THREE.Color('#9aa0a2'), 0.35); // lands outside the game: muted
      }
      if (cell.border) c.multiplyScalar(owner === 'albania' ? 1.9 : 0.68);
      if (cell.province && cell.province === this.hovered) c.lerp(new THREE.Color(owner === 'wallachia' ? '#ffd54f' : '#ffffff'), 0.3);
      this.mesh.setColorAt(i, c);
    });
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.paintRelief();
  }

  /** Relief colours: the land's own colour (forest, steppe, rock, snow) washed with the owner's colour. */
  private paintRelief() {
    const cellCol: (THREE.Color | null)[] = new Array(COLS * ROWS).fill(null);
    const own = new THREE.Color();
    this.cells.forEach((cell, i) => {
      const owner = cell.province ? this.owners[cell.province] : undefined;
      const c = cell.base.clone();
      if (owner) { own.set(OWNER_COLORS[owner] ?? '#999999'); c.lerp(own, 0.4); }
      else c.lerp(new THREE.Color('#a7a596'), 0.3);
      if (cell.border && owner) c.lerp(owner === 'albania' ? new THREE.Color('#ffffff') : new THREE.Color('#2a1d12'), 0.45);
      if (cell.province && cell.province === this.hovered) c.lerp(new THREE.Color('#fff2c0'), 0.35);
      const r = Math.floor((cell.lat - EXTENT.latMin) / CELL), col = Math.floor((cell.lon - EXTENT.lonMin) / CELL);
      cellCol[r * COLS + col] = c;
      void i;
    });
    const attr = this.relief.geometry.attributes.color as THREE.BufferAttribute;
    const sand = new THREE.Color('#cdbb8a'), deep = new THREE.Color('#2c5d73'), snow = new THREE.Color('#f3f5f7'), rock = new THREE.Color('#857a6a');
    const tmp = new THREE.Color();
    const vc = this.vcols;
    const nrm = this.relief.geometry.attributes.normal as THREE.BufferAttribute;
    for (let r = 0; r < this.vrows; r++) for (let c = 0; c < vc; c++) {
      const i = r * vc + c;
      const y = this.rh[i];
      // average the up-to-four cells touching this vertex
      const cr = r / SUB - 0.5, cc = c / SUB - 0.5;
      const r0 = Math.floor(cr), c0 = Math.floor(cc);
      tmp.setRGB(0, 0, 0);
      let wsum = 0;
      for (const [dr, dc] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
        const rr = r0 + dr, ccc = c0 + dc;
        if (rr < 0 || ccc < 0 || rr >= ROWS || ccc >= COLS) continue;
        const col = cellCol[rr * COLS + ccc];
        if (!col) continue;
        const w = (1 - Math.abs(cr - rr)) * (1 - Math.abs(cc - ccc));
        tmp.r += col.r * w; tmp.g += col.g * w; tmp.b += col.b * w; wsum += w;
      }
      if (wsum > 0) tmp.multiplyScalar(1 / wsum); else tmp.copy(deep);
      if (y < 0.28) tmp.lerp(y < 0.05 ? deep : sand, y < 0.05 ? 0.85 : 0.6); // beaches and shallows
      const ny = nrm.getY(i);
      if (y > 0.4 && ny < 0.93) tmp.lerp(rock, Math.min(0.55, (0.93 - ny) * 3)); // steep slopes show bare rock
      if (y > 2.2) tmp.lerp(y > 2.75 ? snow : rock, Math.min(0.85, (y - 2.2) * 1.4));
      attr.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    attr.needsUpdate = true;
  }

  /** Top surface height (world y) of the land at a province seat, for placing models. */
  heightAtWorld(x: number, z: number) {
    if (this.style === 'relief') {
      const [lon, lat] = toLonLat(x, z);
      const c = Math.round(((lon - EXTENT.lonMin) / CELL) * SUB), r = Math.round(((lat - EXTENT.latMin) / CELL) * SUB);
      if (c < 0 || r < 0 || c >= this.vcols || r >= this.vrows) return 0;
      return Math.max(0.25, this.rh[r * this.vcols + c]);
    }
    let best: Cell | null = null;
    let bd = Infinity;
    for (const cell of this.cells) {
      const d = (cell.x - x) ** 2 + (cell.z - z) ** 2;
      if (d < bd) { bd = d; best = cell; }
    }
    return best && bd < 1.2 ? best.h * BLOCK : 0;
  }
}
