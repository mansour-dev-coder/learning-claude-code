// The Divan's counsel. For each option of a matter, the engine works out what it would actually do
// (by dry-running it on a copy of the state), and each minister judges those effects through his own
// faction and private agenda. Nothing here changes the game; it is what ministers *say*.
import type { FactionId, GameState, Minister, MinisterRole, NeighbourId, PendingDilemma } from '../engine/types';
import { FACTIONS, MINISTER_ROLES } from '../engine/types';
import { Rng } from '../engine/rng';
import { applyDilemmaChoice } from '../engine/events/select';
import { fmtAkce, type TurnCtx } from '../engine/state';
import { TITLES } from '../engine/data/ministers';
import { reportedView } from '../engine/intel';

export interface OptionEffects {
  optionId: string;
  label: string;
  available: boolean;
  treasury: number; // change, akçe
  factions: Partial<Record<FactionId, number>>; // immediate shocks
  stance: Partial<Record<NeighbourId, number>>;
  provinces: number; // summed loyalty+prosperity change across provinces
  war: NeighbourId[]; // wars this would start
  lives: number; // princes who would die
  laws: string[];
  later: boolean; // schedules consequences in coming months
}

const FACTION_WORD: Record<FactionId, string> = {
  janissaries: 'the Janissaries', ulema: 'the ulema', rumelianBeys: 'the Rumelian beys', anatolianBeys: 'the Anatolian beys',
  harem: 'the harem', merchants: 'the merchants', millets: 'the Christian subjects',
};

/** What each option of a dilemma would do, worked out on a copy of the state. */
export function optionEffects(s: GameState, d: PendingDilemma): OptionEffects[] {
  return d.options.map((o) => {
    const c: GameState = structuredClone(s);
    const ctx: TurnCtx = { s: c, rng: new Rng(s.rngState ^ 0x2c1b), facts: [] };
    const r = o.available ? applyDilemmaChoice(ctx, d, o.id, false) : { ok: false };
    const factions: OptionEffects['factions'] = {};
    for (const f of FACTIONS) { const dlt = Math.round(c.factions[f] - s.factions[f]); if (dlt) factions[f] = dlt; }
    const stance: OptionEffects['stance'] = {};
    for (const n of Object.values(c.neighbours)) { const dlt = Math.round(n.stance - s.neighbours[n.id].stance); if (dlt) stance[n.id] = dlt; }
    let provinces = 0;
    for (const p of Object.values(c.provinces)) { const q = s.provinces[p.id]; provinces += p.loyalty - q.loyalty + p.prosperity - q.prosperity; }
    return {
      optionId: o.id,
      label: o.label,
      available: r.ok,
      treasury: Math.round(c.treasury - s.treasury),
      factions,
      stance,
      provinces: Math.round(provinces),
      war: c.wars.flatMap((w) => w.enemies).filter((e) => !s.wars.some((w) => w.enemies.includes(e))),
      lives: s.dynasty.princes.filter((p) => p.alive).length - c.dynasty.princes.filter((p) => p.alive).length,
      laws: c.laws.filter((l) => !s.laws.some((x) => x.id === l.id)).map((l) => l.name),
      later: c.scheduled.length > s.scheduled.length,
    };
  });
}

/** How strongly each office cares about each faction and about money. */
const WEIGHTS: Record<MinisterRole, { factions: Partial<Record<FactionId, number>>; money: number; realm: number }> = {
  grandVizier: { factions: { anatolianBeys: 1.2, merchants: 0.8, janissaries: 0.8, ulema: 0.6 }, money: 1.2, realm: 1 },
  defterdar: { factions: { merchants: 1 }, money: 2.2, realm: 0.4 },
  kazasker: { factions: { ulema: 1.6, millets: 0.8 }, money: 0.4, realm: 1 },
  nisanci: { factions: { merchants: 0.8, ulema: 0.4 }, money: 0.8, realm: 0.8 },
  beylerbeyRumelia: { factions: { rumelianBeys: 2, janissaries: 0.6 }, money: 0.3, realm: 0.6 },
  beylerbeyAnatolia: { factions: { anatolianBeys: 2, janissaries: 0.4 }, money: 0.3, realm: 0.6 },
  janissaryAgha: { factions: { janissaries: 3 }, money: 0.2, realm: 0.2 },
  kapudanPasha: { factions: { rumelianBeys: 0.8, merchants: 0.6 }, money: 0.4, realm: 0.6 },
  seyhulislam: { factions: { ulema: 2.4, millets: 0.3 }, money: 0.2, realm: 0.8 },
};

