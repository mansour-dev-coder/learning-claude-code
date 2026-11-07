// Stage C: short, stylised 3D scenes driven by the engine's result. No player control; they play out and
// end with the outcome the engine already decided. Each scene owns its renderer and frees it when done.
import * as THREE from 'three';
import { Builder } from './models';

export type CinematicSpec =
  | {
      kind: 'siege';
      town: string;
      walls: number; // 0–100
      breachFrom: number;
      breachTo: number;
      outcome: 'stormed' | 'surrender' | 'repulsed' | 'continue';
      attackerColor: string;
      defenderColor: string;
      bombards: number;
      guns: number;
      caption: string;
      grand?: boolean; // Constantinople: triple land walls and Hagia Sophia
    }
  | { kind: 'battle'; title: string; won: boolean; ourColor: string; theirColor: string; ourMen: number; theirMen: number; caption: string }
  | { kind: 'bosporus'; caption: string };

interface Scene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  duration: number;
  update(t: number, dt: number): void;
  captions: [number, string][];
}

const CSS = `
.cine { position: absolute; inset: 0; z-index: 30; background: #000; }
.cine canvas { width: 100%; height: 100%; display: block; }
.cine .bars::before, .cine .bars::after { content: ''; position: absolute; left: 0; right: 0; height: 9%; background: #000; z-index: 1; }
.cine .bars::before { top: 0; } .cine .bars::after { bottom: 0; }
.cine .cap { position: absolute; left: 50%; bottom: 12%; transform: translateX(-50%); width: min(760px, calc(100% - 32px)); text-align: center; color: #f3ecd9;
  font: italic 20px/1.45 "Alegreya", Georgia, serif; text-shadow: 0 2px 6px #000; z-index: 2; transition: opacity .6s; }
.cine .skip { position: absolute; right: max(16px, env(safe-area-inset-right, 0px)); top: max(16px, env(safe-area-inset-top, 0px)); z-index: 3; font: 600 14px "Alegreya Sans", system-ui, sans-serif;
  color: #eee; background: rgba(0,0,0,.5); border: 1px solid rgba(255,255,255,.3); border-radius: 7px; padding: 8px 12px; cursor: pointer; }
.cine .fade { position: absolute; inset: 0; background: #000; z-index: 2; pointer-events: none; transition: opacity 1s; }
@media (prefers-reduced-motion: reduce) { .cine .cap { transition: none; } }
`;

export function playCinematic(root: HTMLElement, spec: CinematicSpec): Promise<void> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'cine';
    wrap.innerHTML = `<style>${CSS}</style><div class="bars"></div><div class="cap"></div><button class="skip">Skip ▸</button><div class="fade"></div>`;
    root.append(wrap);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    wrap.prepend(renderer.domElement);
    const cap = wrap.querySelector('.cap') as HTMLElement;
    const fade = wrap.querySelector('.fade') as HTMLElement;
    const sc = spec.kind === 'siege' ? siegeScene(spec) : spec.kind === 'battle' ? battleScene(spec) : bosporusScene(spec);
    const size = () => {
      const w = wrap.clientWidth || 1, h = wrap.clientHeight || 1;
      renderer.setSize(w, h, false);
      sc.camera.aspect = w / h;
      sc.camera.updateProjectionMatrix();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(wrap);
    let t = 0, last = performance.now(), done = false, capIdx = -1;
    requestAnimationFrame(() => (fade.style.opacity = '0'));
    const finish = () => {
      if (done) return;
      done = true;
      fade.style.opacity = '1';
      setTimeout(() => {
        ro.disconnect();
        renderer.dispose();
        sc.scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); });
        wrap.remove();
        resolve();
      }, 700);
    };
    (wrap.querySelector('.skip') as HTMLButtonElement).onclick = finish;
    const loop = () => {
      if (done) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000); // real time, so captions keep pace on slow machines
      last = now;
      t += dt;
      sc.update(t, dt);
      let i = -1;
      for (let k = 0; k < sc.captions.length; k++) if (t >= sc.captions[k][0]) i = k;
      if (i !== capIdx) { capIdx = i; cap.style.opacity = '0'; setTimeout(() => { cap.textContent = i >= 0 ? sc.captions[i][1] : ''; cap.style.opacity = '1'; }, 250); }
      renderer.render(sc.scene, sc.camera);
      if (t >= sc.duration) finish();
      else requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}

