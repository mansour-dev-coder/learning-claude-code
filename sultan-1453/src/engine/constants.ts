// Tunable numbers. Reasoning and sources for each are in docs/economy.md.
import type { Difficulty } from './types';

export const C = {
  /** average daily pay of a Janissary in akçe (cadets 1–2, veterans 5–8) */
  janissaryDailyPay: 3.5,
  /** average daily pay of a Porte cavalryman (sipahi oğlanları, silahdars) */
  palaceCavalryDailyPay: 12,
  /** daily pay of a fortress garrison soldier (azap, mustahfız) */
  garrisonDailyPay: 1.5,
  /** monthly upkeep per galley laid up / at sea */
  galleyUpkeepIdle: 2500,
  galleyUpkeepActive: 9000,
  gunUpkeep: 400,
  bombardUpkeep: 1500,
  /** base court cost per month: palace, harem, chancery salaries paid in cash */
  courtBase: 450_000,
  princeHousehold: 25_000,
  /** campaign provisioning per man per month, beyond normal pay (kapıkulu only; timariots self-supply) */
  campaignCostPerKapikulu: 40,
  campaignCostPerTimariot: 6,
  campaignCostPerGun: 600,
  /** grain */
  kilePerPersonMonth: 0.65,
  baseGrainPrice: 6, // akçe per Istanbul kile (~25.6 kg) of wheat
  /** cast a siege gun / a great bombard */
  gunCastCost: 6_000,
  bombardCastCost: 60_000,
  galleyBuildCost: 80_000,
  /** devşirme yields, cost per boy (collection, transport, Turkish farm placement) */
  devsirmeCostPerBoy: 400,
  cadetTrainingTurns: 60,
  /** silver grams in one akçe at game start (1451 ≈ 0.98 g; 1421 ≈ 1.15 g) */
  akceSilverGrams1451: 0.98,
  akcePerDucat1451: 45,
  /** faction drift: share of gap to equilibrium closed per month */
  loyaltyReversion: 0.12,
} as const;

export const DIFFICULTY: Record<Difficulty, { revenue: number; enemyArmy: number; loyalty: number; eventSeverity: number }> = {
  easy: { revenue: 1.15, enemyArmy: 0.85, loyalty: 6, eventSeverity: 0.8 },
  normal: { revenue: 1.0, enemyArmy: 1.0, loyalty: 0, eventSeverity: 1.0 },
  hard: { revenue: 0.88, enemyArmy: 1.15, loyalty: -6, eventSeverity: 1.25 },
};
