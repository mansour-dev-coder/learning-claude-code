import type { Agenda, FactionId, Minister, MinisterRole } from '../types';
import type { Rng } from '../rng';

type M = Omit<Minister, 'role' | 'appointedTurn'>;
const m = (name: string, faction: FactionId, personality: string, agenda: Agenda, honesty: number, competence: number, loyalty: number, historical: boolean, agendaTarget?: string): M => ({ name, faction, personality, agenda, honesty, competence, loyalty, historical, agendaTarget });

export const TITLES: Record<MinisterRole, string> = {
  grandVizier: 'Grand Vizier (Vezir-i Azam)',
  defterdar: 'Defterdar (Treasurer)',
  kazasker: 'Kazasker (Chief Military Judge)',
  nisanci: 'Nişancı (Chancellor)',
  beylerbeyRumelia: 'Beylerbey of Rumelia',
  beylerbeyAnatolia: 'Beylerbey of Anatolia',
  janissaryAgha: 'Agha of the Janissaries',
  kapudanPasha: 'Kapudan (Admiral of the Fleet)',
  seyhulislam: 'Mufti (Şeyhülislam)',
};

export const MINISTERS_1451: Record<MinisterRole, M> = {
  grandVizier: m('Çandarlı Halil Pasha', 'anatolianBeys', 'Head of the old Turkish vizier dynasty; vastly experienced, cautious, condescending toward the young Sultan he once helped depose. Rumoured to take Byzantine gold.', 'peaceParty', 40, 8, 40, true, 'byzantium'),
  defterdar: m('Mahmud Çelebi', 'merchants', 'A smooth accountant from Bursa with friends among the tax farmers.', 'embezzle', 35, 6, 55, false),
  kazasker: m('Molla Gürani', 'ulema', 'Kurdish scholar, the Sultan’s old tutor who once beat him for idleness; addresses the Sultan by name and kisses no hand.', 'orthodoxy', 90, 7, 70, true),
  nisanci: m('Ahmed Bey', 'merchants', 'Meticulous chancery official; master of the tuğra and the inşa style.', 'loyal', 75, 6, 65, false),
  beylerbeyRumelia: m('Dayı Karaca Pasha', 'rumelianBeys', 'Veteran frontier commander, eager for war on the Danube.', 'warParty', 60, 7, 70, true),
  beylerbeyAnatolia: m('İshak Pasha', 'anatolianBeys', 'Capable, ambitious governor of Anatolia; a convert raised in the palace.', 'loyal', 65, 7, 60, true),
  janissaryAgha: m('Kazancı Doğan', 'janissaries', 'Agha who lets the corps’ grievances rise until the Sultan pays.', 'janissaryPatron', 45, 5, 45, true),
  kapudanPasha: m('Baltaoğlu Süleyman Bey', 'rumelianBeys', 'Bulgarian-born sancak bey of Gelibolu; brave, impetuous, untested at sea against Latin ships.', 'loyal', 65, 5, 65, true),
  seyhulislam: m('Molla Fahreddin-i Acemi', 'ulema', 'Persian-born Mufti of Edirne; stern guardian of orthodoxy who burned the Hurufi heretics.', 'orthodoxy', 80, 7, 60, true),
};

export const MINISTERS_1421: Record<MinisterRole, M> = {
  grandVizier: m('Çandarlı İbrahim Pasha', 'anatolianBeys', 'Son of the first Çandarlı vizier; patient builder of the state’s finances.', 'loyal', 70, 8, 65, true),
  defterdar: m('Hacı İvaz Pasha', 'merchants', 'Builder of the Green Mosque at Bursa, clever and secretive.', 'embezzle', 50, 7, 50, true),
  kazasker: m('Mehmed Çelebi', 'ulema', 'A conscientious judge of the army.', 'loyal', 75, 6, 60, false),
  nisanci: m('Yakub Bey', 'merchants', 'Keeper of the tuğra and registers.', 'loyal', 70, 5, 60, false),
  beylerbeyRumelia: m('Bayezid Pasha', 'rumelianBeys', 'Old vizier of Mehmed I; the man who hid the late Sultan’s death and brought you to the throne. Hates the pretender Mustafa.', 'warParty', 70, 7, 80, true),
  beylerbeyAnatolia: m('Yörgüç Pasha', 'anatolianBeys', 'Lala (tutor) of the princes at Amasya; master of the Turcoman borderlands.', 'loyal', 65, 7, 65, true),
  janissaryAgha: m('Hasan Agha', 'janissaries', 'A gruff old soldier.', 'janissaryPatron', 55, 5, 55, false),
  kapudanPasha: m('Çalı Bey', 'rumelianBeys', 'Admiral beaten by the Venetians off Gallipoli in 1416.', 'loyal', 60, 4, 60, true),
  seyhulislam: m('Molla Şemseddin Fenari', 'ulema', 'Most learned scholar of the realm; Mufti in all but title.', 'orthodoxy', 85, 8, 65, true),
};

