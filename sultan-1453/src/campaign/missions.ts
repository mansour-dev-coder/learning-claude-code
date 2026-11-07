// Mehmed II's campaign: nine missions, 1451–1480. Missions 1–3 are playable; 4–9 are outlined stubs.
import type { MissionDef } from './types';
import { historicalState } from './timeline';
import { declareWar } from '../engine/war';
import { Rng } from '../engine/rng';
import { atWarWith, type TurnCtx } from '../engine/state';

const peaceWith = (s: Parameters<NonNullable<MissionDef['script']>>[0], id: 'karaman') => !atWarWith(s, id);

export const MISSIONS: MissionDef[] = [
  {
    id: 'accession',
    index: 1,
    title: 'Accession',
    year: 1451,
    focus: 'edirne',
    tutorial: true,
    briefing:
      'February 1451. Murad II is dead and you are nineteen. The Janissaries remember that you were set aside once before; Çandarlı Halil Pasha remembers it too. In Anatolia the Bey of Karaman is gathering the Turcoman lords. Secure the corps, settle the question of your infant brother, and bring Karaman to terms.',
    objective: {
      text: 'Bring Karaman to terms (peace or Konya taken) with the Janissaries at least uneasy (loyalty 45+)',
      check: (s, run) => {
        const rose = !!run.marks.karamanRose;
        const done = rose && (peaceWith(s, 'karaman') || s.provinces.konya.owner === 'ottoman');
        const ok = s.factions.janissaries >= 45;
        const progress = !rose ? 'Karaman is gathering its strength' : done ? (ok ? 'Karaman has submitted' : 'Karaman has submitted, but the Janissaries are restless') : `At war with Karaman (war score ${Math.round(s.wars.find((w) => w.enemies.includes('karaman'))?.score ?? 0)})`;
        return { met: done && ok, progress };
      },
    },
    limit: 14,
    par: 9,
    bonus: {
      text: 'Never fall into arrears, and keep the corps content (60+) at the end',
      check: (s, run) => !run.marks.arrears && s.factions.janissaries >= 60,
    },
    reward: { text: 'The corps remembers your accession: +10 Janissary loyalty at the start of every later mission.', unlocks: ['corpsLoyalty'] },
    start: (seed, unlocked) => historicalState({ year: 1451, month: 2, seed, unlocked, treasury: 25_000_000, janissaries: 5000, guns: 20, opening: ['accessionDonative', 'fratricideQuestion'] }),
    script: (s, run) => {
      const notes: string[] = [];
      if (s.arrears > 0) run.marks.arrears = true;
      // April 1451: Karaman rises (historically, İbrahim Bey restored the Germiyan, Aydın and Menteşe pretenders)
      if (run.months === 2 && !run.marks.karamanRose) {
        const ctx: TurnCtx = { s, rng: new Rng(s.rngState), facts: [] };
        s.neighbours.karaman.stance = -75;
        declareWar(ctx, 'karaman', 'the restoration of the Germiyan and Aydın princes', false);
        s.rngState = ctx.rng.state;
        run.marks.karamanRose = true;
        notes.push(...ctx.facts);
      }
      return notes;
    },
  },
  {
    id: 'rumeli-hisari',
    index: 2,
    title: 'Rumeli Hisarı',
    year: 1452,
    focus: 'constantinople',
    briefing:
      'April 1452. On the European shore of the Bosporus, opposite your great-grandfather’s fortress, you mean to build a castle that will close the strait: Boğazkesen, the Throat-Cutter. The Emperor’s envoys protest; Venice watches. Build it before winter. A Hungarian founder named Orban is said to be looking for a new master.',
    objective: {
      text: 'Complete Rumeli Hisarı',
      check: (s) => {
        const p = s.projects.find((x) => x.id === 'rumeliHisari');
        const done = !!s.flags.bosporusFortress;
        return { met: done, progress: done ? 'The fortress stands' : p ? `Under construction: ${p.monthsLeft} months left` : 'Not yet begun: order the fortress in the Divan, or from Edirne on the map' };
      },
    },
    limit: 9,
    par: 6,
    bonus: { text: 'Take the founder Orban into your service', check: (s) => s.flags.orbanHired !== undefined },
    reward: { text: 'Great bombards: Orban’s guns join your siege train, and the Porte can cast its own.', unlocks: ['bombards'] },
    start: (seed, unlocked) => {
      const s = historicalState({ year: 1452, month: 4, seed, unlocked, treasury: 22_000_000, janissaries: 6000, guns: 30, opening: ['bosporusFortress'] });
      s.scheduled.push({ id: 'mission-orban', dueTurn: 2, kind: 'event', ref: 'orbanCannon', note: 'Orban arrives' });
      delete s.eventHistory.orbanCannon;
      s.flags.lockBombards = false; // Orban's offer is the point of this mission
      return s;
    },
    cinematic: 'bosporus',
  },
  {
    id: 'constantinople',
    index: 3,
    title: 'Constantinople',
    year: 1453,
    focus: 'constantinople',
    briefing:
      'March 1453. Rumeli Hisarı commands the strait. Your casus belli is ready: the Emperor’s threats over the pretender Orhan. Seven thousand defenders hold the Theodosian walls; Venetian and Genoese ships may yet slip through. Declare war, bring the army and the guns, and take the City before the campaigning season ends.',
    objective: {
      text: 'Take Constantinople',
      check: (s) => {
        const sg = s.sieges.find((x) => x.province === 'constantinople');
        const taken = s.provinces.constantinople.owner === 'ottoman';
        return { met: taken, progress: taken ? 'The City is yours' : sg ? `Siege, month ${sg.months}: breach ${Math.round(sg.breach)}%, ${sg.defenders.toLocaleString()} defenders` : atWarWith(s, 'byzantium') ? 'At war: march on the City' : 'Declare war on Byzantium' };
      },
    },
    limit: 8,
    par: 5,
    bonus: { text: 'Take the City without a failed assault', check: (_s, run) => !run.marks.failedAssault },
    reward: { text: 'The imperial fleet programme and the move to Topkapı; Sandbox play is unlocked.', unlocks: ['fleet', 'topkapi', 'sandbox'] },
    start: (seed, unlocked) => {
      const s = historicalState({ year: 1453, month: 3, seed, unlocked, treasury: 28_000_000, janissaries: 10000, guns: 60 });
      s.army.palaceCavalry = 4000;
      s.army.fleet.galleys = 100; // Baltaoğlu's fleet, assembled at Gelibolu over the winter
      s.flags.casusBelli_byzantium = true;
      s.flags.bosporusFortress = 1;
      return s;
    },
    script: (s, run) => {
      const sg = s.sieges.find((x) => x.province === 'constantinople' && x.attacker === 'ottoman');
      if (sg && sg.assaultsFailed > 0) run.marks.failedAssault = true;
      return [];
    },
    cinematic: 'constantinople',
  },
  stub(4, 'serbia', 'Serbia', 1459, 'smederevo', 'Take Smederevo and end the Serbian Despotate', 'Novo Brdo’s silver: +15% tax-farm revenue.', ['silver']),
  stub(5, 'morea', 'The Morea', 1460, 'morea', 'Annex the Despotate of the Morea', 'Seaborne invasion: campaigns can land on coasts that do not border your lands.', ['navalInvasion']),
  stub(6, 'trebizond', 'Trebizond', 1461, 'amasya', 'Take Trebizond, the last Greek empire', 'Mastery of the Black Sea.', ['blackSea'], 'Trebizond is not yet on the map (Phase 4 map additions).'),
  stub(7, 'skanderbeg', 'Skanderbeg', 1466, 'kruje', 'Break the League of Lezhë: hold the passes and besiege Krujë', 'Mountain warfare: smaller attrition in hill country.', ['mountainWar']),
  stub(8, 'otlukbeli', 'Karaman and Otlukbeli', 1473, 'larende', 'Annex Karaman and defeat Uzun Hasan in the field', 'Field artillery: guns count double in pitched battle.', ['fieldArtillery']),
  stub(9, 'otranto', 'Otranto', 1480, 'modon', 'Land in Apulia and hold Otranto', 'The title of Conqueror, and the campaign’s end.', ['conqueror'], 'Otranto and southern Italy are not yet on the map (Phase 4 map additions).'),
];

function stub(index: number, id: string, title: string, year: number, focus: string, objective: string, reward: string, unlocks: MissionDef['reward']['unlocks'], extra?: string): MissionDef {
  return {
    id, index, title, year, focus,
    briefing: `${year}. ${objective}.`,
    objective: { text: objective, check: () => ({ met: false, progress: '' }) },
    limit: 12, par: 8,
    bonus: { text: 'To be designed', check: () => false },
    reward: { text: reward, unlocks },
    stub: { reason: extra ?? 'Outlined; playable in a later build.' },
  };
}

export const MISSION_BY_ID: Record<string, MissionDef> = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));
