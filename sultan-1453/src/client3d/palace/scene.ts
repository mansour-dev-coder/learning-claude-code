// The walkable palace: third-person Sultan, WASD/arrow keys or click/tap-to-walk, collision with walls,
// the court placed from GameState, and interaction with whoever has business with the Sultan.
import * as THREE from 'three';
import type { GameState, MinisterRole } from '../../engine/types';
import { MINISTER_ROLES } from '../../engine/types';
import { TITLES } from '../../engine/data/ministers';
import { livingPrinces, princeAge } from '../../engine/state';
import { Builder, labelSprite } from '../models';
import { buildPalace, roomAt, setCutaway, type PalaceLayout, type PalaceStyle, type Rect, type Room, type RoomId } from './layout';
import { DRESS_FOR_ROLE, personModel, type Dress } from './people';

export interface Npc {
  id: string;
  name: string;
  title: string;
  room: RoomId;
  dress: Dress;
  /** dilemma ids this person presents */
  dilemmas: string[];
  /** words for a person with no dilemma (petitions, reports) */
  note?: string;
  kind: 'minister' | 'treasurer' | 'valide' | 'consort' | 'prince' | 'eunuch' | 'petitioner' | 'guard';
}

interface NpcObj { npc: Npc; obj: THREE.Group; badge: THREE.Sprite | null; name: THREE.Sprite; face: number }

const RADIUS = 0.35;
const SPEED = 4.2;
const TALK = 2.4;

