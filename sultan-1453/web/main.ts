// Browser edition of Sultan: 1453. Same engine; Claude reached through the artifact's `sample` capability
// (the viewer's own Claude account), saves through the `db` capability with a local fallback.
import { createGame, resolveTurn, succeed, Rng, FACTIONS, type Action, type GameState } from '../src/engine';
import { fmtDate } from '../src/engine/calendar';
import { reportedView } from '../src/engine/intel';
import { grainConsumption } from '../src/engine/economy';
import { describeAction } from '../src/engine/actions';
import { fmtAkce, livingPrinces, ottomanProvinces, princeAge, sultanAge, type TurnCtx } from '../src/engine/state';
import { narrationInput, plainNarration } from '../src/llm/sheets';
import { ordersSheet, LETTERS } from '../src/llm/context';
import { parseShortcuts, previewOrders } from '../src/llm/orders';
import { ACTION_SPECS, toolCallToAction } from '../src/llm/actionTools';
import { auditNarration } from '../src/llm/audit';
import GM from '../src/llm/prompts/game_master.md';
import MINISTERS from '../src/llm/prompts/ministers.md';
import PARSER from '../src/llm/prompts/parser.md';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sample = any;
declare const claude: any;

const MODEL = 'claude-sonnet-5-5';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

interface Save { state: GameState; orders: Action[]; chronicle: string[]; narration: string; warnings: string[] }
let game: Save | null = null;
let sample: Sample = null;
let db: any = null;
let uid: string | null = null;
let busy = false;

// ── persistence ─────────────────────────────────────────────────────────────
const LOCAL_KEY = 'sultan1453.save';
async function persist() {
  if (!game) return;
  const data = { ...game, chronicle: game.chronicle.slice(-2), savedAt: Date.now() };
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
  if (db && uid) {
    try {
      await db.doc(`data/users/${uid}/save`).set({ json: JSON.stringify(data) });
      setSaveNote('Saved to your account');
    } catch { setSaveNote('Saved on this device'); }
  } else setSaveNote('Saved on this device');
}
async function loadSave(): Promise<Save | null> {
  if (db && uid) {
    try {
      const snap = await db.doc(`data/users/${uid}/save`).get();
      const json = snap?.exists ? (snap.data as { json?: string })?.json : undefined;
      if (json) return JSON.parse(json);
    } catch { /* fall through */ }
  }
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* no storage */ }
  return null;
}
function setSaveNote(t: string) { $('saveNote').textContent = t; }

// ── tiny markdown (headings, bold, italic, strike, lists) ────────────────────
function esc(s: string) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!); }
function inline(s: string) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/~~(.+?)~~/g, '<s>$1</s>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>');
}
function md(src: string) {
  const out: string[] = [];
  let list = false;
  for (const raw of src.split('\n')) {
    const line = raw.trimEnd();
    if (/^\s*[-*] /.test(line)) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(line.replace(/^\s*[-*] /, ''))}</li>`); continue; }
    if (list) { out.push('</ul>'); list = false; }
    if (line.startsWith('### ')) out.push(`<h3>${inline(line.slice(4))}</h3>`);
    else if (line.startsWith('## ')) out.push(`<h2>${inline(line.slice(3))}</h2>`);
    else if (line.startsWith('```') || !line.trim()) continue;
    else out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('');
}

// ── Claude calls ────────────────────────────────────────────────────────────
const WEB_NARRATION = `\n\nTHIS EDITION: the page shows each dilemma's options as buttons right after your text, so do NOT write the lettered option lists. End each minister's speech naturally, then go on to the next. Keep the "### The Divan" heading and the bold presenter lines.`;

