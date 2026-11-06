import type { Budget, BudgetLine, GameState, GrainReport } from './types';
import { C, DIFFICULTY } from './constants';
import { SPECIAL_INCOME } from './data/provinces';
import { LAW_BY_ID } from './data/laws';
import { harvestShare } from './calendar';
import { atWarWith, clamp, log, ottomanProvinces, shock, type TurnCtx } from './state';

function lawMult(s: GameState, key: 'landTaxMult' | 'customsMult' | 'cizyeMult' | 'taxFarmMult') {
  return s.laws.reduce((m, l) => m * (LAW_BY_ID[l.id]?.[key] ?? 1), 1);
}

function modMult(s: GameState, key: 'revenueMult' | 'customsMult') {
  return s.modifiers.filter((m) => !m.province).reduce((m, x) => m * (x[key] ?? 1), 1);
}

function provMod(s: GameState, pid: string, key: 'revenueMult' | 'customsMult') {
  return s.modifiers.filter((m) => m.province === pid).reduce((m, x) => m * (x[key] ?? 1), 1);
}

/** Customs: revenue rises with the rate but trade volume falls as it climbs above the customary 4%. */
export function customsRateFactor(rate: number) {
  return (rate / 4) * clamp(1 - (rate - 4) * 0.07, 0.3, 1.3);
}

export function campaignMonthlyCost(s: GameState) {
  const c = s.campaign;
  if (!c) return 0;
  return (
    (c.janissaries + c.palaceCavalry) * C.campaignCostPerKapikulu +
    c.timariots * C.campaignCostPerTimariot +
    (c.guns + c.bombards * 5) * C.campaignCostPerGun +
    c.fleet * (C.galleyUpkeepActive - C.galleyUpkeepIdle)
  );
}

