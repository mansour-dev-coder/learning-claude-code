// Dynasty, harem and court dilemmas. Court politics only.
import type { EventDef } from './types';
import type { MinisterRole } from '../types';
import { addModifier, canAfford, clamp, gain, livingPrinces, log, princeAge, schedule, shock, shocks, spend, stance, sultanAge, type TurnCtx } from '../state';
import { adultPrinces } from '../dynasty';
import { generateMinister } from '../data/ministers';
import { enactFromEvent } from './economy';
import { k, monthlyRevenue, owns } from './helpers';

const SANCAKS = ['amasya', 'kutahya', 'aydin', 'bursa', 'ankara', 'konya', 'filibe'];

export const COURT_EVENTS: EventDef[] = [
  {
    id: 'fratricideQuestion',
    title: 'The question of the brothers',
    category: 'dynasty',
    presenter: 'grandVizier',
    cooldown: 12,
    condition: (s) => livingPrinces(s).some((p) => p.relation === 'brother' && !p.heldBy),
    weight: (s) => (s.turn - s.sultan.reignStartTurn < 3 ? 20 : 1.5),
    prepare: (s) => {
      const b = livingPrinces(s).find((p) => p.relation === 'brother' && !p.heldBy);
      return b ? { pid: b.id, name: b.name, age: princeAge(s, b.birthYear) } : null;
    },
    brief: (s, c) => `Şehzade ${c.name}, aged ${c.age}, brother of the Sultan, lives. While he lives, any faction can raise him against you. The ulema will provide a fatwa if asked: “sedition is worse than killing.”`,
    options: [
      { id: 'execute', label: 'Have him strangled with a bowstring', summary: 'No rival; the harem grieves and some ulema are troubled. The corps prefers a single master.', apply: (ctx, c) => { const p = ctx.s.dynasty.princes.find((x) => x.id === c.pid); if (p) p.alive = false; shocks(ctx.s, { harem: -12, ulema: -3, janissaries: 3 }); log(ctx, 'dynasty', `Şehzade ${c.name} is put to death “for the order of the world.”`); } },
      { id: 'confine', label: 'Confine him within the palace', summary: 'He lives; his household is dispersed but plotters know where he is.', apply: (ctx, c) => { const p = ctx.s.dynasty.princes.find((x) => x.id === c.pid); if (p) { p.household = 5; p.province = null; } shock(ctx.s, 'harem', 3); } },
      { id: 'sancak', label: 'Give him a distant sancak', summary: 'Generous and dangerous: a prince with a province builds a household.', apply: (ctx, c) => { const p = ctx.s.dynasty.princes.find((x) => x.id === c.pid); if (p) { p.province = 'amasya'; p.household = clamp(p.household + 20); p.ambition = clamp(p.ambition + 15); } shock(ctx.s, 'harem', 6); } },
    ],
    defaultOption: 'confine',
  },
  {
    id: 'fratricideLaw',
    title: 'Make fratricide law',
    category: 'dynasty',
    presenter: 'nisanci',
    cooldown: 0,
    unique: true,
    condition: (s) => !s.laws.some((l) => l.id === 'fratricide') && s.date.year >= 1460 && sultanAge(s) > 25,
    weight: 1,
    brief: () => 'The Nişancı drafts a clause for the new kanunname: whichever son succeeds may lawfully execute his brothers.',
    options: [
      { id: 'enact', label: 'Enact it', summary: 'Ends wars of succession at the cost of princes’ lives.', apply: (ctx) => { enactFromEvent(ctx, 'fratricide'); ctx.s.dynasty.fratricideLaw = true; } },
      { id: 'decline', label: 'Leave it to God and each generation', summary: 'Succession wars remain possible.', apply: () => {} },
    ],
    defaultOption: 'decline',
  },
  {
    id: 'princeSancak',
    title: 'A prince comes of age',
    category: 'dynasty',
    presenter: 'valide',
    cooldown: 6,
    condition: (s) => livingPrinces(s).some((p) => p.relation === 'son' && !p.province && princeAge(s, p.birthYear) >= 12 && !p.heldBy),
    weight: 4,
    prepare: (s, rng) => {
      const p = livingPrinces(s).find((x) => x.relation === 'son' && !x.province && princeAge(s, x.birthYear) >= 12);
      const free = SANCAKS.filter((id) => owns(s, id) && !s.dynasty.princes.some((x) => x.alive && x.province === id));
      return p && free.length ? { pid: p.id, name: p.name, age: princeAge(s, p.birthYear), near: free.includes('bursa') ? 'bursa' : free[0], far: free.includes('amasya') ? 'amasya' : free[free.length - 1] } : null;
    },
    brief: (s, c) => `Şehzade ${c.name} is ${c.age}. His mother asks that he be sent with a lala to govern a sancak, as is custom. A sancak near the capital gives him the best chance at the succession.`,
    options: [
      { id: 'near', label: (`Appoint him near the capital`), summary: (s, c) => `${s.provinces[String(c.near)].name}: favoured heir; his household grows fast.`, apply: (ctx, c) => appoint(ctx, String(c.pid), String(c.near), 20) },
      { id: 'far', label: 'Appoint him to a distant sancak', summary: (s, c) => `${s.provinces[String(c.far)].name}: training without favour.`, apply: (ctx, c) => appoint(ctx, String(c.pid), String(c.far), 8) },
      { id: 'keep', label: 'Keep him in the palace', summary: 'Safer for you; his mother and the harem are offended; he learns nothing of rule.', apply: (ctx, c) => { shock(ctx.s, 'harem', -8); const p = ctx.s.dynasty.princes.find((x) => x.id === c.pid); if (p) p.ambition = clamp(p.ambition + 10); } },
    ],
    defaultOption: 'keep',
  },
  {
    id: 'haremRivalry',
    title: 'Rivalry between the mothers of princes',
    category: 'dynasty',
    presenter: 'chiefEunuch',
    cooldown: 12,
    condition: (s) => s.dynasty.consorts.filter((c) => c.alive && s.dynasty.princes.some((p) => p.alive && p.motherId === c.id)).length >= 2,
    weight: 2,
    prepare: (s) => {
      const mothers = s.dynasty.consorts.filter((c) => c.alive && s.dynasty.princes.some((p) => p.alive && p.motherId === c.id));
      return { a: mothers[0].id, an: mothers[0].name, b: mothers[1].id, bn: mothers[1].name };
    },
    brief: (s, c) => `${c.an} and ${c.bn} quarrel over precedence at the festival and over which son receives the better tutors. Their eunuchs carry tales.`,
    options: [
      { id: 'favourA', label: (`Favour the elder line`), summary: (s, c) => `${c.an} gains influence; the other house nurses a grievance.`, apply: (ctx, c) => favour(ctx, String(c.a), String(c.b)) },
      { id: 'favourB', label: 'Favour the younger line', summary: (s, c) => `${c.bn} gains influence.`, apply: (ctx, c) => favour(ctx, String(c.b), String(c.a)) },
      { id: 'valide', label: 'Let the Valide settle it', summary: 'The Valide’s power grows.', available: (s) => !!s.dynasty.valide?.alive, apply: (ctx) => { if (ctx.s.dynasty.valide) ctx.s.dynasty.valide.influence = clamp(ctx.s.dynasty.valide.influence + 10); shock(ctx.s, 'harem', 3); } },
    ],
    defaultOption: 'valide',
  },
  {
    id: 'valideCounsel',
    title: 'The Valide offers counsel',
    category: 'dynasty',
    presenter: 'valide',
    cooldown: 18,
    condition: (s) => !!s.dynasty.valide?.alive,
    weight: 1,
    prepare: (s, rng) => ({ target: rng.pick(['serbia', 'wallachia', 'karaman', 'venice'].filter((x) => s.neighbours[x as 'serbia'].maxArmy > 0 || x === 'venice')) }),
    brief: (s, c) => `${s.dynasty.valide!.name} says she can use her letters and kin to soften ${s.neighbours[c.target as 'serbia'].ruler}, if the Sultan will grant her household the revenues of two villages.`,
    options: [
      { id: 'accept', label: 'Grant the villages', summary: 'Better relations; her influence grows.', apply: (ctx, c) => { stance(ctx.s, c.target as 'serbia', 20); ctx.s.dynasty.valide!.influence = clamp(ctx.s.dynasty.valide!.influence + 8); shock(ctx.s, 'harem', 5); } },
      { id: 'decline', label: 'Decline with thanks', summary: 'She will remember.', apply: (ctx) => { ctx.s.dynasty.valide!.influence = clamp(ctx.s.dynasty.valide!.influence - 5); shock(ctx.s, 'harem', -4); } },
    ],
    defaultOption: 'decline',
  },
  {
    id: 'assassinationPlot',
    title: 'A plot is uncovered',
    category: 'court',
    presenter: 'chiefEunuch',
    cooldown: 12,
    condition: (s) => adultPrinces(s).some((p) => p.ambition > 55) || s.factions.janissaries < 35,
    weight: 2,
    prepare: (s) => {
      const p = adultPrinces(s).sort((a, b) => b.ambition - a.ambition)[0];
      return { suspect: p ? `the household of Şehzade ${p.name}` : 'disaffected Janissary officers', pid: p?.id ?? '' };
    },
    brief: (s, c) => `${s.dynasty.chiefEunuch.name} reports a cook bribed to poison the Sultan’s sherbet; the trail leads to ${c.suspect}.`,
    options: [
      { id: 'purge', label: 'Purge the suspects', summary: 'Executions; fear at court; the plot is broken.', apply: (ctx, c) => { const p = ctx.s.dynasty.princes.find((x) => x.id === c.pid); if (p) { p.household = clamp(p.household - 30); p.ambition = clamp(p.ambition - 10); } shocks(ctx.s, { harem: -6 }); ctx.s.flags.plotWarning = true; } },
      { id: 'investigate', label: `Quiet investigation (${k(80_000)})`, summary: 'Lower risk without a scandal.', available: (s) => canAfford(s, 80_000), apply: (ctx) => { spend(ctx.s, 80_000); ctx.s.flags.plotWarning = true; } },
      { id: 'ignore', label: 'Dismiss it as eunuch intrigue', summary: 'If it was real, the next cup may be poisoned.', apply: (ctx) => { addModifier(ctx.s, { id: 'plotUnchecked', label: 'unchecked conspiracy', months: 6 }); } },
    ],
    defaultOption: 'ignore',
  },
  {
    id: 'sultanIllness',
    title: 'The Sultan’s health',
    category: 'dynasty',
    presenter: 'chiefEunuch',
    cooldown: 12,
    condition: (s) => s.sultan.health < 60,
    weight: 3,
    brief: (s) => `The physicians report the Sultan suffers from gout and fevers (health ${Math.round(s.sultan.health)}).`,
    options: [
      { id: 'physician', label: `Summon Jacopo of Gaeta, the Jewish physician (${k(150_000)})`, summary: 'The best medicine of the age.', available: (s) => canAfford(s, 150_000), apply: (ctx) => { spend(ctx.s, 150_000); ctx.s.sultan.health = clamp(ctx.s.sultan.health + 15); } },
      { id: 'rest', label: 'Rest in the summer palace', summary: 'Health improves; the Divan meets without you for a month.', apply: (ctx) => { ctx.s.sultan.health = clamp(ctx.s.sultan.health + 8); shock(ctx.s, 'janissaries', -2); } },
      { id: 'ignore', label: 'Carry on', summary: 'Hide weakness.', apply: (ctx) => { ctx.s.sultan.health = clamp(ctx.s.sultan.health - 3); } },
    ],
    defaultOption: 'ignore',
  },
  {
    id: 'princeRebellion',
    title: 'A prince raises his standard',
    category: 'dynasty',
    presenter: 'beylerbeyAnatolia',
    cooldown: 12,
    condition: (s) => adultPrinces(s).some((p) => p.ambition > 80 && p.household > 50 && !p.heldBy),
    weight: 5,
    prepare: (s) => {
      const p = adultPrinces(s).find((x) => x.ambition > 80 && x.household > 50);
      return p ? { pid: p.id, name: p.name, province: p.province ?? 'the palace' } : null;
    },
    brief: (s, c) => `Şehzade ${c.name} has gathered sipahis and Turcomans at ${c.province} and demands to be named heir — or more.`,
    options: [
      { id: 'crush', label: 'March against him', summary: 'Civil war: costly and bloody, but final if you win.', apply: (ctx, c) => { const s = ctx.s; const p = s.dynasty.princes.find((x) => x.id === c.pid); spend(s, Math.min(s.treasury, 1_500_000)); const win = ctx.rng.chance(0.7 + (s.sultan.martial - 5) * 0.04); if (p) { if (win) { p.alive = false; log(ctx, 'dynasty', `Şehzade ${p.name} is defeated and killed.`); shock(s, 'harem', -10); } else { p.household = clamp(p.household + 10); shocks(s, { janissaries: -10, anatolianBeys: -8 }); log(ctx, 'dynasty', `The campaign against Şehzade ${p.name} fails; he holds Anatolia.`); } } } },
      { id: 'negotiate', label: 'Name him heir-presumptive', summary: 'Peace now; his brothers’ mothers are furious.', apply: (ctx, c) => { const p = ctx.s.dynasty.princes.find((x) => x.id === c.pid); if (p) { p.ambition = clamp(p.ambition - 30); p.province = 'bursa'; } shock(ctx.s, 'harem', -6); } },
    ],
    defaultOption: 'negotiate',
  },
  {
    id: 'pretenderRevolt',
    title: 'The pretender Mustafa',
    category: 'dynasty',
    presenter: 'beylerbeyRumelia',
    cooldown: 0,
    unique: true,
    forcedOnly: true,
    condition: (s) => s.dynasty.princes.some((p) => p.alive && p.relation === 'uncle'),
    weight: 1,
    brief: () => '“Düzmece” Mustafa, who claims to be the son of Bayezid the Thunderbolt, released by the Byzantines, has been acclaimed by the Rumelian marcher lords. He marches on Edirne.',
    options: [
      { id: 'battle', label: 'Meet him in the field', summary: 'Win the Janissaries and the beys back by victory — or lose everything.', apply: (ctx) => { const s = ctx.s; const p = s.dynasty.princes.find((x) => x.alive && x.relation === 'uncle'); const pRumelia = 0.55 + (s.factions.rumelianBeys - 50) / 200 + (s.factions.janissaries - 50) / 200; if (ctx.rng.chance(pRumelia)) { if (p) p.alive = false; shocks(s, { rumelianBeys: 8, janissaries: 6 }); s.flags.lastVictoryTurn = s.turn; log(ctx, 'dynasty', 'The pretender’s army melts away at the Ulubad; Mustafa is captured and hanged from the walls of Edirne.'); stance(s, 'byzantium', -20); s.flags.casusBelli_byzantium = true; } else { shocks(s, { rumelianBeys: -15, janissaries: -12 }); s.provinces.edirne.loyalty = clamp(s.provinces.edirne.loyalty - 20); log(ctx, 'dynasty', 'The first clash goes badly; Rumelia wavers between two Sultans.'); schedule(s, 2, 'event', 'pretenderRevolt', 'pretender still at large'); delete s.eventHistory.pretenderRevolt; } } },
      { id: 'bribe', label: `Buy his beys with gold (${k(1_500_000)})`, summary: 'Old marcher lords like Mihaloğlu can be bought.', available: (s) => canAfford(s, 1_500_000), apply: (ctx) => { spend(ctx.s, 1_500_000); const p = ctx.s.dynasty.princes.find((x) => x.alive && x.relation === 'uncle'); if (p) p.alive = false; shock(ctx.s, 'rumelianBeys', 4); log(ctx, 'dynasty', 'Mustafa’s beys desert him for Ottoman gold; he is caught fleeing toward Wallachia.'); } },
    ],
    defaultOption: 'battle',
  },
  {
    id: 'embezzlerCaught',
    title: 'The Defterdar’s fate',
    category: 'court',
    presenter: 'grandVizier',
    cooldown: 0,
    forcedOnly: true,
    condition: () => true,
    weight: 1,
    brief: (s) => `The audit has proved ${s.ministers.defterdar.name} guilty. The Divan awaits your judgement.`,
    options: [
      { id: 'execute', label: 'Execute him and confiscate everything', summary: 'A lesson to all officials.', apply: (ctx) => { gain(ctx.s, Math.round(monthlyRevenue(ctx.s) * 0.3)); replaceMinister(ctx, 'defterdar', 'executed'); shock(ctx.s, 'merchants', -3); } },
      { id: 'dismiss', label: 'Dismiss him in disgrace', summary: 'A new Defterdar.', apply: (ctx) => replaceMinister(ctx, 'defterdar', 'dismissed') },
      { id: 'pardon', label: 'Pardon him; he knows where the money is', summary: 'He will be careful, for a while.', apply: (ctx) => { ctx.s.ministers.defterdar.honesty = clamp(ctx.s.ministers.defterdar.honesty + 25); ctx.s.ministers.defterdar.loyalty = clamp(ctx.s.ministers.defterdar.loyalty + 10); } },
    ],
    defaultOption: 'dismiss',
  },
  {
    id: 'vizierRivalry',
    title: 'The war party against the Grand Vizier',
    category: 'court',
    presenter: 'beylerbeyRumelia',
    cooldown: 12,
    condition: (s) => s.ministers.grandVizier.agenda === 'peaceParty',
    weight: 1.5,
    brief: (s) => `${s.ministers.beylerbeyRumelia.name} and the younger viziers accuse ${s.ministers.grandVizier.name} of corresponding with ${s.neighbours[(s.ministers.grandVizier.agendaTarget ?? 'byzantium') as 'byzantium'].name} and of opposing every campaign.`,
    options: [
      { id: 'dismiss', label: 'Dismiss the Grand Vizier', summary: 'A new man of your own; the old Turkish families lose their head.', apply: (ctx) => { replaceMinister(ctx, 'grandVizier', 'dismissed'); shock(ctx.s, 'anatolianBeys', -10); shock(ctx.s, 'janissaries', 4); } },
      { id: 'execute', label: 'Arrest and execute him for treason', summary: 'Terrifying; the family’s wealth to the treasury.', apply: (ctx) => { gain(ctx.s, 2_000_000); replaceMinister(ctx, 'grandVizier', 'executed'); shocks(ctx.s, { anatolianBeys: -18, janissaries: 6, ulema: -4 }); } },
      { id: 'keep', label: 'Keep him; experience matters', summary: 'The war party is disappointed.', apply: (ctx) => { shock(ctx.s, 'rumelianBeys', -4); ctx.s.ministers.grandVizier.loyalty = clamp(ctx.s.ministers.grandVizier.loyalty + 5); } },
    ],
    defaultOption: 'keep',
  },
  {
    id: 'moveCapital',
    title: 'The seat of the Caliphate of Rum',
    category: 'court',
    presenter: 'grandVizier',
    cooldown: 0,
    unique: true,
    condition: (s) => owns(s, 'constantinople') && s.capital !== 'constantinople',
    weight: 10,
    brief: () => 'Constantinople is ours: half-empty, its walls breached, its churches silent. Shall the throne move from Edirne?',
    options: [
      { id: 'move', label: 'Make Konstantiniyye the capital', summary: 'Prestige beyond measure; a city to feed and refill.', apply: (ctx) => { const s = ctx.s; s.capital = 'constantinople'; s.grain.population = Math.max(40_000, Math.round(s.grain.population * 0.5)); s.provinces.constantinople.prosperity = 30; shocks(s, { ulema: 6, merchants: 8, rumelianBeys: -4 }); log(ctx, 'court', 'The court moves to Konstantiniyye.'); } },
      { id: 'stay', label: 'Remain at Edirne', summary: 'The marcher lords approve; the City decays.', apply: (ctx) => { shock(ctx.s, 'rumelianBeys', 4); shock(ctx.s, 'merchants', -4); } },
    ],
    defaultOption: 'move',
  },
  {
    id: 'patriarchElection',
    title: 'A Patriarch for the Rum',
    category: 'religion',
    presenter: 'nisanci',
    cooldown: 0,
    unique: true,
    condition: (s) => owns(s, 'constantinople') && !s.laws.some((l) => l.id === 'patriarchate'),
    weight: 5,
    brief: () => 'The patriarchal throne is empty. The monk Gennadios Scholarios, enemy of union with Rome, could be invested by the Sultan himself.',
    options: [
      { id: 'invest', label: 'Invest Gennadios with staff and privileges', summary: 'The Orthodox look to the Porte rather than Rome.', apply: (ctx) => { enactFromEvent(ctx, 'patriarchate'); stance(ctx.s, 'papacy', -10); } },
      { id: 'leave', label: 'Leave the see vacant', summary: 'The Orthodox are leaderless and sullen.', apply: (ctx) => shock(ctx.s, 'millets', -8) },
    ],
    defaultOption: 'invest',
  },
  {
    id: 'repopulate',
    title: 'Repopulating the City',
    category: 'economy',
    presenter: 'grandVizier',
    cooldown: 24,
    condition: (s) => s.capital === 'constantinople' && s.grain.population < 80_000,
    weight: 2,
    brief: (s) => `The capital holds ${s.grain.population.toLocaleString()} souls. The viziers propose sürgün: forced resettlement of families from Anatolia and the Balkans.`,
    options: [
      { id: 'surgun', label: 'Order the sürgün', summary: '+15,000 people, artisans and merchants among them; the provinces they leave suffer.', apply: (ctx) => { const s = ctx.s; s.grain.population += 15_000; for (const id of ['bursa', 'ankara', 'filibe', 'selanik']) if (owns(s, id)) s.provinces[id].prosperity = clamp(s.provinces[id].prosperity - 3); s.provinces.constantinople.prosperity = clamp(s.provinces.constantinople.prosperity + 8); shock(s, 'millets', -5); enactFromEvent(ctx, 'surgun'); } },
      { id: 'invite', label: 'Invite settlers with tax exemptions and free houses', summary: 'Slower, cheaper in goodwill, costlier in revenue.', apply: (ctx) => { const s = ctx.s; s.grain.population += 6_000; addModifier(s, { id: 'exemption-constantinople', label: 'settler exemptions', months: 24, province: 'constantinople', revenueMult: 0.5 }); s.provinces.constantinople.prosperity = clamp(s.provinces.constantinople.prosperity + 4); shock(s, 'merchants', 3); } },
    ],
    defaultOption: 'invite',
  },
  {
    id: 'kanunnameDraft',
    title: 'A new kanunname',
    category: 'court',
    presenter: 'nisanci',
    cooldown: 0,
    unique: true,
    condition: (s) => !s.laws.some((l) => l.id === 'kanunOsmani') && s.turn > 6,
    weight: 1,
    brief: () => 'The Nişancı has drafted a codification of criminal fines and peasant dues to bind the sancak beys and kadıs alike.',
    options: [
      { id: 'enact', label: `Promulgate it (${k(200_000)} for copies and criers)`, summary: 'Peasants and Christians gain predictability; beys lose discretion.', available: (s) => canAfford(s, 200_000), apply: (ctx) => { spend(ctx.s, 200_000); enactFromEvent(ctx, 'kanunOsmani'); } },
      { id: 'shelve', label: 'Shelve it', summary: 'Custom continues.', apply: () => {} },
    ],
    defaultOption: 'shelve',
  },
];

