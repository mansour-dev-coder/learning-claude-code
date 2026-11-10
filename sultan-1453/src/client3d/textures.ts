// Procedural canvas textures, drawn once at startup: İznik tiles, a Divan carpet, court paving, marble,
// grass and a sky gradient. No image files, so the artifact stays self-contained.
import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

function canvas(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, key: string, repeat: [number, number] = [1, 1]) {
  const k = `${key}:${repeat.join('x')}`;
  if (cache.has(k)) return cache.get(k)!;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  cache.set(k, t);
  return t;
}

/** Deterministic noise so textures look the same each load. */
function rand(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function speckle(g: CanvasRenderingContext2D, s: number, n: number, alpha: number, seed: number) {
  const r = rand(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${alpha * r()})` : `rgba(255,255,255,${alpha * r()})`;
    g.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2);
  }
}

/** An İznik tile: white ground, cobalt and turquoise saz leaves and a red tulip, with a border. */
export function iznik(repeat: [number, number] = [1, 1]) {
  return canvas(256, (g, s) => {
    g.fillStyle = '#f4f1ea';
    g.fillRect(0, 0, s, s);
    const c = s / 2;
    // four-fold rosette
    for (let k = 0; k < 4; k++) {
      g.save();
      g.translate(c, c);
      g.rotate((k * Math.PI) / 2);
      g.fillStyle = '#1f4fa0';
      g.beginPath();
      g.moveTo(0, -12);
      g.bezierCurveTo(40, -40, 70, -90, 4, -122);
      g.bezierCurveTo(-30, -80, -26, -40, 0, -12);
      g.fill();
      g.fillStyle = '#2aa3a0';
      g.beginPath();
      g.ellipse(48, -48, 16, 34, Math.PI / 4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#c0392b';
      g.beginPath();
      g.moveTo(0, -60); g.quadraticCurveTo(10, -78, 0, -96); g.quadraticCurveTo(-10, -78, 0, -60);
      g.fill();
      g.restore();
    }
    g.fillStyle = '#c0392b';
    g.beginPath(); g.arc(c, c, 14, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f4f1ea';
    g.beginPath(); g.arc(c, c, 6, 0, Math.PI * 2); g.fill();
    // corner quarter-medallions join the next tile
    g.fillStyle = '#1f4fa0';
    for (const [x, y] of [[0, 0], [s, 0], [0, s], [s, s]]) { g.beginPath(); g.arc(x, y, 30, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(30,50,90,0.35)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, s - 2, s - 2);
    speckle(g, s, 500, 0.08, 3);
  }, 'iznik', repeat);
}

/** A red Ottoman carpet with a central medallion, borders and small repeating motifs. */
export function carpet(repeat: [number, number] = [1, 1]) {
  return canvas(512, (g, s) => {
    g.fillStyle = '#8e1f1f';
    g.fillRect(0, 0, s, s);
    // borders
    g.fillStyle = '#1d2a4a'; g.fillRect(0, 0, s, 40); g.fillRect(0, s - 40, s, 40); g.fillRect(0, 0, 40, s); g.fillRect(s - 40, 0, 40, s);
    g.strokeStyle = '#d8b04a'; g.lineWidth = 4; g.strokeRect(44, 44, s - 88, s - 88); g.strokeRect(8, 8, s - 16, s - 16);
    for (let i = 60; i < s - 40; i += 32) {
      for (const [x, y] of [[i, 20], [i, s - 20], [20, i], [s - 20, i]]) { g.fillStyle = '#d8b04a'; g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x + 8, y); g.lineTo(x, y + 8); g.lineTo(x - 8, y); g.fill(); }
    }
    // field motifs
    const r = rand(7);
    for (let y = 80; y < s - 60; y += 46) for (let x = 80; x < s - 60; x += 46) {
      if (Math.hypot(x - s / 2, y - s / 2) < 120) continue;
      g.fillStyle = r() < 0.5 ? '#e9c46a' : '#f4f1ea';
      g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(29,42,74,0.8)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 9, y); g.lineTo(x + 9, y); g.moveTo(x, y - 9); g.lineTo(x, y + 9); g.stroke();
    }
    // medallion
    g.save(); g.translate(s / 2, s / 2);
    g.fillStyle = '#1d2a4a'; g.beginPath(); g.ellipse(0, 0, 120, 100, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d8b04a'; g.beginPath(); g.ellipse(0, 0, 92, 74, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8e1f1f'; g.beginPath(); g.ellipse(0, 0, 70, 54, 0, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 8; k++) { g.rotate(Math.PI / 4); g.fillStyle = '#f4f1ea'; g.beginPath(); g.ellipse(0, -34, 7, 16, 0, 0, Math.PI * 2); g.fill(); }
    g.restore();
    speckle(g, s, 6000, 0.12, 11); // wool
  }, 'carpet', repeat);
}

/** Court paving: irregular limestone flags with mortar joints. */
export function paving(repeat: [number, number] = [1, 1]) {
  return canvas(256, (g, s) => {
    g.fillStyle = '#8d8270';
    g.fillRect(0, 0, s, s);
    const r = rand(5);
    const rows = 4;
    for (let row = 0; row < rows; row++) {
      let x = row % 2 ? -32 : 0;
      const y = (row * s) / rows;
      while (x < s) {
        const w = 48 + r() * 40;
        const v = 190 + Math.floor(r() * 30);
        g.fillStyle = `rgb(${v},${v - 8},${v - 26})`;
        g.fillRect(x + 2, y + 2, w - 4, s / rows - 4);
        x += w;
      }
    }
    speckle(g, s, 3000, 0.12, 9);
  }, 'paving', repeat);
}

/** Polished marble with soft veins. */
export function marble(repeat: [number, number] = [1, 1]) {
  return canvas(256, (g, s) => {
    g.fillStyle = '#ece6da';
    g.fillRect(0, 0, s, s);
    const r = rand(13);
    g.strokeStyle = 'rgba(120,110,100,0.25)';
    for (let i = 0; i < 14; i++) {
      g.lineWidth = 0.5 + r() * 1.5;
      g.beginPath();
      let x = r() * s, y = r() * s;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (r() - 0.3) * 60; y += (r() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
    g.strokeStyle = 'rgba(90,80,70,0.25)'; g.lineWidth = 2; g.strokeRect(0, 0, s, s);
  }, 'marble', repeat);
}

/** Grass for the courts. */
export function grass(repeat: [number, number] = [1, 1]) {
  return canvas(256, (g, s) => {
    g.fillStyle = '#6f8f4e';
    g.fillRect(0, 0, s, s);
    const r = rand(17);
    for (let i = 0; i < 5000; i++) {
      const v = Math.floor(r() * 50);
      g.fillStyle = `rgba(${70 + v},${110 + v},${50 + v / 2},0.6)`;
      g.fillRect(r() * s, r() * s, 1, 2 + r() * 3);
    }
  }, 'grass', repeat);
}

/** Plastered wall with a faint wash. */
export function plaster(repeat: [number, number] = [1, 1]) {
  return canvas(256, (g, s) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    speckle(g, s, 4000, 0.06, 23);
  }, 'plaster', repeat);
}

/** A vertical sky gradient for the background. */
export function sky(top = '#5d8fc4', horizon = '#e8d9bd') {
  return canvas(64, (g, s) => {
    const gr = g.createLinearGradient(0, 0, 0, s);
    gr.addColorStop(0, top);
    gr.addColorStop(0.75, horizon);
    gr.addColorStop(1, horizon);
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  }, `sky${top}${horizon}`);
}
