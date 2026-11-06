// npm run sim -- [--seed 1453] [--scenario mehmed1451|murad1421|fictional] [--months 24] [--difficulty normal] [--full]
// Plays N months with a random (but not suicidal) Sultan and prints the ledger so the numbers can be sanity-checked.
import { createGame, resolveTurn, formatLedger, formatReport, Rng, computeBudget, grainConsumption, succeed, fmtDate, LAWS, PROJECTS, type Action, type GameState, type NeighbourId } from '../src/engine';
import { ottomanProvinces, type TurnCtx } from '../src/engine/state';
import type { ScenarioId } from '../src/engine/data/scenarios';

function arg(name: string, def: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const seed = Number(arg('seed', '1453'));
const scenario = arg('scenario', 'mehmed1451') as ScenarioId;
const months = Number(arg('months', '24'));
const difficulty = arg('difficulty', 'normal') as 'easy' | 'normal' | 'hard';
const full = process.argv.includes('--full');
const quiet = process.argv.includes('--quiet');

const bot = new Rng(seed ^ 0x9e3779b9);
const out = (s = '') => {
  if (!quiet) console.log(s);
};

function botActions(s: GameState): Action[] {
  const acts: Action[] = [];
  // answer every dilemma at random among available options
  for (const d of s.pendingDilemmas) {
    const opts = d.options.filter((o) => o.available);
    if (opts.length) acts.push({ type: 'resolveDilemma', dilemmaId: d.id, optionId: bot.pick(opts).id });
  }
  if (s.arrears > 0 && s.treasury > 0 && bot.chance(0.7)) acts.push({ type: 'payArrears' });
  const cons = grainConsumption(s);
  if (s.grain.stock < cons * 1.5 && bot.chance(0.8)) acts.push({ type: 'buyGrain', kile: cons });

  const season = s.date.month >= 3 && s.date.month <= 6;
  if (!s.campaign && season && bot.chance(0.45)) {
    // fight a war we have, or start one against a hostile neighbour
    let war = s.wars[0];
    if (!war && bot.chance(0.35)) {
      const hostile = (Object.values(s.neighbours) as GameState['neighbours'][NeighbourId][]).filter(
        (n) => n.maxArmy > 0 && n.relation !== 'war' && (n.stance < -30 || s.flags[`casusBelli_${n.id}`]) && Object.values(s.provinces).some((p) => p.owner === n.id && p.adjacent.some((a) => s.provinces[a]?.owner === 'ottoman')),
      );
      if (hostile.length) {
        const t = bot.pick(hostile);
        acts.push({ type: 'declareWar', target: t.id, casusBelli: s.flags[`casusBelli_${t.id}`] ? 'the Emperor’s threats over Orhan' : 'border raids' });
        war = { id: 'pending', enemies: [t.id], casusBelli: '', startedTurn: s.turn, score: 0, declaredByUs: true, peakEnemies: 1, devastation: {}, capitalBreached: [] };
      }
    }
    if (war) {
      const targets = Object.values(s.provinces).filter((p) => war.enemies.includes(p.owner as NeighbourId) && p.adjacent.some((a) => s.provinces[a]?.owner === 'ottoman'));
      const besieged = s.sieges.find((sg) => sg.defender === 'ottoman');
      const target = besieged ? s.provinces[besieged.province] : targets.length ? bot.pick(targets) : null;
      if (target) acts.push({ type: 'startCampaign', target: target.id, artillery: true, fleet: target.coastal, ledBySultan: true });
    }
  }
  if (bot.chance(0.08)) {
    const law = bot.pick(LAWS.filter((l) => !s.laws.some((x) => x.id === l.id)));
    if (law) acts.push({ type: 'enactLaw', lawId: law.id });
  }
  if (bot.chance(0.08) && s.projects.length < 2) {
    const p = bot.pick(PROJECTS.filter((x) => x.where === 'any'));
    acts.push({ type: 'startProject', projectId: p.id, province: bot.pick(ottomanProvinces(s)).id });
  }
  if (bot.chance(0.08) && s.treasury > 3_000_000) acts.push({ type: 'castCannon', guns: 10 });
  if (bot.chance(0.05) && s.treasury > 4_000_000) acts.push({ type: 'buildGalleys', count: 10 });
  return acts;
}

let s = createGame({ scenario, difficulty, seed });
out(`SULTAN: 1453 — engine simulation | scenario ${scenario} | seed ${seed} | difficulty ${difficulty} | ${months} months`);
out('');
out(formatLedger(s));
out('');
out(`Opening Divan: ${s.pendingDilemmas.map((d) => `[${d.presenterName}] ${d.title}`).join(' | ')}`);

const tAnnual: { year: number; revenue: number; expenses: number }[] = [];
for (let m = 0; m < months; m++) {
  if (s.status !== 'active') {
    out(`\n*** ${s.status.toUpperCase()}: ${s.statusReason}`);
    const ctx: TurnCtx = { s: structuredClone(s), rng: new Rng(s.rngState), facts: [] };
    if ((s.status === 'dead' || s.status === 'deposed') && succeed(ctx)) {
      s = ctx.s;
      s.rngState = ctx.rng.state;
      out(`*** Continuing as ${s.sultan.name}.\n`);
    } else break;
  }
  const actions = botActions(s);
  const res = resolveTurn(s, actions);
  s = res.state;
  const r = res.report;
  const y = tAnnual.find((x) => x.year === r.date.year) ?? (tAnnual.push({ year: r.date.year, revenue: 0, expenses: 0 }), tAnnual[tAnnual.length - 1]);
  y.revenue += r.budget.totalRevenue;
  y.expenses += r.budget.totalExpenses;
  out('');
  out(formatReport(r));
  if (full || (m + 1) % 6 === 0) {
    out('');
    out(formatLedger(s));
  } else {
    const f = s.factions;
    out(`   ledger: treasury ${Math.round(s.treasury / 1000).toLocaleString()}k | arrears ${Math.round(s.arrears / 1000)}k | grain ${(s.grain.stock / grainConsumption(s)).toFixed(1)} mo | jan ${Math.round(f.janissaries)} ul ${Math.round(f.ulema)} rum ${Math.round(f.rumelianBeys)} ana ${Math.round(f.anatolianBeys)} har ${Math.round(f.harem)} mer ${Math.round(f.merchants)} mil ${Math.round(f.millets)} | provinces ${ottomanProvinces(s).length}${s.campaign ? ` | army: ${s.campaign.phase} ${s.provinces[s.campaign.target].name}` : ''}`);
  }
  if (s.pendingDilemmas.length) out(`   next Divan (${fmtDate(s.date)}): ${s.pendingDilemmas.map((d) => d.title).join(' | ')}`);
}
out('');
out('══ SUMMARY ══');
for (const y of tAnnual) out(`${y.year}: revenue ${(y.revenue / 1e6).toFixed(1)}M akçe, expenses ${(y.expenses / 1e6).toFixed(1)}M, net ${((y.revenue - y.expenses) / 1e6).toFixed(1)}M`);
const b = computeBudget(s);
out(`Run-rate now: revenue ${(b.totalRevenue * 12 / 1e6).toFixed(1)}M/yr ≈ ${Math.round((b.totalRevenue * 12) / 45 / 1000)}k ducats at 45 akçe/ducat`);
out(`Status: ${s.status}${s.statusReason ? ' — ' + s.statusReason : ''}`);
if (quiet) console.log(JSON.stringify({ seed, status: s.status, turn: s.turn, treasury: s.treasury, provinces: ottomanProvinces(s).length, jan: Math.round(s.factions.janissaries), constantinople: s.provinces.constantinople.owner }));
