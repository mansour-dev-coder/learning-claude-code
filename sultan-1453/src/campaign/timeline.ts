// Starting states for the campaign, built from the same scripted conquest data as the 1451→1475 revenue test:
// start from Mehmed II's accession, then apply the conquests, reforms and court changes that had happened by
// the mission's date. No months are simulated, so a mission starts instantly and identically for a given seed.
import type { GameState, MinisterRole } from '../engine/types';
import { createGame } from '../engine/newGame';
import { Rng } from '../engine/rng';
import { transferProvince } from '../engine/war';
import { selectDilemmas } from '../engine/events/select';
import { CANDIDATES } from '../engine/data/ministers';
import { LAW_BY_ID } from '../engine/data/laws';
import type { TurnCtx } from '../engine/state';
import type { Capability } from './types';

/** Mehmed II's conquests by date [year, month, provinces]. Shared with tests/helpers/conquest.ts. */
export const CONQUESTS: [number, number, string[]][] = [
  [1453, 6, ['constantinople']],
  [1455, 6, ['novobrdo']],
  [1459, 6, ['smederevo']],
  [1460, 6, ['morea']],
  [1468, 6, ['konya']],
  [1470, 7, ['negroponte']],
  [1474, 6, ['larende']],
];

const REFORMS: [number, number, string][] = [
  [1453, 7, 'patriarchate'],
  [1455, 1, 'tahrir'],
  [1460, 1, 'iltizam'],
];

/** Grand Viziers after Çandarlı Halil (executed 1453). */
const VIZIERS: [number, string][] = [
  [1453, 'Zaganos Pasha'],
  [1456, 'Mahmud Pasha Angelović'],
];

const before = (y: number, m: number, Y: number, M: number) => y < Y || (y === Y && m <= M);

export interface StartOptions {
  year: number;
  month: number;
  seed: number;
  unlocked: Set<Capability>;
  treasury: number;
  janissaries: number;
  guns: number;
  /** events that open the mission's first Divan */
  opening?: string[];
}

export function historicalState(o: StartOptions): GameState {
  const s = createGame({ scenario: 'mehmed1451', seed: o.seed });
  const rng = new Rng(o.seed ^ 0x51a7);
  const ctx: TurnCtx = { s, rng, facts: [] };
  s.date = { year: o.year, month: o.month };
  s.log = [];

  for (const [y, m, ids] of CONQUESTS) if (before(y, m, o.year, o.month)) for (const id of ids) transferProvince(ctx, id, 'ottoman');
  for (const [y, m, id] of REFORMS) if (before(y, m, o.year, o.month)) s.laws.push({ id, name: LAW_BY_ID[id].name, enactedTurn: 0 });
  if (s.provinces.constantinople.owner === 'ottoman') {
    s.capital = 'constantinople';
    s.grain.population = 40_000 + Math.max(0, o.year - 1453) * 4000;
    s.provinces.constantinople.prosperity = Math.min(70, 35 + (o.year - 1453) * 5);
    s.flags.bosporusFortress = 1;
  }
  if (o.year > 1452 || (o.year === 1452 && o.month > 8)) s.flags.bosporusFortress = 1;
  for (const [y, name] of VIZIERS) {
    if (o.year < y) continue;
    const c = CANDIDATES.grandVizier?.find((x) => x.name === name);
    if (c) s.ministers.grandVizier = { ...c, role: 'grandVizier' as MinisterRole, appointedTurn: 0 };
  }

  // the dynasty as it stood
  const after1451 = o.year > 1451 || o.month > 3;
  for (const p of s.dynasty.princes) {
    if (p.id === 'ahmed' && after1451) p.alive = false; // put to death at the accession
    if (p.id === 'orhan' && o.year >= 1453) p.alive = false; // died in the fall of the city
  }
  if (o.year >= 1459 && !s.dynasty.princes.some((p) => p.id === 'cem')) {
    s.dynasty.consorts.push({ id: 'cicek', name: 'Çiçek Hatun', origin: 'concubine of the palace', influence: 45, alive: true, historical: true });
    s.dynasty.princes.push({ id: 'cem', name: 'Cem', birthYear: 1459, motherId: 'cicek', province: null, household: 10, ambition: 20, ability: 7, alive: true, relation: 'son', historical: true });
  }
  if (o.year >= 1455) for (const p of s.dynasty.princes) if (p.id === 'bayezid') p.province = 'amasya';
  if (o.year >= 1453) s.dynasty.valide = null; // Mara Hatun had returned to Serbia

  // the accession is behind us after the first mission
  if (after1451) {
    s.eventHistory.accessionDonative = 0;
    s.eventHistory.fratricideQuestion = 0;
  }
  if (o.year >= 1454) {
    s.neighbours.hungary.relation = 'peace';
    s.neighbours.hungary.truceUntilTurn = 0;
  }

  s.treasury = o.treasury;
  s.army.janissaries = o.janissaries;
  s.army.artillery.guns = o.guns;
  if (o.unlocked.has('bombards')) {
    s.army.artillery.bombards = Math.max(s.army.artillery.bombards, 10); // Orban's monster and the great guns cast over the winter of 1452–53
    s.army.artillery.quality = Math.max(s.army.artillery.quality, 0.9);
    s.eventHistory.orbanCannon = 0;
    s.flags.orbanHired = 0;
  }
  if (o.unlocked.has('corpsLoyalty')) s.factions.janissaries = Math.min(90, s.factions.janissaries + 10);

  // capability locks the campaign has not yet lifted
  s.flags.lockBombards = !o.unlocked.has('bombards');
  s.flags.lockFleet = !o.unlocked.has('fleet');
  s.flags.lockNavalInvasion = !o.unlocked.has('navalInvasion');
  s.flags.lockTopkapi = !o.unlocked.has('topkapi');
  s.flags.campaign = true;

  const forced = (o.opening ?? []).map((ref, i) => ({ id: `mission-${i}`, dueTurn: 0, kind: 'event' as const, ref, note: 'mission opening' }));
  s.pendingDilemmas = selectDilemmas(s, rng, forced);
  s.rngState = rng.state;
  return s;
}