export class PalaceScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
  private layout!: PalaceLayout;
  private style: PalaceStyle | null = null;
  private avatar = personModel('sultan');
  private npcs = new Map<string, NpcObj>();
  private chests = new THREE.Group();
  private dynamic = new THREE.Group();
  private keys = new Set<string>();
  private target: THREE.Vector3 | null = null;
  private seek: string | null = null; // npc being walked to
  private yaw = 0; // 0: camera south of the Sultan, looking north
  private dist = 9;
  private active = false;
  private clock = new THREE.Clock();
  private ray = new THREE.Raycaster();
  private room: Room | null = null;
  private near: string | null = null;
  private answered = new Set<string>();
  private walkBob = 0;
  onInteract: (npc: Npc) => void = () => {};
  onNear: (npc: Npc | null) => void = () => {};
  onRoom: (room: Room | null) => void = () => {};

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.localClippingEnabled = true;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'none';
    this.scene.background = new THREE.Color('#a9cde3');
    this.scene.fog = new THREE.Fog('#a9cde3', 45, 110);
    this.scene.add(new THREE.HemisphereLight('#f4f8ff', '#6b5a44', 1.7));
    const sun = new THREE.DirectionalLight('#fff1d6', 2.1);
    sun.position.set(-20, 40, 18);
    this.scene.add(sun);
    this.scene.add(this.avatar, this.chests, this.dynamic);

    const el = this.renderer.domElement;
    el.tabIndex = 0;
    window.addEventListener('keydown', (e) => {
      if (!this.active || (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'e'].includes(k)) {
        if (k === 'e' && this.near) { this.interact(this.near); return; }
        this.keys.add(k);
        this.target = null; this.seek = null;
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());

    // drag to turn the camera, click/tap to walk or to speak
    let down: { x: number; y: number; yaw: number } | null = null;
    let dragged = false;
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, yaw: this.yaw }; dragged = false; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      if (Math.abs(dx) > 6) dragged = true;
      if (dragged) this.yaw = down.yaw - dx * 0.008;
    });
    el.addEventListener('pointerup', (e) => {
      const wasDrag = dragged;
      down = null;
      if (wasDrag) return;
      this.clickAt(e.clientX, e.clientY);
    });
    el.addEventListener('wheel', (e) => { this.dist = Math.max(4, Math.min(18, this.dist + e.deltaY * 0.01)); e.preventDefault(); }, { passive: false });

    new ResizeObserver(() => this.resize()).observe(container);
    this.loop();
  }

  setActive(on: boolean) {
    this.active = on;
    this.renderer.domElement.style.display = on ? 'block' : 'none';
    if (on) { this.resize(); this.clock.getDelta(); this.renderer.domElement.focus({ preventScroll: true }); }
    this.keys.clear();
  }
  get isActive() { return this.active; }

  private resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private ensureLayout(style: PalaceStyle) {
    if (this.style === style) return;
    if (this.layout) this.scene.remove(this.layout.group);
    this.layout = buildPalace(style);
    this.scene.add(this.layout.group);
    this.style = style;
    this.teleport('gate');
  }

  /** Place the court from the current state. `answered` holds dilemma ids the Sultan has already ruled on. */
  setState(s: GameState, answered: Set<string>) {
    this.ensureLayout(s.capital === 'constantinople' ? 'topkapi' : 'edirne');
    this.answered = answered;
    const sp = this.layout.spots;
    const want: { npc: Npc; at: THREE.Vector3; face: THREE.Vector3 }[] = [];
    const byPresenter = new Map<string, string[]>();
    for (const d of s.pendingDilemmas) {
      const key = d.presenter === 'valide' ? 'valide' : d.presenter === 'chiefEunuch' ? 'eunuch' : d.presenter === 'sultan' ? 'min:grandVizier' : `min:${d.presenter}`;
      byPresenter.set(key, [...(byPresenter.get(key) ?? []), d.id]);
    }
    MINISTER_ROLES.forEach((role: MinisterRole, i) => {
      const m = s.ministers[role];
      want.push({ npc: { id: `min:${role}`, name: m.name, title: TITLES[role], room: 'divan', dress: DRESS_FOR_ROLE[role], dilemmas: byPresenter.get(`min:${role}`) ?? [], kind: 'minister' }, at: sp.ministers[i], face: sp.throne });
    });
    want.push({ npc: { id: 'treasurer', name: 'The Hazinedarbaşı', title: 'Keeper of the Inner Treasury', room: 'treasury', dress: 'eunuch', dilemmas: [], kind: 'treasurer' }, at: sp.treasury, face: new THREE.Vector3(9, 0, -6) });
    const v = s.dynasty.valide;
    let hi = 0;
    if (v?.alive || byPresenter.has('valide')) {
      want.push({ npc: { id: 'valide', name: v?.alive ? v.name : 'The senior lady of the harem', title: v?.note ?? 'senior lady of the harem', room: 'harem', dress: 'lady', dilemmas: byPresenter.get('valide') ?? [], kind: 'valide' }, at: sp.harem[hi++], face: new THREE.Vector3(-3, 0, -19) });
    }
    for (const c of s.dynasty.consorts.filter((x) => x.alive).slice(0, 3)) {
      want.push({ npc: { id: `consort:${c.id}`, name: c.name, title: c.origin, room: 'harem', dress: 'lady', dilemmas: [], kind: 'consort' }, at: sp.harem[hi++], face: new THREE.Vector3(-3, 0, -19) });
    }
    for (const p of livingPrinces(s).filter((x) => !x.province && !x.heldBy).slice(0, 4)) {
      const age = princeAge(s, p.birthYear);
      want.push({ npc: { id: `prince:${p.id}`, name: `Şehzade ${p.name}`, title: `${p.relation === 'son' ? 'son' : p.relation} of the Sultan, aged ${age}`, room: 'harem', dress: 'prince', dilemmas: [], kind: 'prince' }, at: sp.harem[hi++ % sp.harem.length], face: new THREE.Vector3(-3, 0, -19) });
    }
    want.push({ npc: { id: 'eunuch', name: s.dynasty.chiefEunuch.name, title: s.dynasty.chiefEunuch.title, room: 'harem', dress: 'eunuch', dilemmas: byPresenter.get('eunuch') ?? [], kind: 'eunuch' }, at: sp.eunuch, face: new THREE.Vector3(-3, 0, -10) });
    // petitioners at the Gate bring last month's news
    const facts = (s.lastReport?.facts ?? []).filter((f) => !/^Enacted|^Work begins/.test(f)).slice(0, 5);
    facts.forEach((f, i) => {
      want.push({ npc: { id: `pet:${i}`, name: PETITIONERS[i % PETITIONERS.length], title: 'a petitioner at the Gate', room: 'gate', dress: 'petitioner', dilemmas: [], note: f, kind: 'petitioner' }, at: sp.gate[i], face: new THREE.Vector3(0, 0, 18) });
    });
    sp.guards.forEach((g, i) => want.push({ npc: { id: `guard:${i}`, name: 'A Janissary of the guard', title: 'gatekeeper (kapıcı)', room: 'gate', dress: 'guard', dilemmas: [], kind: 'guard' }, at: g, face: new THREE.Vector3(g.x > 0 ? -10 : 10, 0, g.z) }));

    const keep = new Set(want.map((w) => w.npc.id));
    for (const [id, o] of this.npcs) if (!keep.has(id)) { this.dynamic.remove(o.obj); this.npcs.delete(id); }
    for (const w of want) {
      let o = this.npcs.get(w.npc.id);
      if (!o || o.npc.dress !== w.npc.dress || o.npc.name !== w.npc.name) {
        if (o) this.dynamic.remove(o.obj);
        const obj = new THREE.Group();
        obj.add(personModel(w.npc.dress));
        const name = labelSprite(w.npc.name, { kind: 'city' });
        name.position.set(0, 2.25, 0);
        obj.add(name);
        obj.userData.npc = w.npc.id;
        this.dynamic.add(obj);
        o = { npc: w.npc, obj, badge: null, name, face: 0 };
        this.npcs.set(w.npc.id, o);
      }
      o.npc = w.npc;
      o.obj.position.copy(w.at);
      o.face = Math.atan2(w.face.x - w.at.x, w.face.z - w.at.z);
      o.obj.rotation.y = o.face;
      // a gold banner over anyone with an unanswered matter; green once ruled on
      const pending = w.npc.dilemmas.filter((id) => !answered.has(id)).length;
      if (o.badge) { o.obj.remove(o.badge); o.badge = null; }
      if (w.npc.dilemmas.length) {
        o.badge = labelSprite(pending ? `${pending > 1 ? `${pending} matters` : 'A matter for the Sultan'}` : 'Answered', { kind: pending ? 'army' : 'fleet', accent: pending ? '#c9a227' : '#2e7d32' });
        o.badge.position.set(0, 2.6, 0);
        o.obj.add(o.badge);
      }
    }

    // treasure chests: one per million akçe, up to thirty
    this.chests.clear();
    const n = Math.max(0, Math.min(30, Math.round(s.treasury / 1_000_000)));
    const b = new Builder();
    for (let i = 0; i < n; i++) {
      const p = sp.chests[i];
      b.box(0.9, 0.5, 0.6, '#6d4c33', p.x, 0.1, p.z).box(0.92, 0.12, 0.62, '#c9a227', p.x, 0.6, p.z).box(0.5, 0.18, 0.3, '#f2c94c', p.x, 0.72, p.z);
    }
    if (n) this.chests.add(b.mesh());
  }

  npcList() { return [...this.npcs.values()].map((o) => o.npc); }

  teleport(room: RoomId) {
    const r = this.layout?.rooms.find((x) => x.id === room);
    if (!r) return;
    this.avatar.position.copy(r.spawn);
    this.target = null; this.seek = null;
    this.yaw = room === 'divan' ? Math.PI / 2 : room === 'treasury' ? -Math.PI / 2 : 0;
  }

  interact(id: string) {
    const o = this.npcs.get(id);
    if (!o) return;
    if (o.obj.position.distanceTo(this.avatar.position) > TALK) { this.seek = id; this.target = o.obj.position.clone(); return; }
    this.avatar.lookAt(o.obj.position.x, 0, o.obj.position.z);
    this.onInteract(o.npc);
  }

  private clickAt(cx: number, cy: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const p = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(p, this.camera);
    const hit = this.ray.intersectObjects([...this.npcs.values()].map((o) => o.obj), true)[0];
    if (hit) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj && !obj.userData.npc) obj = obj.parent;
      if (obj) { this.interact(obj.userData.npc as string); return; }
    }
    const f = this.ray.intersectObject(this.layout.floor, false)[0];
    if (f) { this.target = f.point.clone().setY(0); this.seek = null; }
  }

  private collide(p: THREE.Vector3) {
    for (const c of this.layout.colliders) {
      const nx = Math.max(c.x0, Math.min(p.x, c.x1)), nz = Math.max(c.z0, Math.min(p.z, c.z1));
      const dx = p.x - nx, dz = p.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < RADIUS * RADIUS) {
        const d = Math.sqrt(d2) || 0.0001;
        if (d2 === 0) { p.x += RADIUS; continue; }
        p.x = nx + (dx / d) * RADIUS;
        p.z = nz + (dz / d) * RADIUS;
      }
    }
    for (const o of this.npcs.values()) {
      const dx = p.x - o.obj.position.x, dz = p.z - o.obj.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.6 && d > 0) { p.x = o.obj.position.x + (dx / d) * 0.6; p.z = o.obj.position.z + (dz / d) * 0.6; }
    }
    p.x = Math.max(-30, Math.min(30, p.x));
    p.z = Math.max(-30, Math.min(34, p.z));
  }

  private loop = () => {
    requestAnimationFrame(this.loop);
    if (!this.active || !this.layout) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    const pos = this.avatar.position;
    // movement: keys are relative to the camera; a click target walks straight there
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const move = new THREE.Vector3();
    if (this.keys.has('w') || this.keys.has('arrowup')) move.add(fwd);
    if (this.keys.has('s') || this.keys.has('arrowdown')) move.sub(fwd);
    if (this.keys.has('d')) move.add(right);
    if (this.keys.has('a')) move.sub(right);
    if (this.keys.has('arrowleft') || this.keys.has('q')) this.yaw += dt * 2.2;
    if (this.keys.has('arrowright')) this.yaw -= dt * 2.2;
    if (this.target) {
      const to = this.target.clone().sub(pos).setY(0);
      const stop = this.seek ? TALK - 0.4 : 0.15;
      if (to.length() <= stop) {
        this.target = null;
        if (this.seek) { const id = this.seek; this.seek = null; this.interact(id); }
      } else move.copy(to.normalize());
    }
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(SPEED * dt);
      const before = pos.clone();
      pos.add(move);
      this.collide(pos);
      if (pos.distanceTo(before) < SPEED * dt * 0.2 && this.target) {
        // blocked by a wall or a crowd: if we were walking to someone and are close enough, speak anyway
        const id = this.seek;
        this.target = null; this.seek = null;
        const o = id ? this.npcs.get(id) : null;
        if (o && o.obj.position.distanceTo(pos) < TALK + 1.6) this.onInteract(o.npc);
      }
      this.avatar.rotation.y = Math.atan2(move.x, move.z);
      this.walkBob += dt * 10;
      this.avatar.position.y = Math.abs(Math.sin(this.walkBob)) * 0.06;
    } else this.avatar.position.y = 0;

    // camera follows behind and above; indoors it rises for a cutaway view
    const indoors = !!this.room && this.room.id !== 'court' && this.room.id !== 'gate';
    const lift = indoors ? 0.95 : 0.55;
    const camTarget = new THREE.Vector3(pos.x, 1.2, pos.z);
    const camPos = camTarget.clone().add(new THREE.Vector3(Math.sin(this.yaw) * this.dist, this.dist * lift, Math.cos(this.yaw) * this.dist));
    // outdoors, pull the camera in front of any wall or gate between it and the Sultan
    if (!indoors) {
      const dir = camPos.clone().sub(camTarget);
      const len = dir.length();
      this.ray.set(camTarget, dir.normalize());
      this.ray.far = len;
      const hit = this.ray.intersectObjects(this.layout.group.children.filter((c) => c !== this.layout.floor), false)[0];
      this.ray.far = Infinity;
      if (hit) camPos.copy(camTarget).addScaledVector(dir, Math.max(1.2, hit.distance - 0.4));
    }
    this.camera.position.lerp(camPos, 1 - Math.pow(0.001, dt));
    this.camera.lookAt(camTarget);

    // which room; hide its roof
    const room = roomAt(this.layout.rooms, pos.x, pos.z);
    if (room?.id !== this.room?.id) {
      for (const r of this.layout.rooms) if (r.roof) r.roof.visible = r.id !== room?.id;
      setCutaway(!!room && room.id !== 'court' && room.id !== 'gate');
      this.room = room;
      this.onRoom(room);
    }
    // nearest person to speak with
    let best: NpcObj | null = null;
    let bd = TALK;
    for (const o of this.npcs.values()) {
      const d = o.obj.position.distanceTo(pos);
      o.name.visible = d < 9;
      if (d < bd && o.npc.kind !== 'guard') { bd = d; best = o; }
      // people turn to face the Sultan as he approaches, and back to their post when he leaves
      const want = d < 5 && o.npc.kind !== 'guard' ? Math.atan2(pos.x - o.obj.position.x, pos.z - o.obj.position.z) : o.face;
      let diff = want - o.obj.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      o.obj.rotation.y += diff * Math.min(1, dt * 5);
      if (o.badge) o.badge.position.y = 2.6 + Math.sin(this.clock.elapsedTime * 2 + o.obj.position.x) * 0.06;
    }
    const nearId = best?.npc.id ?? null;
    if (nearId !== this.near) { this.near = nearId; this.onNear(best?.npc ?? null); }
    this.renderer.render(this.scene, this.camera);
  };
}

const PETITIONERS = ['A silk merchant of Bursa', 'A timariot from Filibe', 'A kadı’s clerk', 'A Greek shipmaster', 'A village headman'];

export type { Rect };