async function narrate() {
  if (!game) return;
  const s = game.state;
  const out = $('narration');
  if (!sample) {
    game.narration = plainChronicle(s);
    game.warnings = [];
    out.innerHTML = md(game.narration);
    return;
  }
  busy = true; renderControls();
  out.innerHTML = '<p class="thinking">The chronicler sharpens his reed pen…</p>';
  const input = `${GM}\n\n${MINISTERS}${WEB_NARRATION}\n\n=====\n\n${narrationInput(s, game.chronicle)}`;
  try {
    const { text } = await sample(input, {
      model: MODEL, modelTier: 'default', effort: 'medium', cache: false,
      onText: ({ text }: { text: string }) => { out.innerHTML = md(text); },
    });
    game.narration = text;
    game.chronicle = [...game.chronicle, text].slice(-2);
    game.warnings = auditNarration(text, [input]);
  } catch (e: any) {
    game.narration = plainChronicle(s);
    game.warnings = [e?.code === 'not_granted' ? 'Claude was not allowed for this page, so the plain chronicle is shown.' : `The chronicler is unavailable (${e?.code ?? 'error'}); the plain chronicle is shown.`];
    if (e?.code === 'not_granted') sample = null;
  }
  out.innerHTML = md(game.narration);
  busy = false;
}

/** The engine's own account of the month, without the Divan (the page shows dilemmas as cards). */
function plainChronicle(s: GameState) {
  const text = plainNarration(s).split('\n### The Divan')[0].trim();
  return text.includes('\n') ? text : `${text}\n\n*The Divan assembles. Your ministers await your word below.*`;
}

function orderCatalogue() {
  return ACTION_SPECS.map((sp) => {
    const args = Object.entries(sp.props ?? {}).map(([k, p]: [string, any]) => {
      const en = p.enum && p.enum.length <= 12 ? ` one of ${p.enum.join('|')}` : '';
      return `${k}${p.optional ? '?' : ''}: ${p.kind}${en}`;
    });
    return `- ${sp.type}(${args.join(', ')}): ${sp.description}`;
  }).join('\n');
}

async function interpret(text: string) {
  if (!game) return;
  const s = game.state;
  const short = parseShortcuts(s, text);
  if (short) return addOrders(short, '');
  if (!sample) { flash('Free-text orders need Claude. Use the option buttons, or type shortcuts like "1a 2c".'); return; }
  busy = true; renderControls();
  flash('The secretary records your words…');
  const prompt = `${PARSER}\n\nTHIS EDITION: you do not call tools. Instead reply with ONLY a JSON object: {"orders": [{"type": "<order name>", "args": {...}}], "reply": "<one short line>"}. Use an empty orders list when you need to ask. The available orders (args marked ? are optional):\n${orderCatalogue()}\n\n${ordersSheet(s)}${game.orders.length ? `\nORDERS ALREADY RECORDED THIS MONTH (do not repeat them): ${game.orders.map(describeAction).join('; ')}` : ''}\n\nTHE SULTAN SAYS:\n"""${text.slice(0, 4000)}"""`;
  try {
    const res: any = await sample.json(prompt, { model: MODEL, modelTier: 'default', effort: 'low', cache: false });
    const actions: Action[] = [];
    const bad: string[] = [];
    for (const o of Array.isArray(res?.orders) ? res.orders : []) {
      const r = toolCallToAction(String(o?.type), o?.args ?? {});
      if (r.ok) actions.push(r.action); else bad.push(`${o?.type}: ${r.error}`);
    }
    addOrders(actions, [typeof res?.reply === 'string' ? res.reply : '', ...bad.map((b) => `✗ ${b}`)].filter(Boolean).join(' '));
  } catch (e: any) {
    flash(e?.code === 'invalid_json' ? 'The secretary could not make that out. Try rephrasing, or use the buttons.' : `The secretary is unavailable (${e?.code ?? 'error'}). Use the option buttons.`);
  }
  busy = false; renderControls();
}

function addOrders(proposed: Action[], reply: string) {
  if (!game) return;
  for (const p of proposed) if (p.type === 'resolveDilemma') game.orders = game.orders.filter((o) => !(o.type === 'resolveDilemma' && o.dilemmaId === p.dilemmaId));
  const preview = previewOrders(game.state, [...game.orders, ...proposed]).slice(game.orders.length);
  game.orders.push(...preview.filter((p) => p.ok).map((p) => p.action));
  const lines = preview.map((p) => `${p.ok ? '✓' : '✗'} ${p.note}`);
  flash([reply, ...lines].filter(Boolean).join('\n'));
  render();
  void persist();
}

