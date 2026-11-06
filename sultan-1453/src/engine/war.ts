// War: field battles, the siege resolver, the player's campaign, enemy AI and peace terms.
import type { Campaign, GameState, NeighbourId, Owner, Siege, War, Weather } from './types';
import { Rng } from './rng';
import { DIFFICULTY } from './constants';
import { inCampaignSeason } from './calendar';
import {
  addModifier,
  atWarWith,
  clamp,
  gain,
  log,
  newId,
  ottomanProvinces,
  provincesOf,
  shock,
  shocks,
  stance,
  warWith,
  type TurnCtx,
} from './state';

// ─────────────────────────────────────────────────────────── field battle ──

export interface Side {
  infantry: number; // janissaries / professional foot
  cavalry: number; // palace cavalry
  levy: number; // timariots or feudal levy
  guns: number;
  quality: number; // per-man multiplier for the whole side
  leadership: number; // 0–10
  morale: number; // 0–100
}

export interface BattleResult {
  winner: 'a' | 'b';
  ratio: number;
  lossesA: number; // share 0–1
  lossesB: number;
}

export function sidePower(x: Side) {
  const men = x.infantry * 1.6 + x.cavalry * 1.8 + x.levy * 1.0;
  return (men + x.guns * 40) * x.quality * (1 + (x.leadership - 5) * 0.06) * (0.7 + 0.6 * (x.morale / 100));
}

export function fieldBattle(a: Side, b: Side, rng: Rng): BattleResult {
  const pa = sidePower(a) * rng.dice(0.35);
  const pb = sidePower(b) * rng.dice(0.35);
  const ratio = pa / Math.max(1, pb);
  const winner = ratio >= 1 ? 'a' : 'b';
  const r = winner === 'a' ? ratio : 1 / ratio;
  const loserLoss = clamp(0.12 + 0.1 * Math.log(r + 1) + rng.range(0, 0.1), 0.1, 0.6);
  const winnerLoss = clamp(0.1 / r + rng.range(0, 0.05), 0.02, 0.25);
  return winner === 'a'
    ? { winner, ratio, lossesA: winnerLoss, lossesB: loserLoss }
    : { winner, ratio, lossesA: loserLoss, lossesB: winnerLoss };
}

// ─────────────────────────────────────────────────────────────── siege ──

export interface Besieger {
  men: number;
  guns: number;
  bombards: number;
  artilleryQuality: number; // 0.5–1.5
  leadership: number; // 0–10
  morale: number;
  /** fleet strong enough to close the sea side */
  seaBlockade: boolean;
}

export interface SiegeMonthResult {
  siege: Siege;
  damage: number;
  repaired: number;
  attackerLossShare: number;
  defenderLosses: number;
  outcome: 'continue' | 'surrender' | 'stormed' | 'repulsed';
  notes: string[];
}

const WEATHER_GUN: Record<Weather, number> = { fair: 1, mild: 0.8, rain: 0.65, drought: 1, harshWinter: 0.35 };

/** Bombardment damage before repairs: (field guns + 12 × great bombards) × quality × weather × dice × 20 / walls. */
export function bombardment(b: Besieger, walls: number, weather: Weather, rng: Rng) {
  const raw = b.guns + b.bombards * 12;
  const mining = b.men > 10000 ? 2 : 1; // sappers and mines
  return (raw * b.artilleryQuality * WEATHER_GUN[weather] * rng.dice(0.3) * 20) / Math.max(10, walls) + mining;
}

/** Storming chance from breach, numbers, leadership and morale (logistic). */
export function assaultChance(breach: number, attackers: number, defenders: number, leadership: number, morale: number, defenderMorale: number, walls = 50) {
  const ratio = attackers / Math.max(1, defenders * 3);
  const z = (breach - 60) / 10 + Math.log(Math.max(0.05, ratio)) * 0.8 + (leadership - 5) * 0.15 + (morale - defenderMorale) / 40 - (walls - 50) / 25;
  return 1 / (1 + Math.exp(-z));
}

/**
 * One month of siege. Pure: returns a new Siege object.
 * - Guns open a breach; defenders repair in proportion to their numbers.
 * - Blockade consumes the defenders' stores; a coastal city resupplied by sea barely suffers.
 * - If `assaultThreshold` is reached (or `forceAssault`), the besieger storms once this month.
 */
