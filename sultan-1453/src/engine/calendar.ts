import type { GameDate, Weather } from './types';
import type { Rng } from './rng';

export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function fmtDate(d: GameDate): string {
  return `${MONTH_NAMES[d.month - 1]} ${d.year}`;
}

export function nextDate(d: GameDate): GameDate {
  return d.month === 12 ? { year: d.year + 1, month: 1 } : { year: d.year, month: d.month + 1 };
}

/** Campaign season: April–October (between Hıdrellez and Kasım in the Ottoman agrarian calendar). */
export function inCampaignSeason(d: GameDate): boolean {
  return d.month >= 4 && d.month <= 10;
}

export function isWinter(d: GameDate): boolean {
  return d.month === 12 || d.month <= 2;
}

/** Harvest months deliver the bulk of the year's grain to the capital. */
export function harvestShare(month: number): number {
  // fraction of annual grain deliveries arriving each month (sums to 1)
  const shares = [0.04, 0.03, 0.03, 0.04, 0.05, 0.10, 0.20, 0.18, 0.12, 0.08, 0.07, 0.06];
  return shares[month - 1];
}

export function rollWeather(d: GameDate, rng: Rng): Weather {
  const r = rng.next();
  if (isWinter(d)) return r < 0.2 ? 'harshWinter' : r < 0.75 ? 'mild' : 'rain';
  if (d.month >= 6 && d.month <= 8) return r < 0.12 ? 'drought' : r < 0.85 ? 'fair' : 'rain';
  return r < 0.65 ? 'fair' : r < 0.95 ? 'rain' : 'drought';
}
