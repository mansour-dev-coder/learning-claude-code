import type { Difficulty, GameState, MinisterRole, Neighbour, NeighbourId, Province } from './types';
import { MINISTER_ROLES } from './types';
import { Rng, seedFrom } from './rng';
import { BASE_PROVINCES } from './data/provinces';
import { neighbours1421, neighbours1451 } from './data/neighbours';
import { MINISTERS_1421, MINISTERS_1451, generateMinister } from './data/ministers';
import { FICTIONAL_NAMES, SCENARIOS, TIMELINE, type ScenarioDef, type ScenarioId } from './data/scenarios';
import { selectDilemmas } from './events/select';
import { grainConsumption } from './economy';

export interface NewGameOptions {
  scenario: ScenarioId;
  difficulty?: Difficulty;
  seed?: number | string;
  /** fictional Sultan only */
  fictional?: { name?: string; year: number };
}

export function createGame(opts: NewGameOptions): GameState {
  const seed = typeof opts.seed === 'number' ? opts.seed >>> 0 : seedFrom(opts.seed ?? Date.now());
  const rng = new Rng(seed);
  const difficulty = opts.difficulty ?? 'normal';
  const sc: ScenarioDef = opts.scenario === 'fictional' ? fictionalScenario(opts.fictional ?? { year: 1460 }, rng) : structuredClone(SCENARIOS[opts.scenario]);
  const year = sc.start.year;
  const early = year < 1440;

  const provinces: Record<string, Province> = {};
  for (const p of BASE_PROVINCES) {
    provinces[p.id] = { ...structuredClone(p), loyalty: 0, prosperity: 0 };
  }
  for (const [id, owner] of Object.entries(sc.ownerOverrides)) provinces[id].owner = owner;
  for (const p of Object.values(provinces)) {
    p.prosperity = Math.round(rng.range(58, 72));
    p.loyalty = Math.round(rng.range(55, 68));
  }
  if (early) provinces.kutahya.loyalty = 45;

  const nbs = early ? neighbours1421() : neighbours1451();
  const neighbours = {} as Record<NeighbourId, Neighbour>;
  for (const n of nbs) {
    const { truceMonths, ...rest } = n;
    neighbours[n.id] = { ...rest, truceUntilTurn: truceMonths ?? 0 };
  }

  const minsBase = early ? MINISTERS_1421 : MINISTERS_1451;
  const ministers = {} as GameState['ministers'];
  const used = new Set<string>();
  for (const role of MINISTER_ROLES) {
    ministers[role] = opts.scenario === 'fictional' ? generateMinister(role as MinisterRole, rng, 0, used) : { ...minsBase[role], role, appointedTurn: 0 };
    used.add(ministers[role].name);
  }

  const timariots: Record<string, number> = {};
  for (const p of Object.values(provinces)) if (p.owner === 'ottoman') timariots[p.id] = Math.round(p.timarCavalry * sc.army.timarMult);

  const s: GameState = {
    version: 1,
    seed,
    rngState: rng.state,
    turn: 0,
    date: { ...sc.start },
    difficulty,
    scenario: sc.id,
    capital: sc.capital,
    weather: 'fair',
    sultan: { ...sc.sultan, reignStartTurn: 0 },
    treasury: sc.treasury,
    arrears: 0,
    coinage: { silverGrams: sc.silverGrams, debasements: 0, lastDebasementTurn: -999 },
    taxes: { cizyePerHousehold: sc.cizye, customsRate: sc.customsRate },
    grain: { stock: 0, population: sc.population },
    army: {
      janissaries: sc.army.janissaries,
      palaceCavalry: sc.army.palaceCavalry,
      timariots,
      artillery: { guns: sc.army.guns, bombards: sc.army.bombards, quality: sc.army.quality },
      fleet: { galleys: sc.army.galleys, transports: sc.army.transports },
      cadets: [{ count: Math.round(sc.army.janissaries * 0.15), readyTurn: 18 }],
    },
    provinces,
    factions: { ...sc.factions },
    neighbours,
    ministers,
    dynasty: sc.dynasty,
    wars: [],
    sieges: [],
    campaign: null,
    treaties: [],
    laws: [],
    projects: [],
    modifiers: [],
    pendingDilemmas: [],
    scheduled: [],
    eventHistory: {},
    flags: { baseTaxFarm: sc.baseTaxFarm, customaryCizye: sc.cizye },
    log: [],
    lastReport: null,
    status: 'active',
    statusReason: null,
    idCounter: 0,
  };
  s.grain.stock = grainConsumption(s) * 4;
  if (opts.scenario === 'fictional') applyTimelineExtinctions(s);

  // standing wars and truces from the scenario
  for (const n of Object.values(neighbours)) {
    if (n.relation === 'war') s.wars.push({ id: `war-${n.id}`, enemies: [n.id], casusBelli: 'ongoing rebellion', startedTurn: 0, score: 0, declaredByUs: false });
    if (n.relation === 'truce') s.treaties.push({ id: `truce-${n.id}`, with: n.id, kind: 'truce', signedTurn: 0, expiresTurn: n.truceUntilTurn, terms: 'Truce inherited from the previous reign' });
    if (n.relation === 'tributary' || n.relation === 'vassal') s.treaties.push({ id: `trib-${n.id}`, with: n.id, kind: n.relation === 'vassal' ? 'vassalage' : 'tribute', signedTurn: 0, expiresTurn: null, terms: `Pays ${n.tributeToUs.toLocaleString()} akçe a year` });
  }

  s.log.push({ turn: 0, date: { ...s.date }, kind: 'system', text: `${sc.label}: ${s.sultan.name} ascends the throne at ${s.capital === 'edirne' ? 'Edirne' : s.capital}.` });

  for (const [ev, turn] of sc.opening) {
    if (turn > 0) s.scheduled.push({ id: `open-${ev}`, dueTurn: turn, kind: 'event', ref: ev, note: 'opening' });
  }
  const forced = sc.opening.filter(([, t]) => t === 0).map(([ev]) => ({ id: `open-${ev}`, dueTurn: 0, kind: 'event' as const, ref: ev, note: 'opening' }));
  s.pendingDilemmas = selectDilemmas(s, rng, forced);
  s.rngState = rng.state;
  return s;
}

