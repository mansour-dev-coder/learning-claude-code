// One Claude tool per engine Action. The model "issues orders" by calling these tools; the engine is the
// only thing that can apply them. Schemas are static (province, power, law… ids are fixed lists) so the
// tool block never changes between requests and stays in the prompt cache.
//
// Every tool is `strict: true` (schema-valid arguments guaranteed by the API) AND every call is re-validated
// here, because guarantees upstream are not a substitute for checking input at the trust boundary.
import type Anthropic from '@anthropic-ai/sdk';
import type { Action } from '../engine/actions';
import { BASE_PROVINCES } from '../engine/data/provinces';
import { LAWS } from '../engine/data/laws';
import { PROJECTS } from '../engine/data/projects';
import { MINISTER_ROLES } from '../engine/types';

type Prop =
  | { kind: 'string'; description: string; enum?: readonly string[] }
  | { kind: 'integer'; description: string; enum?: readonly number[] }
  | { kind: 'boolean'; description: string }
  | { kind: 'stringArray'; description: string; enum: readonly string[] };

interface Spec {
  type: Action['type'];
  description: string;
  props?: Record<string, Prop & { optional?: boolean }>;
}

const PROVINCES = BASE_PROVINCES.map((p) => p.id);
const POWERS = ['hungary', 'venice', 'papacy', 'serbia', 'wallachia', 'byzantium', 'karaman', 'mamluks', 'aqqoyunlu', 'albania'] as const;
const TERMS = ['whitePeace', 'tribute', 'vassalage', 'cession', 'cessionResettle', 'payTribute'] as const;

const prov = (d: string): Prop => ({ kind: 'string', description: d, enum: PROVINCES });
const power = (d: string): Prop => ({ kind: 'string', description: d, enum: POWERS });

export const ACTION_SPECS: Spec[] = [
  { type: 'resolveDilemma', description: 'Answer one of this month’s Divan dilemmas by choosing one of its listed options. Use the dilemma id and option id exactly as given in the context.', props: { dilemmaId: { kind: 'string', description: 'Dilemma id from the context, e.g. "plague@4"' }, optionId: { kind: 'string', description: 'Option id from that dilemma' } } },
  { type: 'setTax', description: 'Change the cizye (akçe per non-Muslim household per year, 10–120) or the customs rate (percent, 1–12).', props: { tax: { kind: 'string', description: 'Which tax', enum: ['cizye', 'customs'] }, value: { kind: 'integer', description: 'New rate' } } },
  { type: 'debaseCoinage', description: 'Re-mint the akçe with less silver for a one-off profit. Angers the Janissaries and merchants.', props: { percent: { kind: 'integer', description: 'Reduction in silver content', enum: [5, 10] } } },
  { type: 'payArrears', description: 'Pay as much of the overdue kapıkulu salaries as the treasury allows.' },
  { type: 'grantDonative', description: 'A cash gift to every Janissary and Porte cavalryman.', props: { akcePerMan: { kind: 'integer', description: 'Akçe per man (1–2000; 250 customary, 500 generous)' } } },
  { type: 'buyGrain', description: 'Buy grain for the capital at market price.', props: { kile: { kind: 'integer', description: 'Quantity in Istanbul kile (~25.6 kg each)' } } },
  { type: 'declareWar', description: 'Declare war on a foreign power. Required before campaigning against it.', props: { target: power('The power'), casusBelli: { kind: 'string', description: 'The stated justification, in a few words' } } },
  {
    type: 'startCampaign',
    description: 'Raise the imperial army and march on an enemy province (or relieve a besieged one of ours). Only one army can be in the field.',
    props: {
      target: prov('Target province id'),
      regions: { kind: 'stringArray', description: 'Which timariot levies to summon; default: the region nearest the target', enum: ['rumelia', 'anatolia'], optional: true },
      artillery: { kind: 'boolean', description: 'Bring the siege train (default true)', optional: true },
      fleet: { kind: 'boolean', description: 'Send the fleet in support (coastal targets)', optional: true },
      ledBySultan: { kind: 'boolean', description: 'Does the Sultan lead in person (default true)', optional: true },
      assaultThreshold: { kind: 'integer', description: 'Storm automatically when the breach reaches this percent (default 60)', optional: true },
    },
  },
  { type: 'orderAssault', description: 'Order a general assault on the city now under siege, this month.' },
  { type: 'liftSiege', description: 'Abandon the current siege and bring the army home.' },
  { type: 'winterInField', description: 'Keep the army in the field through winter (true) or let it come home in November (false).', props: { value: { kind: 'boolean', description: 'Winter in the field?' } } },
  { type: 'offerPeace', description: 'Offer peace terms to an enemy we are at war with. cession/cessionResettle need the province they would cede.', props: { target: power('The enemy'), terms: { kind: 'string', description: 'Terms', enum: TERMS }, province: { ...prov('Province demanded, for cession terms'), optional: true } } },
  { type: 'castCannon', description: 'Cast new artillery at the foundry.', props: { guns: { kind: 'integer', description: 'Ordinary siege guns (6,000 akçe each)', optional: true }, bombards: { kind: 'integer', description: 'Great bombards (60,000 akçe each; needs a master founder or tophane)', optional: true } } },
  { type: 'buildGalleys', description: 'Build galleys at Gelibolu (80,000 akçe each).', props: { count: { kind: 'integer', description: 'Number of galleys (1–100)' } } },
  { type: 'devsirme', description: 'Levy Christian boys to train as Janissaries (ready in ~5 years). Angers the Christian millets.', props: { boys: { kind: 'integer', description: 'Number of boys (1–5000)' } } },
  { type: 'reinforceGarrison', description: 'Recruit azaps to strengthen a province’s garrison (150 akçe bounty each).', props: { province: prov('Ottoman province id'), men: { kind: 'integer', description: 'Men to add' } } },
  { type: 'enactLaw', description: 'Enact a law or reform from the law library.', props: { lawId: { kind: 'string', description: 'Law id', enum: LAWS.map((l) => l.id) } } },
  { type: 'repealLaw', description: 'Repeal a law in force.', props: { lawId: { kind: 'string', description: 'Law id', enum: LAWS.map((l) => l.id) } } },
  { type: 'startProject', description: 'Begin a construction or waqf project in an Ottoman province.', props: { projectId: { kind: 'string', description: 'Project id', enum: PROJECTS.map((p) => p.id) }, province: prov('Where to build') } },
  { type: 'appointPrince', description: 'Send a prince to govern a sancak, or omit the province to recall him to the palace.', props: { princeId: { kind: 'string', description: 'Prince id from the context' }, province: { ...prov('Sancak to govern; omit to recall'), optional: true } } },
  { type: 'executePrince', description: 'Order the execution of a prince (the fratricide question).', props: { princeId: { kind: 'string', description: 'Prince id from the context' } } },
  { type: 'dismissMinister', description: 'Dismiss a minister (optionally executing him and seizing his wealth); a successor is appointed.', props: { role: { kind: 'string', description: 'Office', enum: MINISTER_ROLES }, execute: { kind: 'boolean', description: 'Execute rather than merely dismiss', optional: true } } },
  { type: 'audit', description: 'Order a secret audit of the treasury registers (60,000 akçe). Reveals whether the Defterdar is skimming.' },
  { type: 'sendEmbassy', description: 'Send an embassy with gifts to improve relations with a power.', props: { target: power('The power'), gift: { kind: 'integer', description: 'Value of gifts in akçe' } } },
  { type: 'grantTimars', description: 'Convert crown land in a province into timars: less cash revenue, more sipahi cavalry.', props: { province: prov('Ottoman province id') } },
];