// ── helpers ───────────────────────────────────────────────────────────────

function appoint(ctx: TurnCtx, princeId: string, province: string, household: number) {
  const p = ctx.s.dynasty.princes.find((x) => x.id === princeId);
  if (!p) return;
  p.province = province;
  p.household = clamp(p.household + household);
  p.ambition = clamp(p.ambition + household / 2);
  shock(ctx.s, 'harem', 6);
  log(ctx, 'dynasty', `Şehzade ${p.name} goes to govern ${ctx.s.provinces[province].name}.`);
}

function favour(ctx: TurnCtx, winner: string, loser: string) {
  const w = ctx.s.dynasty.consorts.find((c) => c.id === winner);
  const l = ctx.s.dynasty.consorts.find((c) => c.id === loser);
  if (w) w.influence = clamp(w.influence + 12);
  if (l) l.influence = clamp(l.influence - 8);
  for (const p of ctx.s.dynasty.princes.filter((x) => x.alive && x.motherId === loser)) p.ambition = clamp(p.ambition + 8);
}

export function replaceMinister(ctx: TurnCtx, role: MinisterRole, how: 'dismissed' | 'executed' | 'died') {
  const s = ctx.s;
  const old = s.ministers[role];
  const used = new Set<string>([...Object.values(s.ministers).map((x) => x.name), ...((s.flags.usedMinisterNames as string) ?? '').split('|')]);
  const next = generateMinister(role, ctx.rng, s.turn, used);
  s.flags.usedMinisterNames = [...used, old.name].join('|');
  s.ministers[role] = next;
  if (how === 'executed') shock(s, old.faction, -8);
  else if (how === 'dismissed') shock(s, old.faction, -4);
  log(ctx, 'court', `${old.name} is ${how}. ${next.name} becomes ${role === 'grandVizier' ? 'Grand Vizier' : role}.`);
}
