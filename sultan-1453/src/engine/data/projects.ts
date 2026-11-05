import type { FactionId } from '../types';

export interface ProjectDef {
  id: string;
  name: string;
  totalCost: number;
  months: number;
  /** province must satisfy */
  where: 'any' | 'capital' | 'coastal' | 'bosporus';
  onComplete: {
    factionShift?: Partial<Record<FactionId, number>>;
    prosperity?: number;
    loyalty?: number;
    walls?: number;
    customsMult?: number; // province customs multiplier
    flag?: string;
  };
  description: string;
}

export const PROJECTS: ProjectDef[] = [
  { id: 'rumeliHisari', name: 'Rumeli Hisarı (Boğazkesen, “the Throat-Cutter”)', totalCost: 3_000_000, months: 5, where: 'bosporus', onComplete: { flag: 'bosporusFortress' }, description: 'Fortress on the European shore of the Bosporus; cuts Black Sea supply to Constantinople.' },
  { id: 'kulliye', name: 'Imperial mosque complex (külliye)', totalCost: 6_000_000, months: 24, where: 'any', onComplete: { factionShift: { ulema: 10, merchants: 3 }, prosperity: 6, loyalty: 6 }, description: 'Mosque, medrese, hospital, imaret and bath, endowed as a waqf.' },
  { id: 'bedesten', name: 'Bedesten (covered market)', totalCost: 1_500_000, months: 10, where: 'any', onComplete: { factionShift: { merchants: 5 }, customsMult: 1.2, prosperity: 3 }, description: 'Lockable stone market hall for valuable goods; anchors a commercial district.' },
  { id: 'caravanserai', name: 'Caravanserai on the trade road', totalCost: 800_000, months: 6, where: 'any', onComplete: { customsMult: 1.1, prosperity: 3 }, description: 'Fortified inn for caravans.' },
  { id: 'imaret', name: 'Imaret (public kitchen)', totalCost: 600_000, months: 6, where: 'any', onComplete: { factionShift: { ulema: 3 }, loyalty: 10 }, description: 'Feeds students, travellers and the poor.' },
  { id: 'fortress', name: 'Rebuild the fortress walls', totalCost: 1_000_000, months: 6, where: 'any', onComplete: { walls: 15 }, description: 'Thicker walls, new towers, a dry ditch.' },
  { id: 'tersane', name: 'Naval arsenal (tersane)', totalCost: 3_000_000, months: 12, where: 'coastal', onComplete: { flag: 'arsenal' }, description: 'Slipways and stores; galleys become a third cheaper to build.' },
  { id: 'tophane', name: 'Cannon foundry (tophane)', totalCost: 2_000_000, months: 8, where: 'capital', onComplete: { flag: 'foundry' }, description: 'Permanent foundry; better guns, cheaper casting.' },
  { id: 'medrese', name: 'Medrese college', totalCost: 1_200_000, months: 12, where: 'any', onComplete: { factionShift: { ulema: 5 }, loyalty: 3 }, description: 'Trains kadıs and müderris for the judiciary.' },
];

export const PROJECT_BY_ID: Record<string, ProjectDef> = Object.fromEntries(PROJECTS.map((p) => [p.id, p]));