/** A minister's verdict on one option: positive favours it. */
export function judge(m: Minister, e: OptionEffects, s: GameState): number {
  if (!e.available) return -1e9;
  const w = WEIGHTS[m.role];
  let v = 0;
  for (const [f, d] of Object.entries(e.factions)) v += (w.factions[f as FactionId] ?? 0.15) * (d as number);
  v += (w.money * e.treasury) / Math.max(400_000, s.treasury * 0.04);
  v += w.realm * e.provinces * 0.15;
  const stanceSum = Object.values(e.stance).reduce((a, b) => a + (b as number), 0);
  switch (m.agenda) {
    case 'warParty': v += e.war.length * 8 - stanceSum * 0.15; break;
    case 'peaceParty': v -= e.war.length * 15; if (m.agendaTarget) v += (e.stance[m.agendaTarget as NeighbourId] ?? 0) * 0.5; v += stanceSum * 0.1; break;
    case 'janissaryPatron': v += (e.factions.janissaries ?? 0) * 2; break;
    case 'orthodoxy': v += (e.factions.ulema ?? 0) * 1.5; break;
    case 'embezzle': v -= e.laws.some((l) => /survey|audit/i.test(l)) ? 20 : 0; break;
    default: v += Object.values(e.factions).reduce((a, b) => a + (b as number), 0) * 0.3; // loyal: the realm as a whole
  }
  v -= e.lives * (m.role === 'seyhulislam' || m.role === 'kazasker' ? 2 : 1) * (m.agenda === 'princeFaction' ? 6 : 1);
  return v;
}

export interface Counsel {
  role: MinisterRole;
  name: string;
  title: string;
  recommends: string; // optionId
  opposes: string;
  strength: number; // how firmly (0–1)
}

export function counselOf(s: GameState, m: Minister, effects: OptionEffects[]): Counsel {
  const scored = effects.map((e) => ({ e, v: judge(m, e, s) })).filter((x) => x.e.available).sort((a, b) => b.v - a.v);
  const best = scored[0] ?? { e: effects[0], v: 0 };
  const worst = scored[scored.length - 1] ?? best;
  const gap = best.v - (scored[1]?.v ?? best.v);
  return { role: m.role, name: m.name, title: TITLES[m.role], recommends: best.e.optionId, opposes: worst.e.optionId, strength: Math.max(0.15, Math.min(1, gap / 10)) };
}

/** The whole Divan's counsel on a matter, the presenter first, then those who disagree with him. */
export function divanCounsel(s: GameState, d: PendingDilemma, effects = optionEffects(s, d)): Counsel[] {
  const all = MINISTER_ROLES.map((r) => counselOf(s, s.ministers[r], effects));
  const lead = all.find((c) => c.role === d.presenter) ?? all[0];
  const rest = all.filter((c) => c !== lead).sort((a, b) => Number(b.recommends !== lead.recommends) - Number(a.recommends !== lead.recommends) || b.strength - a.strength);
  return [lead, ...rest];
}

// ── how ministers say it ──────────────────────────────────────────────────

const ADDRESS = ['My felicitous Padişah', 'Devletlü Padişahım', 'Shadow of God on earth', 'My Sultan', 'Refuge of the world'];

export function address(m: Minister, salt: number) {
  const humble = m.loyalty > 60 || m.role === 'janissaryAgha';
  const pool = humble ? ADDRESS : ['My Sultan', 'Padişahım'];
  return pool[Math.abs(salt + m.name.length) % pool.length];
}

