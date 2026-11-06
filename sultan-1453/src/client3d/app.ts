// The 3D game shell: wires the map scene, the HUD, the engine and the oracle. It only reads GameState and
// sends Actions through resolveTurn(); it never edits state directly.
import { createGame, resolveTurn, succeed, Rng, FACTIONS, type Action, type GameState, type NeighbourId } from '../engine';
import { fmtDate } from '../engine/calendar';
import { reportedView } from '../engine/intel';
import { grainConsumption } from '../engine/economy';
import { describeAction } from '../engine/actions';
import { fmtAkce, type TurnCtx } from '../engine/state';
import { LETTERS } from '../llm/context';
import { parseShortcuts, previewOrders } from '../llm/orders';
import { MapScene } from './scene';
import { HUD_CSS, HUD_HTML } from './hud';
import { esc, md } from './md';
import { OWNER_COLORS } from './palette';
import { offlineOracle, type Oracle, type SaveGame, type Storage3D } from './oracle';

const MOOD = (v: number) => (v >= 75 ? 'devoted' : v >= 60 ? 'content' : v >= 45 ? 'uneasy' : v >= 30 ? 'resentful' : 'mutinous');
const FL: Record<string, string> = { janissaries: 'Janissaries', ulema: 'Ulema', rumelianBeys: 'Rumelian beys', anatolianBeys: 'Anatolian beys', harem: 'Harem', merchants: 'Merchants', millets: 'Christian millets' };
const hijri = (y: number) => Math.round((y - 622) * (33 / 32));

export interface MountOptions {
  oracle?: Oracle;
  storage: Storage3D;
  /** a save carried across a hot reload */
  resume?: SaveGame;
  onChange?: (g: SaveGame) => void;
}