// ── shared pieces ──────────────────────────────────────────────────────────

function baseScene(sky: string) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(sky);
  scene.fog = new THREE.Fog(sky, 40, 120);
  scene.add(new THREE.HemisphereLight('#f6f2e8', '#5b4a36', 1.6));
  const sun = new THREE.DirectionalLight('#ffe7c2', 2.2);
  sun.position.set(-20, 30, 25);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  return { scene, camera };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Camera path through keyframes [time, position, look-at]. */
function camPath(cam: THREE.PerspectiveCamera, keys: [number, THREE.Vector3, THREE.Vector3][], t: number) {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const [t0, p0, l0] = keys[i], [t1, p1, l1] = keys[Math.min(i + 1, keys.length - 1)];
  const u = ease((t - t0) / Math.max(0.001, t1 - t0));
  cam.position.lerpVectors(p0, p1, u);
  cam.lookAt(new THREE.Vector3().lerpVectors(l0, l1, u));
}

/** Smoke and dust: pooled translucent puffs. */
class Puffs {
  group = new THREE.Group();
  private items: { m: THREE.Mesh; v: THREE.Vector3; life: number; max: number; grow: number }[] = [];
  private geo = new THREE.IcosahedronGeometry(0.5, 0);
  spawn(at: THREE.Vector3, color: string, n: number, spread = 0.6, life = 2.2, up = 0.8) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.geo, new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.85, flatShading: true }));
      m.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * spread * 0.5, (Math.random() - 0.5) * spread));
      m.scale.setScalar(0.4 + Math.random() * 0.4);
      this.group.add(m);
      this.items.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 0.6, up * (0.5 + Math.random()), (Math.random() - 0.5) * 0.6), life: 0, max: life * (0.7 + Math.random() * 0.6), grow: 0.8 + Math.random() });
    }
  }
  update(dt: number) {
    this.items = this.items.filter((p) => {
      p.life += dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.scale.multiplyScalar(1 + dt * p.grow * 0.6);
      (p.m.material as THREE.MeshLambertMaterial).opacity = 0.85 * (1 - p.life / p.max);
      if (p.life >= p.max) { this.group.remove(p.m); (p.m.material as THREE.Material).dispose(); return false; }
      return true;
    });
  }
}