/** A number as this minister would report it: the dishonest shade figures that touch their agenda. */
export function reported(m: Minister, kind: 'cost' | 'faction', value: number, faction?: FactionId) {
  const shade = (100 - m.honesty) / 100;
  if (kind === 'cost' && m.agenda === 'embezzle' && value < 0) return Math.round(value * (1 - shade * 0.4)); // costs look smaller
  if (kind === 'faction' && m.agenda === 'janissaryPatron' && faction === 'janissaries') return Math.round(value * (1 + shade)); // the corps' mood exaggerated
  return value;
}

export function describeEffects(m: Minister, e: OptionEffects, s: GameState): string {
  const bits: string[] = [];
  const t = reported(m, 'cost', e.treasury);
  if (t < -10_000) bits.push(`it would cost the treasury ${fmtAkce(-t)} akçe`);
  else if (t > 10_000) bits.push(`it would bring ${fmtAkce(t)} akçe into the treasury`);
  const ups = Object.entries(e.factions).filter(([, v]) => (v as number) >= 3).map(([f]) => FACTION_WORD[f as FactionId]);
  const downs = Object.entries(e.factions).filter(([, v]) => (v as number) <= -3).map(([f]) => FACTION_WORD[f as FactionId]);
  if (ups.length) bits.push(`${list(ups)} would be pleased`);
  if (downs.length) bits.push(`${list(downs)} would resent it`);
  for (const n of e.war) bits.push(`it means war with ${s.neighbours[n].name}`);
  const stance = Object.entries(e.stance).filter(([, v]) => Math.abs(v as number) >= 8);
  for (const [n, v] of stance) bits.push(`${s.neighbours[n as NeighbourId].name} would grow ${(v as number) > 0 ? 'friendlier' : 'colder'}`);
  if (e.lives) bits.push('a prince’s life would be taken');
  if (e.laws.length) bits.push(`it would enact ${list(e.laws)}`);
  if (e.provinces <= -8) bits.push('the provinces would suffer');
  if (e.provinces >= 8) bits.push('the provinces would be the better for it');
  if (e.later) bits.push('and its consequences would not end this month');
  return bits.length ? bits.join('; ') : 'little would change, for good or ill';
}