/** The TRUE monthly budget. Ministers may report something else (see intel.ts). */
export function computeBudget(s: GameState): Budget {
  const diff = DIFFICULTY[s.difficulty].revenue;
  const global = modMult(s, 'revenueMult') * diff;
  const provs = ottomanProvinces(s);

  let hass = 0,
    cizye = 0,
    customs = 0,
    farms = Number(s.flags.baseTaxFarm ?? 0);
  for (const p of provs) {
    const loyal = 0.6 + 0.4 * (p.loyalty / 100);
    const pm = provMod(s, p.id, 'revenueMult');
    hass += p.landTax * (p.prosperity / 100) * loyal * pm;
    cizye += p.christianHouseholds * (0.5 + 0.5 * (p.prosperity / 100)) * s.taxes.cizyePerHousehold * (0.7 + 0.3 * (p.loyalty / 100)) * pm;
    // an imperial capital is a market: its customs grow with its population (Istanbul ~16k households by 1478)
    const capTrade = p.id === s.capital && p.id === 'constantinople' ? clamp(s.grain.population / 50_000, 0.6, 2.5) : 1;
    customs += p.customs * (p.prosperity / 100) * provMod(s, p.id, 'customsMult') * capTrade;
    const special = SPECIAL_INCOME[p.id];
    if (special) farms += special.amount * (p.prosperity / 100);
  }
  const venetianWar = atWarWith(s, 'venice') ? 0.6 : 1;
  const merchantsF = 0.8 + 0.4 * (s.factions.merchants / 100);
  customs *= customsRateFactor(s.taxes.customsRate) * venetianWar * merchantsF * lawMult(s, 'customsMult') * modMult(s, 'customsMult');
  hass *= lawMult(s, 'landTaxMult');
  cizye *= lawMult(s, 'cizyeMult');
  farms *= lawMult(s, 'taxFarmMult');

  let tribute = 0;
  for (const n of Object.values(s.neighbours)) {
    if (n.relation === 'tributary' || n.relation === 'vassal') tribute += n.tributeToUs;
  }

  const revenue: BudgetLine[] = [
    { key: 'hass', label: 'Crown domains land tax (hass)', amount: (hass / 12) * global },
    { key: 'cizye', label: 'Cizye (poll tax on non-Muslims)', amount: (cizye / 12) * global },
    { key: 'customs', label: 'Customs & tolls (gümrük)', amount: (customs / 12) * global },
    { key: 'taxFarms', label: 'Tax farms: mines, mints, salt (mukataa)', amount: (farms / 12) * global },
    { key: 'tribute', label: 'Tribute from vassals (haraç)', amount: tribute / 12 },
  ];

  const garrisonMen = provs.reduce((a, p) => a + p.garrison, 0);
  const princes = s.dynasty.princes.filter((p) => p.alive && !p.heldBy).length;
  let tributePaid = 0;
  for (const n of Object.values(s.neighbours)) tributePaid += n.tributeFromUs;

  const c = s.campaign;
  const jan = s.army.janissaries + (c?.janissaries ?? 0);
  const cav = s.army.palaceCavalry + (c?.palaceCavalry ?? 0);
  const guns = s.army.artillery.guns + (c?.guns ?? 0);
  const bombards = s.army.artillery.bombards + (c?.bombards ?? 0);
  const galleys = s.army.fleet.galleys + (c?.fleet ?? 0);
  const expenses: BudgetLine[] = [
    { key: 'janissaries', label: 'Janissary pay (ulufe)', amount: jan * C.janissaryDailyPay * 30 + Number(s.flags.perm_janissaries_payRise ?? 0) / 6 * jan * 30 },
    { key: 'palaceCavalry', label: 'Porte cavalry pay (altı bölük)', amount: cav * C.palaceCavalryDailyPay * 30 },
    { key: 'garrisons', label: 'Fortress garrisons', amount: garrisonMen * C.garrisonDailyPay * 30 },
    { key: 'court', label: 'Court, harem & chancery', amount: C.courtBase + princes * C.princeHousehold + s.dynasty.consorts.filter((c) => c.alive).length * 8000 },
    { key: 'fleet', label: 'Fleet upkeep', amount: galleys * C.galleyUpkeepIdle + s.army.fleet.transports * 600 },
    { key: 'artillery', label: 'Artillery & armourers (topçu, cebeci)', amount: guns * C.gunUpkeep + bombards * C.bombardUpkeep },
    { key: 'campaign', label: 'Campaign provisioning', amount: campaignMonthlyCost(s) },
    { key: 'construction', label: 'Construction & waqf works', amount: s.projects.reduce((a, p) => a + p.costPerMonth, 0) },
    { key: 'tributePaid', label: 'Payments to foreign powers', amount: tributePaid / 12 },
    { key: 'cadets', label: 'Acemi oğlan (cadets) upkeep', amount: s.army.cadets.reduce((a, c) => a + c.count, 0) * 1.5 * 30 },
  ];

  // Hidden: what an embezzling Defterdar skims. It is real money leaving the treasury.
  const d = s.ministers.defterdar;
  const gross = revenue.reduce((a, b) => a + b.amount, 0);
  if (d.agenda === 'embezzle') {
    expenses.push({ key: 'shrinkage', label: 'Unaccounted (shrinkage)', amount: gross * ((100 - d.honesty) / 100) * 0.06 });
  }

  for (const l of [...revenue, ...expenses]) l.amount = Math.round(l.amount);
  const totalRevenue = revenue.reduce((a, b) => a + b.amount, 0);
  const totalExpenses = expenses.reduce((a, b) => a + b.amount, 0);
  return { revenue, expenses, totalRevenue, totalExpenses, net: totalRevenue - totalExpenses };
}

const SALARY_KEYS = new Set(['janissaries', 'palaceCavalry', 'garrisons']);

/**
 * Cash flow for the month. Salaries are paid first; anything unpaid becomes arrears
 * (the most dangerous number in the empire). Other bills that cannot be met stall projects.
 */