function fictionalScenario(f: { name?: string; year: number }, rng: Rng): ScenarioDef {
  const year = Math.max(1420, Math.min(1500, Math.round(f.year)));
  const base = structuredClone(year < 1440 ? SCENARIOS.murad1421 : SCENARIOS.mehmed1451);
  const owners: Record<string, import('./types').Owner> = { ...base.ownerOverrides };
  for (const t of TIMELINE) if (t.year <= year) Object.assign(owners, t.owners);
  const name = f.name ?? rng.pick(FICTIONAL_NAMES);
  const age = rng.int(18, 32);
  const scale = 1 + Math.max(0, year - 1451) * 0.012; // the state grows richer through the century
  return {
    ...base,
    id: 'fictional',
    label: `Sultan ${name}, ${year}`,
    start: { year, month: 3 },
    capital: owners.constantinople === 'ottoman' ? 'constantinople' : 'edirne',
    sultan: { name, birthYear: year - age, martial: rng.int(3, 9), admin: rng.int(3, 9), piety: rng.int(3, 9), intrigue: rng.int(3, 9), health: rng.int(70, 90), historical: false },
    treasury: Math.round(base.treasury * scale),
    baseTaxFarm: Math.round(base.baseTaxFarm * scale),
    silverGrams: +(base.silverGrams * Math.pow(0.995, Math.max(0, year - base.start.year))).toFixed(3),
    population: owners.constantinople === 'ottoman' ? 60_000 + Math.max(0, year - 1460) * 2000 : base.population,
    army: { ...base.army, janissaries: Math.round(base.army.janissaries * (year >= 1453 ? 1.8 : 1)), guns: year >= 1453 ? 60 : base.army.guns, bombards: year >= 1453 ? 4 : 0, quality: year >= 1453 ? 0.9 : base.army.quality, galleys: year >= 1453 ? 80 : base.army.galleys },
    ownerOverrides: owners,
    dynasty: {
      valide: { name: `${rng.pick(['Hüma', 'Gülbahar', 'Devlet', 'Ayşe', 'Mihrimah'])} Hatun`, influence: 50, alive: true, note: 'mother of the Sultan' },
      consorts: [{ id: 'c1', name: `${rng.pick(['Nigar', 'Şirin', 'Bülbül', 'Gülruh'])} Hatun`, origin: 'palace-trained concubine', influence: 45, alive: true, historical: false }],
      princes: [
        { id: 'p1', name: rng.pick(['Ahmed', 'Korkud', 'Selim']), birthYear: year - rng.int(0, 6), motherId: 'c1', province: null, household: 10, ambition: 15, ability: rng.int(3, 8), alive: true, relation: 'son', historical: false },
        { id: 'b1', name: rng.pick(['Cem', 'Mahmud', 'Şehinşah']), birthYear: year - age + rng.int(1, 6), motherId: null, province: 'kutahya', household: 30, ambition: 50, ability: rng.int(3, 8), alive: true, relation: 'brother', historical: false },
      ],
      chiefEunuch: { name: 'Hadım Hasan Agha', title: 'Kapı Ağası (Chief White Eunuch)', loyalty: 60, competence: 6 },
      fratricideLaw: year >= 1477,
    },
    opening: [['accessionDonative', 0], ['fratricideQuestion', 0]],
  };
}

export function applyTimelineExtinctions(s: GameState) {
  for (const t of TIMELINE) {
    if (t.year > s.date.year) continue;
    for (const e of t.extinct ?? []) {
      const n = s.neighbours[e as NeighbourId];
      n.relation = 'none';
      n.fieldArmy = 0;
      n.maxArmy = 0;
      n.recovery = 0;
      n.tributeToUs = 0;
      n.tributeFromUs = 0;
      s.flags[`extinct_${e}`] = 0;
    }
  }
}
