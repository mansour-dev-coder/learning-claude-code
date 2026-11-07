// Orders you can give by clicking a province on the map, so the whole game is playable without typing.
// Each is an ordinary engine Action; the engine still validates it when the month ends.
import type { GameState, NeighbourId } from '../engine/types';
import type { Action } from '../engine/actions';
import { atWarWith } from '../engine/state';

export interface ProvinceAction { label: string; action: Action; note?: string }

export function provinceActions(s: GameState, pid: string): ProvinceAction[] {
  const p = s.provinces[pid];
  if (!p || s.status !== 'active') return [];
  const out: ProvinceAction[] = [];
  const ours = p.owner === 'ottoman';
  const borders = p.adjacent.some((a) => s.provinces[a]?.owner === 'ottoman');
  const ourSiege = s.campaign?.phase === 'besieging' && s.campaign.target === pid;
  const enemySiege = s.sieges.find((x) => x.province === pid && x.defender === 'ottoman');

  if (ourSiege) {
    out.push({ label: 'Order a general assault this month', action: { type: 'orderAssault' } });
    out.push({ label: 'Lift the siege and come home', action: { type: 'liftSiege' } });
  }
  if (ours) {
    if (enemySiege && !s.campaign) out.push({ label: `Relieve ${p.name}`, action: { type: 'startCampaign', target: pid, artillery: false }, note: 'The army marches to break the siege.' });
    out.push({ label: 'Reinforce the garrison (+500 azaps, 75,000 akçe)', action: { type: 'reinforceGarrison', province: pid, men: 500 } });
    if ((pid === 'edirne' || pid === 'gelibolu') && s.provinces.constantinople.owner !== 'ottoman' && !s.flags.bosporusFortress && !s.projects.some((x) => x.id === 'rumeliHisari'))
      out.push({ label: 'Build Rumeli Hisarı on the Bosporus (3M over 5 months)', action: { type: 'startProject', projectId: 'rumeliHisari', province: pid } });
    if (!s.projects.some((x) => x.province === pid && x.id === 'fortress')) out.push({ label: 'Rebuild the fortress walls (1M over 6 months)', action: { type: 'startProject', projectId: 'fortress', province: pid } });
    return out;
  }

  const owner = p.owner as NeighbourId;
  const n = s.neighbours[owner];
  if (!n) return out;
  if (!atWarWith(s, owner)) {
    out.push({ label: `Declare war on ${n.name}`, action: { type: 'declareWar', target: owner, casusBelli: s.flags[`casusBelli_${owner}`] ? 'just grievances' : 'the Sultan’s will' }, note: s.flags[`casusBelli_${owner}`] ? 'You have a casus belli.' : n.relation === 'truce' ? 'Breaking a truce troubles the ulema.' : 'Without a casus belli the Mufti will hesitate.' });
    out.push({ label: `Send an embassy with gifts (100,000 akçe)`, action: { type: 'sendEmbassy', target: owner, gift: 100_000 } });
    return out;
  }
  if (!s.campaign && (borders || p.coastal)) {
    out.push({ label: `March on ${p.name}`, action: { type: 'startCampaign', target: pid, artillery: true, fleet: p.coastal && s.army.fleet.galleys > 0, ledBySultan: true }, note: p.walls >= 80 ? 'Strong walls: bring every gun you have.' : undefined });
  }
  out.push({ label: 'Offer peace on the status quo', action: { type: 'offerPeace', target: owner, terms: 'whitePeace' } });
  out.push({ label: 'Demand annual tribute', action: { type: 'offerPeace', target: owner, terms: 'tribute' } });
  if (borders) out.push({ label: `Demand ${p.name} as the price of peace`, action: { type: 'offerPeace', target: owner, terms: 'cession', province: pid } });
  return out;
}