/** Instanced little soldiers that can be moved as a block. */
function troops(count: number, color: string) {
  const b = new Builder();
  b.box(0.22, 0.42, 0.18, color, 0, 0, 0).box(0.17, 0.17, 0.17, '#d9b08c', 0, 0.42, 0).box(0.19, 0.12, 0.19, '#f1ece2', 0, 0.59, 0);
  const proto = b.mesh();
  const mesh = new THREE.InstancedMesh(proto.geometry, proto.material as THREE.Material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

// ── siege ──────────────────────────────────────────────────────────────────

function siegeScene(s: Extract<CinematicSpec, { kind: 'siege' }>): Scene {
  const { scene, camera } = baseScene('#c9d8e2');
  const puffs = new Puffs();
  scene.add(puffs.group);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshLambertMaterial({ color: '#8a9a5b' }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // the wall: individual blocks so the breach can open block by block (x along the wall, facing +z)
  const W = 34, HGT = s.grand ? 7 : 5, BLK = 0.9;
  const cols = Math.round(W / BLK);
  const wallMat = new THREE.MeshLambertMaterial({ color: '#b3aa98', flatShading: true });
  const blockGeo = new THREE.BoxGeometry(BLK * 0.98, BLK * 0.98, 1.6);
  const blocks: THREE.Mesh[][] = [];
  const breachCols = [Math.floor(cols / 2) - 3, Math.floor(cols / 2) + 3]; // the section the guns batter
  for (let c = 0; c < cols; c++) {
    blocks[c] = [];
    const tower = c % 8 === 0;
    const h = tower ? HGT + 3 : HGT;
    for (let r = 0; r < h; r++) {
      const m = new THREE.Mesh(blockGeo, wallMat);
      m.position.set(-W / 2 + c * BLK, BLK / 2 + r * BLK, 0);
      if (tower) m.scale.set(1.3, 1, 1.6);
      scene.add(m);
      blocks[c].push(m);
    }
  }
  if (s.grand) {
    // outer wall and moat in front of the main wall
    const outer = new THREE.Mesh(new THREE.BoxGeometry(W, 3, 1.2), wallMat);
    outer.position.set(0, 1.5, 4);
    scene.add(outer);
    const moat = new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, 2.5), new THREE.MeshLambertMaterial({ color: '#3d6f8f' }));
    moat.position.set(0, 0.05, 7);
    scene.add(moat);
  }
  // the city behind
  const city = new Builder();
  for (let i = 0; i < 40; i++) {
    const x = -15 + (i % 10) * 3.3 + Math.sin(i) * 0.6, z = -4 - Math.floor(i / 10) * 3.2;
    const h = 1.6 + (i % 3) * 0.8;
    city.box(2, h, 2, '#e8e0cf', x, 0, z).add(new THREE.ConeGeometry(1.5, 1, 4).rotateY(Math.PI / 4), '#a8502f', x, h + 0.5, z);
  }
  if (s.grand) city.box(7, 5, 6, '#d9c9a8', 4, 0, -12).dome(3.6, '#8d99a6', 4, 5, -12);
  else city.box(3, 3, 4, '#e8e0cf', 0, 0, -9).dome(1.6, '#a8502f', 0, 3, -9);
  scene.add(city.mesh());
  // banner on the main tower
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 5), new THREE.MeshLambertMaterial({ color: '#3a3a3a' }));
  const towerTop = blocks[Math.floor(cols / 2) - 8 >= 0 ? Math.floor(cols / 2) - 8 : 0];
  pole.position.set(towerTop[0].position.x, (towerTop.length + 2) * BLK, 0);
  scene.add(pole);
  const flagMat = new THREE.MeshLambertMaterial({ color: s.defenderColor, side: THREE.DoubleSide });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), flagMat);
  flag.position.set(pole.position.x + 0.9, pole.position.y + 1.3, 0);
  scene.add(flag);

  // the battery: bombards in front, the camp behind them
  const guns: THREE.Vector3[] = [];
  const nGuns = Math.max(3, Math.min(9, Math.round(s.bombards / 2 + s.guns / 20)));
  const battery = new Builder();
  for (let i = 0; i < nGuns; i++) {
    const x = (i - (nGuns - 1) / 2) * 3.2, z = 22;
    battery.box(1.6, 0.5, 2.6, '#5d4037', x, 0, z).add(new THREE.CylinderGeometry(0.42, 0.55, 3.2, 10).rotateX(Math.PI / 2 - 0.18), '#5c636b', x, 0.95, z - 0.4);
    battery.box(2.4, 1.2, 0.5, '#7a5b3c', x, 0, z - 2.2); // mantlet
    guns.push(new THREE.Vector3(x, 1.3, z - 2.1));
  }
  for (let i = 0; i < 14; i++) battery.cone(1, 1.6, 6, i % 3 ? '#f1ece2' : s.attackerColor, -18 + i * 2.8, 0, 32 + (i % 2) * 2.5);
  battery.cone(2, 3, 8, '#b71c1c', 0, 0, 38); // the Sultan's tent
  scene.add(battery.mesh());

  // assault troops
  const N = 120;
  const army = troops(N, s.attackerColor);
  scene.add(army);
  const start: THREE.Vector3[] = [], dummy = new THREE.Object3D();
  for (let i = 0; i < N; i++) start.push(new THREE.Vector3(-10 + (i % 20), 0, 26 + Math.floor(i / 20) * 0.9));
  const breachX = -W / 2 + ((breachCols[0] + breachCols[1]) / 2) * BLK;

  // breach bookkeeping: blocks to knock out between breachFrom and breachTo
  const breachBlocks: THREE.Mesh[] = [];
  for (let r = HGT - 1; r >= 0; r--) for (let c = breachCols[0]; c <= breachCols[1]; c++) if (blocks[c][r]) breachBlocks.push(blocks[c][r]);
  const removeFrom = Math.round((s.breachFrom / 100) * breachBlocks.length);
  const removeTo = Math.round((s.breachTo / 100) * breachBlocks.length);
  for (let i = 0; i < removeFrom; i++) breachBlocks[i].visible = false;
  let removed = removeFrom;
  const falling: { m: THREE.Mesh; v: THREE.Vector3 }[] = [];

  const shots: { ball: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number }[] = [];
  const ballGeo = new THREE.SphereGeometry(0.28, 8, 6), ballMat = new THREE.MeshLambertMaterial({ color: '#2b2b2b' });
  let nextShot = 2.5, gunIdx = 0;
  const BOMBARD_END = 13;
  const assaults = s.outcome === 'stormed' || s.outcome === 'repulsed';
  const duration = assaults || s.outcome === 'surrender' ? 23 : 16;

  const captions: [number, string][] = [
    [0.4, s.caption],
    [3.5, `The great bombards open fire on the walls of ${s.town}.`],
    [9, s.breachTo > s.breachFrom + 5 ? `Stone by stone the breach widens: ${Math.round(s.breachTo)}%.` : 'The defenders repair each night what the guns break by day.'],
  ];
  if (s.outcome === 'stormed') captions.push([13.5, 'The kettledrums sound the general assault.'], [18.5, `${s.town} is taken by storm.`]);
  else if (s.outcome === 'repulsed') captions.push([13.5, 'The kettledrums sound the general assault.'], [18.5, 'The assault is thrown back from the breach.']);
  else if (s.outcome === 'surrender') captions.push([13.5, 'Their stores exhausted, the defenders ask for terms.'], [18.5, `${s.town} opens its gates.`]);
  else captions.push([13, 'Night falls on the siege lines. The siege goes on.']);

  const keys: [number, THREE.Vector3, THREE.Vector3][] = [
    [0, new THREE.Vector3(-30, 22, 46), new THREE.Vector3(0, 3, 0)],
    [4, new THREE.Vector3(-14, 6, 30), new THREE.Vector3(0, 2, 10)],
    [9, new THREE.Vector3(10, 7, 18), new THREE.Vector3(breachX, 3, 0)],
    [13, new THREE.Vector3(breachX + 4, 4, 12), new THREE.Vector3(breachX, 3, 0)],
    [19, new THREE.Vector3(breachX - 12, 9, 24), new THREE.Vector3(breachX, 2, 2)],
    [duration, new THREE.Vector3(breachX - 4, 18, 34), new THREE.Vector3(breachX, 3, -2)],
  ];

  return {
    scene, camera, duration, captions,
    update(t, dt) {
      camPath(camera, keys, t);
      puffs.update(dt);
      flag.rotation.y = Math.sin(t * 3) * 0.15;
      // firing
      if (t >= nextShot && t < BOMBARD_END) {
        const g = guns[gunIdx++ % guns.length];
        puffs.spawn(g.clone().add(new THREE.Vector3(0, 0, -1.2)), '#d8d3c8', 6, 1, 2.8, 0.6);
        puffs.spawn(g.clone().add(new THREE.Vector3(0, 0, -1.4)), '#ffb347', 2, 0.3, 0.25, 0.2);
        const target = new THREE.Vector3(breachX + (Math.random() - 0.5) * 5, 1 + Math.random() * (HGT - 1) * BLK, 0.8);
        const ball = new THREE.Mesh(ballGeo, ballMat);
        ball.position.copy(g);
        scene.add(ball);
        shots.push({ ball, from: g.clone(), to: target, t: 0 });
        nextShot = t + 0.9 + Math.random() * 0.6;
      }
      for (const sh of [...shots]) {
        sh.t += dt / 0.8;
        const p = new THREE.Vector3().lerpVectors(sh.from, sh.to, sh.t);
        p.y += Math.sin(Math.PI * Math.min(1, sh.t)) * 3;
        sh.ball.position.copy(p);
        if (sh.t >= 1) {
          scene.remove(sh.ball);
          shots.splice(shots.indexOf(sh), 1);
          puffs.spawn(sh.to, '#cfc4b0', 7, 1.4, 2, 1);
          // knock out blocks in proportion to the engine's breach for this month
          const due = Math.round(lerp(removeFrom, removeTo, Math.min(1, (t - 2.5) / (BOMBARD_END - 3))));
          while (removed < due && removed < breachBlocks.length) {
            const m = breachBlocks[removed++];
            m.visible = false;
            const rubble = new THREE.Mesh(blockGeo, wallMat);
            rubble.position.copy(m.position);
            rubble.scale.setScalar(0.6);
            scene.add(rubble);
            falling.push({ m: rubble, v: new THREE.Vector3((Math.random() - 0.5) * 2, 1, 2 + Math.random() * 2) });
          }
        }
      }
      for (const f of falling) {
        if (f.m.position.y <= 0.3) continue;
        f.v.y -= 9.8 * dt;
        f.m.position.addScaledVector(f.v, dt);
        f.m.rotation.x += dt * 3;
        if (f.m.position.y < 0.3) f.m.position.y = 0.3;
      }
      // assault or surrender
      const a = Math.max(0, t - 13.5);
      for (let i = 0; i < N; i++) {
        const st = start[i];
        let p = st.clone();
        if (assaults && a > 0) {
          const run = Math.min(1, (a - (i % 10) * 0.08) / 4.5);
          const tgt = new THREE.Vector3(breachX + ((i % 12) - 6) * 0.35, 0, s.outcome === 'stormed' ? -3 - (i % 5) : 1.5);
          p = st.clone().lerp(tgt, Math.max(0, run));
          if (s.outcome === 'repulsed' && a > 5) p = tgt.clone().lerp(st, Math.min(1, (a - 5) / 3.5));
          p.y = Math.abs(Math.sin((a + i) * 9)) * 0.12;
        }
        dummy.position.copy(p);
        dummy.rotation.y = Math.PI;
        dummy.updateMatrix();
        army.setMatrixAt(i, dummy.matrix);
      }
      army.instanceMatrix.needsUpdate = true;
      if (assaults && a > 2 && a < 6 && Math.random() < 0.3) puffs.spawn(new THREE.Vector3(breachX + (Math.random() - 0.5) * 4, 1, 1), '#c9b99a', 2, 1, 1.5, 0.8);
      if ((s.outcome === 'stormed' && a > 5) || (s.outcome === 'surrender' && a > 4)) flagMat.color.set(s.outcome === 'surrender' && a < 7 ? '#ffffff' : s.attackerColor);
    },
  };
}