/** Replacement candidates the engine can offer when a minister is dismissed or dies. */
export const CANDIDATES: Partial<Record<MinisterRole, M[]>> = {
  grandVizier: [
    m('Zaganos Pasha', 'janissaries', 'Second vizier, Albanian-born palace slave, leader of the war party; devoted to the Sultan.', 'warParty', 60, 8, 85, true),
    m('Mahmud Pasha Angelović', 'rumelianBeys', 'Byzantine-Serbian aristocrat taken by devşirme; poet, builder, superb general.', 'loyal', 70, 9, 70, true),
    m('Saruca Pasha', 'janissaries', 'Commander of the Janissaries turned vizier.', 'janissaryPatron', 55, 6, 65, true),
  ],
  defterdar: [m('Hamza Bey', 'merchants', 'Honest but slow.', 'loyal', 80, 5, 60, false), m('Yakub Pasha', 'merchants', 'Brilliant with numbers, fond of gifts.', 'embezzle', 40, 8, 55, false)],
  beylerbeyRumelia: [m('Turahan Bey', 'rumelianBeys', 'Marcher lord of Thessaly; raided the Morea for decades.', 'warParty', 55, 8, 60, true), m('Hadım Şehabeddin Pasha', 'rumelianBeys', 'Eunuch general; boastful.', 'warParty', 50, 5, 70, true)],
  janissaryAgha: [m('Kurtçu Doğan', 'janissaries', 'Hard disciplinarian.', 'loyal', 70, 6, 70, false)],
};

const NAMES = ['Ali', 'Hasan', 'Hüseyin', 'Mustafa', 'Ahmed', 'Mehmed', 'Yusuf', 'Hamza', 'İskender', 'Sinan', 'Davud', 'Gedik Ahmed', 'Ömer', 'Murad', 'Kasım', 'Hızır', 'Mesih'];
const SUFFIX: Record<MinisterRole, string> = { grandVizier: 'Pasha', defterdar: 'Çelebi', kazasker: 'Efendi', nisanci: 'Bey', beylerbeyRumelia: 'Pasha', beylerbeyAnatolia: 'Pasha', janissaryAgha: 'Agha', kapudanPasha: 'Bey', seyhulislam: 'Efendi' };
const FACTION_OF: Record<MinisterRole, FactionId> = { grandVizier: 'janissaries', defterdar: 'merchants', kazasker: 'ulema', nisanci: 'merchants', beylerbeyRumelia: 'rumelianBeys', beylerbeyAnatolia: 'anatolianBeys', janissaryAgha: 'janissaries', kapudanPasha: 'rumelianBeys', seyhulislam: 'ulema' };
const AGENDAS: Agenda[] = ['loyal', 'loyal', 'loyal', 'embezzle', 'warParty', 'peaceParty', 'janissaryPatron', 'orthodoxy'];

export function generateMinister(role: MinisterRole, rng: Rng, turn: number, used: Set<string>): Minister {
  const pool = (CANDIDATES[role] ?? []).filter((c) => !used.has(c.name));
  if (pool.length && rng.chance(0.6)) return { ...rng.pick(pool), role, appointedTurn: turn };
  let name = '';
  for (let i = 0; i < 20 && (!name || used.has(name)); i++) name = `${rng.pick(NAMES)} ${SUFFIX[role]}`;
  let agenda = rng.pick(AGENDAS);
  if (role === 'janissaryAgha' && agenda === 'peaceParty') agenda = 'janissaryPatron';
  return { role, name, faction: FACTION_OF[role], personality: 'A new man, eager to prove himself.', agenda, agendaTarget: agenda === 'peaceParty' ? 'venice' : undefined, honesty: rng.int(30, 85), competence: rng.int(3, 8), loyalty: rng.int(50, 80), historical: false, appointedTurn: turn };
}
