// Court figures: lathe-turned kaftans over a lighter inner robe, rounded heads, wrapped turbans and the
// tall kavuk of the viziers, the Janissary börk, the harem's ferace and veil. Each figure is rigged
// (torso, head, arms) so it can breathe, walk, gesture while speaking and bow.
import * as THREE from 'three';

export type Dress =
  | 'sultan'
  | 'vizier'
  | 'defterdar'
  | 'scholar'
  | 'beylerbey'
  | 'agha'
  | 'admiral'
  | 'scribe'
  | 'eunuch'
  | 'lady'
  | 'prince'
  | 'petitioner'
  | 'guard';

type Hat = 'kavuk' | 'turban' | 'bork' | 'great' | 'veil' | 'cap' | 'helm';
const LOOK: Record<Dress, { robe: string; inner: string; trim: string; hat: Hat; beard: string | null; skin?: string; scale?: number }> = {
  sultan: { robe: '#efe6d2', inner: '#b8292f', trim: '#c9a227', hat: 'great', beard: '#4a3324' },
  vizier: { robe: '#2f6b3b', inner: '#e8dcc0', trim: '#d8b04a', hat: 'kavuk', beard: '#d8d2c8' },
  defterdar: { robe: '#5d3a7e', inner: '#d9c9a8', trim: '#d8b04a', hat: 'kavuk', beard: '#4a3628' },
  scholar: { robe: '#2b2f3a', inner: '#8c8c80', trim: '#b9b4a8', hat: 'turban', beard: '#9a9488' },
  beylerbey: { robe: '#9b2f28', inner: '#e3cfa2', trim: '#d8b04a', hat: 'kavuk', beard: '#3b2a1e' },
  agha: { robe: '#7a1f1f', inner: '#2f4a7a', trim: '#e0d6c0', hat: 'bork', beard: '#2c2018' },
  admiral: { robe: '#1f4e79', inner: '#e8dcc0', trim: '#d8b04a', hat: 'kavuk', beard: '#5a4030' },
  scribe: { robe: '#56677a', inner: '#ddd3bd', trim: '#c8c2b2', hat: 'turban', beard: '#3b2d22' },
  eunuch: { robe: '#e5dcc6', inner: '#8a6f3c', trim: '#9a8a5a', hat: 'cap', beard: null, skin: '#7a5236' },
  lady: { robe: '#8e3a59', inner: '#e9cfa0', trim: '#d8b04a', hat: 'veil', beard: null, skin: '#e3bf9c' },
  prince: { robe: '#2c5e8c', inner: '#e9d9b0', trim: '#d8b04a', hat: 'turban', beard: null, scale: 0.74 },
  petitioner: { robe: '#7a6a52', inner: '#c9b894', trim: '#5a4a32', hat: 'turban', beard: '#3a2c20' },
  guard: { robe: '#7a1f1f', inner: '#30476e', trim: '#d0c8b4', hat: 'bork', beard: '#2c2018' },
};

const SKIN = '#d6a883';
const mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(c: string, rough = 0.78, metal = 0) {
  const k = `${c}|${rough}|${metal}`;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }));
  return mats.get(k)!;
}
function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}
function lathe(profile: [number, number][], segs = 18, phiStart = 0, phiLength = Math.PI * 2) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs, phiStart, phiLength);
}

export interface Rig { torso: THREE.Group; head: THREE.Group; armL: THREE.Group; armR: THREE.Group; body: THREE.Group }

