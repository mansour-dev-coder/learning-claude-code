import type { FactionId } from '../types';

export interface LawDef {
  id: string;
  name: string;
  description: string;
  cost: number; // one-off akçe
  /** permanent shift to faction equilibria while in force */
  factionShift: Partial<Record<FactionId, number>>;
  /** immediate shock at enactment */
  shock?: Partial<Record<FactionId, number>>;
  landTaxMult?: number;
  customsMult?: number;
  cizyeMult?: number;
  taxFarmMult?: number;
  excludes?: string[];
}

export const LAWS: LawDef[] = [
  { id: 'fratricide', name: 'Law of Fratricide', description: '“Whichever of my sons inherits the sultanate, it is proper that he should put his brothers to death for the order of the world.” Ends succession wars at the cost of princes’ lives.', cost: 0, factionShift: { janissaries: 3, harem: -10, ulema: -2 }, shock: { harem: -15 } },
  { id: 'tahrir', name: 'New cadastral survey (tahrir)', description: 'Re-register households and revenues province by province; closes concealed income, angers beys with under-registered timars.', cost: 600_000, factionShift: { rumelianBeys: -4, anatolianBeys: -4 }, landTaxMult: 1.08, cizyeMult: 1.06 },
  { id: 'iltizam', name: 'Auction mukataas to tax farmers (iltizam)', description: 'Mines, mints, salt pans and customs farmed out at auction for three-year terms. More cash, harsher collection.', cost: 0, factionShift: { merchants: 6, millets: -5 }, taxFarmMult: 1.15 },
  { id: 'waqfReversion', name: 'Revert waqf and freehold lands to the state', description: 'Mehmed II’s great land reform: thousands of villages held as waqf or mülk turned into timars and crown land.', cost: 0, factionShift: { ulema: -18, anatolianBeys: -10, rumelianBeys: 3 }, shock: { ulema: -15 }, landTaxMult: 1.12 },
  { id: 'capitulations', name: 'Trade capitulations to Venice and Genoa', description: 'Fixed low customs and consular rights for Latin merchants. Trade grows; local merchants grumble at foreign privilege.', cost: 0, factionShift: { merchants: 4 }, customsMult: 1.1 },
  { id: 'patriarchate', name: 'Recognise the Orthodox Patriarch as head of the millet', description: 'Grant the Patriarch civil authority over Orthodox subjects in return for loyalty and orderly cizye.', cost: 100_000, factionShift: { millets: 15, ulema: -3 }, cizyeMult: 1.05 },
  { id: 'kanunOsmani', name: 'Kanun-i Osmani (codified criminal and fiscal law)', description: 'Standard fines and dues across the provinces, curbing arbitrary exactions by sancak beys.', cost: 200_000, factionShift: { millets: 5, ulema: 3, rumelianBeys: -3, anatolianBeys: -3 } },
  { id: 'soundCoin', name: 'Pledge of sound coinage', description: 'Publicly bind the treasury not to re-mint the akçe for ten years.', cost: 0, factionShift: { merchants: 10, janissaries: 5 }, excludes: [] },
  { id: 'regularDevsirme', name: 'Regular devşirme levy', description: 'A levy of Christian boys every few years to feed the Janissary corps and palace service.', cost: 0, factionShift: { millets: -10, janissaries: 3 } },
  { id: 'kulViziers', name: 'Viziers from the kapıkulu rather than Turkish nobility', description: 'Promote slave-origin men of the palace school to the vizierate, sidelining families like the Çandarlı.', cost: 0, factionShift: { anatolianBeys: -8, janissaries: 4, harem: 3 } },
  { id: 'surgun', name: 'Sürgün: forced resettlement to the capital', description: 'Move artisans, merchants and peasants from the provinces to repopulate the capital.', cost: 300_000, factionShift: { millets: -5, merchants: 3 } },
  { id: 'akinciRegister', name: 'Register the akıncı raiders', description: 'Put the frontier raiders under muster rolls and a share of booty to the treasury (pençik).', cost: 0, factionShift: { rumelianBeys: 6 } },
];

export const LAW_BY_ID: Record<string, LawDef> = Object.fromEntries(LAWS.map((l) => [l.id, l]));