export function siegeMonth(
  input: Siege,
  b: Besieger,
  walls: number,
  coastal: boolean,
  weather: Weather,
  rng: Rng,
  opts: { assaultThreshold: number; forceAssault?: boolean },
): SiegeMonthResult {
  const siege: Siege = { ...input, months: input.months + 1 };
  const notes: string[] = [];
  const damage = bombardment(b, walls, weather, rng);
  const repaired = Math.min(damage * 0.75, (siege.defenders / 1000) * 2.2 * (siege.defenderMorale / 70));
  siege.breach = clamp(siege.breach + damage - repaired);

  const seaOpen = coastal && !b.seaBlockade;
  siege.defenderSupply = Math.max(0, siege.defenderSupply - (seaOpen ? 0.25 : 1));
  if (siege.defenderSupply <= 0) siege.defenderMorale = clamp(siege.defenderMorale - 15);
  else siege.defenderMorale = clamp(siege.defenderMorale - 1.5 + (seaOpen ? 1 : 0));
  // disease in both camps
  siege.defenders = Math.round(siege.defenders * (1 - rng.range(0.005, 0.02)));
  let attackerLossShare = rng.range(0.01, 0.025);
  let defenderLosses = 0;
  let outcome: SiegeMonthResult['outcome'] = 'continue';

  const wantAssault = opts.forceAssault || siege.breach >= opts.assaultThreshold;
  if (wantAssault && b.men > siege.defenders) {
    const p = assaultChance(siege.breach, b.men, siege.defenders, b.leadership, b.morale, siege.defenderMorale, walls);
    if (rng.chance(p)) {
      outcome = 'stormed';
      attackerLossShare += rng.range(0.03, 0.08);
      defenderLosses = siege.defenders;
      notes.push(`The walls are stormed (chance ${(p * 100).toFixed(0)}%).`);
    } else {
      outcome = 'repulsed';
      siege.assaultsFailed += 1;
      attackerLossShare += rng.range(0.05, 0.14);
      defenderLosses = Math.round(siege.defenders * rng.range(0.05, 0.12));
      siege.defenders -= defenderLosses;
      siege.breach = clamp(siege.breach - 10);
      siege.defenderMorale = clamp(siege.defenderMorale + 6);
      notes.push(`An assault is thrown back from the breach (chance was ${(p * 100).toFixed(0)}%).`);
    }
  }
  if (outcome === 'continue' || outcome === 'repulsed') {
    // capitulation on terms when hope runs out
    const surrenderP = siege.defenderSupply <= 0 ? 0.45 : siege.defenderMorale < 25 ? 0.25 : siege.breach > 85 ? 0.1 : 0;
    if (surrenderP > 0 && rng.chance(surrenderP)) {
      outcome = 'surrender';
      notes.push('The garrison asks for terms (aman) and opens the gates.');
    }
  }
  return { siege, damage, repaired, attackerLossShare, defenderLosses, outcome, notes };
}

// ───────────────────────────────────────────────────────── declarations ──

export function declareWar(ctx: TurnCtx, enemy: NeighbourId, casusBelli: string, byUs: boolean): War {
  const s = ctx.s;
  const existing = warWith(s, enemy);
  if (existing) return existing;
  const n = s.neighbours[enemy];
  const brokeTruce = byUs && n.relation === 'truce' && n.truceUntilTurn > s.turn;
  const wasTributary = n.relation === 'tributary' || n.relation === 'vassal';
  const war: War = { id: newId(s, 'war'), enemies: [enemy], casusBelli, startedTurn: s.turn, score: 0, declaredByUs: byUs, peakEnemies: 1, devastation: {}, capitalBreached: [] };
  s.wars.push(war);
  n.relation = 'war';
  stance(s, enemy, -30);
  s.treaties = s.treaties.filter((t) => t.with !== enemy || t.kind === 'capitulation');
  if (byUs) {
    log(ctx, 'war', `War is declared on ${n.name}. Casus belli: ${casusBelli}.`);
    if (brokeTruce) {
      shock(s, 'ulema', -10);
      log(ctx, 'war', 'Breaking a sworn truce troubles the ulema; the Mufti’s fatwa is grudging.');
    }
  } else {
    log(ctx, 'war', `${n.name} (${n.ruler}) declares war on the Sublime State${wasTributary ? ', renouncing its tribute' : ''}.`);
  }
  // Christian coalition: a Hungarian or Byzantine war may draw in the crusading powers.
  if (['hungary', 'byzantium', 'albania', 'serbia'].includes(enemy)) {
    for (const ally of ['venice', 'hungary'] as NeighbourId[]) {
      if (ally === enemy || atWarWith(s, ally)) continue;
      const a = s.neighbours[ally];
      const p = a.stance < -40 && s.neighbours.papacy.stance < -50 ? 0.25 : 0.05;
      if (a.relation !== 'truce' && ctx.rng.chance(p)) {
        war.enemies.push(ally);
        war.peakEnemies = Math.max(war.peakEnemies, war.enemies.length);
        a.relation = 'war';
        log(ctx, 'war', `${a.name} joins the war against us at the Pope's urging.`);
      }
    }
  }
  return war;
}

