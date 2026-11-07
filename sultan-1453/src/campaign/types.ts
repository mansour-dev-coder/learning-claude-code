// Campaign layer: missions wrap the engine. A mission builds a starting GameState, watches each resolved
// month, and decides win/loss and stars. It never changes the engine's rules; its only levers are the
// starting state, scripted historical events between months, and capability locks (state.flags.lock*).
import type { GameState, MonthReport } from '../engine/types';

/** Capabilities unlocked by mission rewards. */
export type Capability =
  | 'corpsLoyalty' // M1: the corps remembers its accession gift (+loyalty at the start of later missions)
  | 'bombards' // M2: Orban's great bombards
  | 'fleet' // M3: the imperial fleet programme
  | 'topkapi' // M3: the court moves to Topkapı
  | 'sandbox' // M3: free play
  | 'silver' // M4: the Serbian silver mines
  | 'navalInvasion' // M5: seaborne invasion
  | 'blackSea' // M6
  | 'mountainWar' // M7
  | 'fieldArtillery' // M8
  | 'conqueror'; // M9

export interface Objective {
  /** short, for the HUD */
  text: string;
  /** called after every resolved month */
  check: (s: GameState, run: MissionRun) => { met: boolean; progress: string };
}

export interface MissionDef {
  id: string;
  index: number; // 1-based
  title: string;
  year: number;
  /** province the mission map points at */
  focus: string;
  briefing: string;
  objective: Objective;
  /** months allowed; the mission fails when they run out */
  limit: number;
  /** finish within this many months for the second star */
  par: number;
  bonus: { text: string; check: (s: GameState, run: MissionRun) => boolean };
  reward: { text: string; unlocks: Capability[] };
  /** stub missions are listed but not yet playable */
  stub?: { reason: string };
  /** builds the starting state */
  start?: (seed: number, unlocked: Set<Capability>) => GameState;
  /** scripted history between months (e.g. Karaman rising in 1451). May mutate the state it is given. */
  script?: (s: GameState, run: MissionRun) => string[];
  /** cinematic shown when the mission ends */
  cinematic?: 'bosporus' | 'constantinople';
  tutorial?: boolean;
}

export interface MissionRun {
  missionId: string;
  startTurn: number;
  months: number;
  startTreasury: number;
  spent: number;
  losses: number;
  /** notable facts, for the results screen */
  highlights: string[];
  /** booleans a bonus may track across months */
  marks: Record<string, boolean | number>;
  status: 'active' | 'won' | 'lost';
  reason: string | null;
}

export interface MissionResult {
  missionId: string;
  won: boolean;
  stars: number; // 0–3
  months: number;
  spent: number;
  losses: number;
  highlights: string[];
  reason: string;
  treasuryStart: number;
  treasuryEnd: number;
  bonusMet: boolean;
  underPar: boolean;
  rewardText: string | null;
}

export interface CampaignProgress {
  version: 1;
  results: Record<string, { stars: number; months: number; won: boolean }>;
  unlocked: Capability[];
}

export type { GameState, MonthReport };