export function personModel(dress: Dress, robeOverride?: string) {
  const l = LOOK[dress];
  const robe = robeOverride ?? l.robe;
  const skin = l.skin ?? SKIN;
  const root = new THREE.Group();
  const body = new THREE.Group(); // bobs while walking
  root.add(body);

  // the skirt of the kaftan, flaring to the floor; the inner robe shows at the open front
  body.add(mesh(lathe([[0.3, 0.02], [0.3, 0.06], [0.27, 0.4], [0.22, 0.8], [0.2, 0.92]]), mat(l.inner)));
  const front = Math.PI / 2; // lathe angle 0 points +x; leave a gap facing +z
  body.add(mesh(lathe([[0.335, 0.02], [0.33, 0.07], [0.29, 0.45], [0.235, 0.85], [0.215, 0.93]], 20, front + 0.32, Math.PI * 2 - 0.64), mat(robe)));
  body.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.06, 8), mat('#3a2a1c'), -0.1, 0.02, 0.18)); // slippers
  body.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.06, 8), mat('#3a2a1c'), 0.1, 0.02, 0.18));

  // torso pivots at the waist (for bowing)
  const torso = new THREE.Group();
  torso.position.y = 0.92;
  body.add(torso);
  torso.add(mesh(lathe([[0.205, 0], [0.22, 0.18], [0.235, 0.36], [0.2, 0.44], [0.09, 0.5]]), mat(l.inner)));
  torso.add(mesh(lathe([[0.222, 0], [0.235, 0.18], [0.25, 0.36], [0.215, 0.45], [0.1, 0.5]], 20, front + 0.28, Math.PI * 2 - 0.56), mat(robe)));
  torso.add(mesh(new THREE.TorusGeometry(0.215, 0.035, 6, 20).rotateX(Math.PI / 2), mat(l.trim, 0.5, 0.3), 0, 0.03, 0)); // sash
  if (dress === 'sultan' || dress === 'vizier' || dress === 'beylerbey') {
    torso.add(mesh(new THREE.TorusGeometry(0.11, 0.03, 6, 14, Math.PI).rotateZ(Math.PI), mat(l.trim, 0.5, 0.2), 0, 0.44, 0.09)); // fur-trimmed collar
  }

  // head
  const head = new THREE.Group();
  head.position.y = 0.55;
  torso.add(head);
  head.add(mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.08, 8), mat(skin), 0, -0.02, 0));
  head.add(mesh(new THREE.SphereGeometry(0.115, 16, 12).scale(0.92, 1.08, 0.98), mat(skin, 0.7), 0, 0.12, 0));
  head.add(mesh(new THREE.SphereGeometry(0.018, 6, 4), mat('#1b1410', 0.4), -0.04, 0.14, 0.1));
  head.add(mesh(new THREE.SphereGeometry(0.018, 6, 4), mat('#1b1410', 0.4), 0.04, 0.14, 0.1));
  head.add(mesh(new THREE.ConeGeometry(0.018, 0.05, 5).rotateX(Math.PI / 2), mat(skin), 0, 0.11, 0.115)); // nose
  if (l.beard) {
    head.add(mesh(new THREE.ConeGeometry(0.07, 0.17, 10).rotateX(Math.PI).rotateX(-0.35), mat(l.beard, 0.95), 0, 0.02, 0.07)); // beard below the chin
    head.add(mesh(new THREE.CapsuleGeometry(0.012, 0.07, 2, 6).rotateZ(Math.PI / 2), mat(l.beard, 0.95), 0, 0.085, 0.108)); // moustache
  }
  hat(head, l.hat, l, robe);

  // arms hang from the shoulders inside wide sleeves
  const arm = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.235, 0.4, 0);
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.085, 0.5, 10).translate(0, -0.25, 0), mat(robe)));
    g.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), mat(skin, 0.7), 0, -0.53, 0.01));
    g.rotation.z = side * 0.12;
    torso.add(g);
    return g;
  };
  const armL = arm(-1), armR = arm(1);

  const rig: Rig = { torso, head, armL, armR, body };
  root.userData.rig = rig;
  root.userData.phase = Math.random() * 10;
  root.scale.setScalar(1.12 * (l.scale ?? 1));
  return root;
}