function flash(t: string) { const el = $('reply'); el.textContent = t; el.hidden = !t; }

// ── turn flow ───────────────────────────────────────────────────────────────
async function endMonth() {
  if (!game || busy) return;
  const { state, report } = resolveTurn(game.state, game.orders);
  game.state = state;
  game.orders = [];
  flash(report.actionsRejected.map((r) => `✗ ${r.reason}`).join('\n'));
  render();
  await narrate();
  render();
  void persist();
  $('narration').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function newGame() {
  const scenario = ($('scenario') as HTMLSelectElement).value as 'mehmed1451' | 'murad1421' | 'fictional';
  const difficulty = ($('difficulty') as HTMLSelectElement).value as 'normal';
  const year = Number(($('year') as HTMLInputElement).value) || 1460;
  game = { state: createGame({ scenario, difficulty, seed: Math.floor(Math.random() * 1e9), fictional: { year } }), orders: [], chronicle: [], narration: '', warnings: [] };
  showGame();
  render();
  await narrate();
  render();
  void persist();
}

function continueAsSuccessor() {
  if (!game) return;
  const ctx: TurnCtx = { s: structuredClone(game.state), rng: new Rng(game.state.rngState), facts: [] };
  if (!succeed(ctx)) return;
  ctx.s.rngState = ctx.rng.state;
  game.state = resolveTurn(ctx.s, []).state;
  game.orders = [];
  render();
  void narrate().then(() => { render(); void persist(); });
}

// ── rendering ───────────────────────────────────────────────────────────────
const hijri = (y: number) => Math.round((y - 622) * (33 / 32));
const MOOD = (v: number) => (v >= 75 ? 'devoted' : v >= 60 ? 'content' : v >= 45 ? 'uneasy' : v >= 30 ? 'resentful' : 'mutinous');
const FL: Record<string, string> = { janissaries: 'Janissaries', ulema: 'Ulema', rumelianBeys: 'Rumelian beys', anatolianBeys: 'Anatolian beys', harem: 'Harem', merchants: 'Merchants', millets: 'Christian millets' };

function render() {
  if (!game) return;
  const s = game.state;
  $('date').textContent = `${fmtDate(s.date)} · ${hijri(s.date.year)} AH`;
  $('sultan').textContent = `${s.sultan.name}, aged ${sultanAge(s)}`;
  if (game.narration && $('narration').dataset.text !== game.narration) { $('narration').innerHTML = md(game.narration); $('narration').dataset.text = game.narration; }
  $('warnings').innerHTML = game.warnings.map((w) => `<li>${esc(w)}</li>`).join('');
  renderDilemmas();
  renderLedger();
  renderControls();
}

function renderDilemmas() {
  const s = game!.state;
  const box = $('dilemmas');
  box.innerHTML = '';
  if (s.status !== 'active') {
    const div = document.createElement('div');
    div.className = 'ending';
    div.innerHTML = `<h3>The reign has ended</h3><p>${esc(s.statusReason ?? '')}</p>`;
    const b = document.createElement('button');
    b.className = 'primary'; b.textContent = 'Continue as the successor'; b.onclick = continueAsSuccessor;
    const b2 = document.createElement('button'); b2.textContent = 'Start a new game'; b2.onclick = showStart;
    div.append(b, b2);
    box.append(div);
    return;
  }
  s.pendingDilemmas.forEach((d, i) => {
    const chosen = game!.orders.find((o) => o.type === 'resolveDilemma' && o.dilemmaId === d.id) as { optionId: string } | undefined;
    const card = document.createElement('section');
    card.className = 'dilemma';
    card.innerHTML = `<header><span class="num">${i + 1}</span><div><h4>${esc(d.title)}</h4><p class="who">${esc(d.presenterName)}</p></div></header><p class="brief">${esc(d.brief)}</p>`;
    const list = document.createElement('div');
    list.className = 'options';
    d.options.forEach((o, j) => {
      const b = document.createElement('button');
      b.className = 'option' + (chosen?.optionId === o.id ? ' chosen' : '') + (o.id === d.defaultOptionId ? ' default' : '');
      b.disabled = !o.available || busy;
      b.innerHTML = `<span class="letter">${LETTERS[j]}</span><span><strong>${esc(o.label)}</strong><span class="sum">${esc(o.summary)}${o.available ? '' : ' (not possible now)'}</span></span>`;
      b.onclick = () => addOrders([{ type: 'resolveDilemma', dilemmaId: d.id, optionId: o.id }], '');
      list.append(b);
    });
    card.append(list);
    const def = d.options.find((o) => o.id === d.defaultOptionId);
    const foot = document.createElement('p');
    foot.className = 'fallback-note';
    foot.textContent = chosen ? 'Your answer is recorded.' : `If you give no order: ${def?.label ?? ''}`;
    card.append(foot);
    box.append(card);
  });
}

function renderLedger() {
  const s = game!.state;
  const v = reportedView(s);
  const tim = Object.values(s.army.timariots).reduce((a, x) => a + x, 0);
  const months = s.grain.stock / Math.max(1, grainConsumption(s));
  const tiles = [
    ['Treasury', `${fmtAkce(v.treasury)}`, 'akçe'],
    ['Monthly balance', `${v.budget.net >= 0 ? '+' : ''}${fmtAkce(v.budget.net)}`, 'akçe', v.budget.net < 0 ? 'bad' : 'good'],
    ['Arrears', fmtAkce(s.arrears), 'owed to troops', s.arrears > 0 ? 'bad' : ''],
    ['Bread', months.toFixed(1), `months for ${Math.round(s.grain.population / 1000)}k`, months < 1.5 ? 'bad' : ''],
  ];
  const fac = FACTIONS.map((f) => `<li><span>${FL[f]}</span><span class="bar"><i style="width:${v.factions[f]}%" class="${v.factions[f] < 35 ? 'low' : ''}"></i></span><span class="mood">${MOOD(v.factions[f])}</span></li>`).join('');
  const c = s.campaign;
  const army = `<p>${s.army.janissaries.toLocaleString()} Janissaries · ${s.army.palaceCavalry.toLocaleString()} Porte cavalry · ~${Math.round(tim / 1000)}k sipahis · ${s.army.artillery.guns} guns, ${s.army.artillery.bombards} bombards · ${s.army.fleet.galleys} galleys</p>`
    + (c ? `<p class="field"><strong>In the field:</strong> ${esc(s.provinces[c.target].name)}, ${c.phase}, ${(c.janissaries + c.palaceCavalry + c.timariots).toLocaleString()} men, morale ${MOOD(c.morale)}</p>` : '')
    + s.sieges.map((sg) => `<p class="field"><strong>Siege of ${esc(s.provinces[sg.province].name)}</strong> (${sg.attacker === 'ottoman' ? 'ours' : 'against us'}): month ${sg.months}, breach ${Math.round(sg.breach)}%</p>`).join('');
  const wars = s.wars.length ? s.wars.map((w) => `<li class="war">${w.enemies.map((e) => esc(s.neighbours[e].name)).join(' and ')} <span>${w.score > 20 ? 'winning' : w.score < -20 ? 'losing' : 'even'}</span></li>`).join('') : '<li>At peace</li>';
  const nbs = Object.values(s.neighbours).filter((n) => n.maxArmy > 0 || n.id === 'papacy').map((n) => `<li><span>${esc(n.name)}</span><span class="rel">${n.relation}</span></li>`).join('');
  const princes = livingPrinces(s).map((p) => `<li>${esc(p.name)} <span>${p.relation}, ${princeAge(s, p.birthYear)}${p.province ? ` · ${esc(s.provinces[p.province].name)}` : ''}${p.heldBy ? ' · abroad' : ''}</span></li>`).join('') || '<li>None living</li>';
  $('ledger').innerHTML = `
    <p class="ledger-note">As reported by the Divan</p>
    <div class="tiles">${tiles.map(([k, val, unit, cls]) => `<div class="tile ${cls ?? ''}"><span class="k">${k}</span><span class="v">${val}</span><span class="u">${unit}</span></div>`).join('')}</div>
    <h3>Factions</h3><ul class="factions">${fac}</ul>
    <h3>Army &amp; fleet</h3>${army}
    <h3>Wars</h3><ul class="plain">${wars}</ul>
    <h3>Provinces</h3><p>${ottomanProvinces(s).length} under the Sultan</p>
    <h3>Dynasty</h3><ul class="plain">${princes}</ul>
    <h3>Neighbours</h3><ul class="plain neighbours">${nbs}</ul>`;
}

function renderControls() {
  if (!game) return;
  const s = game.state;
  $('orders').innerHTML = game.orders.map((o, i) => `<li><span>${esc(describeOrder(o))}</span><button class="x" data-i="${i}" aria-label="Remove order">×</button></li>`).join('');
  $('orders').querySelectorAll<HTMLButtonElement>('button.x').forEach((b) => (b.onclick = () => { game!.orders.splice(Number(b.dataset.i), 1); render(); void persist(); }));
  ($('endMonth') as HTMLButtonElement).disabled = busy || s.status !== 'active';
  ($('send') as HTMLButtonElement).disabled = busy || s.status !== 'active';
  $('endMonth').textContent = `End ${fmtDate(s.date)}`;
  $('aiNote').textContent = sample ? 'Speak your orders in plain words, or pick options above.' : 'Pick options above, or type shortcuts like "1a 2c". Claude is not connected on this page.';
}

function describeOrder(o: Action) {
  const s = game!.state;
  if (o.type === 'resolveDilemma') {
    const d = s.pendingDilemmas.find((x) => x.id === o.dilemmaId);
    return `${d?.title ?? 'Dilemma'}: ${d?.options.find((x) => x.id === o.optionId)?.label ?? o.optionId}`;
  }
  return describeAction(o).replace(/[{}"]/g, '').replace(/,/g, ', ').replace(/type:/, '');
}

function showStart() {
  $('start').hidden = false; $('game').hidden = true;
}
function showGame() {
  $('start').hidden = true; $('game').hidden = false;
}

// ── boot ────────────────────────────────────────────────────────────────────
async function boot() {
  $('newGame').onclick = () => void newGame();
  $('scenario').onchange = () => { $('yearRow').hidden = ($('scenario') as HTMLSelectElement).value !== 'fictional'; };
  $('send').onclick = () => { const t = ($('command') as HTMLTextAreaElement).value.trim(); if (t) { ($('command') as HTMLTextAreaElement).value = ''; void interpret(t); } };
  $('command').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('send').click(); } });
  $('endMonth').onclick = () => void endMonth();
  $('menu').onclick = showStart;
  $('continue').onclick = () => { if (game) { showGame(); render(); } };

  const hot = (window as any).claude?.hot;
  hot?.snapshot?.(() => (game ? { game } : {}));

  if (typeof claude !== 'undefined' && claude?.use) {
    const [smp, d, u] = await Promise.all([claude.use('sample'), claude.use('db'), claude.use('user')]);
    sample = smp; db = d;
    try { uid = (await u?.id?.()) ?? null; } catch { uid = null; }
  }
  const hotData = hot?.data?.game as Save | undefined;
  const saved = hotData ?? (await loadSave());
  if (saved?.state) {
    game = saved;
    $('continue').hidden = false;
    $('continueNote').textContent = `${saved.state.sultan.name}, ${fmtDate(saved.state.date)}`;
    if (hotData) { showGame(); render(); }
  }
  $('aiStatus').textContent = sample ? 'Claude narrates and reads your orders, using your own Claude account.' : 'Claude is not available here, so the game shows the plain chronicle and uses buttons.';
}
void boot();