export function mountGame(root: HTMLElement, opts: MountOptions) {
  let oracle = opts.oracle ?? offlineOracle;
  root.classList.add('s3');
  const style = document.createElement('style');
  style.textContent = HUD_CSS;
  root.append(style);
  root.insertAdjacentHTML('beforeend', HUD_HTML);
  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;

  const scene = new MapScene(root.querySelector('.map') as HTMLElement);
  let game: SaveGame | null = null;
  let busy = false;

  // ── persistence ──
  const persist = async () => {
    if (!game) return;
    opts.onChange?.(game);
    await opts.storage.save(game);
  };

  // ── hover tooltip ──
  const tip = $('s3-tip');
  scene.onHover = ({ province, x, y }) => {
    if (!province || !game) { tip.hidden = true; return; }
    const s = game.state;
    const p = s.provinces[province];
    if (!p) { tip.hidden = true; return; }
    const ours = p.owner === 'ottoman';
    const n = ours ? null : s.neighbours[p.owner as NeighbourId];
    const siege = s.sieges.find((sg) => sg.province === p.id);
    tip.innerHTML = `<h4>${esc(p.name)}</h4><p><span class="own" style="background:${OWNER_COLORS[p.owner] ?? '#999'}"></span>${ours ? 'The Sublime State' : esc(n?.name ?? p.owner)}${n ? ` · ${n.relation}` : ''}</p>`
      + (ours ? `<p>Loyalty ${MOOD(p.loyalty)} · prosperity ${Math.round(p.prosperity)}</p>` : `<p>Ruler: ${esc(n?.ruler ?? '')}</p>`)
      + `<p>Garrison ${p.garrison.toLocaleString()} · walls ${p.walls}</p>`
      + (siege ? `<p style="color:#ff8a65">Under siege: breach ${Math.round(siege.breach)}%, ${siege.defenders.toLocaleString()} defenders</p>` : '');
    const r = root.getBoundingClientRect();
    tip.hidden = false;
    const left = Math.min(x - r.left + 14, r.width - 290);
    const top = Math.min(y - r.top + 14, r.height - tip.offsetHeight - 10);
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  };

  // ── rendering ──
  const renderHud = () => {
    const s = game!.state;
    const v = reportedView(s);
    $('s3-date').innerHTML = `${fmtDate(s.date)}<small>${hijri(s.date.year)} AH · ${esc(s.sultan.name)}</small>`;
    $('s3-tre').textContent = `${fmtAkce(v.treasury)} akçe`;
    $('s3-net').textContent = `${v.budget.net >= 0 ? '+' : ''}${fmtAkce(v.budget.net)}`;
    $('s3-net-w').className = `stat ${v.budget.net < 0 ? 'bad' : 'good'}`;
    $('s3-arr').textContent = fmtAkce(s.arrears);
    $('s3-arr-w').className = `stat opt-stat ${s.arrears > 0 ? 'bad' : ''}`;
    const months = s.grain.stock / Math.max(1, grainConsumption(s));
    $('s3-bread').textContent = `${months.toFixed(1)} mo`;
    $('s3-bread-w').className = `stat opt-stat ${months < 1.5 ? 'bad' : ''}`;
    const men = s.army.janissaries + s.army.palaceCavalry + (s.campaign ? s.campaign.janissaries + s.campaign.palaceCavalry + s.campaign.timariots : 0);
    $('s3-army').textContent = s.campaign ? `${Math.round(men / 1000)}k in the field` : `${Math.round(s.army.janissaries / 1000)}k Janissaries`;
    $('s3-facs').innerHTML = FACTIONS.map((f) => `<span class="fac" title="${FL[f]}: ${MOOD(v.factions[f])}"><i class="${v.factions[f] < 35 ? 'low' : ''}" style="height:${v.factions[f]}%"></i></span>`).join('');
  };

  const renderDivan = () => {
    const s = game!.state;
    const box = $('s3-dilemmas');
    box.innerHTML = '';
    if (s.status !== 'active') {
      const div = document.createElement('div');
      div.className = 'ending';
      div.innerHTML = `<h4>The reign has ended</h4><p>${esc(s.statusReason ?? '')}</p>`;
      const b = document.createElement('button'); b.className = 'primary'; b.textContent = 'Continue as the successor'; b.onclick = continueAsSuccessor;
      const b2 = document.createElement('button'); b2.textContent = 'New game'; b2.onclick = () => ($('s3-start').hidden = false);
      div.append(b, b2);
      box.append(div);
      return;
    }
    s.pendingDilemmas.forEach((d, i) => {
      const chosen = game!.orders.find((o) => o.type === 'resolveDilemma' && o.dilemmaId === d.id) as { optionId: string } | undefined;
      const card = document.createElement('section');
      card.className = 'dl';
      card.innerHTML = `<header><span class="num">${i + 1}</span><div><h4>${esc(d.title)}</h4><p class="who">${esc(d.presenterName)}</p></div></header><p class="brief">${esc(d.brief)}</p>`;
      d.options.forEach((o, j) => {
        const b = document.createElement('button');
        b.className = `opt${chosen?.optionId === o.id ? ' chosen' : ''}`;
        b.disabled = !o.available || busy;
        b.innerHTML = `<b>${LETTERS[j]}</b><span>${esc(o.label)}<span>${esc(o.summary)}${o.available ? '' : ' (not possible now)'}</span></span>`;
        b.onclick = () => addOrders([{ type: 'resolveDilemma', dilemmaId: d.id, optionId: o.id }], '');
        card.append(b);
      });
      const def = d.options.find((o) => o.id === d.defaultOptionId);
      const p = document.createElement('p');
      p.className = 'def';
      p.textContent = chosen ? 'Your answer is recorded.' : `If you give no order: ${def?.label ?? ''}`;
      card.append(p);
      box.append(card);
    });
  };

  const describeOrder = (o: Action) => {
    const s = game!.state;
    if (o.type === 'resolveDilemma') {
      const d = s.pendingDilemmas.find((x) => x.id === o.dilemmaId);
      return `${d?.title ?? 'Dilemma'}: ${d?.options.find((x) => x.id === o.optionId)?.label ?? o.optionId}`;
    }
    return describeAction(o).replace(/[{}"]/g, '').replace(/,/g, ', ').replace(/type:/, '');
  };

  const renderOrders = () => {
    const box = $('s3-orders');
    box.innerHTML = game!.orders.map((o, i) => `<span class="chip">${esc(describeOrder(o))}<button data-i="${i}" aria-label="Remove order">×</button></span>`).join('');
    box.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = () => { game!.orders.splice(Number(b.dataset.i), 1); render(); void persist(); }));
    const s = game!.state;
    ($('s3-end') as HTMLButtonElement).disabled = busy || s.status !== 'active';
    ($('s3-send') as HTMLButtonElement).disabled = busy || s.status !== 'active';
    $('s3-end').textContent = s.status === 'active' ? `End ${fmtDate(s.date)}` : 'Reign ended';
  };

  const renderChronicle = () => {
    $('s3-narr').innerHTML = md(game!.narration);
    $('s3-warn').innerHTML = game!.warnings.map((w) => `<p class="warn">⚠ ${esc(w)}</p>`).join('');
  };

  const render = () => {
    if (!game) return;
    renderHud();
    renderDivan();
    renderOrders();
  };

  const flash = (t: string) => { $('s3-reply').textContent = t; };

  // ── orders ──
  const addOrders = (proposed: Action[], reply: string) => {
    if (!game) return;
    for (const p of proposed) if (p.type === 'resolveDilemma') game.orders = game.orders.filter((o) => !(o.type === 'resolveDilemma' && o.dilemmaId === p.dilemmaId));
    const preview = previewOrders(game.state, [...game.orders, ...proposed]).slice(game.orders.length);
    game.orders.push(...preview.filter((p) => p.ok).map((p) => p.action));
    flash([reply, ...preview.filter((p) => !p.ok || p.action.type !== 'resolveDilemma').map((p) => `${p.ok ? '✓' : '✗'} ${p.note}`)].filter(Boolean).join('\n'));
    render();
    void persist();
  };

  const interpret = async (text: string) => {
    if (!game) return;
    const short = parseShortcuts(game.state, text);
    if (short) return addOrders(short, '');
    if (!oracle.online) { flash('Free-text orders need Claude. Use the Divan buttons, or type shortcuts like "1a 2c".'); return; }
    busy = true; render();
    flash('The secretary records your words…');
    const r = await oracle.parse(game.state, text, game.orders);
    busy = false;
    addOrders(r.actions, r.reply);
  };

  // ── narration ──
  const narrate = async () => {
    if (!game) return;
    busy = true; render();
    openChronicle();
    $('s3-narr').innerHTML = '<p class="thinking">The chronicler sharpens his reed pen…</p>';
    $('s3-warn').innerHTML = '';
    const res = await oracle.narrate(game.state, game.chronicle, (t) => { $('s3-narr').innerHTML = md(t); });
    game.narration = res.text;
    game.warnings = res.warnings;
    if (oracle.online && !res.warnings.some((w) => w.includes('unavailable'))) game.chronicle = [...game.chronicle, res.text].slice(-2);
    busy = false;
    renderChronicle();
    render();
  };

  // ── turn flow ──
  const endMonth = async () => {
    if (!game || busy) return;
    const { state, report } = resolveTurn(game.state, game.orders);
    game.state = state;
    game.orders = [];
    flash(report.actionsRejected.map((r) => `✗ ${r.reason}`).join('\n'));
    scene.setState(state);
    if (state.campaign) scene.focus(state.campaign.phase === 'mustering' ? state.capital : state.campaign.target);
    else if (state.sieges[0]) scene.focus(state.sieges[0].province);
    render();
    await narrate();
    void persist();
  };

  const start = async (g: SaveGame, fresh: boolean) => {
    game = g;
    $('s3-start').hidden = true;
    scene.setState(g.state, true);
    scene.focus(g.state.capital);
    render();
    if (fresh || !g.narration) await narrate();
    else renderChronicle();
    void persist();
  };

  const continueAsSuccessor = () => {
    if (!game) return;
    const ctx: TurnCtx = { s: structuredClone(game.state), rng: new Rng(game.state.rngState), facts: [] };
    if (!succeed(ctx)) return;
    ctx.s.rngState = ctx.rng.state;
    game.state = resolveTurn(ctx.s, []).state;
    game.orders = [];
    scene.setState(game.state);
    render();
    void narrate().then(() => persist());
  };

  // ── panels ──
  const chron = $('s3-chron'), divan = $('s3-divan');
  const openChronicle = () => { chron.classList.remove('collapsed', 'hidden-m'); if (window.innerWidth <= 820) divan.classList.add('hidden-m'); $('s3-chron-t').textContent = '–'; };
  $('s3-chron-t').onclick = () => { chron.classList.toggle('collapsed'); $('s3-chron-t').textContent = chron.classList.contains('collapsed') ? '+' : '–'; };
  $('s3-divan-t').onclick = () => { divan.classList.toggle('collapsed'); $('s3-divan-t').textContent = divan.classList.contains('collapsed') ? '+' : '–'; };
  $('s3-tab-divan').onclick = () => { divan.classList.toggle('hidden-m'); chron.classList.add('hidden-m'); };
  $('s3-tab-chron').onclick = () => { chron.classList.toggle('hidden-m'); divan.classList.add('hidden-m'); };
  if (window.innerWidth <= 820) divan.classList.add('hidden-m');

  // ── controls ──
  $('s3-send').onclick = () => { const i = $('s3-cmd') as HTMLInputElement; const t = i.value.trim(); if (t) { i.value = ''; void interpret(t); } };
  $('s3-cmd').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('s3-send').click(); });
  $('s3-end').onclick = () => void endMonth();
  $('s3-menu').onclick = () => { $('s3-start').hidden = false; refreshStart(); };
  $('s3-scn').onchange = () => { $('s3-year-w').hidden = ($('s3-scn') as HTMLSelectElement).value !== 'fictional'; };
  $('s3-new').onclick = () => {
    const scenario = ($('s3-scn') as HTMLSelectElement).value as 'mehmed1451';
    const difficulty = ($('s3-dif') as HTMLSelectElement).value as 'normal';
    const year = Number(($('s3-year') as HTMLInputElement).value) || 1460;
    const state: GameState = createGame({ scenario, difficulty, seed: Math.floor(Math.random() * 1e9), fictional: { year } });
    void start({ state, orders: [], chronicle: [], narration: '', warnings: [] }, true);
  };
  $('s3-cont').onclick = () => { if (game) { $('s3-start').hidden = true; } };

  const refreshStart = () => {
    $('s3-cont').hidden = !game;
    $('s3-cont-note').textContent = game ? `${game.state.sultan.name}, ${fmtDate(game.state.date)}` : '';
    $('s3-ai').textContent = oracle.online ? 'Claude narrates the chronicle and reads your written orders.' : 'Claude is not connected: the plain chronicle is shown and you answer with the Divan buttons.';
  };

  // fps readout (toggle with F)
  const fpsEl = $('s3-fps');
  let showFps = false;
  window.addEventListener('keydown', (e) => { if (e.key === 'f' && document.activeElement?.tagName !== 'INPUT') { showFps = !showFps; fpsEl.textContent = ''; } });
  setInterval(() => { if (showFps) fpsEl.textContent = `${scene.fps()} fps`; }, 500);

  // ── boot ──
  const boot = async () => {
    const saved = opts.resume ?? (await opts.storage.load());
    if (saved?.state) {
      game = saved;
      if (opts.resume) { void start(saved, false); return; }
      scene.setState(saved.state, true);
      scene.focus(saved.state.capital);
    }
    refreshStart();
  };
  void boot();

  return {
    setOracle(o: Oracle) { oracle = o; refreshStart(); },
    /** Test hook: record these orders and end the month. */
    async play(actions: Action[]) { if (game) { game.orders = actions; await endMonth(); } },
    get game() { return game; },
    dispose() { scene.dispose(); root.innerHTML = ''; },
  };
}
