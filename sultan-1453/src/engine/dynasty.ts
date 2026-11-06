// Dynasty: ageing, illness, mortality, births, princely households, assassination, deposition, succession.
import type { GameState, Prince } from './types';
import { computeBudget } from './economy';
import { addModifier, clamp, livingPrinces, log, newId, princeAge, shock, sultanAge, type TurnCtx } from './state';

/** Annual mortality hazard for an adult man in the 15th c. elite (Gompertz-style). */
export function annualMortality(age: number, health: number) {
  const base = 0.006 * Math.exp(0.085 * Math.max(0, age - 20));
  const healthMult = health >= 80 ? 0.8 : health >= 60 ? 1 : health >= 40 ? 1.8 : health >= 20 ? 3.5 : 8;
  return Math.min(0.9, base * healthMult);
}

export function monthlyMortality(age: number, health: number, plague: boolean) {
  const a = annualMortality(age, health) * (plague ? 3 : 1);
  return 1 - Math.pow(1 - a, 1 / 12);
}

const SON_NAMES = ['Ahmed', 'Korkud', 'Şehinşah', 'Alemşah', 'Mahmud', 'Osman', 'Orhan', 'Yusuf', 'Selim', 'Süleyman', 'Musa', 'İsa', 'Abdullah', 'Murad', 'Mehmed', 'Bayezid', 'Cem', 'Alaeddin'];

export function adultPrinces(s: GameState) {
  return livingPrinces(s).filter((p) => princeAge(s, p.birthYear) >= 15);
}

export function dynastyMonth(ctx: TurnCtx) {
  const s = ctx.s;
  const sul = s.sultan;
  const age = sultanAge(s);

  // health drift
  const ageing = age > 40 ? -0.25 : age > 30 ? -0.08 : 0;
  sul.health = clamp(sul.health + ageing + (sul.health < 70 ? 0.3 : 0) + ctx.rng.normal() * 0.4);
  const plague = s.modifiers.some((m) => m.plague && (m.province === s.capital || !m.province)) && !s.flags.courtFled;
  if (ctx.rng.chance(0.006 + Math.max(0, age - 40) * 0.0008)) {
    const hit = ctx.rng.range(8, 25);
    sul.health = clamp(sul.health - hit);
    log(ctx, 'dynasty', `The Sultan falls ill (health −${hit.toFixed(0)}). The hekimbaşı is summoned.`);
  }

  // death
  if (s.flags.sultanKilledInBattle) {
    killSultan(ctx, 'killed in battle at the head of his army');
    return;
  }
  if (ctx.rng.chance(monthlyMortality(age, sul.health, plague))) {
    killSultan(ctx, plague ? 'carried off by the plague' : sul.health < 40 ? 'after a long illness' : 'suddenly, of a fever');
    return;
  }

  // A full treasury is a prize: rival princes and their households grow bolder (more ambition, not less loyalty elsewhere).
  const treasuryMonths = s.treasury / Math.max(1, computeBudget(s).totalExpenses);
  const prize = treasuryMonths > 12 ? Math.min(1, (treasuryMonths - 12) * 0.1) : 0;
  // princes
  for (const p of livingPrinces(s)) {
    const pa = princeAge(s, p.birthYear);
    if (p.province) p.household = clamp(p.household + 0.4);
    if (pa >= 15 && !p.heldBy) p.ambition = clamp(p.ambition + (p.province ? 0.25 : 0.4) + (age > 50 ? 0.4 : 0) + prize);
    // child mortality, roughly a third before adulthood
    const childRisk = pa < 5 ? 0.006 : pa < 15 ? 0.0015 : 0.0012;
    if (ctx.rng.chance(childRisk)) {
      p.alive = false;
      log(ctx, 'dynasty', `Şehzade ${p.name} dies at ${pa}.`);
    }
  }

  // births
  if (age >= 16 && age <= 55) {
    for (const c of s.dynasty.consorts.filter((x) => x.alive)) {
      if (ctx.rng.chance(0.009)) {
        const used = new Set(s.dynasty.princes.map((p) => p.name));
        const name = SON_NAMES.find((n) => !used.has(n)) ?? `Prince ${s.dynasty.princes.length + 1}`;
        const prince: Prince = { id: newId(s, 'prince'), name, birthYear: s.date.year, motherId: c.id, province: null, household: 5, ambition: 10, ability: ctx.rng.int(2, 9), alive: true, relation: 'son', historical: false };
        s.dynasty.princes.push(prince);
        c.influence = clamp(c.influence + 10);
        log(ctx, 'dynasty', `${c.name} gives birth to a son, Şehzade ${name}. Seven days of celebration.`);
      }
    }
  }

  // valide mortality (no birth year in state; assume elderly)
  const v = s.dynasty.valide;
  if (v?.alive && ctx.rng.chance(0.004)) {
    v.alive = false;
    log(ctx, 'dynasty', `${v.name} dies. Her household and her networks in the harem dissolve.`);
    shock(s, 'harem', -8);
  }

  // assassination
  const plotters = adultPrinces(s).filter((p) => p.ambition > 70 && p.household > 50 && !p.heldBy);
  const assassinP = 0.0002 + plotters.length * 0.002 * (s.factions.janissaries < 40 ? 2 : 1) * (s.flags.plotWarning ? 0.4 : 1) + (s.modifiers.some((m) => m.id === 'plotUnchecked') ? 0.004 : 0);
  if (ctx.rng.chance(assassinP)) {
    killSultan(ctx, plotters.length ? `poisoned; suspicion falls on the household of Şehzade ${plotters[0].name}` : 'assassinated by a disaffected officer');
    return;
  }

  // deposition by the Janissaries
  if (s.factions.janissaries < 20) {
    const p = (20 - s.factions.janissaries) * 0.012;
    if (ctx.rng.chance(p)) {
      const heir = bestHeir(s);
      if (heir) {
        s.status = 'deposed';
        s.statusReason = `The Janissaries overturn their kettles, march on the palace and proclaim Şehzade ${heir.name} Sultan.`;
        log(ctx, 'dynasty', s.statusReason);
      } else {
        shock(s, 'merchants', -15);
        s.treasury = Math.round(s.treasury * 0.8);
        s.arrears = 0;
        addModifier(s, { id: 'janissaryRiot', label: 'aftermath of the Janissary riot', months: 6, faction: { merchants: -10, millets: -5 } });
        shock(s, 'janissaries', 25);
        log(ctx, 'disaster', 'The Janissaries riot and plunder the bazaar; only a huge donative from the treasury restores order.');
      }
    }
  }
}