export function endWar(ctx: TurnCtx, war: War, enemy: NeighbourId, terms: PeaceTerms, provinceId?: string) {
  const s = ctx.s;
  const n = s.neighbours[enemy];
  war.enemies = war.enemies.filter((e) => e !== enemy);
  if (war.enemies.length === 0) {
    s.wars = s.wars.filter((w) => w.id !== war.id);
    s.flags.lastWarEndTurn = s.turn;
  }
  s.sieges = s.sieges.filter((sg) => sg.attacker !== enemy && sg.defender !== enemy);
  if (s.campaign && s.campaign.phase !== 'returning' && (s.provinces[s.campaign.target].owner === enemy || s.provinces[s.campaign.target].owner === 'ottoman')) {
    s.campaign.phase = 'returning';
    s.campaign.monthsLeftInPhase = Math.max(1, Math.ceil(s.provinces[s.campaign.target].travelMonths));
  }
  const truce = 36;
  n.truceUntilTurn = s.turn + truce;
  n.relation = 'truce';
  let text = `Peace with ${n.name}: `;
  switch (terms) {
    case 'whitePeace':
      text += 'status quo, a three-year truce.';
      break;
    case 'tribute': {
      const amt = Math.round((provincesOf(s, enemy).reduce((a, p) => a + p.landTax + p.customs, 0) * 0.12) / 10000) * 10000 || 300_000;
      n.tributeToUs = Math.max(n.tributeToUs, amt);
      n.relation = 'tributary';
      text += `they will pay ${amt.toLocaleString()} akçe a year in haraç.`;
      break;
    }
    case 'vassalage':
      n.relation = 'vassal';
      n.tributeToUs = Math.max(n.tributeToUs, 600_000);
      n.fieldArmy = Math.round(n.fieldArmy * 0.6);
      text += 'they become vassals, owing tribute, troops on campaign and a hostage son at the Porte.';
      break;
    case 'cession':
    case 'cessionResettle': {
      const p = provinceId ? s.provinces[provinceId] : undefined;
      if (p && p.owner === enemy) {
        transferProvince(ctx, p.id, 'ottoman');
        text += `${p.name} is ceded to the Sultan.`;
        if (terms === 'cessionResettle') {
          p.prosperity = clamp(p.prosperity - 15);
          s.grain.population += 4000;
          text += ' Part of its population is resettled (sürgün) to the capital.';
        }
      } else text += 'a truce.';
      break;
    }
    case 'payTribute':
      n.tributeFromUs += 300_000;
      text += 'we buy peace with an annual payment of 300,000 akçe.';
      shock(s, 'janissaries', -6);
      shock(s, 'rumelianBeys', -6);
      break;
  }
  s.treaties.push({ id: newId(s, 'treaty'), with: enemy, kind: terms === 'vassalage' ? 'vassalage' : terms === 'tribute' ? 'tribute' : 'truce', signedTurn: s.turn, expiresTurn: s.turn + truce, terms: text });
  log(ctx, 'diplomacy', text);
}

export type PeaceTerms = 'whitePeace' | 'tribute' | 'vassalage' | 'cession' | 'cessionResettle' | 'payTribute';

/** War score the enemy must face before accepting a given demand. */
export const PEACE_THRESHOLD: Record<PeaceTerms, number> = {
  payTribute: -100,
  whitePeace: -5,
  tribute: 25,
  vassalage: 50,
  cession: 40,
  cessionResettle: 50,
};

const CORE_TERMS: PeaceTerms[] = ['cession', 'cessionResettle', 'vassalage'];

/** Record damage done to an enemy's lands, by campaign year. */
export function devastate(s: GameState, war: War | undefined, enemy: NeighbourId, points: number) {
  if (!war) return;
  const byYear = (war.devastation[enemy] ??= {});
  byYear[s.date.year] = (byYear[s.date.year] ?? 0) + points;
}

/** Seasons (years) in which we inflicted at least 3 points of devastation. */
export function devastatedSeasons(war: War, enemy: NeighbourId) {
  return Object.values(war.devastation[enemy] ?? {}).filter((v) => v >= 3).length;
}

/**
 * Resilient powers (resilience ≥ 6: Skanderbeg, Vlad, Uzun Hasan, Karaman, Byzantium…) do not give up
 * core land or sovereignty because they lost a battle or two. One of these must hold first:
 *  - their capital's walls have been breached (≥50%) or taken,
 *  - sustained devastation: 2 campaign seasons of damage (3 if resilience ≥ 8),
 *  - coalition collapse: they began the war with allies and now stand alone.
 */
export function peaceGate(s: GameState, war: War, enemy: NeighbourId): { open: boolean; reason: string } {
  const n = s.neighbours[enemy];
  if (n.resilience < 6) return { open: true, reason: 'not a resilient power' };
  if (war.capitalBreached.includes(enemy)) return { open: true, reason: 'their capital has been breached' };
  const need = n.resilience >= 8 ? 3 : 2;
  const seasons = devastatedSeasons(war, enemy);
  if (seasons >= need) return { open: true, reason: `${seasons} seasons of devastation` };
  if (war.peakEnemies > 1 && war.enemies.length === 1) return { open: true, reason: 'their coalition has collapsed' };
  return { open: false, reason: `${n.ruler} will not yield land or sovereignty: breach his capital, devastate his lands for ${need - seasons} more season(s), or break his coalition` };
}

export function peaceAcceptance(s: GameState, war: War, enemy: NeighbourId, terms: PeaceTerms): number {
  const n = s.neighbours[enemy];
  if (CORE_TERMS.includes(terms) && !peaceGate(s, war, enemy).open) return 0;
  const ourField = ottomanFieldStrength(s);
  const strength = n.fieldArmy / Math.max(1, ourField);
  const weariness = Math.min(20, (s.turn - war.startedTurn) * 0.6);
  const defiance = terms === 'whitePeace' || terms === 'payTribute' ? 0 : Math.max(0, n.resilience - 5) * 3;
  const margin = war.score + weariness - PEACE_THRESHOLD[terms] - strength * 15 - defiance;
  return clamp(0.5 + margin / 40, 0, 1);
}

export function ottomanFieldStrength(s: GameState) {
  const tim = Object.values(s.army.timariots).reduce((a, b) => a + b, 0);
  return s.army.janissaries * 1.6 + s.army.palaceCavalry * 1.8 + tim;
}

