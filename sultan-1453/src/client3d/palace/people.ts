// Low-poly court figures built from boxes. Dress follows office: viziers in the tall white kavuk with a gold
// band, ulema in broad turbans and dark robes, the Agha in the Janissary börk, ladies of the harem in ferace
// and headdress (court dress only), the Sultan in a white kaftan and great turban.
import * as THREE from 'three';
import { Builder } from '../models';

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

const SKIN = '#d9b08c';
const LOOK: Record<Dress, { robe: string; trim: string; hat: 'kavuk' | 'turban' | 'bork' | 'great' | 'veil' | 'cap' | 'helm'; beard: boolean; scale?: number }> = {
  sultan: { robe: '#f1ece2', trim: '#c9a227', hat: 'great', beard: true },
  vizier: { robe: '#2f6b3b', trim: '#e9c46a', hat: 'kavuk', beard: true },
  defterdar: { robe: '#6b3f8c', trim: '#e9c46a', hat: 'kavuk', beard: true },
  scholar: { robe: '#2b2f3a', trim: '#cfcfcf', hat: 'turban', beard: true },
  beylerbey: { robe: '#a3332b', trim: '#e9c46a', hat: 'kavuk', beard: true },
  agha: { robe: '#7a1f1f', trim: '#e0e0e0', hat: 'bork', beard: true },
  admiral: { robe: '#1f4e79', trim: '#e9c46a', hat: 'kavuk', beard: true },
  scribe: { robe: '#5b6b7a', trim: '#d0d0d0', hat: 'turban', beard: true },
  eunuch: { robe: '#e8e2d0', trim: '#9a8a5a', hat: 'cap', beard: false },
  lady: { robe: '#8e3a59', trim: '#e9c46a', hat: 'veil', beard: false },
  prince: { robe: '#2c5e8c', trim: '#e9c46a', hat: 'turban', beard: false, scale: 0.72 },
  petitioner: { robe: '#7a6a52', trim: '#5a4a32', hat: 'turban', beard: true },
  guard: { robe: '#7a1f1f', trim: '#cfcfcf', hat: 'bork', beard: true },
};

export function personModel(dress: Dress, robeOverride?: string) {
  const l = LOOK[dress];
  const robe = robeOverride ?? l.robe;
  const b = new Builder();
  b.box(0.16, 0.5, 0.18, '#3b2f25', -0.1, 0, 0).box(0.16, 0.5, 0.18, '#3b2f25', 0.1, 0, 0); // legs
  b.box(0.58, 0.95, 0.38, robe, 0, 0.12, 0); // long kaftan
  b.box(0.6, 0.06, 0.4, l.trim, 0, 0.6, 0); // sash
  b.box(0.14, 0.62, 0.16, robe, -0.37, 0.46, 0).box(0.14, 0.62, 0.16, robe, 0.37, 0.46, 0); // arms
  b.box(0.12, 0.12, 0.12, SKIN, -0.37, 0.4, 0).box(0.12, 0.12, 0.12, SKIN, 0.37, 0.4, 0); // hands
  b.box(0.34, 0.36, 0.32, SKIN, 0, 1.07, 0); // head
  b.box(0.06, 0.05, 0.02, '#1b1b1b', -0.08, 1.24, 0.165).box(0.06, 0.05, 0.02, '#1b1b1b', 0.08, 1.24, 0.165); // eyes
  if (l.beard) b.box(0.3, 0.16, 0.06, '#3a2a1e', 0, 1.04, 0.16);
  switch (l.hat) {
    case 'kavuk': b.box(0.36, 0.42, 0.34, '#f4f1ea', 0, 1.42, 0).box(0.38, 0.05, 0.36, l.trim, 0, 1.52, 0); break;
    case 'turban': b.box(0.46, 0.22, 0.44, '#f4f1ea', 0, 1.4, 0).box(0.2, 0.1, 0.2, '#b23b2b', 0, 1.62, 0); break;
    case 'great': b.box(0.62, 0.36, 0.58, '#ffffff', 0, 1.4, 0).box(0.22, 0.14, 0.22, '#c41e2a', 0, 1.76, 0).box(0.06, 0.16, 0.04, '#e9c46a', 0, 1.72, 0.3); break;
    case 'bork': b.box(0.32, 0.5, 0.3, '#f4f1ea', 0, 1.42, 0).box(0.3, 0.6, 0.06, '#f4f1ea', 0, 1.5, -0.18); break;
    case 'veil': b.box(0.42, 0.52, 0.42, robe, 0, 1.0, -0.02).box(0.38, 0.2, 0.38, l.trim, 0, 1.38, 0); break;
    case 'cap': b.box(0.32, 0.36, 0.3, '#f4f1ea', 0, 1.42, 0); break;
    case 'helm': b.box(0.36, 0.2, 0.34, '#8d99a6', 0, 1.42, 0); break;
  }
  const m = b.mesh();
  const g = new THREE.Group();
  g.add(m);
  g.scale.setScalar(1.05 * (l.scale ?? 1));
  return g;
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