// ── field battle ───────────────────────────────────────────────────────────

function battleScene(s: Extract<CinematicSpec, { kind: 'battle' }>): Scene {
  const { scene, camera } = baseScene('#cfdbe4');
  const puffs = new Puffs();
  scene.add(puffs.group);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshLambertMaterial({ color: '#8fa05e' }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const nUs = Math.max(40, Math.min(160, Math.round(s.ourMen / 250))), nThem = Math.max(40, Math.min(160, Math.round(s.theirMen / 250)));
  const us = troops(nUs, s.ourColor), them = troops(nThem, s.theirColor);
  scene.add(us, them);
  const dummy = new THREE.Object3D();
  const place = (mesh: THREE.InstancedMesh, n: number, z0: number, dir: number, t: number, winner: boolean) => {
    const adv = Math.min(1, t / 6);
    const clash = Math.max(0, t - 6);
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / 20), col = i % 20;
      let z = z0 + dir * row * 0.9 - dir * adv * (Math.abs(z0) - 1.2);
      if (clash > 0) z += winner ? -dir * Math.min(3, clash * 0.6) : dir * Math.min(14, clash * clash * 0.5);
      const alive = winner || clash < 1 || (i * 7919) % 100 > clash * 9;
      dummy.position.set((col - 10) * 0.7 + Math.sin(i) * 0.15, alive ? Math.abs(Math.sin((t + i) * 8)) * 0.1 : -1, z);
      dummy.rotation.y = dir > 0 ? Math.PI : 0;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  const captions: [number, string][] = [
    [0.4, s.caption],
    [4, 'The two armies close across the plain.'],
    [8.5, s.won ? 'The enemy line breaks and flees.' : 'Our line wavers, breaks, and falls back.'],
    [13, s.won ? `Victory: ${s.title}.` : `Defeat: ${s.title}.`],
  ];
  const keys: [number, THREE.Vector3, THREE.Vector3][] = [
    [0, new THREE.Vector3(-26, 16, 22), new THREE.Vector3(0, 0, 0)],
    [6, new THREE.Vector3(-14, 5, 8), new THREE.Vector3(0, 1, 0)],
    [11, new THREE.Vector3(12, 8, -10), new THREE.Vector3(0, 0, 2)],
    [16, new THREE.Vector3(0, 24, 26), new THREE.Vector3(0, 0, 0)],
  ];
  return {
    scene, camera, duration: 16, captions,
    update(t, dt) {
      camPath(camera, keys, t);
      puffs.update(dt);
      place(us, nUs, 14, 1, t, s.won);
      place(them, nThem, -14, -1, t, !s.won);
      if (t > 5.5 && t < 11 && Math.random() < 0.4) puffs.spawn(new THREE.Vector3((Math.random() - 0.5) * 14, 0.6, (Math.random() - 0.5) * 2), '#c8b993', 2, 1.2, 1.6, 0.7);
    },
  };
}

// ── the Throat-Cutter: Rumeli Hisarı's guns sink a ship that will not strike sail (November 1452) ──

function bosporusScene(s: Extract<CinematicSpec, { kind: 'bosporus' }>): Scene {
  const { scene, camera } = baseScene('#b9cfdf');
  const puffs = new Puffs();
  scene.add(puffs.group);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshLambertMaterial({ color: '#3d7fa6' }));
  water.rotation.x = -Math.PI / 2;
  scene.add(water);
  // the two shores
  const shores = new Builder();
  shores.box(60, 2.5, 80, '#7f9a5a', -38, 0, 0).box(60, 2.5, 80, '#7f9a5a', 38, 0, 0);
  // Rumeli Hisarı: three great towers and curtain walls climbing the hill (west bank)
  for (const [x, z, r, h] of [[-10, 8, 2.6, 11], [-16, -6, 2.4, 10], [-12, -14, 2, 8]] as [number, number, number, number][])
    shores.add(new THREE.CylinderGeometry(r, r * 1.05, h, 10), '#d8cfbe', x, 2.5 + h / 2, z).add(new THREE.ConeGeometry(r * 1.15, 3, 10), '#8d99a6', x, 2.5 + h + 1.5, z);
  shores.box(1.2, 5, 14, '#d8cfbe', -10.5, 2.5, 1).box(6, 5, 1.2, '#d8cfbe', -13, 2.5, -10).box(1.2, 4, 8, '#d8cfbe', -14, 2.5, -10);
  // Anadolu Hisarı across the water
  shores.box(4, 6, 4, '#d8cfbe', 12, 2.5, 4).add(new THREE.ConeGeometry(3, 2.5, 4).rotateY(Math.PI / 4), '#a8502f', 12, 9.7, 4);
  // shore battery
  const muzzles: THREE.Vector3[] = [];
  for (let i = 0; i < 4; i++) {
    const z = 4 - i * 3;
    shores.box(1.2, 0.5, 1.8, '#5d4037', -8.6, 2.5, z).add(new THREE.CylinderGeometry(0.35, 0.45, 2.4, 10).rotateZ(Math.PI / 2 - 0.1), '#5c636b', -7.6, 3.3, z);
    muzzles.push(new THREE.Vector3(-6.3, 3.4, z));
  }
  scene.add(shores.mesh());
  // the ship: hull, castles, masts, sails
  const ship = new THREE.Group();
  const sb = new Builder();
  sb.box(1.8, 1.2, 6, '#6d4c33', 0, 0, 0).box(1.9, 1, 1.6, '#6d4c33', 0, 1.2, 2.2).box(1.9, 0.8, 1.2, '#6d4c33', 0, 1.2, -2.4);
  sb.cyl(0.08, 6, 5, '#3e2c1f', 0, 1.2, 0.5).cyl(0.07, 4, 5, '#3e2c1f', 0, 1.2, -1.6);
  sb.box(0.08, 3, 2.6, '#f1ece2', 0, 3.6, 0.5).box(0.08, 2, 1.8, '#f1ece2', 0, 3, -1.6);
  sb.box(0.05, 0.8, 1.2, '#b71c1c', 0, 6.8, 0.5); // the lion of St Mark’s colours
  ship.add(sb.mesh());
  scene.add(ship);
  let hits = 0, nextShot = 4;
  const shots: { ball: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number }[] = [];
  const ballGeo = new THREE.SphereGeometry(0.3, 8, 6), ballMat = new THREE.MeshLambertMaterial({ color: '#222' });
  const captions: [number, string][] = [
    [0.4, s.caption],
    [4, 'A Venetian ship runs the strait and will not strike sail.'],
    [9, 'The great guns of the fortress answer.'],
    [14, 'Holed below the waterline, she founders in the current.'],
    [18, 'No ship will pass the Throat-Cutter again without the Sultan’s leave.'],
  ];
  const keys: [number, THREE.Vector3, THREE.Vector3][] = [
    [0, new THREE.Vector3(-42, 30, 52), new THREE.Vector3(-4, 3, 0)],
    [6, new THREE.Vector3(-32, 13, 36), new THREE.Vector3(0, 2, 8)],
    [12, new THREE.Vector3(-24, 10, 14), new THREE.Vector3(2, 1, 0)],
    [17, new THREE.Vector3(18, 9, 8), new THREE.Vector3(2, 0, -6)],
    [22, new THREE.Vector3(-36, 26, 32), new THREE.Vector3(-4, 2, -4)],
  ];
  return {
    scene, camera, duration: 22, captions,
    update(t, dt) {
      camPath(camera, keys, t);
      puffs.update(dt);
      // she sails down the strait (+z → −z), then sinks
      const sinking = Math.max(0, t - 13);
      const z = lerp(26, -10, Math.min(1, t / 16));
      ship.position.set(1.5, -sinking * 0.35 + Math.sin(t * 1.4) * 0.05, z);
      ship.rotation.z = Math.min(0.9, sinking * 0.18);
      ship.rotation.x = Math.sin(t * 1.1) * 0.03 + Math.min(0.3, sinking * 0.05);
      if (t >= nextShot && t < 14) {
        const m = muzzles[Math.floor(t * 10) % muzzles.length];
        puffs.spawn(m, '#dcd6ca', 6, 0.8, 2.6, 0.5);
        const ball = new THREE.Mesh(ballGeo, ballMat);
        ball.position.copy(m);
        scene.add(ball);
        shots.push({ ball, from: m.clone(), to: ship.position.clone().add(new THREE.Vector3(0, 0.6, -2.5 + Math.random())), t: 0 });
        nextShot = t + 1.1;
      }
      for (const sh of [...shots]) {
        sh.t += dt / 0.7;
        const p = new THREE.Vector3().lerpVectors(sh.from, sh.to, sh.t);
        p.y += Math.sin(Math.PI * Math.min(1, sh.t)) * 1.6;
        sh.ball.position.copy(p);
        if (sh.t >= 1) {
          scene.remove(sh.ball);
          shots.splice(shots.indexOf(sh), 1);
          hits++;
          puffs.spawn(sh.to, hits > 2 ? '#7a6a5a' : '#e8f1f6', 5, 1, 1.6, 1);
        }
      }
      if (sinking > 0 && Math.random() < 0.15) puffs.spawn(ship.position.clone().add(new THREE.Vector3(0, 0.5, 0)), '#e8f1f6', 1, 1.5, 1.4, 0.6);
    },
  };
}
