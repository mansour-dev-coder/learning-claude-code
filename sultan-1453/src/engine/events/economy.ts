// Economy, disaster and religious dilemmas.
import type { EventDef } from './types';
import { addModifier, canAfford, clamp, gain, log, schedule, shock, shocks, spend, monthlySalaries } from '../state';
import { grainConsumption } from '../economy';
import { C } from '../constants';
import { k, monthlyRevenue, pickProvince, owns } from './helpers';
import type { TurnCtx } from '../state';
import { LAW_BY_ID } from '../data/laws';
import { PROJECT_BY_ID } from '../data/projects';


export const ECONOMY_EVENTS: EventDef[] = [
  {
    id: 'debasementRequest',
    title: 'The Defterdar proposes re-minting the akçe',
    category: 'economy',
    presenter: 'defterdar',
    cooldown: 36,
    condition: (s) => s.treasury < monthlySalaries(s) * 4 || s.arrears > 0,
    weight: (s) => (s.arrears > 0 ? 4 : 2),
    brief: (s) => `Treasury ${k(s.treasury)}, arrears ${k(s.arrears)}. Re-minting the coin at lower silver content (now ${s.coinage.silverGrams.toFixed(2)} g) yields an immediate seigniorage profit but salaries, fixed in akçe, lose value.`,
    options: [
      { id: 'debase10', label: 'Re-mint at 10% less silver', summary: 'Large one-off profit; Janissaries and merchants will feel it within months.', apply: (ctx) => debase(ctx, 0.1) },
      { id: 'debase5', label: 'A modest 5% re-minting', summary: 'Half the profit, half the anger.', apply: (ctx) => debase(ctx, 0.05) },
      { id: 'refuse', label: 'Refuse; the coin stays sound', summary: 'No money now; merchants grateful.', apply: (ctx) => { shock(ctx.s, 'merchants', 3); log(ctx, 'decision', 'The Sultan refuses to touch the coinage.'); } },
    ],
    defaultOption: 'refuse',
  },
  {
    id: 'corruptTaxFarmer',
    title: 'A tax farmer bleeds the peasants',
    category: 'economy',
    presenter: 'kazasker',
    cooldown: 10,
    condition: () => true,
    weight: 3,
    prepare: (s, rng) => {
      const p = pickProvince(s, rng);
      return p ? { pid: p.id, name: p.name, haul: Math.round(rng.range(150_000, 600_000) / 10_000) * 10_000 } : null;
    },
    brief: (s, c) => `The kadı of ${c.name} reports the mültezim of the salt pans and market dues is collecting double the registered rates. His hoard is estimated at ${k(Number(c.haul))}.`,
    options: [
      { id: 'execute', label: 'Execute him and confiscate his wealth', summary: 'Treasury gains the hoard; peasants cheer; other farmers bid lower at the next auction.', apply: (ctx, c) => { gain(ctx.s, Number(c.haul)); ctx.s.provinces[String(c.pid)].loyalty = clamp(ctx.s.provinces[String(c.pid)].loyalty + 8); shock(ctx.s, 'merchants', -4); shock(ctx.s, 'millets', 4); log(ctx, 'decision', `The tax farmer of ${c.name} is executed; ${k(Number(c.haul))} confiscated.`); } },
      { id: 'fine', label: 'Fine him and renew his contract', summary: 'A third of the hoard, and the extortion continues more quietly.', apply: (ctx, c) => { gain(ctx.s, Math.round(Number(c.haul) / 3)); ctx.s.provinces[String(c.pid)].loyalty = clamp(ctx.s.provinces[String(c.pid)].loyalty - 3); log(ctx, 'decision', `The tax farmer of ${c.name} is fined.`); } },
      { id: 'ignore', label: 'Leave it to the kadı', summary: 'No cost; the province grows sullen.', apply: (ctx, c) => { ctx.s.provinces[String(c.pid)].loyalty = clamp(ctx.s.provinces[String(c.pid)].loyalty - 8); shock(ctx.s, 'millets', -3); } },
    ],
    defaultOption: 'ignore',
  },
  {
    id: 'embezzlementRumour',
    title: 'Whispers about the Defterdar',
    category: 'court',
    presenter: 'chiefEunuch',
    cooldown: 18,
    condition: (s) => s.ministers.defterdar.agenda === 'embezzle',
    weight: 2,
    brief: (s) => `The palace eunuchs report that ${s.ministers.defterdar.name}'s new konak and his gifts to the harem do not match his salary.`,
    options: [
      { id: 'audit', label: 'Order a secret audit of the registers', summary: `Costs ${k(60_000)}. If the books are cooked, the Defterdar can be removed and his wealth seized.`, available: (s) => canAfford(s, 60_000), apply: (ctx) => audit(ctx) },
      { id: 'warn', label: 'Let him know the Sultan is watching', summary: 'He will steal less, for a while.', apply: (ctx) => { ctx.s.ministers.defterdar.honesty = clamp(ctx.s.ministers.defterdar.honesty + 20); log(ctx, 'court', 'The Defterdar receives a pointed gift: an empty purse.'); } },
      { id: 'ignore', label: 'Palace gossip; ignore it', summary: 'Nothing changes.', apply: () => {} },
    ],
    defaultOption: 'ignore',
  },
  {
    id: 'merchantLoan',
    title: 'Galata bankers offer a loan',
    category: 'economy',
    presenter: 'defterdar',
    cooldown: 24,
    condition: (s) => s.treasury < monthlySalaries(s) * 3,
    weight: 2,
    brief: () => 'A consortium of Jewish and Genoese financiers offers 3,000,000 akçe now against 3,600,000 repaid over twelve months from the customs farms.',
    options: [
      { id: 'accept', label: 'Accept the loan', summary: 'Cash now; 300,000 akçe a month leaves the treasury for a year.', apply: (ctx) => { gain(ctx.s, 3_000_000); for (let i = 1; i <= 12; i++) schedule(ctx.s, i, 'effect', 'loanInstalment', 'loan instalment', { amount: 300_000 }); log(ctx, 'economy', 'A 3,000,000 akçe loan is taken against the customs.'); } },
      { id: 'refuse', label: 'Refuse', summary: 'No debt.', apply: () => {} },
    ],
    defaultOption: 'refuse',
  },
  {
    id: 'customsPetition',
    title: 'Merchants petition over customs',
    category: 'economy',
    presenter: 'nisanci',
    cooldown: 18,
    condition: () => true,
    weight: 1.5,
    brief: (s) => `Bursa silk merchants and Ragusan traders complain of the ${s.taxes.customsRate}% customs. The Defterdar would rather raise it.`,
    options: [
      { id: 'lower', label: 'Lower customs by one point', summary: 'Merchants delighted; less revenue per bale, more bales.', available: (s) => s.taxes.customsRate > 2, apply: (ctx) => { ctx.s.taxes.customsRate -= 1; shock(ctx.s, 'merchants', 6); } },
      { id: 'keep', label: 'Keep the rate', summary: 'No change.', apply: () => {} },
      { id: 'raise', label: 'Raise customs by one point', summary: 'More revenue now; merchants resentful, trade thins.', available: (s) => s.taxes.customsRate < 10, apply: (ctx) => { ctx.s.taxes.customsRate += 1; shock(ctx.s, 'merchants', -6); } },
    ],
    defaultOption: 'keep',
  },
  {
    id: 'fireInCapital',
    title: 'Fire in the bazaar',
    category: 'disaster',
    presenter: 'grandVizier',
    cooldown: 24,
    condition: () => true,
    weight: 1.2,
    brief: (s) => `Fire has destroyed shops and houses in the market quarter of ${s.provinces[s.capital].name}.`,
    options: [
      { id: 'relief', label: `Relief and rebuilding (${k(500_000)})`, summary: 'Loyalty in the capital and the merchants’ gratitude.', available: (s) => canAfford(s, 500_000), apply: (ctx) => { spend(ctx.s, 500_000); shocks(ctx.s, { merchants: 6, millets: 3 }); ctx.s.provinces[ctx.s.capital].loyalty = clamp(ctx.s.provinces[ctx.s.capital].loyalty + 6); } },
      { id: 'bedesten', label: 'Rebuild in stone: endow a bedesten', summary: 'Starts a covered market (1.5M over 10 months); long-term customs gain.', apply: (ctx) => { startProjectFromEvent(ctx, 'bedesten', ctx.s.capital); } },
      { id: 'nothing', label: 'Let the guilds rebuild', summary: 'Costs nothing; resentment.', apply: (ctx) => { shocks(ctx.s, { merchants: -6, millets: -3 }); ctx.s.provinces[ctx.s.capital].prosperity = clamp(ctx.s.provinces[ctx.s.capital].prosperity - 4); } },
    ],
    defaultOption: 'nothing',
  },
  {
    id: 'earthquake',
    title: 'Earthquake',
    category: 'disaster',
    presenter: 'grandVizier',
    cooldown: 36,
    condition: () => true,
    weight: 0.8,
    prepare: (s, rng) => {
      const p = pickProvince(s, rng);
      return p ? { pid: p.id, name: p.name } : null;
    },
    brief: (s, c) => `An earthquake has shaken ${c.name}: walls cracked, houses fallen, a mosque dome collapsed.`,
    options: [
      { id: 'relief', label: `Send relief and masons (${k(400_000)})`, summary: 'Restores the walls and loyalty.', available: (s) => canAfford(s, 400_000), apply: (ctx, c) => { spend(ctx.s, 400_000); const p = ctx.s.provinces[String(c.pid)]; p.prosperity = clamp(p.prosperity - 4); p.loyalty = clamp(p.loyalty + 6); shock(ctx.s, 'ulema', 2); } },
      { id: 'nothing', label: 'Remit taxes for a year instead', summary: 'Costs the province’s revenue for 12 months.', apply: (ctx, c) => { addModifier(ctx.s, { id: `remit-${c.pid}`, label: 'tax remission', months: 12, province: String(c.pid), revenueMult: 0.2 }); const p = ctx.s.provinces[String(c.pid)]; p.prosperity = clamp(p.prosperity - 8); p.walls = clamp(p.walls - 10); p.loyalty = clamp(p.loyalty + 4); } },
      { id: 'ignore', label: 'God’s will; nothing to be done', summary: 'Walls and prosperity suffer.', apply: (ctx, c) => { const p = ctx.s.provinces[String(c.pid)]; p.prosperity = clamp(p.prosperity - 12); p.walls = clamp(p.walls - 15); p.loyalty = clamp(p.loyalty - 6); } },
    ],
    defaultOption: 'ignore',
  },
  {
    id: 'plague',
    title: 'Plague',
    category: 'disaster',
    presenter: 'grandVizier',
    cooldown: 30,
    condition: (s) => !s.modifiers.some((m) => m.plague),
    weight: (s) => (s.date.month >= 5 && s.date.month <= 9 ? 1.6 : 0.6),
    prepare: (s, rng) => {
      const p = rng.chance(0.35) ? s.provinces[s.capital] : pickProvince(s, rng);
      return p ? { pid: p.id, name: p.name, capital: p.id === s.capital } : null;
    },
    brief: (s, c) => `Plague (taun) has broken out in ${c.name}.${c.capital ? ' The capital itself is struck.' : ''}`,
    options: [
      { id: 'flee', label: 'The court withdraws to the summer pastures', summary: 'Protects the Sultan’s life; the city feels abandoned.', apply: (ctx, c) => { plagueStart(ctx, String(c.pid)); if (c.capital) { ctx.s.flags.courtFled = true; schedule(ctx.s, 4, 'effect', 'courtReturns', 'court returns'); shock(ctx.s, 'merchants', -4); } } },
      { id: 'quarantine', label: 'Close the roads and the port', summary: 'Shorter outbreak, but trade stops.', apply: (ctx, c) => { plagueStart(ctx, String(c.pid), 3); addModifier(ctx.s, { id: 'quarantine', label: 'quarantine', months: 3, customsMult: 0.7 }); shock(ctx.s, 'merchants', -6); } },
      { id: 'pray', label: 'Public prayers and alms', summary: 'Ulema approve; the plague runs its course.', apply: (ctx, c) => { plagueStart(ctx, String(c.pid)); shock(ctx.s, 'ulema', 4); spend(ctx.s, Math.min(ctx.s.treasury, 100_000)); } },
    ],
    defaultOption: 'pray',
  },
  {
    id: 'grainShortage',
    title: 'The granaries of the capital run low',
    category: 'economy',
    presenter: 'defterdar',
    cooldown: 4,
    condition: (s) => s.grain.stock < grainConsumption(s) * 2,
    weight: 5,
    brief: (s) => `Stocks stand at ${Math.round(s.grain.stock).toLocaleString()} kile, about ${(s.grain.stock / grainConsumption(s)).toFixed(1)} months of bread for ${s.grain.population.toLocaleString()} people.`,
    options: [
      { id: 'buy', label: 'Buy Black Sea and Thessalian grain at market', summary: (s) => `Two months’ stock at ~${C.baseGrainPrice * 2} akçe/kile: about ${k(grainConsumption(s) * 2 * C.baseGrainPrice * 2)}.`, available: (s) => canAfford(s, grainConsumption(s) * 2 * C.baseGrainPrice * 2), apply: (ctx) => { const q = grainConsumption(ctx.s) * 2; spend(ctx.s, q * C.baseGrainPrice * 2); ctx.s.grain.stock += q; log(ctx, 'economy', `${q.toLocaleString()} kile of grain bought at double price.`); } },
      { id: 'requisition', label: 'Requisition from Thrace at the fixed price (narh)', summary: 'Cheap grain; the Rumelian beys and peasants pay for it.', apply: (ctx) => { const q = grainConsumption(ctx.s) * 2; spend(ctx.s, Math.min(ctx.s.treasury, q * C.baseGrainPrice * 0.6)); ctx.s.grain.stock += q; shocks(ctx.s, { rumelianBeys: -7, millets: -5 }); ctx.s.provinces.edirne.prosperity = clamp(ctx.s.provinces.edirne.prosperity - 4); } },
      { id: 'ceiling', label: 'Impose a bread price ceiling and hang hoarders', summary: 'No cost; bakers cheat, supply falls further.', apply: (ctx) => { shock(ctx.s, 'merchants', -8); shock(ctx.s, 'janissaries', 3); addModifier(ctx.s, { id: 'narh', label: 'bread price ceiling', months: 3, grainSupplyMult: 0.9 }); } },
    ],
    defaultOption: 'ceiling',
  },
  {
    id: 'bumperHarvest',
    title: 'A bumper harvest',
    category: 'economy',
    presenter: 'defterdar',
    cooldown: 12,
    condition: (s) => s.date.month >= 7 && s.date.month <= 9 && s.weather === 'fair',
    weight: 1.5,
    brief: () => 'Thrace and Bithynia report the best harvest in years. Venetian factors offer to buy the surplus.',
    options: [
      { id: 'store', label: 'Fill the state granaries', summary: 'Buy four months of grain cheap.', available: (s) => canAfford(s, grainConsumption(s) * 4 * C.baseGrainPrice * 0.7), apply: (ctx) => { const q = grainConsumption(ctx.s) * 4; spend(ctx.s, q * C.baseGrainPrice * 0.7); ctx.s.grain.stock += q; } },
      { id: 'export', label: 'License exports to Venice', summary: 'Customs income now; the merchants are pleased.', apply: (ctx) => { gain(ctx.s, 400_000); shock(ctx.s, 'merchants', 5); } },
    ],
    defaultOption: 'export',
  },
  {
    id: 'drought',
    title: 'Drought and locusts',
    category: 'disaster',
    presenter: 'beylerbeyAnatolia',
    cooldown: 24,
    condition: (s) => s.weather === 'drought',
    weight: 3,
    prepare: (s, rng) => {
      const p = pickProvince(s, rng, (x) => x.region === 'anatolia');
      return p ? { pid: p.id, name: p.name } : null;
    },
    brief: (s, c) => `Locusts and drought in ${c.name}: the sipahis say their peasants cannot pay the tithe.`,
    options: [
      { id: 'remit', label: 'Remit the crown dues for a year', summary: 'Lose the province’s hass revenue; peasants stay on the land.', apply: (ctx, c) => { addModifier(ctx.s, { id: `remit-${c.pid}`, label: 'tax remission', months: 12, province: String(c.pid), revenueMult: 0.4 }); shock(ctx.s, 'anatolianBeys', 4); } },
      { id: 'collect', label: 'Collect in full', summary: 'Peasants flee to the hills; banditry follows.', apply: (ctx, c) => { const p = ctx.s.provinces[String(c.pid)]; p.prosperity = clamp(p.prosperity - 10); p.loyalty = clamp(p.loyalty - 10); schedule(ctx.s, 3, 'event', 'banditry', 'peasants turned bandit', { pid: String(c.pid) }); } },
    ],
    defaultOption: 'collect',
  },
  {
    id: 'banditry',
    title: 'Bandits on the roads',
    category: 'military',
    presenter: 'beylerbeyAnatolia',
    cooldown: 12,
    condition: () => true,
    weight: 1,
    prepare: (s, rng) => {
      const p = pickProvince(s, rng, (x) => x.region === 'anatolia') ?? pickProvince(s, rng);
      return p ? { pid: p.id, name: p.name } : null;
    },
    brief: (s, c) => `Landless men and deserters (levends) have taken to the hills around ${c.name}, robbing caravans.`,
    options: [
      { id: 'suppress', label: 'Send the sipahis to hunt them down', summary: 'Restores order; beys grumble at the off-season service.', apply: (ctx, c) => { const p = ctx.s.provinces[String(c.pid)]; p.loyalty = clamp(p.loyalty + 5); shock(ctx.s, 'anatolianBeys', -3); shock(ctx.s, 'merchants', 4); } },
      { id: 'amnesty', label: 'Amnesty and enrol them as azaps', summary: 'Garrison +400; the roads stay a little unsafe.', apply: (ctx, c) => { ctx.s.provinces[String(c.pid)].garrison += 400; shock(ctx.s, 'merchants', -2); } },
      { id: 'ignore', label: 'Leave it to the sancak bey', summary: 'Trade suffers.', apply: (ctx, c) => { const p = ctx.s.provinces[String(c.pid)]; p.prosperity = clamp(p.prosperity - 5); shock(ctx.s, 'merchants', -5); } },
    ],
    defaultOption: 'ignore',
  },
  {
    id: 'novoBrdoMines',
    title: 'The silver of Novo Brdo',
    category: 'economy',
    presenter: 'defterdar',
    cooldown: 36,
    condition: (s) => owns(s, 'novobrdo'),
    weight: 1.5,
    brief: () => 'Ragusan and Saxon miners at Novo Brdo ask to keep their old mining law and privileges. The Defterdar wants to farm the mines out at auction.',
    options: [
      { id: 'privileges', label: 'Confirm the Saxon mining law', summary: 'Miners stay; steady output.', apply: (ctx) => { ctx.s.provinces.novobrdo.prosperity = clamp(ctx.s.provinces.novobrdo.prosperity + 10); shock(ctx.s, 'millets', 3); } },
      { id: 'auction', label: 'Auction the mines to a tax farmer', summary: 'An advance of 1,000,000 akçe; miners drift away.', apply: (ctx) => { gain(ctx.s, 1_000_000); ctx.s.provinces.novobrdo.prosperity = clamp(ctx.s.provinces.novobrdo.prosperity - 12); } },
    ],
    defaultOption: 'privileges',
  },
  {
    id: 'dervishHeterodoxy',
    title: 'A wandering şeyh preaches against the Sultan',
    category: 'religion',
    presenter: 'seyhulislam',
    cooldown: 30,
    condition: () => true,
    weight: 1,
    prepare: (s, rng) => {
      const p = pickProvince(s, rng);
      return p ? { pid: p.id, name: p.name } : null;
    },
    brief: (s, c) => `In ${c.name} a dervish şeyh, in the manner of Şeyh Bedreddin, preaches common ownership and draws Muslim and Christian peasants alike.`,
    options: [
      { id: 'suppress', label: 'Arrest and hang him by fatwa', summary: 'Ulema satisfied; his followers scatter or rebel.', apply: (ctx, c) => { shock(ctx.s, 'ulema', 6); const p = ctx.s.provinces[String(c.pid)]; p.loyalty = clamp(p.loyalty - 6); if (ctx.rng.chance(0.3)) schedule(ctx.s, 2, 'event', 'provincialRevolt', 'dervish followers rise', { pid: String(c.pid) }); } },
      { id: 'patronise', label: 'Endow his lodge (zaviye) and bring him into the fold', summary: 'The frontier dervishes have always served the dynasty.', apply: (ctx, c) => { spend(ctx.s, Math.min(ctx.s.treasury, 80_000)); shock(ctx.s, 'ulema', -5); shock(ctx.s, 'millets', 3); ctx.s.provinces[String(c.pid)].loyalty = clamp(ctx.s.provinces[String(c.pid)].loyalty + 5); } },
      { id: 'ignore', label: 'Ignore him', summary: 'Movements like this can grow.', apply: (ctx, c) => { if (ctx.rng.chance(0.4)) schedule(ctx.s, 4, 'event', 'provincialRevolt', 'dervish movement', { pid: String(c.pid) }); } },
    ],
    defaultOption: 'ignore',
  },
  {
    id: 'waqfDispute',
    title: 'The ulema ask to confirm old endowments',
    category: 'religion',
    presenter: 'kazasker',
    cooldown: 36,
    condition: (s) => !s.laws.some((l) => l.id === 'waqfReversion'),
    weight: 1,
    brief: () => 'Hundreds of villages are held as waqf or freehold under old berats. The ulema want them confirmed; the Defterdar wants them registered as crown land.',
    options: [
      { id: 'confirm', label: 'Confirm the endowments', summary: 'Ulema grateful; revenue foregone.', apply: (ctx) => { shock(ctx.s, 'ulema', 8); ctx.s.flags.perm_ulema_waqfsConfirmed = 3; } },
      { id: 'revert', label: 'Revert them to the state', summary: 'Enacts the land reform: +12% crown land tax; ulema and old families furious.', apply: (ctx) => { enactFromEvent(ctx, 'waqfReversion'); } },
    ],
    defaultOption: 'confirm',
  },
  {
    id: 'scholarArrives',
    title: 'A famous scholar seeks patronage',
    category: 'religion',
    presenter: 'seyhulislam',
    cooldown: 36,
    condition: () => true,
    weight: 0.8,
    prepare: (s, rng) => ({ who: rng.pick(['Ali Qushji, astronomer of Samarkand', 'Georgios Amiroutzes, Greek philosopher', 'Molla Zeyrek, disputant', 'a Persian master of the inşa chancery style']) }),
    brief: (s, c) => `${c.who} has arrived at the Porte seeking a stipend and a medrese chair.`,
    options: [
      { id: 'patronise', label: `Grant him a chair and 100 akçe a day`, summary: 'Prestige; the ulema and chancery benefit.', available: (s) => canAfford(s, 100_000), apply: (ctx) => { spend(ctx.s, 100_000); shock(ctx.s, 'ulema', 4); ctx.s.ministers.nisanci.competence = clamp(ctx.s.ministers.nisanci.competence + 1, 0, 10); } },
      { id: 'decline', label: 'Decline politely', summary: 'He goes to the Mamluk court.', apply: (ctx) => { shock(ctx.s, 'ulema', -1); } },
    ],
    defaultOption: 'decline',
  },
  {
    id: 'provincialRevolt',
    title: 'Revolt in the provinces',
    category: 'military',
    presenter: 'beylerbeyRumelia',
    cooldown: 12,
    condition: (s) => Object.values(s.provinces).some((p) => p.owner === 'ottoman' && p.loyalty < 25),
    weight: 3,
    prepare: (s, rng) => {
      const p = pickProvince(s, rng, (x) => x.loyalty < 25) ?? pickProvince(s, rng);
      return p ? { pid: p.id, name: p.name } : null;
    },
    brief: (s, c) => `${c.name} is in open revolt: tax collectors driven out, the sancak bey besieged in the citadel.`,
    options: [
      { id: 'crush', label: 'Crush it with the provincial sipahis', summary: 'Quick, bloody; prosperity suffers, loyalty forced back up.', apply: (ctx, c) => { const p = ctx.s.provinces[String(c.pid)]; p.prosperity = clamp(p.prosperity - 10); p.loyalty = clamp(p.loyalty + 20); shock(ctx.s, 'millets', -4); } },
      { id: 'concede', label: 'Pardon and remit taxes', summary: 'Peace bought with a year of revenue.', apply: (ctx, c) => { const p = ctx.s.provinces[String(c.pid)]; p.loyalty = clamp(p.loyalty + 25); addModifier(ctx.s, { id: `remit-${c.pid}`, label: 'tax remission', months: 12, province: p.id, revenueMult: 0.3 }); } },
      { id: 'ignore', label: 'Let it burn out', summary: 'Revenue lost; it may spread.', apply: (ctx, c) => { const p = ctx.s.provinces[String(c.pid)]; addModifier(ctx.s, { id: `revolt-${c.pid}`, label: 'province in revolt', months: 6, province: p.id, revenueMult: 0 }); p.prosperity = clamp(p.prosperity - 6); } },
    ],
    defaultOption: 'ignore',
  },
];