export function transferProvince(ctx: TurnCtx, pid: string, owner: Owner) {
  const s = ctx.s;
  const p = s.provinces[pid];
  const prev = p.owner;
  p.owner = owner;
  if (owner === 'ottoman') {
    p.loyalty = 25;
    p.prosperity = clamp(p.prosperity - 10);
    p.garrison = Math.max(800, Math.round(p.walls * 20));
    s.army.timariots[pid] = Math.round(p.timarCavalry * 0.3); // new timars granted gradually
    if (pid === 'constantinople') {
      s.flags.constantinopleTaken = s.turn;
      s.grain.population += pid === s.capital ? 0 : 0;
    }
  } else {
    delete s.army.timariots[pid];
    p.loyalty = 50;
    if (s.capital === pid) {
      s.status = 'lost';
      s.statusReason = `The capital ${p.name} has fallen to ${s.neighbours[owner as NeighbourId].name}.`;
    }
  }
  // a power with no lands left is extinguished
  if (prev !== 'ottoman' && provincesOf(s, prev).length === 0 && !['papacy', 'hungary', 'venice', 'mamluks', 'aqqoyunlu'].includes(prev)) {
    const n = s.neighbours[prev as NeighbourId];
    n.relation = 'none';
    n.fieldArmy = 0;
    n.maxArmy = 0;
    n.recovery = 0;
    n.tributeToUs = 0;
    n.tributeFromUs = 0;
    s.flags[`extinct_${prev}`] = s.turn;
    const w = warWith(s, prev as NeighbourId);
    if (w) {
      w.enemies = w.enemies.filter((e) => e !== prev);
      if (w.enemies.length === 0) s.wars = s.wars.filter((x) => x.id !== w.id);
    }
    log(ctx, 'war', `${n.name} ceases to exist as an independent power.`);
  }
}

// ─────────────────────────────────────────────────────────── campaigns ──

export interface CampaignOrder {
  target: string;
  janissaries?: number;
  palaceCavalry?: number;
  regions?: ('rumelia' | 'anatolia')[];
  artillery?: boolean;
  fleet?: boolean;
  ledBySultan?: boolean;
  assaultThreshold?: number;
}

export function validateCampaign(s: GameState, o: CampaignOrder): string | null {
  const p = s.provinces[o.target];
  if (!p) return `Unknown province "${o.target}".`;
  if (s.campaign) return 'An imperial army is already in the field.';
  const besiegedOwn = p.owner === 'ottoman' && s.sieges.some((sg) => sg.province === p.id && sg.defender === 'ottoman');
  if (p.owner === 'ottoman' && !besiegedOwn) return `${p.name} is already ours.`;
  if (p.owner !== 'ottoman' && !atWarWith(s, p.owner as NeighbourId)) return `We are not at war with ${s.neighbours[p.owner as NeighbourId].name}. Declare war first.`;
  const reachable = p.owner === 'ottoman' || p.adjacent.some((a) => s.provinces[a]?.owner === 'ottoman') || (p.coastal && o.fleet && s.army.fleet.galleys >= 20);
  if (!reachable) return `${p.name} does not border our lands.`;
  return null;
}

export function startCampaign(ctx: TurnCtx, o: CampaignOrder): Campaign {
  const s = ctx.s;
  const p = s.provinces[o.target];
  const regions = o.regions ?? (p.region === 'anatolia' || ['konya', 'larende', 'aleppo', 'diyarbakir'].includes(p.id) ? ['anatolia'] : ['rumelia']);
  let timariots = 0;
  for (const op of ottomanProvinces(s)) {
    if (regions.includes(op.region as 'rumelia' | 'anatolia')) {
      const t = s.army.timariots[op.id] ?? 0;
      const called = Math.round(t * 0.85); // a garrison share stays home
      timariots += called;
      s.army.timariots[op.id] = t - called;
    }
  }
  const jan = Math.min(s.army.janissaries, o.janissaries ?? Math.round(s.army.janissaries * 0.85));
  const cav = Math.min(s.army.palaceCavalry, o.palaceCavalry ?? Math.round(s.army.palaceCavalry * 0.85));
  s.army.janissaries -= jan;
  s.army.palaceCavalry -= cav;
  const guns = o.artillery === false ? 0 : s.army.artillery.guns;
  const bombards = o.artillery === false ? 0 : s.army.artillery.bombards;
  s.army.artillery.guns -= guns;
  s.army.artillery.bombards -= bombards;
  const fleet = o.fleet ? s.army.fleet.galleys : 0;
  s.army.fleet.galleys -= fleet;
  const war = s.wars.find((w) => w.enemies.includes(p.owner as NeighbourId)) ?? s.wars.find((w) => s.sieges.some((sg) => sg.province === p.id && w.enemies.includes(sg.attacker as NeighbourId)));
  const c: Campaign = {
    id: newId(s, 'camp'),
    target: p.id,
    warId: war?.id ?? '',
    phase: 'mustering',
    monthsLeftInPhase: regions.includes('anatolia') && p.region === 'rumelia' ? 2 : 1,
    janissaries: jan,
    palaceCavalry: cav,
    timariots,
    guns,
    bombards,
    fleet,
    morale: 70,
    supply: 4,
    ledBySultan: o.ledBySultan ?? true,
    assaultThreshold: o.assaultThreshold ?? 60,
    startedTurn: s.turn,
    winterQuarters: false,
  };
  s.campaign = c;
  log(ctx, 'war', `The horsetail standards are raised: ${jan.toLocaleString()} Janissaries, ${cav.toLocaleString()} Porte cavalry, ${timariots.toLocaleString()} timariot sipahis and ${guns} guns (${bombards} great bombards) muster for ${p.name}.`);
  return c;
}

