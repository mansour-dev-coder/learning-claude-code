// Military and diplomatic dilemmas.
import type { EventDef } from './types';
import type { NeighbourId } from '../types';
import { addModifier, atWarWith, canAfford, clamp, gain, log, schedule, shock, shocks, spend, stance, warWith } from '../state';
import { declareWar, endWar, peaceAcceptance } from '../war';
import { C } from '../constants';
import { borderNeighbours, k, n, owns, pickProvince } from './helpers';
import { enactFromEvent, startProjectFromEvent } from './economy';

export const MILITARY_EVENTS: EventDef[] = [
  {
    id: 'janissaryPayDemand',
    title: 'The Janissaries demand their pay',
    category: 'military',
    presenter: 'janissaryAgha',
    cooldown: 6,
    condition: (s) => s.arrears > 0 || s.factions.janissaries < 35,
    weight: (s) => (s.arrears > 0 ? 6 : 3),
    brief: (s) => `The corps gathers in the Et Meydanı. Arrears ${k(s.arrears)}. They demand a pay rise of one akçe a day and back pay.`,
    options: [
      { id: 'payRaise', label: 'Pay arrears and grant the rise', summary: (s) => `Arrears plus ~${k(s.army.janissaries * 30)} a month more, forever. Loyalty restored.`, available: (s) => canAfford(s, s.arrears), apply: (ctx) => { const s = ctx.s; spend(s, s.arrears); s.arrears = 0; s.flags.perm_janissaries_payRise = Number(s.flags.perm_janissaries_payRise ?? 0) + 6; shock(s, 'janissaries', 15); log(ctx, 'decision', 'The Janissaries receive their arrears and a pay rise.'); } },
      { id: 'bonus', label: 'A one-off donative, no rise', summary: (s) => `${k(s.army.janissaries * 200 + s.arrears)}.`, available: (s) => canAfford(s, s.army.janissaries * 200 + s.arrears), apply: (ctx) => { const s = ctx.s; spend(s, s.army.janissaries * 200 + s.arrears); s.arrears = 0; shock(s, 'janissaries', 10); } },
      { id: 'punish', label: 'Flog the Agha and the ringleaders', summary: 'Asserts authority; risks a full mutiny if the corps is already angry.', apply: (ctx) => { const s = ctx.s; s.ministers.janissaryAgha.loyalty = clamp(s.ministers.janissaryAgha.loyalty - 25); if (s.factions.janissaries < 30 && ctx.rng.chance(0.5)) { shock(s, 'janissaries', -20); log(ctx, 'disaster', 'The Janissaries overturn their kettles in mutiny.'); } else { shock(s, 'janissaries', -5); log(ctx, 'decision', 'The Agha is flogged; the corps sullenly submits.'); } } },
    ],
    defaultOption: 'punish',
  },
  {
    id: 'accessionDonative',
    title: 'The accession donative (cülus bahşişi)',
    category: 'military',
    presenter: 'janissaryAgha',
    cooldown: 0,
    forcedOnly: true,
    condition: () => true,
    weight: 1,
    brief: (s) => `The new Sultan must reward the kapıkulu. Custom expects a donative to each of ${s.army.janissaries.toLocaleString()} Janissaries and ${s.army.palaceCavalry.toLocaleString()} Porte cavalrymen.`,
    options: [
      { id: 'generous', label: 'A generous donative', summary: (s) => `${k((s.army.janissaries + s.army.palaceCavalry) * 500)}; the corps is yours.`, available: (s) => canAfford(s, (s.army.janissaries + s.army.palaceCavalry) * 500), apply: (ctx) => { const s = ctx.s; spend(s, (s.army.janissaries + s.army.palaceCavalry) * 500); shock(s, 'janissaries', 20); } },
      { id: 'customary', label: 'The customary sum', summary: (s) => `${k((s.army.janissaries + s.army.palaceCavalry) * 250)}.`, available: (s) => canAfford(s, (s.army.janissaries + s.army.palaceCavalry) * 250), apply: (ctx) => { const s = ctx.s; spend(s, (s.army.janissaries + s.army.palaceCavalry) * 250); shock(s, 'janissaries', 8); } },
      { id: 'refuse', label: 'Refuse: loyalty is owed, not bought', summary: 'The Buçuktepe revolt of 1446 began this way.', apply: (ctx) => { shock(ctx.s, 'janissaries', -20); schedule(ctx.s, 1, 'event', 'janissaryPayDemand', 'refused donative'); } },
    ],
    defaultOption: 'customary',
  },
  {
    id: 'orbanCannon',
    title: 'A Hungarian founder offers great bombards',
    category: 'military',
    presenter: 'grandVizier',
    cooldown: 0,
    unique: true,
    condition: (s) => s.date.year >= 1450 && s.date.year <= 1456 && s.army.artillery.bombards < 6,
    weight: 4,
    brief: () => 'Orban, a founder who left the Emperor’s service for want of pay, says he can cast a bombard “to shatter the walls of Babylon itself.” He asks four times what Constantinople offered.',
    options: [
      { id: 'hire', label: 'Hire him: a great bombard every two months', summary: `${k(250_000)} now plus ${k(C.bombardCastCost)} per gun; up to four great bombards.`, available: (s) => canAfford(s, 250_000), apply: (ctx) => { spend(ctx.s, 250_000); for (let i = 1; i <= 4; i++) schedule(ctx.s, i * 2, 'effect', 'bombardCast', 'Orban casts a bombard'); ctx.s.army.artillery.quality = clamp(ctx.s.army.artillery.quality + 0.15, 0, 1.5); log(ctx, 'military', 'Orban is taken into the Sultan’s service at Edirne.'); } },
      { id: 'refuse', label: 'Send him away', summary: 'He may find another patron.', apply: () => {} },
    ],
    defaultOption: 'refuse',
  },
  {
    id: 'borderRaid',
    title: 'Raiders cross the frontier',
    category: 'military',
    presenter: 'beylerbeyRumelia',
    cooldown: 6,
    condition: (s) => borderNeighbours(s).some((x) => s.neighbours[x].stance < -20),
    weight: 3,
    prepare: (s, rng) => {
      const cands = borderNeighbours(s).filter((x) => s.neighbours[x].stance < -20);
      if (!cands.length) return null;
      const e = rng.pick(cands);
      const p = pickProvince(s, rng, (x) => x.adjacent.some((a) => s.provinces[a]?.owner === e));
      return p ? { enemy: e, pid: p.id, name: p.name } : null;
    },
    brief: (s, c) => `Men of ${n(s, String(c.enemy)).name} have burned villages near ${c.name} and driven off livestock.`,
    options: [
      { id: 'counterRaid', label: 'Unleash the akıncıs in reprisal', summary: 'Booty and captives; their stance hardens and they may declare war.', apply: (ctx, c) => { gain(ctx.s, ctx.rng.int(100_000, 300_000)); stance(ctx.s, c.enemy as NeighbourId, -15); shock(ctx.s, 'rumelianBeys', 5); } },
      { id: 'garrison', label: `Reinforce the garrison (${k(150_000)})`, summary: '+800 men on the frontier.', available: (s) => canAfford(s, 150_000), apply: (ctx, c) => { spend(ctx.s, 150_000); ctx.s.provinces[String(c.pid)].garrison += 800; } },
      { id: 'protest', label: 'Send a çavuş to demand reparations', summary: 'Diplomacy; little effect.', apply: (ctx, c) => { ctx.s.provinces[String(c.pid)].prosperity = clamp(ctx.s.provinces[String(c.pid)].prosperity - 4); if (ctx.rng.chance(0.4)) gain(ctx.s, 50_000); } },
    ],
    defaultOption: 'protest',
  },
  {
    id: 'akinciRaid',
    title: 'The akıncı beys ask leave to raid',
    category: 'military',
    presenter: 'beylerbeyRumelia',
    cooldown: 8,
    condition: (s) => s.date.month >= 4 && s.date.month <= 9,
    weight: 2,
    prepare: (s, rng) => {
      const t = borderNeighbours(s).filter((x) => ['hungary', 'wallachia', 'albania', 'venice', 'serbia'].includes(x));
      return t.length ? { enemy: rng.pick(t) } : null;
    },
    brief: (s, c) => `The Mihaloğlu and Malkoçoğlu raider families want to ride into the lands of ${n(s, String(c.enemy)).name} for slaves and plunder.`,
    options: [
      { id: 'allow', label: 'Allow the raid', summary: 'Pençik (the fifth) to the treasury; risks war if they are at peace with us.', apply: (ctx, c) => { const e = c.enemy as NeighbourId; gain(ctx.s, ctx.rng.int(150_000, 500_000)); stance(ctx.s, e, -18); shock(ctx.s, 'rumelianBeys', 6); if (!atWarWith(ctx.s, e) && ctx.s.neighbours[e].stance < -50 && ctx.rng.chance(0.3)) declareWar(ctx, e, 'akıncı raids', false); } },
      { id: 'forbid', label: 'Forbid it', summary: 'The marcher lords resent the leash.', apply: (ctx) => shock(ctx.s, 'rumelianBeys', -5) },
    ],
    defaultOption: 'allow',
  },
  {
    id: 'fleetRefit',
    title: 'The fleet is rotting at Gelibolu',
    category: 'military',
    presenter: 'kapudanPasha',
    cooldown: 24,
    condition: (s) => s.army.fleet.galleys > 10,
    weight: 1.2,
    brief: (s) => `${s.army.fleet.galleys} galleys lie at Gelibolu. Hulls are worm-eaten; oarsmen deserted over the winter.`,
    options: [
      { id: 'refit', label: 'Full refit and new hulls', summary: (s) => `${k(s.army.fleet.galleys * 15_000)}, plus 10 new galleys.`, available: (s) => canAfford(s, s.army.fleet.galleys * 15_000 + 10 * C.galleyBuildCost * 0.5), apply: (ctx) => { const s = ctx.s; spend(s, s.army.fleet.galleys * 15_000 + 10 * C.galleyBuildCost * 0.5); s.army.fleet.galleys += 10; } },
      { id: 'patch', label: 'Patch what can be patched', summary: (s) => `${k(s.army.fleet.galleys * 5_000)}; a few hulks are broken up.`, apply: (ctx) => { const s = ctx.s; spend(s, Math.min(s.treasury, s.army.fleet.galleys * 5_000)); s.army.fleet.galleys = Math.round(s.army.fleet.galleys * 0.9); } },
      { id: 'neglect', label: 'Neglect it', summary: 'A fifth of the fleet becomes unseaworthy.', apply: (ctx) => { ctx.s.army.fleet.galleys = Math.round(ctx.s.army.fleet.galleys * 0.8); } },
    ],
    defaultOption: 'neglect',
  },
  {
    id: 'janissaryRiot',
    title: 'Janissaries riot in the market',
    category: 'military',
    presenter: 'grandVizier',
    cooldown: 12,
    condition: (s) => s.factions.janissaries < 45,
    weight: 2,
    brief: (s) => `Drunken Janissaries have looted shops in ${s.provinces[s.capital].name} and beaten a kadı’s officers.`,
    options: [
      { id: 'punish', label: 'Hang the ringleaders', summary: 'Merchants and ulema approve; the corps does not.', apply: (ctx) => { shocks(ctx.s, { janissaries: -8, merchants: 6, ulema: 3 }); } },
      { id: 'compensate', label: `Compensate the shopkeepers from the treasury (${k(150_000)})`, summary: 'Quiet everyone; the corps learns nothing.', apply: (ctx) => { spend(ctx.s, Math.min(ctx.s.treasury, 150_000)); shock(ctx.s, 'merchants', 2); } },
      { id: 'ignore', label: 'Boys will be boys', summary: 'Merchants and Christians suffer.', apply: (ctx) => { shocks(ctx.s, { merchants: -8, millets: -5, janissaries: 2 }); } },
    ],
    defaultOption: 'ignore',
  },
  {
    id: 'timarNeglect',
    title: 'Sipahis evade campaign service',
    category: 'military',
    presenter: 'beylerbeyAnatolia',
    cooldown: 18,
    condition: () => true,
    weight: 1,
    brief: () => 'The muster rolls show many timar holders failed to appear at the last summons, sending a cousin or nobody.',
    options: [
      { id: 'revoke', label: 'Revoke their timars and regrant to the deserving', summary: 'Stronger cavalry; the beys see their clients purged.', apply: (ctx) => { shocks(ctx.s, { anatolianBeys: -8, rumelianBeys: -4 }); for (const id of Object.keys(ctx.s.army.timariots)) ctx.s.army.timariots[id] = Math.round(ctx.s.army.timariots[id] * 1.05); } },
      { id: 'fine', label: 'Fine the absent (bedel)', summary: 'Cash instead of men.', apply: (ctx) => { gain(ctx.s, 200_000); shock(ctx.s, 'anatolianBeys', -2); } },
      { id: 'forgive', label: 'Forgive them this time', summary: 'Discipline slackens.', apply: (ctx) => { shock(ctx.s, 'anatolianBeys', 3); for (const id of Object.keys(ctx.s.army.timariots)) ctx.s.army.timariots[id] = Math.round(ctx.s.army.timariots[id] * 0.95); } },
    ],
    defaultOption: 'forgive',
  },
  {
    id: 'frontierFortress',
    title: 'A frontier commander asks for walls',
    category: 'military',
    presenter: 'beylerbeyRumelia',
    cooldown: 18,
    condition: () => true,
    weight: 1,
    prepare: (s, rng) => {
      const p = pickProvince(s, rng, (x) => x.adjacent.some((a) => s.provinces[a] && s.provinces[a].owner !== 'ottoman') && x.walls < 70);
      return p ? { pid: p.id, name: p.name } : null;
    },
    brief: (s, c) => `The dizdar of ${c.name} writes that the walls (strength ${s.provinces[String(c.pid)].walls}) would not hold a week against modern guns.`,
    options: [
      { id: 'build', label: 'Rebuild the fortress (1M over 6 months)', summary: 'Walls +15.', apply: (ctx, c) => startProjectFromEvent(ctx, 'fortress', String(c.pid)) },
      { id: 'men', label: 'Send 500 more men instead', summary: 'Garrison +500; ongoing pay.', apply: (ctx, c) => { ctx.s.provinces[String(c.pid)].garrison += 500; } },
      { id: 'refuse', label: 'Refuse', summary: 'Saves money.', apply: () => {} },
    ],
    defaultOption: 'refuse',
  },
  {
    id: 'siegeCouncil',
    title: 'War council before the walls',
    category: 'military',
    presenter: 'grandVizier',
    cooldown: 2,
    condition: (s) => s.campaign?.phase === 'besieging' && (s.sieges.find((x) => x.attacker === 'ottoman')?.months ?? 0) >= 1,
    weight: 6,
    brief: (s) => {
      const sg = s.sieges.find((x) => x.attacker === 'ottoman')!;
      return `Siege of ${s.provinces[sg.province].name}, month ${sg.months}: breach ${sg.breach.toFixed(0)}%, ${sg.defenders.toLocaleString()} defenders, ${sg.assaultsFailed} failed assaults. ${s.ministers.grandVizier.name} counsels caution; ${s.ministers.beylerbeyRumelia.name} urges a general assault.`;
    },
    options: [
      { id: 'assault', label: 'General assault this month', summary: 'Storm the breach whatever its state. Costly if it fails.', apply: (ctx) => { ctx.s.flags.orderAssault = true; } },
      { id: 'continue', label: 'Keep bombarding', summary: 'Wait for a wider breach.', apply: () => {} },
      { id: 'lift', label: 'Lift the siege', summary: 'Save the army; lose face and war score.', apply: (ctx) => { const s = ctx.s; const sg = s.sieges.find((x) => x.attacker === 'ottoman'); if (sg && s.campaign) { s.sieges = s.sieges.filter((x) => x.id !== sg.id); s.campaign.phase = 'returning'; s.campaign.monthsLeftInPhase = Math.max(1, Math.ceil(s.provinces[sg.province].travelMonths)); const w = warWith(s, sg.defender as NeighbourId); if (w) w.score = clamp(w.score - 10, -100, 100); shocks(s, { janissaries: -6 }); log(ctx, 'siege', `The siege of ${s.provinces[sg.province].name} is lifted.`); } } },
    ],
    defaultOption: 'continue',
  },
  {
    id: 'devsirmeLevy',
    title: 'The corps needs fresh boys',
    category: 'military',
    presenter: 'janissaryAgha',
    cooldown: 36,
    condition: (s) => !s.laws.some((l) => l.id === 'regularDevsirme'),
    weight: 1.5,
    brief: (s) => `The Agha wants a devşirme levy from the Balkan villages. The corps stands at ${s.army.janissaries.toLocaleString()}.`,
    options: [
      { id: 'large', label: 'A large levy (3,000 boys)', summary: `${k(3000 * C.devsirmeCostPerBoy)}; ready as Janissaries in ~5 years. Christian villages grieve.`, available: (s) => canAfford(s, 3000 * C.devsirmeCostPerBoy), apply: (ctx) => levy(ctx, 3000) },
      { id: 'small', label: 'A small levy (1,000 boys)', summary: `${k(1000 * C.devsirmeCostPerBoy)}.`, available: (s) => canAfford(s, 1000 * C.devsirmeCostPerBoy), apply: (ctx) => levy(ctx, 1000) },
      { id: 'defer', label: 'Not this year', summary: 'The corps ages.', apply: (ctx) => shock(ctx.s, 'janissaries', -2) },
    ],
    defaultOption: 'defer',
  },
  // ── diplomacy ───────────────────────────────────────────────────────────
  {
    id: 'venetianEmbassy',
    title: 'A Venetian embassy',
    category: 'diplomacy',
    presenter: 'nisanci',
    cooldown: 24,
    condition: (s) => !atWarWith(s, 'venice') && !s.laws.some((l) => l.id === 'capitulations'),
    weight: 1.5,
    brief: (s) => `The bailo of Venice proposes renewing the trade treaty: reduced customs for Venetian merchants, a consul at the Porte, and ${k(200_000)} in annual gifts. Stance ${Math.round(s.neighbours.venice.stance)}.`,
    options: [
      { id: 'sign', label: 'Grant the capitulations', summary: 'Trade grows (+10% customs); Venice friendlier.', apply: (ctx) => { enactFromEvent(ctx, 'capitulations'); stance(ctx.s, 'venice', 20); gain(ctx.s, 200_000); ctx.s.treaties.push({ id: `cap-${ctx.s.turn}`, with: 'venice', kind: 'capitulation', signedTurn: ctx.s.turn, expiresTurn: null, terms: 'Trade capitulations' }); } },
      { id: 'demand', label: 'Demand an annual tribute for their islands', summary: 'Proud; Venice may refuse and turn hostile.', apply: (ctx) => { if (ctx.rng.chance(0.4)) { ctx.s.neighbours.venice.tributeToUs += 240_000; ctx.s.neighbours.venice.relation = 'tributary'; log(ctx, 'diplomacy', 'Venice agrees to pay 240,000 akçe a year.'); } else { stance(ctx.s, 'venice', -20); log(ctx, 'diplomacy', 'The Signoria refuses and recalls its bailo.'); } } },
      { id: 'refuse', label: 'Send them home with robes of honour', summary: 'No change.', apply: () => {} },
    ],
    defaultOption: 'refuse',
  },
  {
    id: 'byzantineOrhan',
    title: 'The Emperor’s envoys and Prince Orhan',
    category: 'diplomacy',
    presenter: 'grandVizier',
    cooldown: 0,
    unique: true,
    condition: (s) => s.provinces.constantinople.owner === 'byzantium' && s.dynasty.princes.some((p) => p.alive && p.heldBy === 'byzantium'),
    weight: 5,
    brief: (s) => `Envoys of ${s.neighbours.byzantium.ruler} demand that the pension for the Ottoman pretender Orhan, kept in Constantinople, be doubled — or they will “release him”. ${s.ministers.grandVizier.name} urges patience.`,
    options: [
      { id: 'pay', label: 'Double the pension', summary: `+${k(300_000)} a year to Byzantium; peace for now.`, apply: (ctx) => { ctx.s.neighbours.byzantium.tributeFromUs += 300_000; stance(ctx.s, 'byzantium', 10); ctx.s.ministers.grandVizier.loyalty = clamp(ctx.s.ministers.grandVizier.loyalty + 5); } },
      { id: 'stop', label: 'Stop the pension and seize the Strymon revenues assigned to it', summary: 'A casus belli for both sides. The war party cheers.', apply: (ctx) => { ctx.s.neighbours.byzantium.tributeFromUs = 0; stance(ctx.s, 'byzantium', -30); ctx.s.flags.casusBelli_byzantium = true; shocks(ctx.s, { janissaries: 4, rumelianBeys: 4 }); log(ctx, 'diplomacy', 'The Sultan cuts off Orhan’s pension. The Emperor has given him his casus belli.'); } },
      { id: 'delay', label: 'Answer them in Edirne next spring', summary: 'Buys time.', apply: (ctx) => stance(ctx.s, 'byzantium', -5) },
    ],
    defaultOption: 'delay',
  },
  {
    id: 'bosporusFortress',
    title: 'Build a fortress on the Bosporus',
    category: 'military',
    presenter: 'beylerbeyRumelia',
    cooldown: 0,
    unique: true,
    condition: (s) => s.provinces.constantinople.owner === 'byzantium' && !s.flags.bosporusFortress && s.date.year >= 1451 && !s.projects.some((p) => p.id === 'rumeliHisari'),
    weight: 3,
    brief: () => 'Opposite Bayezid I’s Anadolu Hisarı, on the narrowest point of the strait, a fortress would let our guns close the Bosporus to ships from the Black Sea.',
    options: [
      { id: 'build', label: 'Build it now (3M over 5 months)', summary: 'Constantinople can be blockaded; the Emperor will know what it means.', apply: (ctx) => { startProjectFromEvent(ctx, 'rumeliHisari', 'edirne'); stance(ctx.s, 'byzantium', -25); stance(ctx.s, 'venice', -5); } },
      { id: 'wait', label: 'Not yet', summary: 'Keeps the peace with Byzantium.', apply: () => {} },
    ],
    defaultOption: 'wait',
  },
  {
    id: 'truceRenewal',
    title: 'A truce is about to expire',
    category: 'diplomacy',
    presenter: 'nisanci',
    cooldown: 6,
    condition: (s) => Object.values(s.neighbours).some((x) => x.relation === 'truce' && x.truceUntilTurn - s.turn <= 3 && x.truceUntilTurn > s.turn),
    weight: 4,
    prepare: (s) => {
      const x = Object.values(s.neighbours).find((y) => y.relation === 'truce' && y.truceUntilTurn - s.turn <= 3 && y.truceUntilTurn > s.turn);
      return x ? { enemy: x.id } : null;
    },
    brief: (s, c) => `The truce with ${n(s, String(c.enemy)).name} ends in ${n(s, String(c.enemy)).truceUntilTurn - s.turn} months. Their envoy has come to discuss renewal.`,
    options: [
      { id: 'renew', label: `Renew for three years with gifts (${k(150_000)})`, summary: 'Peace on that frontier.', apply: (ctx, c) => { const x = ctx.s.neighbours[c.enemy as NeighbourId]; spend(ctx.s, Math.min(ctx.s.treasury, 150_000)); x.truceUntilTurn = ctx.s.turn + 36; stance(ctx.s, x.id, 10); log(ctx, 'diplomacy', `Truce with ${x.name} renewed for three years.`); } },
      { id: 'lapse', label: 'Let it lapse', summary: 'Free hands; so are theirs.', apply: (ctx, c) => stance(ctx.s, c.enemy as NeighbourId, -10) },
    ],
    defaultOption: 'lapse',
  },
  {
    id: 'vassalTribute',
    title: 'A vassal is late with tribute',
    category: 'diplomacy',
    presenter: 'defterdar',
    cooldown: 12,
    condition: (s) => Object.values(s.neighbours).some((x) => (x.relation === 'tributary' || x.relation === 'vassal') && x.stance < 10),
    weight: 2,
    prepare: (s, rng) => {
      const c = Object.values(s.neighbours).filter((x) => (x.relation === 'tributary' || x.relation === 'vassal') && x.stance < 10);
      return c.length ? { enemy: rng.pick(c).id } : null;
    },
    brief: (s, c) => `${n(s, String(c.enemy)).ruler} sends excuses instead of the year’s ${k(n(s, String(c.enemy)).tributeToUs)}.`,
    options: [
      { id: 'threaten', label: 'Threaten war and demand a hostage son', summary: 'Most vassals pay; some rebel.', apply: (ctx, c) => { const x = ctx.s.neighbours[c.enemy as NeighbourId]; if (ctx.rng.chance(0.7)) { stance(ctx.s, x.id, -5); gain(ctx.s, Math.round(x.tributeToUs / 2)); log(ctx, 'diplomacy', `${x.ruler} pays up and sends a son to the Porte.`); } else { declareWar(ctx, x.id, 'refusal of tribute', false); } } },
      { id: 'reduce', label: 'Reduce the tribute by a third', summary: 'Goodwill; less income.', apply: (ctx, c) => { const x = ctx.s.neighbours[c.enemy as NeighbourId]; x.tributeToUs = Math.round(x.tributeToUs * 0.67); stance(ctx.s, x.id, 20); } },
      { id: 'ignore', label: 'Let it go this year', summary: 'Encourages others.', apply: (ctx, c) => stance(ctx.s, c.enemy as NeighbourId, -8) },
    ],
    defaultOption: 'ignore',
  },
  {
    id: 'wallachianThrone',
    title: 'A claimant to the Wallachian throne',
    category: 'diplomacy',
    presenter: 'beylerbeyRumelia',
    cooldown: 36,
    condition: (s) => s.neighbours.wallachia.maxArmy > 0 && !atWarWith(s, 'wallachia'),
    weight: 1,
    brief: (s) => `A son of the Drăculești, raised as a hostage at the Porte, offers to take the Wallachian throne from ${s.neighbours.wallachia.ruler} as our loyal vassal — if we lend him cavalry.`,
    options: [
      { id: 'back', label: `Back him with 4,000 akıncıs and ${k(200_000)}`, summary: 'A grateful vassal, perhaps. Hostages raised at court do not always stay grateful.', available: (s) => canAfford(s, 200_000), apply: (ctx) => { spend(ctx.s, 200_000); const w = ctx.s.neighbours.wallachia; if (ctx.rng.chance(0.6)) { w.ruler = 'Voivode Vlad III (Drăculea)'; w.relation = 'tributary'; w.tributeToUs = Math.max(w.tributeToUs, 450_000); w.stance = ctx.rng.chance(0.5) ? 40 : -20; log(ctx, 'diplomacy', 'Vlad Drăculea takes the Wallachian throne with Ottoman help.'); } else { stance(ctx.s, 'wallachia', -25); log(ctx, 'diplomacy', 'The coup fails; the boyars rally to the voivode.'); } } },
      { id: 'decline', label: 'Keep him in reserve at court', summary: 'A useful card for later.', apply: () => {} },
    ],
    defaultOption: 'decline',
  },
  {
    id: 'karamanIntrigue',
    title: 'Karaman stirs the Turcomans',
    category: 'diplomacy',
    presenter: 'beylerbeyAnatolia',
    cooldown: 18,
    condition: (s) => s.neighbours.karaman.maxArmy > 0 && !atWarWith(s, 'karaman'),
    weight: 1.5,
    brief: (s) => `${s.neighbours.karaman.ruler} is sending agents among the Turcoman tribes of the borderland and receives Venetian envoys. The Anatolian beys want a campaign.`,
    options: [
      { id: 'war', label: 'Declare war on Karaman', summary: 'The Anatolian beys rejoice; the ulema dislike war on Muslims.', apply: (ctx) => { declareWar(ctx, 'karaman', 'incitement of the Turcomans and alliance with the infidel', true); } },
      { id: 'gift', label: `Buy peace with gifts (${k(300_000)})`, summary: 'Karaman friendlier, for a while.', available: (s) => canAfford(s, 300_000), apply: (ctx) => { spend(ctx.s, 300_000); stance(ctx.s, 'karaman', 25); } },
      { id: 'warn', label: 'A stern letter', summary: 'They may ignore it.', apply: (ctx) => { stance(ctx.s, 'karaman', -5); shock(ctx.s, 'anatolianBeys', -3); } },
    ],
    defaultOption: 'warn',
  },
  {
    id: 'mamlukFrontier',
    title: 'Mamluk envoy on the Dulkadir frontier',
    category: 'diplomacy',
    presenter: 'nisanci',
    cooldown: 30,
    condition: (s) => !atWarWith(s, 'mamluks'),
    weight: 0.8,
    brief: (s) => `${s.neighbours.mamluks.ruler}'s envoy protests our patronage of the Dulkadir beys, whom Cairo considers its clients.`,
    options: [
      { id: 'concede', label: 'Acknowledge Cairo’s suzerainty over Dulkadir', summary: 'Peace with the strongest Muslim power.', apply: (ctx) => { stance(ctx.s, 'mamluks', 15); shock(ctx.s, 'anatolianBeys', -3); } },
      { id: 'defy', label: 'Insist on our protection', summary: 'Pride; the Mamluks are not to be trifled with.', apply: (ctx) => { stance(ctx.s, 'mamluks', -20); shock(ctx.s, 'anatolianBeys', 3); } },
    ],
    defaultOption: 'concede',
  },
  {
    id: 'aqqoyunluEnvoy',
    title: 'An embassy from the Aq Qoyunlu',
    category: 'diplomacy',
    presenter: 'beylerbeyAnatolia',
    cooldown: 36,
    condition: (s) => s.date.year >= 1453 && !atWarWith(s, 'aqqoyunlu'),
    weight: 0.8,
    brief: (s) => `${s.neighbours.aqqoyunlu.ruler} demands that we renounce claims in eastern Anatolia and hints at alliance with Venice and Karaman.`,
    options: [
      { id: 'appease', label: 'Exchange gifts and recognise the frontier', summary: 'Quiet in the east.', apply: (ctx) => { spend(ctx.s, Math.min(ctx.s.treasury, 150_000)); stance(ctx.s, 'aqqoyunlu', 15); } },
      { id: 'rebuff', label: 'Rebuff him', summary: 'Hostility grows in the east.', apply: (ctx) => stance(ctx.s, 'aqqoyunlu', -20) },
    ],
    defaultOption: 'appease',
  },
  {
    id: 'crusadeCall',
    title: 'The Pope preaches a crusade',
    category: 'diplomacy',
    presenter: 'nisanci',
    cooldown: 36,
    condition: (s) => s.neighbours.papacy.stance < -50,
    weight: 1,
    brief: (s) => `${s.neighbours.papacy.ruler} has proclaimed a crusade and imposed a tithe on Christendom. Hungary and Venice are being courted.`,
    options: [
      { id: 'splitVenice', label: `Offer Venice trade concessions to stay out (${k(300_000)} in lost customs)`, summary: 'Splits the coalition.', apply: (ctx) => { spend(ctx.s, Math.min(ctx.s.treasury, 300_000)); stance(ctx.s, 'venice', 25); stance(ctx.s, 'hungary', -10); } },
      { id: 'prepare', label: 'Prepare the frontier fortresses', summary: 'Garrisons on the Danube +1,500.', apply: (ctx) => { for (const id of ['vidin', 'nikopol', 'sofia']) if (owns(ctx.s, id)) ctx.s.provinces[id].garrison += 500; } },
      { id: 'ignore', label: 'Christendom is too divided to march', summary: 'Often true.', apply: (ctx) => { stance(ctx.s, 'hungary', -15); stance(ctx.s, 'venice', -8); } },
    ],
    defaultOption: 'ignore',
  },
  {
    id: 'galataNeutrality',
    title: 'The Genoese of Galata',
    category: 'diplomacy',
    presenter: 'grandVizier',
    cooldown: 0,
    unique: true,
    condition: (s) => s.provinces.constantinople.owner === 'byzantium' && atWarWith(s, 'byzantium'),
    weight: 4,
    brief: () => 'The podestà of Genoese Galata, across the Golden Horn, asks for a guarantee of the colony’s privileges in exchange for neutrality.',
    options: [
      { id: 'guarantee', label: 'Guarantee their privileges', summary: 'Galata stays neutral (mostly); fewer Latin volunteers on the walls.', apply: (ctx) => { ctx.s.provinces.constantinople.garrison = Math.round(ctx.s.provinces.constantinople.garrison * 0.92); shock(ctx.s, 'merchants', 3); } },
      { id: 'threaten', label: 'Threaten them with the fate of the city', summary: 'Galata sends men and chains across the Horn.', apply: (ctx) => { ctx.s.provinces.constantinople.garrison += 600; stance(ctx.s, 'venice', -5); } },
    ],
    defaultOption: 'guarantee',
  },
  {
    id: 'peaceFeelers',
    title: 'The enemy sues for peace',
    category: 'diplomacy',
    presenter: 'grandVizier',
    cooldown: 4,
    condition: (s) => s.wars.some((w) => w.score >= 30),
    weight: 4,
    prepare: (s) => {
      const w = s.wars.find((x) => x.score >= 30);
      if (!w) return null;
      const e = w.enemies[0];
      const prov = Object.values(s.provinces).find((p) => p.owner === e && p.adjacent.some((a) => s.provinces[a]?.owner === 'ottoman'));
      return { enemy: e, warId: w.id, pid: prov?.id ?? '' };
    },
    brief: (s, c) => `Envoys of ${n(s, String(c.enemy)).name} have come to the camp. War score ${s.wars.find((w) => w.id === c.warId)?.score.toFixed(0)}.`,
    options: [
      { id: 'tribute', label: 'Peace for annual tribute', summary: 'Haraç every year; they keep their lands.', apply: (ctx, c) => { const w = ctx.s.wars.find((x) => x.id === c.warId); if (w) endWar(ctx, w, c.enemy as NeighbourId, 'tribute'); } },
      { id: 'cession', label: 'Demand a border province', summary: (s, c) => (c.pid ? `${s.provinces[String(c.pid)].name}; they may refuse.` : 'They have nothing adjacent to give.'), available: (s, c) => !!c.pid, apply: (ctx, c) => { const w = ctx.s.wars.find((x) => x.id === c.warId); if (!w) return; const p = peaceAcceptance(ctx.s, w, c.enemy as NeighbourId, 'cession'); if (ctx.rng.chance(p)) endWar(ctx, w, c.enemy as NeighbourId, 'cession', String(c.pid)); else log(ctx, 'diplomacy', 'The envoys refuse to cede land and depart.'); } },
      { id: 'fight', label: 'Send them away: the war goes on', summary: 'Seek total victory.', apply: () => {} },
    ],
    defaultOption: 'fight',
  },
  {
    id: 'enemyDemands',
    title: 'The war goes badly',
    category: 'diplomacy',
    presenter: 'grandVizier',
    cooldown: 4,
    condition: (s) => s.wars.some((w) => w.score <= -30),
    weight: 4,
    prepare: (s) => {
      const w = s.wars.find((x) => x.score <= -30);
      return w ? { enemy: w.enemies[0], warId: w.id } : null;
    },
    brief: (s, c) => `${s.ministers.grandVizier.name} urges peace with ${n(s, String(c.enemy)).name} before worse befalls. They ask for an annual payment.`,
    options: [
      { id: 'pay', label: 'Buy peace: 300,000 akçe a year', summary: 'Humiliating; the corps and the beys will remember.', apply: (ctx, c) => { const w = ctx.s.wars.find((x) => x.id === c.warId); if (w) endWar(ctx, w, c.enemy as NeighbourId, 'payTribute'); } },
      { id: 'white', label: 'Offer status quo', summary: 'They may accept.', apply: (ctx, c) => { const w = ctx.s.wars.find((x) => x.id === c.warId); if (!w) return; if (ctx.rng.chance(peaceAcceptance(ctx.s, w, c.enemy as NeighbourId, 'whitePeace') + 0.2)) endWar(ctx, w, c.enemy as NeighbourId, 'whitePeace'); else log(ctx, 'diplomacy', 'The enemy rejects a peace without gain.'); } },
      { id: 'fight', label: 'Fight on', summary: 'Pride.', apply: (ctx) => shock(ctx.s, 'janissaries', 2) },
    ],
    defaultOption: 'fight',
  },
];

function levy(ctx: import('../state').TurnCtx, count: number) {
  const s = ctx.s;
  spend(s, count * C.devsirmeCostPerBoy);
  s.army.cadets.push({ count, readyTurn: s.turn + C.cadetTrainingTurns });
  addModifier(s, { id: 'devsirme', label: 'recent devşirme levy', months: 18, faction: { millets: -10 } });
  shock(s, 'millets', -6);
  log(ctx, 'military', `Devşirme officers collect ${count.toLocaleString()} boys from the Balkan villages.`);
}


