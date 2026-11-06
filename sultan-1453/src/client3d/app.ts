// The 3D game shell: wires the map scene, the HUD, the engine and the oracle. It only reads GameState and
// sends Actions through resolveTurn(); it never edits state directly.
import { createGame, resolveTurn, succeed, Rng, FACTIONS, type Action, type GameState, type NeighbourId } from '../engine';
import { fmtDate } from '../engine/calendar';
import { reportedView } from '../engine/intel';
import { grainConsumption } from '../engine/economy';
import { describeAction } from '../engine/actions';
import { fmtAkce, princeAge, type TurnCtx } from '../engine/state';
import { LETTERS } from '../llm/context';
import { parseShortcuts, previewOrders } from '../llm/orders';
import { MapScene } from './scene';
import { PalaceScene, type Npc } from './palace/scene';
import { HUD_CSS, HUD_HTML } from './hud';
import { esc, md } from './md';
import { LEGEND, OWNER_COLORS } from './palette';
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
  const palace = new PalaceScene(root.querySelector('.map') as HTMLElement);
  let inPalace = false;
  let talking: Npc | null = null;
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
    $('s3-chron-sub').textContent = fmtDate(s.lastReport?.date ?? s.date);
    const answered = s.pendingDilemmas.filter((d) => game!.orders.some((o) => o.type === 'resolveDilemma' && o.dilemmaId === d.id)).length;
    $('s3-divan-sub').textContent = s.status === 'active' ? `${s.pendingDilemmas.length} matters · ${answered} answered` : 'the reign has ended';
    renderLegend();
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

  const answeredSet = () => new Set(game!.orders.filter((o) => o.type === 'resolveDilemma').map((o) => (o as { dilemmaId: string }).dilemmaId));

  const render = () => {
    if (!game) return;
    renderHud();
    renderDivan();
    renderOrders();
    palace.setState(game.state, answeredSet());
    if (talking) renderDialogue(talking);
  };

  // ── the palace ──
  const setMode = (palaceOn: boolean) => {
    inPalace = palaceOn;
    scene.setActive(!palaceOn);
    palace.setActive(palaceOn);
    $('s3-place').hidden = !palaceOn;
    $('s3-mode').textContent = palaceOn ? 'Return to the map' : 'Enter the palace';
    $('s3-legend').hidden = true;
    tip.hidden = true;
    if (!palaceOn) { closeDialogue(); $('s3-prompt').hidden = true; }
    // the Divan panel stays available but starts folded inside the palace: the ministers present in person
    if (palaceOn && !divan.classList.contains('collapsed') && window.innerWidth > 820) { divan.classList.add('collapsed'); $('s3-divan-t').textContent = '+'; }
    if (palaceOn && window.innerWidth <= 820) { divan.classList.add('hidden-m'); chron.classList.add('hidden-m'); }
  };

  /** The minister's words from this month's chronicle, if the narrator gave him a speech; else the engine's brief. */
  const speechFor = (name: string) => {
    const text = game!.narration ?? '';
    const at = text.indexOf('### The Divan');
    if (at < 0) return null;
    const para = text.slice(at).split(/\n\s*\n|\n(?=\*\*)/).find((p) => p.includes(`**${name}`) || p.startsWith(`**${name.split(' ')[0]}`));
    return para ? para.replace(/\*\*/g, '').replace(/^\s*[-*] /gm, '').trim() : null;
  };

  const closeDialogue = () => { talking = null; $('s3-dlg').hidden = true; };

  const renderDialogue = (npc: Npc) => {
    const s = game!.state;
    $('s3-dlg-name').innerHTML = `${esc(npc.name)}<small>${esc(npc.title)}</small>`;
    const body = $('s3-dlg-body');
    body.innerHTML = '';
    const p = (html: string, cls = 'speech') => { const el = document.createElement('p'); el.className = cls; el.innerHTML = html; body.append(el); return el; };
    const act = (label: string, fn: () => void, disabled = false) => { const b = document.createElement('button'); b.className = 'opt'; b.textContent = label; b.disabled = disabled || busy; b.onclick = fn; return b; };
    const dls = s.pendingDilemmas.filter((d) => npc.dilemmas.includes(d.id));
    if (dls.length) {
      const said = speechFor(npc.name);
      if (said) p(esc(said));
      for (const d of dls) {
        const chosen = game!.orders.find((o) => o.type === 'resolveDilemma' && o.dilemmaId === d.id) as { optionId: string } | undefined;
        p(`<strong>${esc(d.title)}.</strong> ${esc(d.brief)}`, said ? 'who2' : 'speech');
        const box = document.createElement('div');
        box.className = 'acts';
        d.options.forEach((o, j) => {
          const b = document.createElement('button');
          b.className = `opt${chosen?.optionId === o.id ? ' chosen' : ''}`;
          b.disabled = !o.available || busy;
          b.innerHTML = `<b>${LETTERS[j]}</b><span>${esc(o.label)}<span>${esc(o.summary)}${o.available ? '' : ' (not possible now)'}</span></span>`;
          b.onclick = () => addOrders([{ type: 'resolveDilemma', dilemmaId: d.id, optionId: o.id }], '');
          box.append(b);
        });
        body.append(box);
        p(chosen ? 'Your answer is recorded. It takes effect when the month ends.' : `If you give no order: ${esc(d.options.find((o) => o.id === d.defaultOptionId)?.label ?? '')}`, 'who2');
      }
      return;
    }
    switch (npc.kind) {
      case 'minister': {
        const m = Object.values(s.ministers).find((x) => x.name === npc.name);
        p(`“My Sultan, I have nothing before the Divan this month.”`);
        if (m) p(esc(m.personality), 'who2');
        break;
      }
      case 'treasurer': {
        const v = reportedView(s);
        p(`“The chests hold ${fmtAkce(v.treasury)} akçe, my Sultan. Each month brings ${fmtAkce(v.budget.totalRevenue)} and takes ${fmtAkce(v.budget.totalExpenses)}.${s.arrears > 0 ? ` The troops are owed ${fmtAkce(s.arrears)}.` : ''}” These are the Defterdar's figures.`);
        const box = document.createElement('div');
        box.className = 'acts';
        if (s.arrears > 0) box.append(act('Pay the troops what they are owed', () => addOrders([{ type: 'payArrears' }], '')));
        box.append(act('Order a secret audit of the registers (60,000 akçe)', () => addOrders([{ type: 'audit' }], '')));
        box.append(act('Cast ten siege guns (60,000 akçe)', () => addOrders([{ type: 'castCannon', guns: 10 }], '')));
        box.append(act('A customary donative to the corps (250 akçe a man)', () => addOrders([{ type: 'grantDonative', akcePerMan: 250 }], '')));
        body.append(box);
        break;
      }
      case 'valide': p(`“${esc(s.dynasty.valide?.note ?? '')}. The harem is quiet, my son, for now.”`); break;
      case 'consort': {
        const c = s.dynasty.consorts.find((x) => x.name === npc.name);
        const sons = s.dynasty.princes.filter((x) => x.alive && x.motherId === c?.id).map((x) => x.name);
        p(`${esc(npc.name)}, ${esc(npc.title)}. ${sons.length ? `Mother of Şehzade ${sons.map(esc).join(' and Şehzade ')}.` : 'She has no living son.'}`);
        break;
      }
      case 'prince': {
        const pr = s.dynasty.princes.find((x) => `Şehzade ${x.name}` === npc.name);
        if (pr) p(`${esc(npc.title)}. His household is ${pr.household > 60 ? 'strong' : pr.household > 30 ? 'growing' : 'small'}; his tutors call him ${pr.ability >= 7 ? 'quick' : pr.ability >= 4 ? 'diligent' : 'slow'}${princeAge(s, pr.birthYear) >= 15 ? `, and his ambition ${pr.ambition > 70 ? 'is spoken of' : 'is unremarkable'}` : ''}.`);
        break;
      }
      case 'eunuch': p('“The doors of the harem are kept, my Sultan. If I hear anything that concerns you, you will hear it first.”'); break;
      case 'petitioner': p(`“${esc(npc.note ?? '')}”`); p('Petitions at the Gate bring news. Decisions are taken in the Divan.', 'who2'); break;
      default: p('He bows and says nothing.');
    }
  };

  palace.onInteract = (npc) => { talking = npc; $('s3-prompt').hidden = true; $('s3-dlg').hidden = false; renderDialogue(npc); };
  palace.onNear = (npc) => {
    const el = $('s3-prompt');
    if (!npc || talking) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = `${npc.dilemmas.length ? '★ ' : ''}Speak with ${npc.name} (E, or tap him)`;
  };
  palace.onRoom = (room) => { $('s3-room').textContent = room?.name ?? 'The palace grounds'; };
  $('s3-dlg-x').onclick = closeDialogue;
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && talking) closeDialogue(); });
  root.querySelectorAll<HTMLButtonElement>('#s3-place button[data-room]').forEach((b) => (b.onclick = () => { closeDialogue(); palace.teleport(b.dataset.room as 'divan'); }));
  $('s3-mode').onclick = () => setMode(!inPalace);

  const flash = (t: string) => { $('s3-reply').textContent = t; };

  const renderLegend = () => {
    const s = game?.state;
    $('s3-legend').innerHTML = LEGEND.map((l) => {
      const rel = !s || l.id === 'ottoman' ? '' : s.neighbours[l.id as NeighbourId]?.relation ?? '';
      return `<div><span class="sw" style="background:${OWNER_COLORS[l.id]}"></span>${l.name}<span class="sub">${l.colour}${rel && rel !== 'none' ? ` · ${rel}` : ''}</span></div>`;
    }).join('') + `<div class="kind">Pills in a power's colour with crossed swords are armies; dark pills are towns; a red bar is a siege's breach.</div>`;
  };

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
    if (chron.classList.contains('collapsed') || chron.classList.contains('hidden-m')) $('s3-chron-dot').hidden = false;
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
    if (inPalace) {
      closeDialogue();
      palace.setState(state, answeredSet());
      if (state.pendingDilemmas.length) { palace.teleport('divan'); flash('The Divan is assembled in the throne room.'); }
    }
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
  // the chronicle stays collapsed on desktop; a gold dot marks a new entry
  const openChronicle = () => { if (window.innerWidth <= 820) return; };
  $('s3-chron-t').onclick = () => {
    chron.classList.toggle('collapsed');
    const open = !chron.classList.contains('collapsed');
    $('s3-chron-t').textContent = open ? '–' : '+';
    if (open) $('s3-chron-dot').hidden = true;
  };
  $('s3-hud-t').onclick = () => { const h = root.querySelector('.hud')!; h.classList.toggle('min'); $('s3-hud-t').textContent = h.classList.contains('min') ? '+' : '–'; };
  $('s3-legend-t').onclick = () => { const l = $('s3-legend'); l.hidden = !l.hidden; $('s3-legend-t').setAttribute('aria-pressed', String(!l.hidden)); renderLegend(); };
  $('s3-divan-t').onclick = () => { divan.classList.toggle('collapsed'); $('s3-divan-t').textContent = divan.classList.contains('collapsed') ? '+' : '–'; };
  $('s3-tab-divan').onclick = () => { divan.classList.toggle('hidden-m'); chron.classList.add('hidden-m'); };
  $('s3-tab-chron').onclick = () => { chron.classList.toggle('hidden-m'); divan.classList.add('hidden-m'); $('s3-chron-dot').hidden = true; };
  if (window.innerWidth <= 820) { divan.classList.add('hidden-m'); chron.classList.add('hidden-m'); chron.classList.remove('collapsed'); }

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
    get scene() { return scene; },
    get palace() { return palace; },
    dispose() { scene.dispose(); root.innerHTML = ''; },
  };
}