function campaignMen(c: Campaign) {
  return c.janissaries + c.palaceCavalry + c.timariots;
}

function applyCampaignLosses(c: Campaign, share: number) {
  c.janissaries = Math.round(c.janissaries * (1 - share));
  c.palaceCavalry = Math.round(c.palaceCavalry * (1 - share));
  c.timariots = Math.round(c.timariots * (1 - share));
}

export function disbandCampaign(ctx: TurnCtx, reason: string) {
  const s = ctx.s;
  const c = s.campaign;
  if (!c) return;
  s.army.janissaries += c.janissaries;
  s.army.palaceCavalry += c.palaceCavalry;
  s.army.artillery.guns += c.guns;
  s.army.artillery.bombards += c.bombards;
  s.army.fleet.galleys += c.fleet;
  // timariots return proportionally to the provinces' capacity
  const provs = ottomanProvinces(s);
  const cap = provs.reduce((a, p) => a + p.timarCavalry, 0) || 1;
  for (const p of provs) s.army.timariots[p.id] = Math.min(p.timarCavalry, (s.army.timariots[p.id] ?? 0) + Math.round((c.timariots * p.timarCavalry) / cap));
  s.sieges = s.sieges.filter((sg) => !(sg.attacker === 'ottoman' && sg.province === c.target));
  s.campaign = null;
  log(ctx, 'war', `The army returns to winter at home: ${reason}`);
}

function enemyOf(s: GameState, c: Campaign): NeighbourId | null {
  const p = s.provinces[c.target];
  if (p.owner !== 'ottoman') return p.owner as NeighbourId;
  const sg = s.sieges.find((x) => x.province === p.id && x.defender === 'ottoman');
  return sg ? (sg.attacker as NeighbourId) : null;
}

function ourSide(s: GameState, c: Campaign): Side {
  return {
    infantry: c.janissaries,
    cavalry: c.palaceCavalry,
    levy: c.timariots,
    guns: Math.round(c.guns * 0.3),
    quality: 1,
    leadership: c.ledBySultan ? s.sultan.martial : s.ministers.beylerbeyRumelia.competence,
    morale: c.morale,
  };
}

function enemySide(s: GameState, n: NeighbourId, men: number): Side {
  const nb = s.neighbours[n];
  return { infantry: men * 0.3, cavalry: men * 0.2, levy: men * 0.5, guns: n === 'hungary' || n === 'venice' ? 10 : 2, quality: nb.quality * 0.75, leadership: n === 'hungary' || n === 'albania' ? 8 : 5, morale: 65 };
}

export function fightCampaignBattle(ctx: TurnCtx, enemy: NeighbourId, enemyMen: number, label: string): boolean {
  const s = ctx.s;
  const c = s.campaign!;
  const res = fieldBattle(ourSide(s, c), enemySide(s, enemy, enemyMen), ctx.rng);
  const n = s.neighbours[enemy];
  const war = warWith(s, enemy);
  applyCampaignLosses(c, res.lossesA);
  n.fieldArmy = Math.max(0, Math.round(n.fieldArmy - enemyMen * res.lossesB));
  const ourLoss = Math.round(campaignMen(c) * res.lossesA);
  const theirLoss = Math.round(enemyMen * res.lossesB);
  if (res.winner === 'a') {
    c.morale = clamp(c.morale + 12);
    if (war) war.score = clamp(war.score + 20, -100, 100);
    devastate(s, war, enemy, 1);
    s.flags.lastVictoryTurn = s.turn;
    shocks(s, { janissaries: 5, rumelianBeys: 4 });
    log(ctx, 'battle', `${label}: victory over ${n.name}. Their losses about ${theirLoss.toLocaleString()}, ours about ${ourLoss.toLocaleString()}.`);
  } else {
    c.morale = clamp(c.morale - 20);
    if (war) war.score = clamp(war.score - 25, -100, 100);
    s.flags.lastDefeatTurn = s.turn;
    shocks(s, { janissaries: -8, rumelianBeys: -6 });
    log(ctx, 'battle', `${label}: defeat at the hands of ${n.name}. We lose about ${ourLoss.toLocaleString()} men.`);
    if (c.ledBySultan && ctx.rng.chance(0.04)) {
      s.flags.sultanKilledInBattle = true;
    }
  }
  return res.winner === 'a';
}