function list(xs: string[]) {
  return xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

const REASON: Record<MinisterRole, string> = {
  grandVizier: 'The state is preserved by moderation and by the precedents of your noble forefathers.',
  defterdar: 'A full treasury is the sinew of the state; every akçe spent must earn its keep.',
  kazasker: 'Justice to the reaya is the foundation of a lasting realm.',
  nisanci: 'What is written and sealed must be honoured; the registers do not forget.',
  beylerbeyRumelia: 'The frontier respects only strength.',
  beylerbeyAnatolia: 'Anatolia must be held with a firm hand and an open one.',
  janissaryAgha: 'The corps is your right arm. Keep it fed and paid, and it will never fail you.',
  kapudanPasha: 'Whoever holds the sea holds the City’s bread.',
  seyhulislam: 'The sharia must be your measure in all things.',
};

/** The minister's own advice, in his voice. */
export function adviceLine(s: GameState, m: Minister, c: Counsel, effects: OptionEffects[], d: PendingDilemma) {
  const rec = effects.find((e) => e.optionId === c.recommends)!;
  const bad = effects.find((e) => e.optionId === c.opposes);
  const firm = c.strength > 0.6 ? 'I beg you' : c.strength > 0.3 ? 'I counsel you' : 'if I may, I would incline';
  let line = `${address(m, s.turn)}, ${firm} to choose “${rec.label}”: ${describeEffects(m, rec, s)}. ${REASON[m.role]}`;
  if (bad && bad.optionId !== rec.optionId) line += ` But “${bad.label}” I cannot counsel: ${describeEffects(m, bad, s)}.`;
  const foreign = effects.some((e) => e.war.length || Object.keys(e.stance).length);
  if (foreign && m.agenda === 'peaceParty') line += ' And let us give the infidel no pretext; peace has served your fathers well.';
  if (foreign && m.agenda === 'warParty') line += ' The sword settles what the pen only postpones.';
  void d;
  return line;
}

/** Answers to the Sultan's questions, from the engine's numbers, in the minister's voice. */
export function answer(s: GameState, m: Minister, d: PendingDilemma, effects: OptionEffects[], q: 'cost' | 'who' | 'advice' | 'sound' | 'alternatives'): string {
  const c = counselOf(s, m, effects);
  switch (q) {
    case 'cost': {
      const lines = effects.filter((e) => e.available).map((e) => {
        const t = reported(m, 'cost', e.treasury);
        return `“${e.label}”: ${t < -10_000 ? `${fmtAkce(-t)} akçe` : t > 10_000 ? `a gain of ${fmtAkce(t)} akçe` : 'nothing from the treasury'}`;
      });
      return `${address(m, s.turn + 1)}, by my reckoning: ${lines.join('; ')}.${m.role !== 'defterdar' ? ' The Defterdar keeps the registers; I speak as I understand them.' : ''}`;
    }
    case 'who': {
      return effects.filter((e) => e.available).map((e) => `If you choose “${e.label}”, ${describeEffects(m, e, s)}.`).join(' ');
    }
    case 'advice':
      return adviceLine(s, m, c, effects, d);
    case 'alternatives': {
      const unavailable = effects.filter((e) => !e.available).map((e) => e.label);
      return unavailable.length ? `Some courses are closed to us this month: ${list(unavailable.map((x) => `“${x}”`))}. The treasury or circumstance forbids them.` : 'Every course before you is open, my Sultan; the choice is yours alone.';
    }
    case 'sound': {
      // Pressing a minister on his figures: a shrewd Sultan may catch a dishonest one (deterministic per month).
      const shady = m.agenda === 'embezzle' || m.agenda === 'janissaryPatron' || m.agenda === 'peaceParty';
      const catchP = (s.sultan.intrigue / 10) * ((100 - m.honesty) / 100) + 0.15;
      const roll = ((s.turn * 2654435761 + m.name.length * 97 + d.id.length * 13) >>> 0) % 1000 / 1000;
      if (!shady) return `${address(m, s.turn)}, I would stake my head on them. Ask the Defterdar to show you the registers if you doubt me.`;
      if (roll < catchP) {
        if (m.agenda === 'embezzle') return 'He hesitates, then speaks too quickly of the season and the late caravans. His figures for the tax farms do not match what the Kapı Ağası whispered to you. An audit of the registers might be wise.';
        if (m.agenda === 'janissaryPatron') return 'He insists the corps is content, but will not meet your eye. The mood in the barracks is surely worse than he reports.';
        return `He speaks warmly of ${s.neighbours[(m.agendaTarget ?? 'byzantium') as NeighbourId]?.name ?? 'the infidel'}, rather too warmly. You wonder whose gold has reached his household.`;
      }
      return `${address(m, s.turn)}, my figures are the figures of the registers, sealed and witnessed. I have served the House of Osman too long to deceive it.`;
    }
  }
}

/** A one-line reaction when the Sultan rules. */
export function reaction(s: GameState, m: Minister, effects: OptionEffects[], chosen: string) {
  const c = counselOf(s, m, effects);
  if (c.recommends === chosen) return pick(['Your wisdom honours your servant, my Sultan.', 'It shall be done at once, Padişahım.', 'May God prosper the decision.'], s.turn + m.name.length);
  if (c.opposes === chosen) return pick(['It shall be done… as you command.', 'I obey, my Sultan, though I fear the cost.', 'Your servant hears and obeys.'], s.turn + m.name.length);
  return pick(['As you command.', 'It will be recorded, Padişahım.', 'So be it.'], s.turn + m.name.length);
}

function pick<T>(xs: T[], salt: number) {
  return xs[Math.abs(salt) % xs.length];
}

/** Which minister presents a dilemma (valide/eunuch dilemmas return null). */
export function presenterMinister(s: GameState, d: PendingDilemma): Minister | null {
  return (MINISTER_ROLES as readonly string[]).includes(d.presenter) ? s.ministers[d.presenter as MinisterRole] : null;
}

const MOOD = (v: number) => (v >= 75 ? 'devoted' : v >= 60 ? 'content' : v >= 45 ? 'uneasy' : v >= 30 ? 'resentful' : 'close to mutiny');

/** A minister's report on his own office, from the figures as he would give them. */
export function officeReport(s: GameState, m: Minister): string {
  const v = reportedView(s);
  const a = address(m, s.turn + 2);
  const fac = (f: FactionId) => `${FACTION_WORD[f]} are ${MOOD(v.factions[f])}`;
  const tim = Object.values(s.army.timariots).reduce((x, y) => x + y, 0);
  const restless = Object.values(s.provinces).filter((p) => p.owner === 'ottoman' && p.loyalty < 40).map((p) => p.name);
  switch (m.role) {
    case 'defterdar':
      return `${a}, the chests hold ${fmtAkce(v.treasury)} akçe. Each month the revenues bring ${fmtAkce(v.budget.totalRevenue)} and the state spends ${fmtAkce(v.budget.totalExpenses)}, so the treasury ${v.budget.net >= 0 ? `gains ${fmtAkce(v.budget.net)}` : `loses ${fmtAkce(-v.budget.net)}`} a month.${s.arrears > 0 ? ` The troops are owed ${fmtAkce(s.arrears)}; that debt is dangerous.` : ''}${m.agenda === 'embezzle' ? ' The tax farms have been slow this season; the caravans were late.' : ''}`;
    case 'janissaryAgha':
      return `${a}, the corps numbers ${s.army.janissaries.toLocaleString()} men at the Porte, and they are ${MOOD(v.factions.janissaries)}.${s.arrears > 0 ? ' But they have not been paid in full, and men talk at the cauldrons.' : ''} ${v.factions.janissaries < 50 ? 'A donative would quiet them.' : 'They wait only for a campaign worthy of them.'}`;
    case 'beylerbeyRumelia':
    case 'beylerbeyAnatolia': {
      const own = m.role === 'beylerbeyRumelia' ? 'rumelianBeys' : 'anatolianBeys';
      return `${a}, some ${Math.round(tim / 1000)} thousand sipahis hold timars and will ride when called. ${fac(own)}.${restless.length ? ` ${list(restless)} ${restless.length > 1 ? 'are' : 'is'} restless.` : ' The provinces are quiet.'}`;
    }
    case 'kapudanPasha':
      return `${a}, the arsenal has ${s.army.fleet.galleys} galleys fit for sea. ${s.army.fleet.galleys < 60 ? 'It is not enough to face the Venetians; give me timber and oarsmen.' : 'With these we can close the straits.'}`;
    case 'nisanci': {
      const n = Object.values(s.neighbours).filter((x) => x.maxArmy > 0).sort((x, y) => v.neighbourStance[x.id] - v.neighbourStance[y.id]);
      return `${a}, the letters from abroad tell one story: ${n[0].name} is the most hostile to us, and ${n[n.length - 1].name} the most friendly. ${s.wars.length ? `We are at war with ${list(s.wars.flatMap((w) => w.enemies).map((e) => s.neighbours[e].name))}.` : 'No treaty is presently broken.'}`;
    }
    case 'kazasker':
    case 'seyhulislam':
      return `${a}, ${fac('ulema')}, and ${fac('millets')}. ${v.factions.ulema < 50 ? 'The learned men murmur that the sharia is not given its due.' : 'The mosques pray for your victory.'}`;
    default:
      return `${a}, ${FACTIONS.map(fac).slice(0, 4).join('; ')}. ${s.wars.length ? 'The war weighs on every account.' : 'The realm is at peace.'} The treasury holds ${fmtAkce(v.treasury)} akçe, by the Defterdar's figures.`;
  }
}

/** One short line from each of the other ministers on a matter. */
export function divanVoices(s: GameState, d: PendingDilemma, effects: OptionEffects[], except: string): string[] {
  return divanCounsel(s, d, effects)
    .filter((c) => c.name !== except)
    .slice(0, 4)
    .map((c) => {
      const m = s.ministers[c.role];
      const e = effects.find((x) => x.optionId === c.recommends)!;
      const why = describeEffects(m, e, s).split('; ')[0];
      return `${c.name}, ${c.title}: “${c.strength > 0.6 ? 'Without question' : c.strength > 0.3 ? 'I would say' : 'Perhaps'}, ${e.label.charAt(0).toLowerCase()}${e.label.slice(1)}: ${why}.”`;
    });
}
