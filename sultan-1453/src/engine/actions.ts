// The complete set of orders a Sultan can give. This union is the target schema for the LLM's
// command-parsing tool (Phase 2): the model may only *propose* Actions; the engine validates and applies them.
import type { MinisterRole, NeighbourId } from './types';
import { C } from './constants';
import { LAW_BY_ID } from './data/laws';
import { PROJECT_BY_ID } from './data/projects';
import { atWarWith, canAfford, clamp, gain, log, ottomanProvinces, princeAge, shock, shocks, spend, stance, warWith, type TurnCtx } from './state';
import { declareWar, disbandCampaign, endWar, peaceAcceptance, peaceGate, startCampaign, validateCampaign, type PeaceTerms } from './war';
import { applyDilemmaChoice } from './events/select';
import { debase, audit } from './events/economy';
import { replaceMinister } from './events/court';
import { grainConsumption, grainPrice } from './economy';

export type Action =
  | { type: 'resolveDilemma'; dilemmaId: string; optionId: string }
  | { type: 'setTax'; tax: 'cizye' | 'customs'; value: number }
  | { type: 'debaseCoinage'; percent: 5 | 10 }
  | { type: 'payArrears' }
  | { type: 'grantDonative'; akcePerMan: number }
  | { type: 'buyGrain'; kile: number }
  | { type: 'declareWar'; target: NeighbourId; casusBelli: string }
  | { type: 'startCampaign'; target: string; janissaries?: number; palaceCavalry?: number; regions?: ('rumelia' | 'anatolia')[]; artillery?: boolean; fleet?: boolean; ledBySultan?: boolean; assaultThreshold?: number }
  | { type: 'orderAssault' }
  | { type: 'liftSiege' }
  | { type: 'winterInField'; value: boolean }
  | { type: 'offerPeace'; target: NeighbourId; terms: PeaceTerms; province?: string }
  | { type: 'castCannon'; guns?: number; bombards?: number }
  | { type: 'buildGalleys'; count: number }
  | { type: 'devsirme'; boys: number }
  | { type: 'reinforceGarrison'; province: string; men: number }
  | { type: 'enactLaw'; lawId: string }
  | { type: 'repealLaw'; lawId: string }
  | { type: 'startProject'; projectId: string; province: string }
  | { type: 'appointPrince'; princeId: string; province: string | null }
  | { type: 'executePrince'; princeId: string }
  | { type: 'dismissMinister'; role: MinisterRole; execute?: boolean }
  | { type: 'audit' }
  | { type: 'sendEmbassy'; target: NeighbourId; gift: number }
  | { type: 'grantTimars'; province: string }
  | { type: 'endTurn' };

export interface ActionResult {
  ok: boolean;
  reason?: string;
  summary?: string;
}

const fail = (reason: string): ActionResult => ({ ok: false, reason });
const ok = (summary: string): ActionResult => ({ ok: true, summary });

export function describeAction(a: Action) {
  return JSON.stringify(a);
}

