// The strategic map: renderer, camera, lights, sea, terrain, markers, hover picking, render loop.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GameState } from '../engine/types';
import { Terrain } from './terrain';
import { Markers } from './markers';
import { SEATS, toWorld } from './geo';

export interface HoverInfo {
  province: string | null;
  x: number;
  y: number;
}

export class MapScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  terrain = new Terrain();
  markers: Markers;
  private clock = new THREE.Clock();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerDirty = false;
  private lastPointer = { x: 0, y: 0 };
  private frame = 0;
  private tickCount = 0;
  private tmp = new THREE.Vector3();
  private running = true;
  private fpsSamples: number[] = [];
  private focusTween: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
  onHover: (h: HoverInfo) => void = () => {};
  onClick: (province: string | null) => void = () => {};

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#9fc4dc');
    this.scene.fog = new THREE.Fog('#9fc4dc', 60, 140);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
    const start = toWorld(SEATS.constantinople.lon - 3, SEATS.constantinople.lat - 1.5);
    this.camera.position.set(start.x - 2, 34, start.z + 30);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(start.x, 0, start.z);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 85;
    this.controls.maxPolarAngle = 1.32;
    this.controls.screenSpacePanning = false;
    this.controls.zoomToCursor = true;

    this.scene.add(new THREE.HemisphereLight('#e8f1ff', '#5a5040', 1.6));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
    sun.position.set(-30, 60, 25);
    this.scene.add(sun);

    // the sea: a shallow shelf and the water surface
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 300), new THREE.MeshLambertMaterial({ color: '#2f6c8f' }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.2;
    this.scene.add(floor);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 300), new THREE.MeshLambertMaterial({ color: '#3d8fbf', transparent: true, opacity: 0.78 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.22;
    this.scene.add(water);

    this.scene.add(this.terrain.mesh);
    this.markers = new Markers(this.terrain);
    this.scene.add(this.markers.group);

    const el = this.renderer.domElement;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.pointerDirty = true;
    });
    el.addEventListener('pointerleave', () => { this.terrain.setHover(null); this.onHover({ province: null, x: 0, y: 0 }); });
    let down = { x: 0, y: 0 };
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    el.addEventListener('pointerup', (e) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return; // a drag, not a click
      const r = el.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const p = this.pick();
      this.terrain.setHover(p);
      this.onHover({ province: p, x: e.clientX, y: e.clientY });
      this.onClick(p);
    });

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.loop();
  }

  resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setState(s: GameState, first = false) {
    const owners: Record<string, string> = {};
    for (const p of Object.values(s.provinces)) owners[p.id] = p.owner;
    this.terrain.setOwners(owners);
    this.markers.update(s, first);
  }

  /** Glide the camera to look at a province. */
  focus(province: string) {
    const s = SEATS[province];
    if (!s) return;
    const { x, z } = toWorld(s.lon, s.lat);
    this.focusTween = { from: this.controls.target.clone(), to: new THREE.Vector3(x, 0, z), t: 0 };
  }

  private pick(): string | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const cityHits = this.raycaster.intersectObjects(this.markers.pickables(), true);
    for (const h of cityHits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.province) o = o.parent;
      if (o) return o.userData.province as string;
    }
    const hit = this.raycaster.intersectObject(this.terrain.mesh, false)[0];
    if (hit?.instanceId === undefined) return null;
    return this.terrain.cells[hit.instanceId].province;
  }

  /**
   * Hide labels that would overlap a more important one (siege > army > fleet > capital > city), so
   * sieges and armies stay legible where many markers crowd together, as around Constantinople.
   */
  private declutter() {
    const W = this.container.clientWidth, H = this.container.clientHeight;
    const k = (this.camera.projectionMatrix.elements[5] * H) / 2;
    const placed: [number, number, number, number][] = [];
    const sprites = this.markers.labels().sort((a, b) => b.userData.priority - a.userData.priority);
    // each label tries its usual anchor (above), then below, right and left, before giving way
    const anchors: [number, number][] = [[0.5, 0], [0.5, 1.15], [-0.08, 0.5], [1.08, 0.5]];
    for (const s of sprites) {
      if (s.userData.anchor === undefined) s.userData.anchor = [s.center.x, s.center.y];
      const p = s.getWorldPosition(this.tmp).project(this.camera);
      if (p.z > 1 || Math.abs(p.x) > 1.2 || Math.abs(p.y) > 1.2) { s.visible = false; continue; }
      const x = ((p.x + 1) / 2) * W, y = ((1 - p.y) / 2) * H;
      const w = s.scale.x * k, h = s.scale.y * k;
      const own = s.userData.anchor as [number, number];
      let chosen: [number, number, number, number] | null = null;
      for (const [cx, cy] of [own, ...anchors]) {
        const left = x - cx * w, top = y - (1 - cy) * h;
        const r: [number, number, number, number] = [left - 3, top - 3, left + w + 3, top + h + 3];
        if (!placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) {
          chosen = r;
          s.center.set(cx, cy);
          break;
        }
        if (s.userData.priority <= 1) break; // plain town labels don't wander
      }
      s.visible = !!chosen;
      if (chosen) placed.push(chosen);
    }
  }

  /** Measured frames per second over the last ~2 seconds. */
  fps() {
    if (this.fpsSamples.length < 2) return 0;
    return Math.round((this.fpsSamples.length - 1) / ((this.fpsSamples[this.fpsSamples.length - 1] - this.fpsSamples[0]) / 1000));
  }

  private loop = () => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = performance.now();
    this.fpsSamples.push(now);
    while (this.fpsSamples.length && now - this.fpsSamples[0] > 2000) this.fpsSamples.shift();
    if (this.focusTween) {
      const f = this.focusTween;
      f.t = Math.min(1, f.t + dt / 1.2);
      const e = 1 - (1 - f.t) ** 3;
      const next = f.from.clone().lerp(f.to, e);
      const delta = next.clone().sub(this.controls.target);
      this.controls.target.add(delta);
      this.camera.position.add(delta);
      if (f.t >= 1) this.focusTween = null;
    }
    this.controls.update();
    this.markers.tick(dt, this.clock.elapsedTime);
    if (this.tickCount++ % 6 === 0) {
      this.markers.setZoom(this.camera.position.distanceTo(this.controls.target));
      this.declutter();
    }
    // hover picking at most every other frame
    if (this.pointerDirty && this.frame++ % 2 === 0) {
      this.pointerDirty = false;
      const p = this.pick();
      this.terrain.setHover(p);
      this.onHover({ province: p, x: this.lastPointer.x, y: this.lastPointer.y });
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.running = false;
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