export function applyEconomy(ctx: TurnCtx): Budget {
  const s = ctx.s;
  const b = computeBudget(s);
  s.treasury += b.totalRevenue;
  const salaries = b.expenses.filter((e) => SALARY_KEYS.has(e.key)).reduce((a, e) => a + e.amount, 0);
  const other = b.totalExpenses - salaries;

  if (s.treasury >= salaries) {
    s.treasury -= salaries;
    if (s.arrears > 0) {
      const pay = Math.min(s.arrears, s.treasury);
      s.treasury -= pay;
      s.arrears -= pay;
      if (pay > 0 && s.arrears === 0) log(ctx, 'economy', 'Arrears to the kapıkulu troops are cleared.');
    }
  } else {
    const unpaid = salaries - s.treasury;
    s.arrears += unpaid;
    s.treasury = 0;
    log(ctx, 'economy', `The treasury cannot meet the payroll: ${Math.round(unpaid).toLocaleString()} akçe added to arrears.`);
  }

  if (s.treasury >= other) {
    s.treasury -= other;
    s.flags.unpaidBills = false;
  } else {
    s.treasury = 0;
    s.flags.unpaidBills = true;
    log(ctx, 'economy', 'Contractors and suppliers go unpaid; building works stall and campaign supply suffers.');
    if (s.campaign) s.campaign.morale = clamp(s.campaign.morale - 8);
  }
  s.treasury = Math.round(s.treasury);
  s.arrears = Math.round(s.arrears);
  return b;
}

export function grainPrice(s: GameState, monthsCover: number) {
  const scarcity = 1 + Math.max(0, 3 - monthsCover) * 0.35;
  const weather = s.weather === 'drought' ? 1.4 : s.weather === 'harshWinter' ? 1.2 : 1;
  return +(C.baseGrainPrice * scarcity * weather).toFixed(2);
}

export function grainConsumption(s: GameState) {
  return Math.round(s.grain.population * C.kilePerPersonMonth);
}

/** Capital grain: harvest-weighted deliveries from Thrace/Bithynia against monthly consumption. */
export function applyGrain(ctx: TurnCtx, bought: number): GrainReport {
  const s = ctx.s;
  const stockStart = s.grain.stock;
  const consumed = grainConsumption(s);
  const hinterland = ['edirne', 'filibe', 'gelibolu', 'bursa', 'selanik']
    .map((id) => s.provinces[id])
    .filter((p) => p && p.owner === 'ottoman');
  const hp = hinterland.length ? hinterland.reduce((a, p) => a + p.prosperity, 0) / hinterland.length : 40;
  let w = 1;
  if (s.weather === 'drought') w = 0.55;
  else if (s.weather === 'harshWinter') w = 0.6;
  else if (s.weather === 'rain') w = 0.95;
  const mod = s.modifiers.reduce((m, x) => m * (x.grainSupplyMult ?? 1), 1);
  const annualNeed = consumed * 12;
  // a coastal capital also draws Black Sea and Thessalian grain by sea, which smooths the year
  const seaShare = s.provinces[s.capital]?.coastal && !atWarWith(s, 'venice') ? 0.3 : 0;
  const landShare = 1 - seaShare;
  const supplied = Math.round(annualNeed * 1.06 * (landShare * harvestShare(s.date.month) + seaShare / 12) * w * Math.min(1.2, hp / 65) * mod);
  let stock = stockStart + supplied + bought - consumed;
  const shortage = stock < 0;
  if (shortage) {
    const deficit = -stock;
    stock = 0;
    const share = deficit / consumed;
    shock(s, 'janissaries', -6 * share - 2);
    shock(s, 'merchants', -4);
    shock(s, 'millets', -5);
    s.grain.population = Math.round(s.grain.population * (1 - 0.01 * share));
    log(ctx, 'disaster', `Bread runs short in ${s.provinces[s.capital].name}: ${Math.round(share * 100)}% of the month's need unmet. Crowds at the bakeries.`);
  }
  s.grain.stock = Math.round(stock);
  const monthsCover = s.grain.stock / Math.max(1, consumed);
  return {
    stockStart,
    supplied,
    consumed,
    bought,
    stockEnd: s.grain.stock,
    pricePerKile: grainPrice(s, monthsCover),
    monthsCover: +monthsCover.toFixed(1),
    shortage,
  };
}