// ── shared effect helpers ──────────────────────────────────────────────────


export function debase(ctx: TurnCtx, share: number) {
  const s = ctx.s;
  const profit = Math.round(monthlyRevenue(s) * 12 * share * 0.6);
  s.coinage.silverGrams = +(s.coinage.silverGrams * (1 - share)).toFixed(3);
  s.coinage.debasements += 1;
  s.coinage.lastDebasementTurn = s.turn;
  gain(s, profit);
  shocks(s, { janissaries: -15 * (share / 0.1), merchants: -12 * (share / 0.1) });
  log(ctx, 'economy', `The akçe is re-minted at ${s.coinage.silverGrams.toFixed(2)} g silver: seigniorage profit ${k(profit)}.`);
  if (ctx.rng.chance(0.4 + share * 3)) schedule(s, ctx.rng.int(2, 4), 'event', 'janissaryPayDemand', 'debased pay', {});
}

export function audit(ctx: TurnCtx) {
  const s = ctx.s;
  spend(s, 60_000);
  s.flags.auditedTurn = s.turn;
  const d = s.ministers.defterdar;
  if (d.agenda === 'embezzle' && ctx.rng.chance(0.75)) {
    const recovered = Math.round(monthlyRevenue(s) * 0.4);
    gain(s, recovered);
    log(ctx, 'court', `The audit proves ${d.name} has been skimming the mukataa revenue. ${k(recovered)} recovered from his household.`);
    schedule(s, 1, 'event', 'embezzlerCaught', 'audit result');
  } else {
    log(ctx, 'court', 'The audit finds the registers in order.');
    d.loyalty = clamp(d.loyalty - 10);
  }
}