function hat(head: THREE.Group, h: Hat, l: (typeof LOOK)[Dress], robe: string) {
  const white = mat('#f3efe6', 0.85);
  switch (h) {
    case 'kavuk': // tall stiff cylinder wound at the base, a gold band for the viziers
      head.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.34, 14), white, 0, 0.36, 0));
      head.add(mesh(new THREE.TorusGeometry(0.12, 0.045, 8, 18).rotateX(Math.PI / 2), white, 0, 0.23, 0));
      head.add(mesh(new THREE.CylinderGeometry(0.102, 0.102, 0.035, 14), mat(l.trim, 0.45, 0.4), 0, 0.42, 0));
      break;
    case 'turban':
      head.add(mesh(new THREE.SphereGeometry(0.17, 16, 10).scale(1, 0.62, 1), white, 0, 0.26, 0));
      head.add(mesh(new THREE.TorusGeometry(0.14, 0.04, 8, 18).rotateX(Math.PI / 2.2), white, 0, 0.24, 0));
      head.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.08, 10), mat('#a8322a'), 0, 0.34, 0));
      break;
    case 'great': // the imperial turban, with a red cap and a jewelled aigrette
      head.add(mesh(new THREE.SphereGeometry(0.25, 18, 12).scale(1, 0.72, 1), white, 0, 0.3, 0));
      head.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.12, 12), mat('#b8292f'), 0, 0.5, 0));
      head.add(mesh(new THREE.OctahedronGeometry(0.035), mat('#2e8b57', 0.2, 0.3), 0, 0.33, 0.235));
      head.add(mesh(new THREE.ConeGeometry(0.02, 0.22, 6), mat('#f2f0ea', 0.6), 0.02, 0.48, 0.22));
      break;
    case 'bork': // the Janissary felt cap with the sleeve falling behind
      head.add(mesh(new THREE.CylinderGeometry(0.11, 0.125, 0.32, 14), white, 0, 0.34, 0));
      head.add(mesh(new THREE.BoxGeometry(0.2, 0.42, 0.03), white, 0, 0.32, -0.14).rotateX(0.18));
      head.add(mesh(new THREE.ConeGeometry(0.035, 0.1, 8), mat(l.trim, 0.45, 0.4), 0, 0.27, 0.12));
      break;
    case 'veil':
      head.add(mesh(lathe([[0.02, 0.36], [0.13, 0.33], [0.16, 0.2], [0.17, 0.02], [0.24, -0.12]]), mat(robe), 0, 0, -0.01));
      head.add(mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.08, 14), mat(l.trim, 0.45, 0.4), 0, 0.3, 0));
      break;
    case 'cap':
      head.add(mesh(new THREE.CylinderGeometry(0.12, 0.125, 0.26, 14), white, 0, 0.3, 0));
      head.add(mesh(new THREE.SphereGeometry(0.12, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), white, 0, 0.43, 0));
      break;
    case 'helm':
      head.add(mesh(new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#8d99a6', 0.3, 0.8), 0, 0.17, 0));
      break;
  }
}

export type Pose = 'idle' | 'walk' | 'talk' | 'bow' | 'listen';

/** Animate a rigged figure. `t` is seconds; `w` is the pose weight time for bows. */
export function animatePerson(o: THREE.Object3D, t: number, pose: Pose, bowT = 0) {
  const rig = o.userData.rig as Rig | undefined;
  if (!rig) return;
  const ph = (o.userData.phase as number) + t;
  const breathe = Math.sin(ph * 1.6) * 0.012;
  rig.body.position.y = 0;
  rig.torso.rotation.set(breathe * 0.6, 0, 0);
  rig.head.rotation.set(Math.sin(ph * 0.37) * 0.04, Math.sin(ph * 0.23) * 0.12, 0);
  rig.armL.rotation.set(0, 0, -0.12);
  rig.armR.rotation.set(0, 0, 0.12);
  rig.torso.scale.set(1 + breathe * 0.5, 1, 1 + breathe * 0.5);
  switch (pose) {
    case 'walk': {
      const s = Math.sin(t * 9);
      rig.body.position.y = Math.abs(Math.cos(t * 9)) * 0.03;
      rig.armL.rotation.x = s * 0.45;
      rig.armR.rotation.x = -s * 0.45;
      rig.torso.rotation.x = 0.05;
      break;
    }
    case 'talk': {
      // an open hand that rises and turns with the words, the head nodding gently
      rig.armR.rotation.x = -0.75 - Math.sin(ph * 3.1) * 0.25;
      rig.armR.rotation.z = 0.25 + Math.sin(ph * 1.7) * 0.1;
      rig.armL.rotation.x = -0.25 - Math.max(0, Math.sin(ph * 2.3)) * 0.2;
      rig.head.rotation.x = Math.sin(ph * 4.2) * 0.07;
      rig.torso.rotation.x = 0.04;
      break;
    }
    case 'listen':
      rig.armL.rotation.set(-0.5, 0, -0.35); // hands folded before the sash
      rig.armR.rotation.set(-0.5, 0, 0.35);
      rig.head.rotation.x = 0.12;
      break;
    case 'bow': {
      // bow from the waist, right hand to the breast, then rise: bowT runs 0 → 1
      const k = Math.sin(Math.min(1, bowT) * Math.PI);
      rig.torso.rotation.x = k * 0.75;
      rig.armR.rotation.set(-1.2 * k, 0, 0.12 + 0.5 * k);
      rig.head.rotation.x = k * 0.3;
      break;
    }
  }
}

/** Dress for each Divan office. */
export const DRESS_FOR_ROLE: Record<string, Dress> = {
  grandVizier: 'vizier',
  defterdar: 'defterdar',
  kazasker: 'scholar',
  nisanci: 'scribe',
  beylerbeyRumelia: 'beylerbey',
  beylerbeyAnatolia: 'beylerbey',
  janissaryAgha: 'agha',
  kapudanPasha: 'admiral',
  seyhulislam: 'scholar',
};
