// All engine state. Everything here must stay JSON-serialisable (no functions, no Dates, no Maps)
// so that it can be saved to SQLite verbatim and replayed deterministically.

export type FactionId =
  | 'janissaries'
  | 'ulema'
  | 'rumelianBeys'
  | 'anatolianBeys'
  | 'harem'
  | 'merchants'
  | 'millets';

export const FACTIONS: FactionId[] = [
  'janissaries',
  'ulema',
  'rumelianBeys',
  'anatolianBeys',
  'harem',
  'merchants',
  'millets',
];

export type NeighbourId =
  | 'hungary'
  | 'venice'
  | 'papacy'
  | 'serbia'
  | 'wallachia'
  | 'byzantium'
  | 'karaman'
  | 'mamluks'
  | 'aqqoyunlu'
  | 'albania';

export type Owner = 'ottoman' | NeighbourId;

export type MinisterRole =
  | 'grandVizier'
  | 'defterdar'
  | 'kazasker'
  | 'nisanci'
  | 'beylerbeyRumelia'
  | 'beylerbeyAnatolia'
  | 'janissaryAgha'
  | 'kapudanPasha'
  | 'seyhulislam';

export const MINISTER_ROLES: MinisterRole[] = [
  'grandVizier',
  'defterdar',
  'kazasker',
  'nisanci',
  'beylerbeyRumelia',
  'beylerbeyAnatolia',
  'janissaryAgha',
  'kapudanPasha',
  'seyhulislam',
];

/** Who can present a dilemma: a Divan minister or a palace figure. */
export type Presenter = MinisterRole | 'valide' | 'chiefEunuch' | 'sultan';

export type Difficulty = 'easy' | 'normal' | 'hard';
export type Weather = 'fair' | 'rain' | 'drought' | 'harshWinter' | 'mild';

export interface GameDate {
  year: number;
  month: number; // 1–12
}

export interface Sultan {
  name: string;
  birthYear: number;
  health: number; // 0–100
  /** 0–10 skills */
  martial: number;
  admin: number;
  piety: number;
  intrigue: number;
  reignStartTurn: number;
  historical: boolean;
}

export type Agenda =
  | 'embezzle' // skims revenue, under-reports income
  | 'peaceParty' // wants peace with Christian neighbours; may be in foreign pay
  | 'warParty' // wants campaigns; overstates enemy weakness
  | 'janissaryPatron' // shields the corps, overstates its loyalty
  | 'orthodoxy' // pushes ulema interests
  | 'princeFaction' // backs a particular prince
  | 'loyal'; // honest servant

export interface Minister {
  role: MinisterRole;
  name: string;
  faction: FactionId;
  personality: string;
  agenda: Agenda;
  /** Prince id when agenda === 'princeFaction'; foreign power when on someone's payroll. */
  agendaTarget?: string;
  honesty: number; // 0–100; low honesty → larger distortions in reports
  competence: number; // 0–10
  loyalty: number; // 0–100, personal loyalty to the Sultan
  historical: boolean;
  appointedTurn: number;
}

export interface Province {
  id: string;
  name: string;
  region: 'rumelia' | 'anatolia' | 'frontier';
  owner: Owner;
  loyalty: number; // 0–100 (only meaningful when Ottoman)
  prosperity: number; // 0–100
  garrison: number; // men
  walls: number; // 0–100 fortification strength
  /** tax base, akçe per year at prosperity 100 */
  landTax: number;
  customs: number;
  /** non-Muslim households liable to cizye */
  christianHouseholds: number;
  /** timariot cavalry the province can field when Ottoman */
  timarCavalry: number;
  coastal: boolean;
  adjacent: string[];
  /** march months from Edirne for a full army with artillery */
  travelMonths: number;
}

export type Relation = 'war' | 'truce' | 'peace' | 'tributary' | 'vassal' | 'none';

export interface Neighbour {
  id: NeighbourId;
  name: string;
  ruler: string;
  stance: number; // -100 hostile … +100 friendly
  relation: Relation;
  truceUntilTurn: number;
  /** tribute *they* pay us per year (akçe) */
  tributeToUs: number;
  /** tribute *we* pay them per year */
  tributeFromUs: number;
  fieldArmy: number; // men available for a field army
  quality: number; // per-man combat multiplier
  aggression: number; // 0–10
  navy: number; // galleys
  /** strength recovery per month */
  recovery: number;
  maxArmy: number;
}

export interface Army {
  janissaries: number;
  /** six divisions of the Porte cavalry (altı bölük / kapıkulu sipahileri) */
  palaceCavalry: number;
  /** timariot sipahis available per province (dynamic, reduced by losses, recovers) */
  timariots: Record<string, number>;
  artillery: { guns: number; bombards: number; quality: number };
  fleet: { galleys: number; transports: number };
  /** acemi oğlan cadets in training (devşirme), with their graduation turn */
  cadets: { count: number; readyTurn: number }[];
}

export type CampaignPhase = 'mustering' | 'marching' | 'besieging' | 'returning';

export interface Campaign {
  id: string;
  target: string; // province id
  warId: string;
  phase: CampaignPhase;
  monthsLeftInPhase: number;
  janissaries: number;
  palaceCavalry: number;
  timariots: number;
  guns: number;
  bombards: number;
  fleet: number;
  morale: number; // 0–100
  /** months of provisions carried */
  supply: number;
  ledBySultan: boolean;
  assaultThreshold: number; // breach % at which the army storms automatically
  startedTurn: number;
  winterQuarters: boolean;
}