export function applyAction(ctx: TurnCtx, a: Action): ActionResult {
  const s = ctx.s;
  switch (a.type) {
    case 'endTurn':
      return ok('end of orders');
    case 'resolveDilemma': {
      const d = s.pendingDilemmas.find((x) => x.id === a.dilemmaId || x.eventId === a.dilemmaId);
      if (!d) return fail(`no pending dilemma "${a.dilemmaId}"`);
      const r = applyDilemmaChoice(ctx, d, a.optionId, false);
      if (!r.ok) return fail(r.reason!);
      s.pendingDilemmas = s.pendingDilemmas.filter((x) => x.id !== d.id);
      return ok(`${d.title} → ${r.label}`);
    }
    case 'setTax': {
      if (a.tax === 'cizye') {
        if (a.value < 10 || a.value > 120) return fail('cizye must be between 10 and 120 akçe per household per year');
        const delta = a.value - s.taxes.cizyePerHousehold;
        s.taxes.cizyePerHousehold = Math.round(a.value);
        if (delta > 0) shock(s, 'millets', -delta * 0.5);
        return ok(`cizye set to ${a.value} akçe per household`);
      }
      if (a.value < 1 || a.value > 12) return fail('customs must be between 1% and 12%');
      const delta = a.value - s.taxes.customsRate;
      s.taxes.customsRate = a.value;
      if (delta > 0) shock(s, 'merchants', -delta * 3);
      return ok(`customs set to ${a.value}%`);
    }
    case 'debaseCoinage': {
      if (s.laws.some((l) => l.id === 'soundCoin')) return fail('the Pledge of sound coinage forbids re-minting');
      if (a.percent !== 5 && a.percent !== 10) return fail('re-minting is by 5% or 10%');
      debase(ctx, a.percent / 100);
      return ok(`coin debased ${a.percent}%`);
    }
    case 'payArrears': {
      if (s.arrears <= 0) return fail('there are no arrears');
      const pay = Math.min(s.arrears, s.treasury);
      if (pay <= 0) return fail('the treasury is empty');
      spend(s, pay);
      s.arrears -= pay;
      shock(s, 'janissaries', (pay / Math.max(1, pay + s.arrears)) * 8);
      return ok(`paid ${pay.toLocaleString()} akçe of arrears`);
    }
    case 'grantDonative': {
      const men = s.army.janissaries + s.army.palaceCavalry + (s.campaign ? s.campaign.janissaries + s.campaign.palaceCavalry : 0);
      const cost = Math.round(men * a.akcePerMan);
      if (a.akcePerMan <= 0 || a.akcePerMan > 2000) return fail('donative must be 1–2000 akçe per man');
      if (!canAfford(s, cost)) return fail(`a donative of ${cost.toLocaleString()} akçe exceeds the treasury`);
      spend(s, cost);
      shock(s, 'janissaries', Math.min(25, a.akcePerMan / 25));
      if (s.flags.accessionPending !== undefined) delete s.flags.accessionPending;
      return ok(`donative of ${a.akcePerMan} akçe a man (${cost.toLocaleString()})`);
    }
    case 'buyGrain': {
      if (a.kile <= 0) return fail('quantity must be positive');
      const price = grainPrice(s, s.grain.stock / Math.max(1, grainConsumption(s))) * 1.2;
      const cost = Math.round(a.kile * price);
      if (!canAfford(s, cost)) return fail(`${a.kile.toLocaleString()} kile at ${price.toFixed(1)} akçe costs ${cost.toLocaleString()} — more than the treasury holds`);
      spend(s, cost);
      s.grain.stock += Math.round(a.kile);
      s.flags.grainBoughtThisTurn = Number(s.flags.grainBoughtThisTurn ?? 0) + a.kile;
      return ok(`bought ${a.kile.toLocaleString()} kile at ${price.toFixed(1)} akçe`);
    }
    case 'declareWar': {
      const n = s.neighbours[a.target];
      if (!n) return fail(`unknown power "${a.target}"`);
      if (atWarWith(s, a.target)) return fail(`already at war with ${n.name}`);
      if (s.flags[`extinct_${a.target}`] !== undefined) return fail(`${n.name} no longer exists`);
      const hasCb = !!s.flags[`casusBelli_${a.target}`] || n.relation === 'none' || n.stance < -60;
      if (!hasCb) {
        shock(s, 'ulema', -6);
        log(ctx, 'war', 'The Mufti hesitates to issue a fatwa for a war without just cause.');
      }
      if (n.relation === 'tributary' || n.relation === 'vassal') shock(s, 'merchants', -3);
      declareWar(ctx, a.target, a.casusBelli || 'the Sultan’s will', true);
      return ok(`war on ${n.name}`);
    }
    case 'startCampaign': {
      const err = validateCampaign(s, a);
      if (err) return fail(err);
      startCampaign(ctx, a);
      return ok(`campaign against ${s.provinces[a.target].name}`);
    }
    case 'orderAssault': {
      if (s.campaign?.phase !== 'besieging') return fail('no siege in progress');
      s.flags.orderAssault = true;
      return ok('general assault ordered');
    }
    case 'liftSiege': {
      if (!s.campaign) return fail('no army in the field');
      const name = s.provinces[s.campaign.target].name;
      s.sieges = s.sieges.filter((x) => !(x.attacker === 'ottoman' && x.province === s.campaign!.target));
      s.campaign.phase = 'returning';
      s.campaign.monthsLeftInPhase = Math.max(1, Math.ceil(s.provinces[s.campaign.target].travelMonths));
      shock(s, 'janissaries', -4);
      return ok(`army withdraws from ${name}`);
    }
    case 'winterInField': {
      if (!s.campaign) return fail('no army in the field');
      s.campaign.winterQuarters = a.value;
      return ok(a.value ? 'the army will winter in the field' : 'the army will return in Kasım');
    }
    case 'offerPeace': {
      const war = warWith(s, a.target);
      if (!war) return fail(`not at war with ${a.target}`);
      if ((a.terms === 'cession' || a.terms === 'cessionResettle') && (!a.province || s.provinces[a.province]?.owner !== a.target)) return fail('cession requires a province they own');
      if (a.terms === 'cession' || a.terms === 'cessionResettle' || a.terms === 'vassalage') {
        const gate = peaceGate(s, war, a.target);
        if (!gate.open) {
          log(ctx, 'diplomacy', `${s.neighbours[a.target].name} rejects our terms out of hand.`);
          return ok(`peace rejected: ${gate.reason}`);
        }
      }
      const p = peaceAcceptance(s, war, a.target, a.terms);
      if (ctx.rng.chance(p)) {
        endWar(ctx, war, a.target, a.terms, a.province);
        if (s.campaign && s.provinces[s.campaign.target]?.owner === a.target) disbandCampaign(ctx, 'peace is made.');
        return ok(`peace accepted (${a.terms})`);
      }
      stance(s, a.target, -5);
      log(ctx, 'diplomacy', `${s.neighbours[a.target].name} rejects our terms (${a.terms}).`);
      return ok(`peace rejected (acceptance chance was ${(p * 100).toFixed(0)}%)`);
    }
    case 'castCannon': {
      const guns = Math.max(0, Math.round(a.guns ?? 0));
      const bombards = Math.max(0, Math.round(a.bombards ?? 0));
      const f = s.flags.foundry ? 0.75 : 1;
      const cost = Math.round((guns * C.gunCastCost + bombards * C.bombardCastCost) * f);
      if (guns + bombards === 0) return fail('nothing to cast');
      if (bombards > 0 && s.army.artillery.quality < 0.8 && !s.flags.foundry) return fail('no founder at the Porte can yet cast great bombards (build a tophane or hire a master founder)');
      if (!canAfford(s, cost)) return fail(`casting costs ${cost.toLocaleString()} akçe`);
      spend(s, cost);
      s.army.artillery.guns += guns;
      s.army.artillery.bombards += bombards;
      return ok(`cast ${guns} guns and ${bombards} bombards for ${cost.toLocaleString()}`);
    }
    case 'buildGalleys': {
      const f = s.flags.arsenal ? 0.67 : 1;
      const cost = Math.round(a.count * C.galleyBuildCost * f);
      if (a.count <= 0 || a.count > 100) return fail('1–100 galleys');
      if (!canAfford(s, cost)) return fail(`building costs ${cost.toLocaleString()} akçe`);
      spend(s, cost);
      s.army.fleet.galleys += a.count;
      return ok(`${a.count} galleys built at Gelibolu`);
    }
    case 'devsirme': {
      if (a.boys <= 0 || a.boys > 5000) return fail('a levy is 1–5000 boys');
      const cost = a.boys * C.devsirmeCostPerBoy;
      if (!canAfford(s, cost)) return fail(`the levy costs ${cost.toLocaleString()}`);
      spend(s, cost);
      s.army.cadets.push({ count: a.boys, readyTurn: s.turn + C.cadetTrainingTurns });
      shock(s, 'millets', -Math.min(15, a.boys / 250));
      return ok(`devşirme of ${a.boys} boys`);
    }
    case 'reinforceGarrison': {
      const p = s.provinces[a.province];
      if (!p || p.owner !== 'ottoman') return fail('not an Ottoman province');
      const cost = a.men * 150; // recruitment bounty for azaps
      if (!canAfford(s, cost)) return fail(`recruiting costs ${cost.toLocaleString()}`);
      spend(s, cost);
      p.garrison += a.men;
      return ok(`${a.men} azaps added to ${p.name}`);
    }
    case 'enactLaw': {
      const law = LAW_BY_ID[a.lawId];
      if (!law) return fail(`unknown law "${a.lawId}"`);
      if (s.laws.some((l) => l.id === a.lawId)) return fail('already in force');
      if (!canAfford(s, law.cost)) return fail(`enactment costs ${law.cost.toLocaleString()}`);
      spend(s, law.cost);
      s.laws.push({ id: law.id, name: law.name, enactedTurn: s.turn });
      if (law.shock) shocks(s, law.shock);
      if (law.id === 'fratricide') s.dynasty.fratricideLaw = true;
      log(ctx, 'law', `Enacted: ${law.name}.`);
      return ok(`enacted ${law.name}`);
    }
    case 'repealLaw': {
      if (!s.laws.some((l) => l.id === a.lawId)) return fail('not in force');
      s.laws = s.laws.filter((l) => l.id !== a.lawId);
      if (a.lawId === 'fratricide') s.dynasty.fratricideLaw = false;
      log(ctx, 'law', `Repealed: ${LAW_BY_ID[a.lawId]?.name ?? a.lawId}.`);
      return ok('repealed');
    }
    case 'startProject': {
      const def = PROJECT_BY_ID[a.projectId];
      const p = s.provinces[a.province];
      if (!def) return fail(`unknown project "${a.projectId}"`);
      if (!p || p.owner !== 'ottoman') return fail('must be built in an Ottoman province');
      if (def.where === 'coastal' && !p.coastal) return fail('needs a coastal province');
      if (def.where === 'capital' && p.id !== s.capital) return fail('must be at the capital');
      if (def.where === 'bosporus' && s.provinces.constantinople.owner === 'ottoman') return fail('no longer needed');
      if (s.projects.some((x) => x.id === def.id && x.province === p.id)) return fail('already under construction');
      s.projects.push({ id: def.id, instanceId: `${def.id}-${s.turn}`, name: def.name, province: p.id, costPerMonth: Math.round(def.totalCost / def.months), monthsLeft: def.months, started: s.turn });
      log(ctx, 'construction', `Work begins: ${def.name} at ${p.name}.`);
      return ok(`${def.name} begun`);
    }
    case 'appointPrince': {
      const pr = s.dynasty.princes.find((x) => x.id === a.princeId && x.alive);
      if (!pr) return fail('no such living prince');
      if (a.province && s.provinces[a.province]?.owner !== 'ottoman') return fail('not an Ottoman province');
      if (a.province && princeAge(s, pr.birthYear) < 11) return fail('the prince is too young for a sancak');
      pr.province = a.province;
      if (a.province) {
        pr.household = clamp(pr.household + 10);
        shock(s, 'harem', 4);
      }
      return ok(a.province ? `Şehzade ${pr.name} to ${s.provinces[a.province].name}` : `Şehzade ${pr.name} recalled to the palace`);
    }
    case 'executePrince': {
      const pr = s.dynasty.princes.find((x) => x.id === a.princeId && x.alive);
      if (!pr) return fail('no such living prince');
      if (pr.heldBy) return fail(`he is beyond reach, held by ${s.neighbours[pr.heldBy].name}`);
      pr.alive = false;
      const sanctioned = s.dynasty.fratricideLaw && pr.relation !== 'son';
      shocks(s, { harem: -15, ulema: sanctioned ? -1 : -8, janissaries: pr.relation === 'son' ? -6 : 2 });
      log(ctx, 'dynasty', `Şehzade ${pr.name} is executed by the Sultan’s order.`);
      return ok(`Şehzade ${pr.name} executed`);
    }
    case 'dismissMinister': {
      if (!s.ministers[a.role]) return fail(`unknown office "${a.role}"`);
      if (a.execute) gain(s, 300_000);
      replaceMinister(ctx, a.role, a.execute ? 'executed' : 'dismissed');
      return ok(`${a.role} ${a.execute ? 'executed' : 'dismissed'}`);
    }
    case 'audit': {
      if (!canAfford(s, 60_000)) return fail('an audit costs 60,000 akçe');
      audit(ctx);
      return ok('audit of the treasury registers');
    }
    case 'sendEmbassy': {
      const n = s.neighbours[a.target];
      if (!n) return fail('unknown power');
      if (a.gift < 0 || !canAfford(s, a.gift)) return fail('cannot afford the gifts');
      spend(s, a.gift);
      const delta = 4 + Math.sqrt(a.gift / 10_000) * 2;
      stance(s, a.target, delta);
      log(ctx, 'diplomacy', `An embassy with ${a.gift.toLocaleString()} akçe in gifts goes to ${n.ruler}.`);
      return ok(`embassy to ${n.name} (+${delta.toFixed(0)} stance)`);
    }
    case 'grantTimars': {
      const p = s.provinces[a.province];
      if (!p || p.owner !== 'ottoman') return fail('not an Ottoman province');
      const moved = Math.round(p.landTax * 0.1);
      p.landTax -= moved;
      p.timarCavalry = Math.round(p.timarCavalry * 1.15);
      s.army.timariots[p.id] = (s.army.timariots[p.id] ?? 0) + Math.round(p.timarCavalry * 0.13);
      shock(s, p.region === 'anatolia' ? 'anatolianBeys' : 'rumelianBeys', 5);
      return ok(`crown land in ${p.name} granted as timars (−${moved.toLocaleString()} akçe/yr, more sipahis)`);
    }
    default:
      // Actions arrive from the LLM as JSON; never trust the type tag.
      return fail(`unknown action type "${(a as { type?: string }).type}"`);
  }
}

export function availableTargets(ctx: TurnCtx) {
  return ottomanProvinces(ctx.s).map((p) => p.id);
}
