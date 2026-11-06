// Voxel terrain: one InstancedMesh of columns (one draw call). Each column's colour is its biome tinted by
// the owner of its province, with darker cells along province borders.
import * as THREE from 'three';
import { CELL, CELL_W, COLS, EXTENT, ROWS, hash, heightAt, isLand, provinceAt, toWorld } from './geo';
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

export class Terrain {
  cells: Cell[] = [];
  mesh: THREE.InstancedMesh;
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

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh = new THREE.InstancedMesh(columnGeometry(), mat, this.cells.length);
    const m = new THREE.Matrix4();
    this.cells.forEach((cell, i) => {
      m.makeScale(CELL_W.x * 0.999, cell.h * BLOCK, CELL_W.z * 0.999);
      m.setPosition(cell.x, 0, cell.z);
      this.mesh.setMatrixAt(i, m);
      this.mesh.setColorAt(i, cell.base);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
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
  }

  /** Top surface height (world y) of the land at a province seat, for placing models. */
  heightAtWorld(x: number, z: number) {
    let best: Cell | null = null;
    let bd = Infinity;
    for (const cell of this.cells) {
      const d = (cell.x - x) ** 2 + (cell.z - z) ** 2;
      if (d < bd) { bd = d; best = cell; }
    }
    return best && bd < 1.2 ? best.h * BLOCK : 0;
  }
}