export function campaignMonth(ctx: TurnCtx) {
  const s = ctx.s;
  const c = s.campaign;
  if (!c) return;
  const target = s.provinces[c.target];
  const enemy = enemyOf(s, c);

  // Season: from Kasım (November) the timariots go home unless ordered to winter in the field.
  const winter = s.date.month >= 11 || s.date.month <= 2;
  if (winter && c.phase !== 'returning') {
    if (!c.winterQuarters) {
      c.phase = 'returning';
      c.monthsLeftInPhase = Math.max(1, Math.ceil(target.travelMonths));
      log(ctx, 'war', 'Kasım has come: the sipahis must return to their timars, and the army turns for home.');
    } else {
      const desert = ctx.rng.range(0.12, 0.25);
      c.timariots = Math.round(c.timariots * (1 - desert));
      applyCampaignLosses(c, 0.04);
      c.morale = clamp(c.morale - 6);
      shock(s, 'rumelianBeys', -2);
      shock(s, 'anatolianBeys', -2);
      log(ctx, 'war', `Wintering in the field: ${Math.round(desert * 100)}% of the timariots slip away; cold and sickness thin the ranks.`);
    }
  }

  // supply
  c.supply -= 1;
  const nearHome = target.adjacent.some((a) => s.provinces[a]?.owner === 'ottoman') || target.owner === 'ottoman';
  if (nearHome && !s.flags.unpaidBills) c.supply = Math.min(4, c.supply + 0.8);
  if (c.supply <= 0) {
    applyCampaignLosses(c, 0.06);
    c.morale = clamp(c.morale - 12);
    log(ctx, 'war', 'Provisions are exhausted; men eat their horses and desert.');
  }
  applyCampaignLosses(c, ctx.rng.range(0.005, 0.015));

  switch (c.phase) {
    case 'mustering':
      if (--c.monthsLeftInPhase <= 0) {
        c.phase = 'marching';
        c.monthsLeftInPhase = Math.max(0, Math.ceil(target.travelMonths));
        log(ctx, 'war', `The army sets out for ${target.name}.`);
      }
      if (c.phase !== 'marching' || c.monthsLeftInPhase > 0) break;
    // falls through when no march time is needed
    case 'marching': {
      if (c.monthsLeftInPhase > 0) c.monthsLeftInPhase -= 1;
      if (c.monthsLeftInPhase > 0) break;
      if (!enemy) {
        disbandCampaign(ctx, 'no enemy left to fight.');
        return;
      }
      const n = s.neighbours[enemy];
      // relieving a besieged Ottoman fortress
      const enemySiege = s.sieges.find((x) => x.province === target.id && x.defender === 'ottoman');
      if (enemySiege) {
        const won = fightCampaignBattle(ctx, enemy, enemySiege.attackers, `Relief of ${target.name}`);
        if (won) {
          s.sieges = s.sieges.filter((x) => x.id !== enemySiege.id);
          log(ctx, 'siege', `The siege of ${target.name} is raised.`);
          c.phase = 'returning';
          c.monthsLeftInPhase = Math.max(1, Math.ceil(target.travelMonths));
        } else {
          c.phase = 'returning';
          c.monthsLeftInPhase = Math.max(1, Math.ceil(target.travelMonths));
        }
        break;
      }
      // the enemy field army may offer battle before the walls
      if (n.fieldArmy > campaignMen(c) * 0.25 && ctx.rng.chance(0.55)) {
        const men = Math.round(n.fieldArmy * 0.8);
        const won = fightCampaignBattle(ctx, enemy, men, `Battle before ${target.name}`);
        if (!won) {
          c.phase = 'returning';
          c.monthsLeftInPhase = Math.max(1, Math.ceil(target.travelMonths));
          break;
        }
      }
      const blockade = !target.coastal || c.fleet >= Math.max(10, n.navy * 0.8) || (target.id === 'constantinople' && !!s.flags.bosporusFortress && c.fleet >= n.navy * 0.5);
      s.sieges.push({
        id: newId(s, 'siege'),
        province: target.id,
        attacker: 'ottoman',
        defender: target.owner,
        breach: 0,
        defenders: target.garrison,
        defenderSupply: target.id === 'constantinople' ? 5 : 4,
        defenderMorale: 70,
        months: 0,
        assaultsFailed: 0,
        attackers: campaignMen(c),
        attackerGuns: c.guns,
      });
      s.flags[`blockade_${target.id}`] = blockade;
      c.phase = 'besieging';
      log(ctx, 'siege', `The siege of ${target.name} begins. ${target.garrison.toLocaleString()} defenders man walls of strength ${target.walls}.${target.coastal ? (blockade ? ' Our galleys close the sea.' : ' The sea remains open to the defenders.') : ''}`);
      break;
    }
    case 'besieging': {
      const sg = s.sieges.find((x) => x.province === target.id && x.attacker === 'ottoman');
      if (!sg || !enemy) {
        c.phase = 'returning';
        c.monthsLeftInPhase = Math.ceil(target.travelMonths);
        break;
      }
      const n = s.neighbours[enemy];
      // relief army (Belgrade 1456)
      const allies = (['hungary', 'venice'] as NeighbourId[]).filter((a) => a !== enemy && atWarWith(s, a));
      const relief = [enemy, ...allies].find((r) => s.neighbours[r].fieldArmy > campaignMen(c) * 0.3);
      if (relief && sg.months >= 1 && ctx.rng.chance(0.2)) {
        const men = Math.round(s.neighbours[relief].fieldArmy * 0.7);
        log(ctx, 'battle', `A relief army of ${s.neighbours[relief].name} (${men.toLocaleString()} men) falls on our siege lines.`);
        const won = fightCampaignBattle(ctx, relief, men, `Relief battle at ${target.name}`);
        if (!won) {
          s.sieges = s.sieges.filter((x) => x.id !== sg.id);
          c.phase = 'returning';
          c.monthsLeftInPhase = Math.max(1, Math.ceil(target.travelMonths));
          log(ctx, 'siege', `The siege of ${target.name} is broken.`);
          break;
        }
      }
      const forceAssault = !!s.flags.orderAssault;
      s.flags.orderAssault = false;
      const res = siegeMonth(
        sg,
        {
          men: campaignMen(c),
          guns: c.guns,
          bombards: c.bombards,
          artilleryQuality: s.army.artillery.quality,
          leadership: c.ledBySultan ? s.sultan.martial : s.ministers.beylerbeyRumelia.competence,
          morale: c.morale,
          seaBlockade: !!s.flags[`blockade_${target.id}`],
        },
        target.walls,
        target.coastal,
        s.weather,
        ctx.rng,
        { assaultThreshold: c.assaultThreshold, forceAssault },
      );
      applyCampaignLosses(c, res.attackerLossShare);
      Object.assign(sg, res.siege);
      // the army lives off the enemy's land around the siege
      if (inCampaignSeason(s.date)) {
        target.prosperity = clamp(target.prosperity - 2);
        devastate(s, warWith(s, enemy), enemy, 1);
      }
      const w = warWith(s, enemy);
      if (w && target.id === s.neighbours[enemy].capital && sg.breach >= 50 && !w.capitalBreached.includes(enemy)) {
        w.capitalBreached.push(enemy);
        log(ctx, 'siege', `The walls of ${target.name}, seat of ${s.neighbours[enemy].ruler}, are breached.`);
      }
      for (const note of res.notes) log(ctx, 'siege', `${target.name}: ${note}`);
      if (res.outcome === 'repulsed') c.morale = clamp(c.morale - 10);
      if (res.outcome === 'stormed' || res.outcome === 'surrender') {
        captureByCampaign(ctx, enemy, res.outcome === 'stormed');
      } else {
        log(ctx, 'siege', `Siege of ${target.name}, month ${sg.months}: breach ${sg.breach.toFixed(0)}%, defenders ${sg.defenders.toLocaleString()}, their stores ${sg.defenderSupply.toFixed(1)} months.`);
        if (c.morale < 20) {
          s.sieges = s.sieges.filter((x) => x.id !== sg.id);
          c.phase = 'returning';
          c.monthsLeftInPhase = Math.max(1, Math.ceil(target.travelMonths));
          const war = warWith(s, enemy);
          if (war) war.score = clamp(war.score - 15, -100, 100);
          log(ctx, 'siege', `Morale collapses and the siege of ${target.name} is abandoned.`);
        }
      }
      void n;
      break;
    }
    case 'returning':
      if (--c.monthsLeftInPhase <= 0) disbandCampaign(ctx, 'the campaign is over.');
      break;
  }
}

