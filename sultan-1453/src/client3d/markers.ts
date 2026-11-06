// Turns GameState into map markers (cities, armies, fleets, sieges) and tweens them between months.
import * as THREE from 'three';
import type { GameState, NeighbourId } from '../engine/types';
import { SEATS, toWorld } from './geo';
import { LEGEND, OWNER_COLORS } from './palette';

const SHORT = Object.fromEntries(LEGEND.map((l) => [l.id, l.name]));
import { armyModel, cityModel, constantinopleModel, galleyModel, labelSprite, ringModel, siegeModel } from './models';
import type { Terrain } from './terrain';

interface Marker {
  key: string;
  obj: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  sig: string; // rebuild when this changes
}

const TWEEN_S = 1.6;
const ANCHORS: Record<string, [number, number]> = {
  gelibolu: [26.45, 40.25], // fleet base in the Dardanelles
  constantinople: [29.05, 40.85],
  negroponte: [24.0, 38.2],
  modon: [21.6, 36.6],
  selanik: [22.9, 40.35],
  morea: [22.9, 37.0],
  aydin: [26.6, 38.4],
  tirhala: [22.95, 39.15],
};

export class Markers {
  group = new THREE.Group();
  private markers = new Map<string, Marker>();
  constructor(private terrain: Terrain) {}

  seat(id: string, dx = 0, dz = 0): THREE.Vector3 {
    const s = SEATS[id];
    const { x, z } = toWorld(s.lon, s.lat);
    return new THREE.Vector3(x + dx, this.terrain.heightAtWorld(x, z), z + dz);
  }
  sea(id: string): THREE.Vector3 {
    const a = ANCHORS[id];
    if (!a) return this.seat(id, 0, 0.8).setY(0.3);
    const { x, z } = toWorld(a[0], a[1]);
    return new THREE.Vector3(x, 0.3, z);
  }

  private upsert(key: string, sig: string, build: () => THREE.Object3D, at: THREE.Vector3, instant = false) {
    const m = this.markers.get(key);
    if (m && m.sig === sig) {
      if (!m.to.equals(at)) {
        m.from.copy(m.obj.position);
        m.to.copy(at);
        m.t = instant ? 1 : 0;
      }
      return;
    }
    if (m) this.remove(key);
    const obj = build();
    obj.position.copy(m ? m.obj.position : at);
    this.group.add(obj);
    this.markers.set(key, { key, obj, from: obj.position.clone(), to: at.clone(), t: instant || !m ? 1 : 0, sig });
  }