export interface Siege {
  id: string;
  province: string;
  attacker: Owner;
  defender: Owner;
  breach: number; // 0–100
  defenders: number;
  defenderSupply: number; // months
  defenderMorale: number;
  months: number;
  assaultsFailed: number;
  /** attacker men (for enemy sieges of Ottoman forts; player sieges read the campaign) */
  attackers: number;
  attackerGuns: number;
}

export interface War {
  id: string;
  enemies: NeighbourId[];
  casusBelli: string;
  startedTurn: number;
  /** -100 (we are losing badly) … +100 (crushing victory) */
  score: number;
  declaredByUs: boolean;
}

export interface Treaty {
  id: string;
  with: NeighbourId;
  kind: 'truce' | 'peace' | 'tribute' | 'vassalage' | 'capitulation' | 'alliance';
  signedTurn: number;
  expiresTurn: number | null;
  terms: string;
}

export interface Law {
  id: string;
  name: string;
  enactedTurn: number;
}

export interface Project {
  id: string; // library id
  instanceId: string;
  name: string;
  province: string;
  costPerMonth: number;
  monthsLeft: number;
  started: number;
}

export interface Prince {
  id: string;
  name: string;
  birthYear: number;
  motherId: string | null;
  province: string | null; // sancak appointment
  household: number; // 0–100 strength of his household/following
  ambition: number; // 0–100
  ability: number; // 0–10
  alive: boolean;
  /** brothers/uncles of the reigning Sultan are claimants, sons are heirs */
  relation: 'son' | 'brother' | 'uncle' | 'pretender';
  historical: boolean;
  /** held hostage/abroad by a foreign power (e.g. Orhan in Constantinople, Cem later) */
  heldBy?: NeighbourId;
}

export interface Consort {
  id: string;
  name: string;
  origin: string;
  influence: number; // 0–100
  alive: boolean;
  historical: boolean;
}

export interface Dynasty {
  valide: { name: string; influence: number; alive: boolean; note: string } | null;
  consorts: Consort[];
  princes: Prince[];
  chiefEunuch: { name: string; title: string; loyalty: number; competence: number };
  fratricideLaw: boolean;
}

export interface Modifier {
  id: string;
  label: string;
  expiresTurn: number;
  /** additive shift to faction equilibrium */
  faction?: Partial<Record<FactionId, number>>;
  /** multiplicative shifts */
  revenueMult?: number;
  customsMult?: number;
  grainSupplyMult?: number;
  plague?: boolean;
  province?: string;
}

export interface ScheduledItem {
  id: string;
  dueTurn: number;
  kind: 'event' | 'effect';
  ref: string; // event id or effect id
  data?: Record<string, string | number | boolean>;
  note: string;
}

export interface PendingDilemma {
  id: string;
  eventId: string;
  title: string;
  presenter: Presenter;
  presenterName: string;
  /** engine facts for the LLM */
  brief: string;
  options: { id: string; label: string; summary: string; available: boolean }[];
  defaultOptionId: string;
  context: Record<string, string | number | boolean>;
  turn: number;
}

export interface LogEntry {
  turn: number;
  date: GameDate;
  kind:
    | 'economy'
    | 'war'
    | 'siege'
    | 'battle'
    | 'diplomacy'
    | 'dynasty'
    | 'court'
    | 'event'
    | 'decision'
    | 'disaster'
    | 'law'
    | 'construction'
    | 'system'
    | 'military';
  text: string;
}

export interface BudgetLine {
  key: string;
  label: string;
  amount: number; // akçe per month
}

export interface Budget {
  revenue: BudgetLine[];
  expenses: BudgetLine[];
  totalRevenue: number;
  totalExpenses: number;
  net: number;
}

export interface GrainReport {
  stockStart: number;
  supplied: number;
  consumed: number;
  bought: number;
  stockEnd: number;
  pricePerKile: number;
  monthsCover: number;
  shortage: boolean;
}

export interface MonthReport {
  turn: number;
  date: GameDate; // the month just resolved
  weather: Weather;
  budget: Budget;
  treasuryStart: number;
  treasuryEnd: number;
  arrears: number;
  grain: GrainReport;
  factionDeltas: Record<FactionId, number>;
  actionsApplied: string[];
  actionsRejected: { action: string; reason: string }[];
  decisions: { dilemma: string; option: string; byDefault: boolean }[];
  /** chronological facts for the narrator */
  facts: string[];
}

export type GameStatus = 'active' | 'dead' | 'deposed' | 'lost';

export interface GameState {
  version: 1;
  seed: number;
  rngState: number;
  turn: number;
  date: GameDate;
  difficulty: Difficulty;
  scenario: string;
  capital: string;
  weather: Weather;
  sultan: Sultan;
  treasury: number;
  /** unpaid salaries owed to the kapıkulu, akçe */
  arrears: number;
  coinage: { silverGrams: number; debasements: number; lastDebasementTurn: number };
  taxes: { cizyePerHousehold: number; customsRate: number };
  grain: { stock: number; population: number };
  army: Army;
  provinces: Record<string, Province>;
  /** current loyalty 0–100 */
  factions: Record<FactionId, number>;
  neighbours: Record<NeighbourId, Neighbour>;
  ministers: Record<MinisterRole, Minister>;
  dynasty: Dynasty;
  wars: War[];
  sieges: Siege[];
  campaign: Campaign | null;
  treaties: Treaty[];
  laws: Law[];
  projects: Project[];
  modifiers: Modifier[];
  pendingDilemmas: PendingDilemma[];
  scheduled: ScheduledItem[];
  /** event id → last turn fired */
  eventHistory: Record<string, number>;
  flags: Record<string, number | boolean | string>;
  log: LogEntry[];
  lastReport: MonthReport | null;
  status: GameStatus;
  statusReason: string | null;
  idCounter: number;
}