function captureByCampaign(ctx: TurnCtx, enemy: NeighbourId, stormed: boolean) {
  const s = ctx.s;
  const c = s.campaign!;
  const p = s.provinces[c.target];
  const war = warWith(s, enemy);
  const booty = Math.round((p.landTax + p.customs) * (stormed ? 0.5 : 0.15) * (p.prosperity / 100));
  gain(s, Math.round(booty * 0.2)); // the Sultan's fifth (pençik)
  const wasCapital = p.id === s.neighbours[enemy].capital;
  transferProvince(ctx, p.id, 'ottoman');
  if (war) {
    devastate(s, war, enemy, 2);
    if (wasCapital && !war.capitalBreached.includes(enemy)) war.capitalBreached.push(enemy);
  }
  if (stormed) p.prosperity = clamp(p.prosperity - 20);
  s.sieges = s.sieges.filter((x) => !(x.province === p.id && x.attacker === 'ottoman'));
  if (war) war.score = clamp(war.score + 25 + p.walls / 4, -100, 100);
  s.flags.lastVictoryTurn = s.turn;
  shocks(s, { janissaries: 10, rumelianBeys: 6, ulema: p.id === 'constantinople' ? 20 : 3 });
  c.morale = clamp(c.morale + 15);
  log(ctx, 'siege', `${p.name} ${stormed ? 'is taken by storm; three days of plunder are proclaimed' : 'surrenders on terms; lives and property of the inhabitants are spared'}. The Sultan’s fifth of the booty: ${Math.round(booty * 0.2).toLocaleString()} akçe.`);
  if (p.id === 'constantinople') {
    addModifier(s, { id: 'conqueror', label: 'Conqueror of Constantinople', months: 120, faction: { janissaries: 8, ulema: 12, rumelianBeys: 6 } });
    log(ctx, 'siege', 'The Red Apple has fallen. The Sultan is hailed as Fatih — the Conqueror.');
  }
  c.phase = 'returning';
  c.monthsLeftInPhase = Math.max(1, Math.ceil(p.travelMonths));
}

// ───────────────────────────────────────────────────────────── enemy AI ──