  private remove(key: string) {
    const m = this.markers.get(key);
    if (!m) return;
    this.group.remove(m.obj);
    m.obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = (o as THREE.Sprite).material as THREE.SpriteMaterial | undefined;
      if (mat && 'map' in mat && mat.map) { mat.map.dispose(); mat.dispose(); }
    });
    this.markers.delete(key);
  }

  update(s: GameState, first = false) {
    const seen = new Set<string>();
    const put = (key: string, sig: string, build: () => THREE.Object3D, at: THREE.Vector3) => {
      seen.add(key);
      this.upsert(key, sig, build, at, first);
    };

    // cities
    for (const p of Object.values(s.provinces)) {
      if (!SEATS[p.id]) continue;
      const owner = p.owner;
      const color = OWNER_COLORS[owner] ?? '#999';
      const capital = p.id === s.capital || (owner !== 'ottoman' && s.neighbours[owner as NeighbourId]?.capital === p.id);
      const sig = `${owner}|${capital}|${p.walls >= 50}`;
      put(`city:${p.id}`, sig, () => {
        const g = new THREE.Group();
        const model = p.id === 'constantinople' ? constantinopleModel(color, owner === 'ottoman') : cityModel({ size: p.landTax > 1.4e6 ? 2 : 1, walls: p.walls, ottoman: owner === 'ottoman', capital, color });
        g.add(model);
        const label = labelSprite(p.name.replace(/ \(.*\)/, ''), { kind: capital ? 'capital' : 'city' });
        label.position.set(0, 1.2, 0);
        g.add(label);
        g.userData.province = p.id;
        return g;
      }, this.seat(p.id));
    }

    // the Sultan's army
    const c = s.campaign;
    if (c) {
      const start = this.seat(s.capital, 1.2, 0.8);
      const target = this.seat(c.target, -2.2, 0.4);
      const travel = Math.max(1, Math.ceil(s.provinces[c.target].travelMonths));
      const prog = c.phase === 'mustering' ? 0 : c.phase === 'marching' ? 1 - c.monthsLeftInPhase / travel : c.phase === 'besieging' ? 1 : c.monthsLeftInPhase / travel;
      const men = c.janissaries + c.palaceCavalry + c.timariots;
      put('army:ottoman', `ott|${Math.round(Math.log10(men + 1) * 3)}|${c.phase === 'besieging'}`, () => {
        const g = new THREE.Group();
        const body = new THREE.Group();
        body.add(armyModel(OWNER_COLORS.ottoman, men, true), ringModel(OWNER_COLORS.ottoman));
        body.userData.zoomScale = true;
        g.add(body);
        if (c.phase === 'besieging') return g; // the siege label names the army
        const l = labelSprite(`Imperial army ${Math.round(men / 1000)}k`, { kind: 'army', accent: OWNER_COLORS.ottoman });
        l.position.set(-0.4, 0.9, 0);
        l.center.set(1, 0); // label extends away from the town it faces
        g.add(l);
        return g;
      }, start.clone().lerp(target, Math.max(0, Math.min(1, prog))));
      if (c.fleet > 0) {
        put('fleet:ottoman', 'ott', () => { const g = galleyModel(OWNER_COLORS.ottoman); g.userData.zoomScale = true; return g; }, this.sea(c.target));
      }
    }
    if (s.army.fleet.galleys > 0) {
      put('fleet:home', 'home', () => {
        const g = new THREE.Group();
        const body = galleyModel(OWNER_COLORS.ottoman);
        body.userData.zoomScale = true;
        g.add(body);
        const l = labelSprite(`${s.army.fleet.galleys} galleys`, { kind: 'fleet', accent: '#1f4e79' });
        l.position.set(0, 1.0, 0);
        g.add(l);
        return g;
      }, this.sea('gelibolu'));
    }

    // enemy field armies (at war) and their sieges
    for (const w of s.wars) {
      for (const e of w.enemies) {
        const n = s.neighbours[e];
        if (n.fieldArmy < 2000) continue;
        const sg = s.sieges.find((x) => x.attacker === e);
        const home = n.capital && SEATS[n.capital] ? n.capital : Object.values(s.provinces).find((p) => p.owner === e && SEATS[p.id])?.id;
        if (!home && !sg) continue;
        const at = sg ? this.seat(sg.province, -2.2, 1.2) : this.seat(home!, 1.2, 1.0);
        put(`army:${e}`, `${e}|${Math.round(Math.log10(n.fieldArmy + 1) * 3)}|${!!sg}`, () => {
          const g = new THREE.Group();
          const body = new THREE.Group();
          body.add(armyModel(OWNER_COLORS[e] ?? '#555', n.fieldArmy, false), ringModel(OWNER_COLORS[e] ?? '#555'));
          body.userData.zoomScale = true;
          g.add(body);
          const short = SHORT[e] ?? n.name;
          if (sg) return g; // named on the siege label
          const l = labelSprite(`${short} ~${Math.round(n.fieldArmy / 1000)}k`, { kind: 'army', accent: OWNER_COLORS[e] ?? '#555' });
          l.position.set(-0.4, 0.9, 0);
          l.center.set(1, 0);
          g.add(l);
          return g;
        }, at);
      }
    }

    // sieges
    for (const sg of s.sieges) {
      const color = OWNER_COLORS[sg.attacker] ?? '#555';
      put(`siege:${sg.province}`, `${Math.round(sg.breach)}|${sg.attacker}|${sg.attacker === 'ottoman' ? Math.round(((c?.janissaries ?? 0) + (c?.timariots ?? 0)) / 1000) : ''}`, () => {
        const g = new THREE.Group();
        g.add(siegeModel(sg.breach, color));
        const town = s.provinces[sg.province].name.replace(/ \(.*\)/, '');
        const who = sg.attacker === 'ottoman'
          ? `Imperial army ${Math.round(((c?.janissaries ?? 0) + (c?.palaceCavalry ?? 0) + (c?.timariots ?? 0)) / 1000)}k`
          : SHORT[sg.attacker] ?? sg.attacker;
        const l = labelSprite(`${who} besieging ${town}: breach ${Math.round(sg.breach)}%`, { kind: 'siege', value: sg.breach, accent: color });
        l.position.set(0, 2.6, 0);
        g.add(l);
        return g;
      }, this.seat(sg.province));
    }

    for (const key of [...this.markers.keys()]) if (!seen.has(key)) this.remove(key);
  }

  tick(dt: number, time: number) {
    for (const m of this.markers.values()) {
      if (m.t < 1) {
        m.t = Math.min(1, m.t + dt / TWEEN_S);
        const e = m.t < 0.5 ? 2 * m.t * m.t : 1 - (-2 * m.t + 2) ** 2 / 2;
        m.obj.position.lerpVectors(m.from, m.to, e);
        if (m.key.startsWith('army')) m.obj.position.y += Math.sin(m.t * Math.PI * 6) * 0.03;
      }
      if (m.key.startsWith('fleet')) m.obj.position.y = m.to.y + Math.sin(time * 1.6 + m.to.x) * 0.02;
    }
  }

  /** Scale troop and ship models with camera distance so they stay visible when zoomed out. */
  setZoom(distance: number) {
    const k = Math.max(1, Math.min(2.6, distance / 20));
    for (const m of this.markers.values()) {
      m.obj.traverse((o) => { if (o.userData.zoomScale) o.scale.setScalar(k); });
    }
  }

  /** All label sprites, for decluttering. */
  labels(): THREE.Sprite[] {
    const out: THREE.Sprite[] = [];
    for (const m of this.markers.values()) m.obj.traverse((o) => { if ((o as THREE.Sprite).isSprite && o.userData.priority) out.push(o as THREE.Sprite); });
    return out;
  }

  /** Province id of a city marker under a ray, if any. */
  pickables() {
    return [...this.markers.values()].filter((m) => m.key.startsWith('city:')).map((m) => m.obj);
  }
}
