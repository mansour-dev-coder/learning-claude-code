import type { GameState, Presenter } from '../types';
import type { TurnCtx } from '../state';

export type EventContext = Record<string, string | number | boolean>;

export interface OptionDef {
  id: string;
  label: string;
  /** tradeoffs as the presenting minister would frame them (fed to the LLM) */
  summary: string | ((s: GameState, c: EventContext) => string);
  available?: (s: GameState, c: EventContext) => boolean;
  apply: (ctx: TurnCtx, c: EventContext) => void;
}

export interface EventDef {
  id: string;
  title: string;
  category: 'economy' | 'military' | 'diplomacy' | 'dynasty' | 'religion' | 'disaster' | 'court';
  presenter: Presenter | ((s: GameState, c: EventContext) => Presenter);
  /** months before it may fire again */
  cooldown: number;
  unique?: boolean;
  /** only fires when scheduled by another effect */
  forcedOnly?: boolean;
  condition: (s: GameState) => boolean;
  weight: number | ((s: GameState) => number);
  /** choose the specifics (which province, which neighbour). Return null to skip. */
  prepare?: (s: GameState, rng: import('../rng').Rng) => EventContext | null;
  brief: (s: GameState, c: EventContext) => string;
  options: OptionDef[];
  /** applied if the Sultan ignores the dilemma */
  defaultOption: string;
}