export function enemyAI(ctx: TurnCtx) {
  const s = ctx.s;
  const diff = DIFFICULTY[s.difficulty].enemyArmy;
  for (const n of Object.values(s.neighbours)) {
    if (n.maxArmy > 0) n.fieldArmy = Math.min(Math.round(n.maxArmy * diff), n.fieldArmy + n.recovery);
    n.stance = clamp(n.stance + ctx.rng.normal() * 1.5 - n.stance * 0.01, -100, 100);
    if (n.relation === 'truce' && n.truceUntilTurn <= s.turn) {
      n.relation = 'peace';
      log(ctx, 'diplomacy', `The truce with ${n.name} has expired.`);
    }
  }

  // Enemy offensives against Ottoman provinces
  for (const war of s.wars) {
    for (const e of war.enemies) {
      const n = s.neighbours[e];
      if (!inCampaignSeason(s.date) || n.fieldArmy < 3000) continue;
      const borders = ottomanProvinces(s).filter((p) => p.adjacent.some((a) => s.provinces[a]?.owner === e));
      if (borders.length === 0) continue;
      const target = ctx.rng.pick(borders);
      const already = s.sieges.some((sg) => sg.province === target.id);
      const roll = ctx.rng.next();
      if (!already && roll < n.aggression / 40 && n.fieldArmy > target.garrison * 4 && !(s.campaign && s.campaign.target === target.id)) {
        s.sieges.push({ id: newId(s, 'siege'), province: target.id, attacker: e, defender: 'ottoman', breach: 0, defenders: target.garrison, defenderSupply: 5, defenderMorale: 65, months: 0, assaultsFailed: 0, attackers: Math.round(n.fieldArmy * 0.7), attackerGuns: e === 'hungary' || e === 'venice' ? 20 : 4 });
        log(ctx, 'siege', `${n.name} lays siege to ${target.name} with some ${Math.round(n.fieldArmy * 0.7).toLocaleString()} men.`);
      } else if (roll < n.aggression / 15) {
        const loss = ctx.rng.range(3, 9);
        target.prosperity = clamp(target.prosperity - loss);
        target.loyalty = clamp(target.loyalty - 3);
        war.score = clamp(war.score - 3, -100, 100);
        log(ctx, 'war', `Raiders of ${n.name} burn villages around ${target.name} (prosperity −${loss.toFixed(0)}).`);
      }
    }
  }

  // Resolve enemy sieges of our forts
  for (const sg of [...s.sieges]) {
    if (sg.defender !== 'ottoman') continue;
    const p = s.provinces[sg.province];
    const e = sg.attacker as NeighbourId;
    if (!atWarWith(s, e)) {
      s.sieges = s.sieges.filter((x) => x.id !== sg.id);
      continue;
    }
    // local timariots and akıncıs harass the besiegers
    const local = (s.army.timariots[p.id] ?? 0) + (p.adjacent.reduce((a, id) => a + (s.army.timariots[id] ?? 0), 0) * 0.3);
    const res = siegeMonth(sg, { men: sg.attackers, guns: sg.attackerGuns, bombards: 0, artilleryQuality: 0.8, leadership: 5, morale: 60, seaBlockade: false }, p.walls, p.coastal, s.weather, ctx.rng, { assaultThreshold: 55 });
    Object.assign(sg, res.siege);
    sg.attackers = Math.round(sg.attackers * (1 - res.attackerLossShare) - local * 0.02);
    p.garrison = sg.defenders;
    const war = warWith(s, e)!;
    if (res.outcome === 'stormed' || res.outcome === 'surrender') {
      s.sieges = s.sieges.filter((x) => x.id !== sg.id);
      p.garrison = 0;
      transferProvince(ctx, p.id, e);
      war.score = clamp(war.score - 25, -100, 100);
      s.flags.lastDefeatTurn = s.turn;
      shocks(s, { janissaries: -6, rumelianBeys: -8 });
      log(ctx, 'siege', `${p.name} falls to ${s.neighbours[e].name}.`);
    } else if (!inCampaignSeason(s.date) || sg.attackers < sg.defenders * 1.5 || sg.months > 6) {
      s.sieges = s.sieges.filter((x) => x.id !== sg.id);
      war.score = clamp(war.score + 8, -100, 100);
      p.garrison = Math.max(p.garrison, 300);
      log(ctx, 'siege', `${s.neighbours[e].name} raises the siege of ${p.name}.`);
    } else {
      log(ctx, 'siege', `${p.name} under siege by ${s.neighbours[e].name}, month ${sg.months}: breach ${sg.breach.toFixed(0)}%, ${sg.defenders.toLocaleString()} defenders.`);
    }
  }

  // War weariness and enemy-initiated peace
  for (const war of [...s.wars]) {
    if (s.turn - war.startedTurn > 24) war.score = clamp(war.score - 0.5, -100, 100);
  }

  // Declarations of war against us
  const ourStrength = ottomanFieldStrength(s);
  for (const n of Object.values(s.neighbours)) {
    if (n.relation === 'war' || n.relation === 'truce' || n.fieldArmy < 3000 || n.maxArmy === 0) continue;
    if (provincesOf(s, n.id).length === 0) continue;
    const hostile = n.stance < -45;
    const tributaryRevolt = (n.relation === 'tributary' || n.relation === 'vassal') && n.stance < -55;
    const distracted = s.campaign ? 1.6 : 1;
    const p = (hostile ? (n.aggression / 500) * distracted * Math.min(2, (n.fieldArmy * n.quality * 3) / Math.max(1, ourStrength)) : 0) + (tributaryRevolt ? 0.02 : 0);
    if (p > 0 && ctx.rng.chance(p)) {
      declareWar(ctx, n.id, tributaryRevolt ? 'refusal of tribute' : 'border quarrels and opportunity', false);
    }
  }
}

export type SiegeView = Siege & { wallStrength: number; name: string };
