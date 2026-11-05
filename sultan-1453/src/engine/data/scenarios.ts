import type { Consort, Dynasty, FactionId, Owner, Prince } from '../types';

export type ScenarioId = 'murad1421' | 'mehmed1451' | 'fictional';

export interface ScenarioDef {
  id: ScenarioId;
  label: string;
  start: { year: number; month: number };
  capital: string;
  sultan: { name: string; birthYear: number; martial: number; admin: number; piety: number; intrigue: number; health: number; historical: boolean };
  treasury: number;
  baseTaxFarm: number;
  cizye: number;
  customsRate: number;
  silverGrams: number;
  population: number;
  army: { janissaries: number; palaceCavalry: number; guns: number; bombards: number; quality: number; galleys: number; transports: number; timarMult: number };
  factions: Record<FactionId, number>;
  ownerOverrides: Record<string, Owner>;
  dynasty: Dynasty;
  /** events forced onto the opening turns: [eventId, turn] */
  opening: [string, number][];
}

const consort = (id: string, name: string, origin: string, influence: number, historical = true): Consort => ({ id, name, origin, influence, alive: true, historical });
const prince = (p: Partial<Prince> & Pick<Prince, 'id' | 'name' | 'birthYear' | 'relation'>): Prince => ({ motherId: null, province: null, household: 10, ambition: 20, ability: 5, alive: true, historical: true, ...p });

export const SCENARIOS: Record<'murad1421' | 'mehmed1451', ScenarioDef> = {
  mehmed1451: {
    id: 'mehmed1451',
    label: 'Mehmed II, February 1451',
    start: { year: 1451, month: 2 },
    capital: 'edirne',
    sultan: { name: 'Mehmed II', birthYear: 1432, martial: 8, admin: 9, piety: 5, intrigue: 8, health: 85, historical: true },
    treasury: 25_000_000,
    baseTaxFarm: 8_500_000,
    cizye: 35,
    customsRate: 4,
    silverGrams: 0.98,
    population: 30_000,
    army: { janissaries: 5000, palaceCavalry: 2500, guns: 20, bombards: 0, quality: 0.7, galleys: 30, transports: 20, timarMult: 1 },
    factions: { janissaries: 45, ulema: 60, rumelianBeys: 60, anatolianBeys: 55, harem: 50, merchants: 55, millets: 50 },
    ownerOverrides: {},
    dynasty: {
      valide: { name: 'Mara Hatun', influence: 45, alive: true, note: 'Mara Branković, Serbian widow of Murad II and the Sultan’s stepmother; his own mother Hüma Hatun died in 1449. Serves the role a Valide would.' },
      consorts: [consort('gulbahar', 'Gülbahar Hatun', 'Albanian-born concubine', 55), consort('gulsah', 'Gülşah Hatun', 'Turkish concubine', 40), consort('sittisah', 'Sittişah Hatun', 'Dulkadirid princess, married 1450', 35)],
      princes: [
        prince({ id: 'bayezid', name: 'Bayezid', birthYear: 1447, relation: 'son', motherId: 'gulbahar', ability: 6 }),
        prince({ id: 'mustafa', name: 'Mustafa', birthYear: 1450, relation: 'son', motherId: 'gulsah', ability: 7 }),
        prince({ id: 'ahmed', name: 'Küçük Ahmed', birthYear: 1450, relation: 'brother', household: 15, ambition: 0, ability: 5 }),
        prince({ id: 'orhan', name: 'Orhan Çelebi', birthYear: 1412, relation: 'pretender', heldBy: 'byzantium', household: 20, ambition: 60, ability: 4 }),
      ],
      chiefEunuch: { name: 'Hadım Ali Agha', title: 'Kapı Ağası (Chief White Eunuch)', loyalty: 65, competence: 6 },
      fratricideLaw: false,
    },
    opening: [['accessionDonative', 0], ['fratricideQuestion', 0]],
  },
  murad1421: {
    id: 'murad1421',
    label: 'Murad II, June 1421',
    start: { year: 1421, month: 6 },
    capital: 'edirne',
    sultan: { name: 'Murad II', birthYear: 1404, martial: 7, admin: 7, piety: 8, intrigue: 5, health: 85, historical: true },
    treasury: 8_000_000,
    baseTaxFarm: 5_000_000,
    cizye: 25,
    customsRate: 4,
    silverGrams: 1.15,
    population: 25_000,
    army: { janissaries: 3000, palaceCavalry: 1500, guns: 6, bombards: 0, quality: 0.5, galleys: 20, transports: 10, timarMult: 0.8 },
    factions: { janissaries: 50, ulema: 65, rumelianBeys: 40, anatolianBeys: 60, harem: 55, merchants: 50, millets: 50 },
    ownerOverrides: { selanik: 'byzantium', belgrade: 'serbia', kruje: 'albania' },
    dynasty: {
      valide: { name: 'Emine Hatun', influence: 50, alive: true, note: 'Dulkadirid princess, chief wife of the late Mehmed I. Sources differ on whether she is Murad’s birth mother.' },
      consorts: [consort('hatice', 'Hatice Hatun', 'concubine of the household (name not attested)', 40, false)],
      princes: [
        prince({ id: 'ahmedCelebi', name: 'Ahmed', birthYear: 1420, relation: 'son', motherId: 'hatice', ability: 6 }),
        prince({ id: 'kucukMustafa', name: 'Küçük Mustafa', birthYear: 1408, relation: 'brother', household: 30, ambition: 55, ability: 4, province: 'amasya' }),
        prince({ id: 'duzmece', name: 'Mustafa “Düzmece”', birthYear: 1380, relation: 'uncle', household: 65, ambition: 100, ability: 5 }),
      ],
      chiefEunuch: { name: 'Hadım Yakub Agha', title: 'Kapı Ağası (Chief White Eunuch)', loyalty: 60, competence: 5 },
      fratricideLaw: false,
    },
    opening: [['accessionDonative', 0], ['pretenderRevolt', 1]],
  },
};

/** Approximate ownership changes by year, for a fictional Sultan starting later than the historical scenarios. */
export const TIMELINE: { year: number; owners: Record<string, Owner>; extinct?: string[] }[] = [
  { year: 1427, owners: { belgrade: 'hungary' } },
  { year: 1430, owners: { selanik: 'ottoman' } },
  { year: 1453, owners: { constantinople: 'ottoman' } },
  { year: 1455, owners: { novobrdo: 'ottoman' } },
  { year: 1459, owners: { smederevo: 'ottoman' }, extinct: ['serbia'] },
  { year: 1460, owners: { morea: 'ottoman' }, extinct: ['byzantium'] },
  { year: 1470, owners: { negroponte: 'ottoman' } },
  { year: 1474, owners: { konya: 'ottoman', larende: 'ottoman' }, extinct: ['karaman'] },
  { year: 1479, owners: { kruje: 'ottoman' }, extinct: ['albania'] },
  { year: 1500, owners: { modon: 'ottoman' } },
];

export const FICTIONAL_NAMES = ['Orhan', 'Süleyman', 'Musa', 'Yusuf', 'Alaeddin', 'Korkud', 'Ertuğrul', 'Savcı', 'Kasım', 'İshak'];