export function plagueStart(ctx: TurnCtx, pid: string, months = 6) {
  addModifier(ctx.s, { id: `plague-${pid}`, label: 'plague', months, province: pid, plague: true, revenueMult: 0.75 });
  const p = ctx.s.provinces[pid];
  p.prosperity = clamp(p.prosperity - 8);
  if (pid === ctx.s.capital) ctx.s.grain.population = Math.round(ctx.s.grain.population * 0.92);
  log(ctx, 'disaster', `Plague in ${p.name}.`);
}

export function enactFromEvent(ctx: TurnCtx, lawId: string) {
  const s = ctx.s;
  const law = LAW_BY_ID[lawId];
  if (!law || s.laws.some((l) => l.id === lawId)) return;
  s.laws.push({ id: lawId, name: law.name, enactedTurn: s.turn });
  if (law.shock) shocks(s, law.shock);
  log(ctx, 'law', `Enacted: ${law.name}.`);
}

export function startProjectFromEvent(ctx: TurnCtx, projectId: string, province: string) {
  const s = ctx.s;
  const def = PROJECT_BY_ID[projectId];
  s.projects.push({ id: def.id, instanceId: `${def.id}-${s.turn}`, name: def.name, province, costPerMonth: Math.round(def.totalCost / def.months), monthsLeft: def.months, started: s.turn });
  log(ctx, 'construction', `Work begins: ${def.name} at ${s.provinces[province].name}.`);
}