export function bestHeir(s: GameState): Prince | null {
  const cands = livingPrinces(s).filter((p) => (p.relation === 'son' || p.relation === 'brother') && !p.heldBy);
  if (cands.length === 0) return null;
  return [...cands].sort((a, b) => scoreHeir(s, b) - scoreHeir(s, a))[0];
}

function scoreHeir(s: GameState, p: Prince) {
  const age = princeAge(s, p.birthYear);
  return (p.relation === 'son' ? 30 : 0) + p.household + p.ability * 3 + Math.min(age, 25) * 2 + (p.province ? 10 : 0);
}

export function killSultan(ctx: TurnCtx, cause: string) {
  const s = ctx.s;
  s.status = 'dead';
  s.statusReason = `${s.sultan.name} dies, ${cause}, aged ${sultanAge(s)}.`;
  log(ctx, 'dynasty', s.statusReason);
}

/**
 * Continue the game as the successor after death or deposition. Returns null if there is no one.
 * Rival brothers remain alive (and dangerous) unless the Fratricide question is answered.
 */
export function successionCandidates(s: GameState) {
  return livingPrinces(s).filter((p) => (p.relation === 'son' || p.relation === 'brother') && !p.heldBy);
}

export function succeed(ctx: TurnCtx, heirId?: string): boolean {
  const s = ctx.s;
  const heir = (heirId && s.dynasty.princes.find((p) => p.id === heirId && p.alive)) || bestHeir(s);
  if (!heir) return false;
  const old = s.sultan;
  const age = princeAge(s, heir.birthYear);
  const ordinal = ['', ' II', ' III', ' IV'];
  const sameName = s.flags[`name_${heir.name}`] ? Number(s.flags[`name_${heir.name}`]) + 1 : 1;
  s.flags[`name_${heir.name}`] = sameName;
  s.sultan = {
    name: `${heir.name}${ordinal[Math.min(3, sameName - 1)] ?? ''}`,
    birthYear: heir.birthYear,
    health: 80,
    martial: clamp(heir.ability + ctx.rng.int(-2, 2), 1, 10),
    admin: clamp(heir.ability + ctx.rng.int(-2, 2), 1, 10),
    piety: ctx.rng.int(3, 9),
    intrigue: ctx.rng.int(3, 9),
    reignStartTurn: s.turn,
    historical: false,
  };
  const mother = s.dynasty.consorts.find((c) => c.id === heir.motherId);
  s.dynasty.valide = mother?.alive ? { name: mother.name, influence: clamp(mother.influence + 20), alive: true, note: `mother of ${s.sultan.name}` } : null;
  s.dynasty.consorts = [];
  s.dynasty.princes = s.dynasty.princes.filter((p) => p.id !== heir.id); // he is now the Sultan
  for (const p of livingPrinces(s)) {
    if (p.relation === 'son') p.relation = 'brother';
    else if (p.relation === 'brother') p.relation = 'uncle';
    if (p.province) p.ambition = clamp(p.ambition + 20);
  }
  s.status = 'active';
  s.statusReason = null;
  delete s.flags.sultanKilledInBattle;
  shock(s, 'janissaries', -10); // they expect the accession donative
  s.flags.accessionPending = s.turn;
  log(ctx, 'dynasty', `${s.sultan.name}, son of ${old.name}, girds the sword of Osman at ${age}.`);
  return true;
}
