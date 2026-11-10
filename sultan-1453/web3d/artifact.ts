// Artifact build of the 3D client: Claude through the page's `sample` capability (the viewer's own account),
// saves in the viewer's private artifact storage with a local fallback.
import { mountGame } from '../src/client3d/app';
import { offlineOracle, plainChronicle, localStore, type Oracle, type SaveGame, type Storage3D } from '../src/client3d/oracle';
import { narrationInput } from '../src/llm/sheets';
import { ordersSheet } from '../src/llm/context';
import { ACTION_SPECS, toolCallToAction } from '../src/llm/actionTools';
import { auditNarration } from '../src/llm/audit';
import { describeAction, type Action } from '../src/engine/actions';
import GM from '../src/llm/prompts/game_master.md';
import MINISTERS from '../src/llm/prompts/ministers.md';
import PARSER from '../src/llm/prompts/parser.md';
import AUDIENCE from '../src/llm/prompts/audience.md';
import { audienceBrief, audienceInput } from '../src/llm/converse';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const claude: any;
const MODEL = 'claude-sonnet-5-5';
const WEB = `\n\nTHIS EDITION: the screen shows each dilemma's options as buttons in a Divan panel, so do NOT write the lettered option lists. Under "### The Divan", give each presenting minister's speech in one short paragraph (bold name and title first), then move on.`;

function catalogue() {
  return ACTION_SPECS.map((sp) => {
    const args = Object.entries(sp.props ?? {}).map(([k, p]: [string, any]) => `${k}${p.optional ? '?' : ''}: ${p.kind}${p.enum && p.enum.length <= 12 ? ` one of ${p.enum.join('|')}` : ''}`);
    return `- ${sp.type}(${args.join(', ')}): ${sp.description}`;
  }).join('\n');
}

function sampleOracle(sample: any): Oracle {
  return {
    online: true,
    async narrate(state, chronicle, onText) {
      const input = `${GM}\n\n${MINISTERS}${WEB}\n\n=====\n\n${narrationInput(state, chronicle)}`;
      try {
        const { text } = await sample(input, { model: MODEL, modelTier: 'default', effort: 'medium', cache: false, onText: ({ text }: { text: string }) => onText(text) });
        return { text, warnings: auditNarration(text, [input]) };
      } catch (e: any) {
        return { text: plainChronicle(state), warnings: [e?.code === 'not_granted' ? 'Claude was not allowed for this page; the plain chronicle is shown.' : `The chronicler is unavailable (${e?.code ?? 'error'}); the plain chronicle is shown.`] };
      }
    },
    async parse(state, text, pending: Action[]) {
      const prompt = `${PARSER}\n\nTHIS EDITION: you do not call tools. Reply with ONLY a JSON object: {"orders": [{"type": "<order name>", "args": {...}}], "reply": "<one short line>"}. Use an empty orders list when you need to ask. Orders (args marked ? are optional):\n${catalogue()}\n\n${ordersSheet(state)}${pending.length ? `\nORDERS ALREADY RECORDED THIS MONTH (do not repeat them): ${pending.map(describeAction).join('; ')}` : ''}\n\nTHE SULTAN SAYS:\n"""${text.slice(0, 4000)}"""`;
      try {
        const res: any = await sample.json(prompt, { model: MODEL, modelTier: 'default', effort: 'low', cache: false });
        const actions: Action[] = [];
        const bad: string[] = [];
        for (const o of Array.isArray(res?.orders) ? res.orders : []) {
          const r = toolCallToAction(String(o?.type), o?.args ?? {});
          if (r.ok) actions.push(r.action); else bad.push(`✗ ${o?.type}: ${r.error}`);
        }
        return { actions, reply: [typeof res?.reply === 'string' ? res.reply : '', ...bad].filter(Boolean).join(' ') };
      } catch (e: any) {
        return { actions: [], reply: e?.code === 'invalid_json' ? 'The secretary could not make that out. Rephrase, or use the Divan buttons.' : `The secretary is unavailable (${e?.code ?? 'error'}).` };
      }
    },
    async converse(state, speaker, history, text, onText) {
      const input = `${AUDIENCE}\n\n${MINISTERS}\n\n=====\n\n${audienceBrief(state, speaker)}\n\n=====\n\n${audienceInput(history, text)}`;
      try {
        const { text: out } = await sample(input, { model: MODEL, modelTier: 'default', effort: 'low', cache: false, onText: ({ text: t }: { text: string }) => onText(t) });
        return String(out).trim();
      } catch { return null; }
    },
  };
}

function dbStore(db: any, uid: string | null): Storage3D {
  const local = localStore();
  const path = uid ? `data/users/${uid}/save3d` : null;
  return {
    async load() {
      if (db && path) {
        try { const snap = await db.doc(path).get(); const json = snap?.exists ? snap.data?.json : undefined; if (json) return JSON.parse(json); } catch { /* fall back */ }
      }
      return local.load();
    },
    async save(g: SaveGame) {
      await local.save(g);
      if (db && path) {
        try { await db.doc(path).set({ json: JSON.stringify({ ...g, chronicle: g.chronicle.slice(-2) }) }); return 'Saved to your account'; } catch { /* local only */ }
      }
      return 'Saved on this device';
    },
    async loadProgress() {
      if (db && uid) {
        try { const snap = await db.doc(`data/users/${uid}/campaign`).get(); const json = snap?.exists ? snap.data?.json : undefined; if (json) return JSON.parse(json); } catch { /* fall back */ }
      }
      return local.loadProgress!();
    },
    async saveProgress(p) {
      await local.saveProgress!(p);
      if (db && uid) { try { await db.doc(`data/users/${uid}/campaign`).set({ json: JSON.stringify(p) }); } catch { /* local only */ } }
    },
  };
}

const root = document.getElementById('game')!;
const hot = (window as any).claude?.hot;
let latest: SaveGame | undefined;
hot?.snapshot?.(() => (latest ? { game: latest } : {}));

let storage: Storage3D = localStore();
const app = mountGame(root, {
  oracle: offlineOracle,
  storage: { load: () => storage.load(), save: (g) => storage.save(g), loadProgress: () => storage.loadProgress!(), saveProgress: (p) => storage.saveProgress!(p) },
  resume: hot?.data?.game,
  onChange: (g) => { latest = g; },
});

(window as any).__sultan = app;

(async () => {
  if (typeof claude === 'undefined' || !claude?.use) return;
  const [sample, db, user] = await Promise.all([claude.use('sample'), claude.use('db'), claude.use('user')]);
  let uid: string | null = null;
  try { uid = (await user?.id?.()) ?? null; } catch { uid = null; }
  storage = dbStore(db, uid);
  void app.reloadProgress();
  if (sample) app.setOracle(sampleOracle(sample));
})();
