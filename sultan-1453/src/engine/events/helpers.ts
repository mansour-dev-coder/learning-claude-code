import type { GameState, NeighbourId, Province } from '../types';
import type { Rng } from '../rng';
import { computeBudget } from '../economy';
import { ottomanProvinces } from '../state';

export function monthlyRevenue(s: GameState) {
  return computeBudget(s).totalRevenue;
}

export function pickProvince(s: GameState, rng: Rng, filter: (p: Province) => boolean = () => true): Province | null {
  const ps = ottomanProvinces(s).filter(filter);
  return ps.length ? rng.pick(ps) : null;
}

/** A foreign power sharing a border with us. */
export function borderNeighbours(s: GameState): NeighbourId[] {
  const out = new Set<NeighbourId>();
  for (const p of ottomanProvinces(s)) {
    for (const a of p.adjacent) {
      const o = s.provinces[a]?.owner;
      if (o && o !== 'ottoman') out.add(o as NeighbourId);
    }
  }
  return [...out];
}

export const CHRISTIAN_POWERS: NeighbourId[] = ['hungary', 'venice', 'papacy', 'serbia', 'wallachia', 'byzantium', 'albania'];

export function owns(s: GameState, pid: string) {
  return s.provinces[pid]?.owner === 'ottoman';
}

export function n(s: GameState, id: string) {
  return s.neighbours[id as NeighbourId];
}

export function k(amount: number) {
  return `${Math.round(amount).toLocaleString()} akçe`;
}
