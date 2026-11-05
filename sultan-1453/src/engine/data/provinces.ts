import type { Owner, Province } from '../types';

// Province base data. Tax bases are annual akçe at prosperity 100 that reach the *central treasury*
// (crown domains / hass-ı hümayun, cizye, customs). Timar revenues are off-budget: they pay the sipahis,
// who are represented by `timarCavalry`. See docs/economy.md.

type P = Omit<Province, 'owner' | 'loyalty' | 'prosperity'> & { owner: Owner };

const M = 1_000_000;

export const BASE_PROVINCES: P[] = [
  // ── Ottoman core, Rumelia ───────────────────────────────────────────────
  { id: 'edirne', name: 'Edirne (Thrace)', region: 'rumelia', owner: 'ottoman', garrison: 1500, walls: 35, landTax: 3.0 * M, customs: 1.2 * M, christianHouseholds: 25_000, timarCavalry: 2000, coastal: false, adjacent: ['gelibolu', 'filibe', 'constantinople', 'selanik'], travelMonths: 0 },
  { id: 'gelibolu', name: 'Gelibolu', region: 'rumelia', owner: 'ottoman', garrison: 1000, walls: 40, landTax: 0.8 * M, customs: 1.5 * M, christianHouseholds: 10_000, timarCavalry: 500, coastal: true, adjacent: ['edirne', 'constantinople', 'bursa'], travelMonths: 0.3 },
  { id: 'filibe', name: 'Filibe (Plovdiv)', region: 'rumelia', owner: 'ottoman', garrison: 600, walls: 25, landTax: 1.6 * M, customs: 0.2 * M, christianHouseholds: 40_000, timarCavalry: 2500, coastal: false, adjacent: ['edirne', 'sofia', 'uskup'], travelMonths: 0.5 },
  { id: 'sofia', name: 'Sofia', region: 'rumelia', owner: 'ottoman', garrison: 800, walls: 30, landTax: 1.4 * M, customs: 0.3 * M, christianHouseholds: 40_000, timarCavalry: 2500, coastal: false, adjacent: ['filibe', 'vidin', 'nikopol', 'uskup', 'smederevo', 'novobrdo'], travelMonths: 0.8 },
  { id: 'vidin', name: 'Vidin', region: 'rumelia', owner: 'ottoman', garrison: 1200, walls: 45, landTax: 1.0 * M, customs: 0.4 * M, christianHouseholds: 30_000, timarCavalry: 1800, coastal: false, adjacent: ['sofia', 'nikopol', 'smederevo', 'belgrade', 'wallachia'], travelMonths: 1.2 },
  { id: 'nikopol', name: 'Nikopol', region: 'rumelia', owner: 'ottoman', garrison: 1200, walls: 50, landTax: 1.0 * M, customs: 0.4 * M, christianHouseholds: 30_000, timarCavalry: 1800, coastal: false, adjacent: ['sofia', 'vidin', 'wallachia'], travelMonths: 1.0 },
  { id: 'uskup', name: 'Üsküp (Skopje)', region: 'rumelia', owner: 'ottoman', garrison: 800, walls: 30, landTax: 1.4 * M, customs: 0.3 * M, christianHouseholds: 45_000, timarCavalry: 2500, coastal: false, adjacent: ['sofia', 'filibe', 'selanik', 'novobrdo', 'kruje', 'tirhala'], travelMonths: 1.0 },
  { id: 'selanik', name: 'Selanik (Thessaloniki)', region: 'rumelia', owner: 'ottoman', garrison: 1500, walls: 60, landTax: 1.5 * M, customs: 1.5 * M, christianHouseholds: 35_000, timarCavalry: 1500, coastal: true, adjacent: ['edirne', 'uskup', 'tirhala'], travelMonths: 0.8 },
  { id: 'tirhala', name: 'Tirhala (Thessaly)', region: 'rumelia', owner: 'ottoman', garrison: 600, walls: 25, landTax: 1.3 * M, customs: 0.3 * M, christianHouseholds: 35_000, timarCavalry: 2000, coastal: true, adjacent: ['selanik', 'uskup', 'morea', 'negroponte'], travelMonths: 1.0 },
  // ── Ottoman core, Anatolia ──────────────────────────────────────────────
  { id: 'bursa', name: 'Bursa (Hüdavendigâr)', region: 'anatolia', owner: 'ottoman', garrison: 1200, walls: 45, landTax: 2.5 * M, customs: 2.0 * M, christianHouseholds: 8_000, timarCavalry: 2500, coastal: true, adjacent: ['gelibolu', 'kutahya', 'ankara', 'constantinople'], travelMonths: 0.6 },
  { id: 'kutahya', name: 'Kütahya (Germiyan)', region: 'anatolia', owner: 'ottoman', garrison: 700, walls: 35, landTax: 1.5 * M, customs: 0.3 * M, christianHouseholds: 3_000, timarCavalry: 3000, coastal: false, adjacent: ['bursa', 'aydin', 'ankara', 'konya'], travelMonths: 1.0 },
  { id: 'aydin', name: 'Aydın & Saruhan', region: 'anatolia', owner: 'ottoman', garrison: 600, walls: 25, landTax: 1.8 * M, customs: 0.8 * M, christianHouseholds: 6_000, timarCavalry: 2500, coastal: true, adjacent: ['kutahya'], travelMonths: 1.0 },
  { id: 'ankara', name: 'Ankara', region: 'anatolia', owner: 'ottoman', garrison: 800, walls: 40, landTax: 1.5 * M, customs: 0.5 * M, christianHouseholds: 4_000, timarCavalry: 3000, coastal: false, adjacent: ['bursa', 'kutahya', 'amasya', 'konya'], travelMonths: 1.2 },
  { id: 'amasya', name: 'Amasya (Rum)', region: 'anatolia', owner: 'ottoman', garrison: 900, walls: 50, landTax: 1.6 * M, customs: 0.4 * M, christianHouseholds: 8_000, timarCavalry: 3500, coastal: false, adjacent: ['ankara', 'diyarbakir'], travelMonths: 1.5 },
  // ── Foreign ─────────────────────────────────────────────────────────────
  { id: 'constantinople', name: 'Constantinople', region: 'rumelia', owner: 'byzantium', garrison: 7000, walls: 95, landTax: 0.5 * M, customs: 3.0 * M, christianHouseholds: 10_000, timarCavalry: 0, coastal: true, adjacent: ['edirne', 'gelibolu', 'bursa'], travelMonths: 0.3 },
  { id: 'morea', name: 'Despotate of the Morea', region: 'frontier', owner: 'byzantium', garrison: 3000, walls: 55, landTax: 1.2 * M, customs: 0.3 * M, christianHouseholds: 40_000, timarCavalry: 1500, coastal: true, adjacent: ['tirhala', 'modon'], travelMonths: 2.0 },
  { id: 'modon', name: 'Modon & Coron', region: 'frontier', owner: 'venice', garrison: 1500, walls: 70, landTax: 0.2 * M, customs: 0.8 * M, christianHouseholds: 5_000, timarCavalry: 0, coastal: true, adjacent: ['morea'], travelMonths: 2.5 },
  { id: 'negroponte', name: 'Negroponte (Euboea)', region: 'frontier', owner: 'venice', garrison: 2000, walls: 70, landTax: 0.4 * M, customs: 0.9 * M, christianHouseholds: 12_000, timarCavalry: 0, coastal: true, adjacent: ['tirhala'], travelMonths: 1.8 },
  { id: 'smederevo', name: 'Smederevo', region: 'frontier', owner: 'serbia', garrison: 3000, walls: 70, landTax: 0.8 * M, customs: 0.3 * M, christianHouseholds: 30_000, timarCavalry: 1500, coastal: false, adjacent: ['sofia', 'vidin', 'novobrdo', 'belgrade'], travelMonths: 1.4 },
  { id: 'novobrdo', name: 'Novo Brdo (silver mines)', region: 'frontier', owner: 'serbia', garrison: 2000, walls: 60, landTax: 0.4 * M, customs: 0.2 * M, christianHouseholds: 15_000, timarCavalry: 600, coastal: false, adjacent: ['sofia', 'uskup', 'smederevo'], travelMonths: 1.2 },
  { id: 'belgrade', name: 'Belgrade', region: 'frontier', owner: 'hungary', garrison: 7000, walls: 85, landTax: 0.6 * M, customs: 0.6 * M, christianHouseholds: 15_000, timarCavalry: 800, coastal: false, adjacent: ['smederevo', 'vidin', 'buda'], travelMonths: 1.6 },
  { id: 'buda', name: 'Buda', region: 'frontier', owner: 'hungary', garrison: 8000, walls: 75, landTax: 2.0 * M, customs: 1.0 * M, christianHouseholds: 80_000, timarCavalry: 3000, coastal: false, adjacent: ['belgrade'], travelMonths: 3.0 },
  { id: 'wallachia', name: 'Wallachia (Târgoviște)', region: 'frontier', owner: 'wallachia', garrison: 3000, walls: 35, landTax: 1.2 * M, customs: 0.4 * M, christianHouseholds: 60_000, timarCavalry: 0, coastal: false, adjacent: ['nikopol', 'vidin'], travelMonths: 1.5 },
  { id: 'kruje', name: 'Krujë (Albania)', region: 'frontier', owner: 'albania', garrison: 3000, walls: 80, landTax: 0.3 * M, customs: 0.1 * M, christianHouseholds: 20_000, timarCavalry: 500, coastal: false, adjacent: ['uskup'], travelMonths: 1.4 },
  { id: 'konya', name: 'Konya', region: 'frontier', owner: 'karaman', garrison: 3000, walls: 45, landTax: 1.5 * M, customs: 0.5 * M, christianHouseholds: 3_000, timarCavalry: 2500, coastal: false, adjacent: ['kutahya', 'ankara', 'larende'], travelMonths: 1.5 },
  { id: 'larende', name: 'Larende (Karaman)', region: 'frontier', owner: 'karaman', garrison: 2000, walls: 50, landTax: 0.8 * M, customs: 0.2 * M, christianHouseholds: 2_000, timarCavalry: 1500, coastal: false, adjacent: ['konya', 'aleppo'], travelMonths: 2.0 },
  { id: 'aleppo', name: 'Aleppo', region: 'frontier', owner: 'mamluks', garrison: 6000, walls: 75, landTax: 2.0 * M, customs: 2.0 * M, christianHouseholds: 10_000, timarCavalry: 0, coastal: false, adjacent: ['larende'], travelMonths: 3.0 },
  { id: 'diyarbakir', name: 'Diyarbakır (Amid)', region: 'frontier', owner: 'aqqoyunlu', garrison: 5000, walls: 70, landTax: 1.5 * M, customs: 0.8 * M, christianHouseholds: 10_000, timarCavalry: 0, coastal: false, adjacent: ['amasya'], travelMonths: 3.0 },
];

/** Special tax-farm income (mukataa) attached to a province, akçe per year, when Ottoman. */
export const SPECIAL_INCOME: Record<string, { label: string; amount: number }> = {
  novobrdo: { label: 'Novo Brdo silver mines', amount: 6.5 * M },
  gelibolu: { label: 'Straits ferry & salt farms', amount: 0.8 * M },
  constantinople: { label: 'Galata & Bosporus tolls', amount: 3.0 * M },
};