const SPEC_BY_TYPE = new Map(ACTION_SPECS.map((s) => [s.type, s]));

function jsonProp(p: Prop): Record<string, unknown> {
  switch (p.kind) {
    case 'string':
      return { type: 'string', description: p.description, ...(p.enum ? { enum: [...p.enum] } : {}) };
    case 'integer':
      return { type: 'integer', description: p.description, ...(p.enum ? { enum: [...p.enum] } : {}) };
    case 'boolean':
      return { type: 'boolean', description: p.description };
    case 'stringArray':
      return { type: 'array', description: p.description, items: { type: 'string', enum: [...p.enum] } };
  }
}

/** Tool definitions for the Messages API, in a fixed order (cache-stable). */
export const ACTION_TOOLS: Anthropic.Beta.BetaTool[] = ACTION_SPECS.map((s) => {
  const props = s.props ?? {};
  return {
    name: s.type,
    description: s.description,
    strict: true,
    input_schema: {
      type: 'object',
      properties: Object.fromEntries(Object.entries(props).map(([k, p]) => [k, jsonProp(p)])),
      required: Object.entries(props).filter(([, p]) => !p.optional).map(([k]) => k),
      additionalProperties: false,
    },
  };
});

/** Validate one tool call from the model and turn it into an engine Action. Never throws. */
export function toolCallToAction(name: string, input: unknown): { ok: true; action: Action } | { ok: false; error: string } {
  const spec = SPEC_BY_TYPE.get(name as Action['type']);
  if (!spec) return { ok: false, error: `unknown order "${name}"` };
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { ok: false, error: 'arguments must be an object' };
  const args = input as Record<string, unknown>;
  const props = spec.props ?? {};
  for (const key of Object.keys(args)) if (!(key in props)) return { ok: false, error: `unexpected argument "${key}"` };
  for (const [key, p] of Object.entries(props)) {
    const v = args[key];
    if (v === undefined || v === null) {
      if (!p.optional) return { ok: false, error: `missing argument "${key}"` };
      delete args[key];
      continue;
    }
    switch (p.kind) {
      case 'string':
        if (typeof v !== 'string' || v.length > 200) return { ok: false, error: `"${key}" must be a short string` };
        if (p.enum && !p.enum.includes(v)) return { ok: false, error: `"${key}" must be one of ${p.enum.join(', ')}` };
        break;
      case 'integer':
        if (typeof v !== 'number' || !Number.isInteger(v)) return { ok: false, error: `"${key}" must be an integer` };
        if (p.enum && !p.enum.includes(v)) return { ok: false, error: `"${key}" must be one of ${p.enum.join(', ')}` };
        break;
      case 'boolean':
        if (typeof v !== 'boolean') return { ok: false, error: `"${key}" must be true or false` };
        break;
      case 'stringArray':
        if (!Array.isArray(v) || !v.every((x) => typeof x === 'string' && p.enum.includes(x))) return { ok: false, error: `"${key}" must be a list of ${p.enum.join(', ')}` };
        break;
    }
  }
  const action = { type: spec.type, ...args } as Action;
  if (action.type === 'appointPrince' && action.province === undefined) (action as { province: string | null }).province = null;
  return { ok: true, action };
}
