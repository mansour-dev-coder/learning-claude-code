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
import type { MonthReport } from '../engine/types';
import { MISSIONS, MISSION_BY_ID } from '../campaign/missions';
import { advanceMission, isUnlocked, newProgress, recordResult, sandboxUnlocked, startMission } from '../campaign/runner';
import type { CampaignProgress, MissionDef, MissionResult } from '../campaign/types';
import { playCinematic, type CinematicSpec } from './cinematic';
import { provinceActions } from './provinceActions';
import { TUTORIAL, type TutorialEvent } from './tutorial';
import { createAudience } from './audience';

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
    const w = game!.watch;
    if (w) {
      const b = document.createElement('button');
      b.className = 'watch primary';
      b.textContent = w.kind === 'siege' ? `▶ Watch the siege of ${w.town}` : w.kind === 'battle' ? `▶ Watch ${w.title}` : '▶ Watch';
      b.onclick = () => void playCinematic(root, w);
      $('s3-warn').append(b);
    }
  };

  const answeredSet = () => new Set(game!.orders.filter((o) => o.type === 'resolveDilemma').map((o) => (o as { dilemmaId: string }).dilemmaId));

  const render = () => {
    if (!game) return;
    renderHud();
    renderDivan();
    renderOrders();
    palace.setState(game.state, answeredSet());
    if (talking) renderDialogue(talking);
    renderObjectives();
  };

  // ── the palace ──
  const setMode = (palaceOn: boolean) => {
    inPalace = palaceOn;
    tutorialEvent(palaceOn ? 'palace:on' : 'palace:off');
    if (palaceOn) closeProvince();
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

  const closeDialogue = () => { talking = null; $('s3-dlg').hidden = true; audience?.close(); palace.faceAudience?.(null); };

  const staticExtras = (npc: Npc, body: HTMLElement) => {
    const s = game!.state;
    const p = (html: string, cls = 'speech') => { const el = document.createElement('p'); el.className = cls; el.innerHTML = html; body.append(el); return el; };
    const act = (label: string, fn: () => void, disabled = false) => { const b = document.createElement('button'); b.className = 'opt'; b.textContent = label; b.disabled = disabled || busy; b.onclick = fn; return b; };
    switch (npc.kind) {
      case 'minister': {
        const m = Object.values(s.ministers).find((x) => x.name === npc.name);
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

  const audience = createAudience({
    body: $('s3-dlg-body'),
    state: () => game?.state ?? null,
    orders: () => (game?.orders ?? []) as { type: string; dilemmaId?: string; optionId?: string }[],
    busy: () => busy,
    oracle: () => oracle,
    rule: (dilemmaId, optionId) => addOrders([{ type: 'resolveDilemma', dilemmaId, optionId }], ''),
    speechFor,
    extras: staticExtras,
    speaking: (npc, on) => palace.setSpeaking?.(npc.id, on),
  });
  const renderDialogue = (npc: Npc) => {
    $('s3-dlg-name').innerHTML = `${esc(npc.name)}<small>${esc(npc.title)}</small>`;
    if (audience.current?.id !== npc.id) audience.open(npc); else audience.render();
  };

  palace.onInteract = (npc) => { tutorialEvent(`talk:${npc.id}` as TutorialEvent); talking = npc; $('s3-prompt').hidden = true; $('s3-dlg').hidden = false; palace.faceAudience?.(npc.id); renderDialogue(npc); };
  palace.onNear = (npc) => {
    const el = $('s3-prompt');
    if (!npc || talking) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = `${npc.dilemmas.length ? '★ ' : ''}Speak with ${npc.name} (E, or tap him)`;
  };
  palace.onLeave = () => closeDialogue();
  palace.onRoom = (room) => { $('s3-room').textContent = room?.name ?? 'The palace grounds'; };
  $('s3-dlg-x').onclick = closeDialogue;
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && talking) closeDialogue(); });
  root.querySelectorAll<HTMLButtonElement>('#s3-place button[data-room]').forEach((b) => (b.onclick = () => { closeDialogue(); palace.teleport(b.dataset.room as 'divan'); }));
  $('s3-mode').onclick = () => setMode(!inPalace);
  // map style: realistic relief (default) or the block map; remembered on this device
  const applyStyle = (st: 'relief' | 'voxel') => {
    scene.setStyle(st, game?.state);
    $('s3-style-t').textContent = st === 'relief' ? 'Block map' : 'Relief map';
    try { localStorage.setItem('sultan1453.mapStyle', st); } catch { /* storage unavailable */ }
  };
  $('s3-style-t').onclick = () => applyStyle(scene.terrain.style === 'relief' ? 'voxel' : 'relief');
  try { if (localStorage.getItem('sultan1453.mapStyle') === 'voxel') applyStyle('voxel'); } catch { /* storage unavailable */ }

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
    const accepted = preview.filter((p) => p.ok).map((p) => p.action);
    game.orders.push(...accepted);
    for (const a of accepted) {
      if (a.type === 'resolveDilemma') { const d = game.state.pendingDilemmas.find((x) => x.id === a.dilemmaId); if (d) tutorialEvent(`answered:${d.eventId}` as TutorialEvent); }
      if (a.type === 'startCampaign' || a.type === 'offerPeace' || a.type === 'declareWar') tutorialEvent('order:war');
    }
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
    if (!game || busy || game.mission?.result) return;
    const prev = game.state;
    const def = game.mission ? MISSION_BY_ID[game.mission.id] : null;
    let state: GameState, report: MonthReport, result: MissionResult | null = null;
    if (def && game.mission) {
      const r = advanceMission(def, game.state, game.mission.run, game.orders);
      state = r.state; report = r.report; result = r.result;
      game.mission.run = r.run;
    } else ({ state, report } = resolveTurn(game.state, game.orders));
    game.state = state;
    game.orders = [];
    game.watch = cinematicFor(prev, state, report);
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
    tutorialEvent('endMonth');
    if (game.mission?.run.marks.karamanRose) tutorialEvent('karamanRose');
    await narrate();
    void persist();
    if (def && result) await finishMission(def, result);
  };

  /** A cinematic for the month just resolved: a siege month of ours, or a battle the imperial army fought. */
  const cinematicFor = (prev: GameState, next: GameState, report: MonthReport): CinematicSpec | null => {
    const target = prev.campaign?.target;
    const before = prev.sieges.find((x) => x.attacker === 'ottoman' && x.province === target);
    if (target && before) {
      const after = next.sieges.find((x) => x.attacker === 'ottoman' && x.province === target);
      const town = prev.provinces[target].name.replace(/ \(.*\)/, '');
      const facts = report.facts.join(' ');
      const outcome = /taken by storm/.test(facts) ? 'stormed' : /surrenders on terms/.test(facts) ? 'surrender' : /thrown back/.test(facts) ? 'repulsed' : 'continue';
      const defender = prev.provinces[target].owner;
      return {
        kind: 'siege', town, walls: prev.provinces[target].walls, breachFrom: before.breach, breachTo: after ? after.breach : Math.max(before.breach, 70),
        outcome, attackerColor: OWNER_COLORS.ottoman, defenderColor: OWNER_COLORS[defender] ?? '#777', bombards: prev.campaign?.bombards ?? 0, guns: prev.campaign?.guns ?? 0,
        caption: `${fmtDate(report.date)}. Month ${before.months + 1} of the siege of ${town}.`, grand: target === 'constantinople',
      };
    }
    const b = report.facts.map((f) => f.match(/^(Battle before .+?|Relief battle at .+?|Relief of .+?): (victory|defeat)/)).find(Boolean);
    if (b && prev.campaign) {
      const enemy = Object.values(prev.neighbours).find((n) => b[0].includes(n.name) || report.facts.some((f) => f.startsWith(b[0]) && f.includes(n.name)));
      return {
        kind: 'battle', title: b[1], won: b[2] === 'victory', ourColor: OWNER_COLORS.ottoman, theirColor: OWNER_COLORS[enemy?.id ?? ''] ?? '#555',
        ourMen: prev.campaign.janissaries + prev.campaign.palaceCavalry + prev.campaign.timariots, theirMen: enemy?.fieldArmy ?? 15000,
        caption: `${fmtDate(report.date)}. ${b[1]}.`,
      };
    }
    return null;
  };

  // ── campaign ──
  let progress: CampaignProgress = newProgress();
  const saveProgress = () => opts.storage.saveProgress?.(progress);

  const finishMission = async (def: MissionDef, result: MissionResult) => {
    if (!game?.mission) return;
    game.mission.result = result;
    progress = recordResult(progress, result);
    void saveProgress();
    void persist();
    setMode(false);
    let spec: CinematicSpec | null = null;
    if (def.cinematic === 'bosporus' && result.won) spec = { kind: 'bosporus', caption: 'November 1452. Rumeli Hisarı stands complete on the European shore.' };
    if (def.cinematic === 'constantinople' && game.watch?.kind === 'siege') spec = { ...game.watch, caption: result.won ? 'Tuesday, 29 May 1453.' : game.watch.caption };
    if (spec) await playCinematic(root, spec);
    showResults(def, result);
  };

  const stars = (n: number) => [1, 2, 3].map((i) => (i <= n ? '★' : '<span class="off">★</span>')).join('');

  const showResults = (def: MissionDef, r: MissionResult) => {
    const next = MISSIONS.find((m) => m.index === def.index + 1);
    const nextPlayable = r.won && next && isUnlocked(progress, next);
    $('s3-res-card').innerHTML = `
      <h2>${r.won ? 'Victory' : 'Defeat'}: ${esc(def.title)}</h2>
      <div class="bigstars" aria-label="${r.stars} of 3 stars">${stars(r.stars)}</div>
      <p class="fine" style="text-align:center">${esc(r.reason)}</p>
      <dl>
        <dt>Objective</dt><dd>${r.won ? '★ ' : '✗ '}${esc(def.objective.text)}</dd>
        <dt>Time</dt><dd>${r.underPar ? '★ ' : ''}${r.months} months (par ${def.par}, limit ${def.limit})</dd>
        <dt>Bonus</dt><dd>${r.bonusMet ? '★ ' : '✗ '}${esc(def.bonus.text)}</dd>
        <dt>Treasury</dt><dd>${fmtAkce(r.treasuryStart)} → ${fmtAkce(r.treasuryEnd)} akçe (${r.treasuryEnd >= r.treasuryStart ? '+' : '−'}${fmtAkce(Math.abs(r.treasuryEnd - r.treasuryStart))}); ${fmtAkce(r.spent)} paid out in all</dd>
        <dt>Losses</dt><dd>${r.losses.toLocaleString()} men</dd>
      </dl>
      ${r.highlights.length ? `<h3>From the chronicle</h3><ul>${r.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
      ${r.rewardText ? `<div class="reward"><b>Reward unlocked.</b> ${esc(r.rewardText)}</div>` : ''}
      <div class="menu-btns row">${nextPlayable ? '<button id="s3-res-next" class="primary">Next mission</button>' : ''}<button id="s3-res-replay">Replay</button><button id="s3-res-map">Mission map</button></div>
      ${r.won && next?.stub ? `<p class="fine">Next: ${esc(next.title)} (${next.year}). ${esc(next.stub.reason)}</p>` : ''}`;
    $('s3-res').hidden = false;
    const go = (fn: () => void) => () => { $('s3-res').hidden = true; fn(); };
    root.querySelector<HTMLButtonElement>('#s3-res-next')?.addEventListener('click', go(() => showBriefing(next!)));
    $('s3-res-replay').onclick = go(() => showBriefing(def));
    $('s3-res-map').onclick = go(() => showMenu('camp'));
  };

  const startMissionUI = async (def: MissionDef) => {
    const { state, run } = startMission(def, Math.floor(Math.random() * 1e9), progress);
    $('s3-start').hidden = true;
    await start({ state, orders: [], chronicle: [], narration: '', warnings: [], mission: { id: def.id, run, tutorial: def.tutorial ? 0 : TUTORIAL.length } }, true);
    renderTutorial();
  };

  const showMenu = (view: 'main' | 'camp' | 'brief' | 'sand') => {
    $('s3-start').hidden = false;
    for (const v of ['main', 'camp', 'brief', 'sand']) $(`s3-v-${v}`).hidden = v !== view;
    if (view === 'main') refreshStart();
    if (view === 'camp') renderMissions();
  };

  const renderMissions = () => {
    const ol = $('s3-missions');
    ol.innerHTML = '';
    for (const m of MISSIONS) {
      const rec = progress.results[m.id];
      const open = isUnlocked(progress, m);
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.className = `mission${open ? '' : ' locked'}${rec?.won ? ' done' : ''}`;
      b.innerHTML = `<span class="yr">MISSION ${m.index} · ${m.year}</span><b>${esc(m.title)}</b><span class="stars">${rec ? stars(rec.stars) : open ? stars(0) : ''}</span>`
        + `<span class="lock">${m.stub ? 'In development' : open ? (rec?.won ? 'Replay for more stars' : 'Ready') : 'Locked: win the previous mission'}</span>`;
      b.onclick = () => { scene.focus(m.focus); if (open) showBriefing(m); };
      li.append(b);
      ol.append(li);
    }
  };

  const showBriefing = (m: MissionDef) => {
    showMenu('brief');
    scene.focus(m.focus);
    $('s3-brief-title').textContent = `${m.index}. ${m.title}, ${m.year}`;
    $('s3-brief-body').innerHTML = `<p>${esc(m.briefing)}</p><dl>
      <dt>Objective</dt><dd>${esc(m.objective.text)}</dd>
      <dt>Time</dt><dd>${m.limit} months; finish within ${m.par} for the second star</dd>
      <dt>Bonus</dt><dd>${esc(m.bonus.text)}</dd>
      <dt>Reward</dt><dd>${esc(m.reward.text)}</dd>
      ${progress.results[m.id] ? `<dt>Best</dt><dd>${stars(progress.results[m.id].stars)}</dd>` : ''}</dl>`;
    ($('s3-brief-go') as HTMLButtonElement).disabled = !m.start;
    $('s3-brief-go').onclick = () => void startMissionUI(m);
  };

  const renderObjectives = () => {
    const box = $('s3-obj');
    const m = game?.mission;
    if (!m || !game) { box.hidden = true; return; }
    const def = MISSION_BY_ID[m.id];
    const o = def.objective.check(game.state, m.run);
    box.hidden = false;
    $('s3-obj-title').innerHTML = `Mission ${def.index}: ${esc(def.title)}<small>${m.run.months}/${def.limit} months</small>`;
    $('s3-obj-body').innerHTML = `<p><b>${esc(def.objective.text)}</b></p><p class="${o.met ? 'ok' : ''}">${esc(o.progress)}</p>`
      + `<p><span class="k">★★ </span>finish within ${def.par} months${m.run.months > def.par ? ' (missed)' : ` (${def.par - m.run.months} left)`}</p>`
      + `<p><span class="k">★★★ </span>${esc(def.bonus.text)}</p>`;
  };
  $('s3-obj-t').onclick = () => { const b = $('s3-obj'); b.classList.toggle('collapsed'); $('s3-obj-t').textContent = b.classList.contains('collapsed') ? '+' : '–'; };

  // ── tutorial ──
  let pulsed: Element | null = null;
  const renderTutorial = () => {
    pulsed?.classList.remove('pulse');
    pulsed = null;
    const i = game?.mission?.tutorial ?? TUTORIAL.length;
    const step = TUTORIAL[i];
    if (!step || game?.mission?.result) { $('s3-tut').hidden = true; return; }
    $('s3-tut').hidden = false;
    $('s3-tut-text').textContent = step.text;
    $('s3-tut-next').hidden = !!step.until;
    if (step.target) {
      pulsed = root.querySelector(step.target);
      pulsed?.classList.add('pulse');
      if (step.target === '#s3-divan' && divan.classList.contains('collapsed')) $('s3-divan-t').click();
      if (step.target === '#s3-divan' && window.innerWidth <= 820) divan.classList.remove('hidden-m');
    }
  };
  const tutorialEvent = (e: TutorialEvent) => {
    const m = game?.mission;
    if (!m) return;
    const step = TUTORIAL[m.tutorial];
    if (step?.until === e) { m.tutorial++; renderTutorial(); }
  };
  $('s3-tut-next').onclick = () => { if (game?.mission) { game.mission.tutorial++; renderTutorial(); void persist(); } };
  $('s3-tut-skip').onclick = () => { if (game?.mission) { game.mission.tutorial = TUTORIAL.length; renderTutorial(); void persist(); } };

  // ── province orders (click the map) ──
  let pointer = { x: 0, y: 0 };
  const closeProvince = () => { $('s3-prov').hidden = true; };
  const openProvince = (pid: string | null) => {
    if (!game || !pid || inPalace) { closeProvince(); return; }
    const s = game.state;
    const p = s.provinces[pid];
    const acts = provinceActions(s, pid);
    $('s3-prov-title').innerHTML = `${esc(p.name)}<small>${p.owner === 'ottoman' ? 'yours' : esc(s.neighbours[p.owner as NeighbourId]?.name ?? '')}</small>`;
    const body = $('s3-prov-body');
    body.innerHTML = acts.length ? '' : '<p class="note">No orders to give here.</p>';
    for (const a of acts) {
      const b = document.createElement('button');
      b.className = 'opt';
      b.textContent = a.label;
      b.disabled = busy;
      b.onclick = () => { addOrders([a.action], ''); closeProvince(); };
      body.append(b);
      if (a.note) { const n = document.createElement('p'); n.className = 'note'; n.textContent = a.note; body.append(n); }
    }
    const el = $('s3-prov');
    el.hidden = false;
    const r = root.getBoundingClientRect();
    el.style.left = `${Math.max(10, Math.min(pointer.x - r.left + 16, r.width - 340))}px`;
    el.style.top = `${Math.max(74, Math.min(pointer.y - r.top - 20, r.height - el.offsetHeight - 160))}px`;
    tip.hidden = true;
    tutorialEvent('provincePanel');
  };
  scene.onClick = (pid) => openProvince(pid);
  $('s3-prov-x').onclick = closeProvince;
  root.querySelector('.map')!.addEventListener('pointermove', (e) => { pointer = { x: (e as PointerEvent).clientX, y: (e as PointerEvent).clientY }; });

  const start = async (g: SaveGame, fresh: boolean) => {
    game = g;
    $('s3-start').hidden = true;
    $('s3-res').hidden = true;
    closeProvince();
    renderTutorial();
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
  $('s3-menu').onclick = () => showMenu('main');
  $('s3-scn').onchange = () => { $('s3-year-w').hidden = ($('s3-scn') as HTMLSelectElement).value !== 'fictional'; };
  $('s3-new').onclick = () => {
    const scenario = ($('s3-scn') as HTMLSelectElement).value as 'mehmed1451';
    const difficulty = ($('s3-dif') as HTMLSelectElement).value as 'normal';
    const year = Number(($('s3-year') as HTMLInputElement).value) || 1460;
    const state: GameState = createGame({ scenario, difficulty, seed: Math.floor(Math.random() * 1e9), fictional: { year } });
    void start({ state, orders: [], chronicle: [], narration: '', warnings: [] }, true);
  };
  $('s3-m-cont').onclick = () => {
    if (!game) return;
    $('s3-start').hidden = true;
    if (game.mission?.result) showResults(MISSION_BY_ID[game.mission.id], game.mission.result);
  };
  $('s3-m-camp').onclick = () => showMenu('camp');
  $('s3-m-sand').onclick = () => { if (sandboxUnlocked(progress)) showMenu('sand'); };
  $('s3-camp-back').onclick = () => showMenu('main');
  $('s3-sand-back').onclick = () => showMenu('main');
  $('s3-brief-back').onclick = () => showMenu('camp');

  const refreshStart = () => {
    $('s3-m-cont').hidden = !game;
    $('s3-cont-note').textContent = game ? `${game.mission ? `Mission ${MISSION_BY_ID[game.mission.id].index}: ${MISSION_BY_ID[game.mission.id].title}` : 'Sandbox'} · ${game.state.sultan.name}, ${fmtDate(game.state.date)}` : '';
    const sand = sandboxUnlocked(progress);
    ($('s3-m-sand') as HTMLButtonElement).disabled = !sand;
    $('s3-sand-note').textContent = sand ? 'Free play from any reign' : 'Unlocked by winning Mission 3, Constantinople';
    $('s3-ai').textContent = oracle.online ? 'Claude narrates the chronicle and reads your written orders.' : 'Claude is not connected: the plain chronicle is shown and you give orders with buttons.';
  };

  // fps readout (toggle with F)
  const fpsEl = $('s3-fps');
  let showFps = false;
  window.addEventListener('keydown', (e) => { if (e.key === 'f' && document.activeElement?.tagName !== 'INPUT') { showFps = !showFps; fpsEl.textContent = ''; } });
  setInterval(() => { if (showFps) fpsEl.textContent = `${scene.fps()} fps`; }, 500);

  // ── boot ──
  const boot = async () => {
    progress = (await opts.storage.loadProgress?.()) ?? newProgress();
    const saved = opts.resume ?? (await opts.storage.load());
    if (saved?.state) {
      game = saved;
      if (opts.resume) { void start(saved, false); return; }
      scene.setState(saved.state, true);
      scene.focus(saved.state.capital);
    }
    showMenu('main');
  };
  void boot();

  return {
    setOracle(o: Oracle) { oracle = o; refreshStart(); },
    /** Re-read campaign progress after the storage backend changes (artifact: account storage arrives late). */
    async reloadProgress() { progress = (await opts.storage.loadProgress?.()) ?? progress; refreshStart(); if (!$('s3-v-camp').hidden) renderMissions(); },
    /** Test hook: record these orders and end the month. */
    async play(actions: Action[]) { if (game) { game.orders = actions; await endMonth(); } },
    get game() { return game; },
    get scene() { return scene; },
    get palace() { return palace; },
    dispose() { scene.dispose(); root.innerHTML = ''; },
  };
}
