// A private audience in the palace: the courtier speaks, the Sultan questions him, hears the rest of the
// Divan, speaks freely (through Claude when available) and rules. Every figure comes from the engine.
import type { GameState, Minister, PendingDilemma } from '../engine/types';
import type { Npc } from './palace/scene';
import type { Oracle, Turn } from './oracle';
import { optionEffects, divanCounsel, adviceLine, answer, reaction, officeReport, divanVoices, address, type OptionEffects } from '../court/counsel';
import { LETTERS } from '../llm/context';

type Line = { who: 'them' | 'sultan' | 'note'; text: string; fresh?: boolean };

export interface AudienceDeps {
  body: HTMLElement;
  state(): GameState | null;
  orders(): { type: string; dilemmaId?: string; optionId?: string }[];
  busy(): boolean;
  oracle(): Oracle;
  rule(dilemmaId: string, optionId: string): void;
  /** the narrator's speech for this person this month, if any */
  speechFor(name: string): string | null;
  /** static content for people with no matter (reports, treasury actions…) */
  extras(npc: Npc, into: HTMLElement): void;
  /** the person starts or stops speaking (for animation) */
  speaking?(npc: Npc, on: boolean): void;
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const md = (t: string) => esc(t).replace(/\*([^*]+)\*/g, '<em>$1</em>');

type Ask = 'cost' | 'who' | 'advice' | 'sound' | 'divan' | 'alternatives' | 'report';
const ASK_TEXT: Record<Ask, string> = {
  cost: 'What will each course cost us?',
  who: 'Who gains by it, and who loses?',
  advice: 'What is your counsel?',
  sound: 'Are your figures sound?',
  divan: 'What say the others of the Divan?',
  alternatives: 'Are any courses closed to us?',
  report: 'How stands your office?',
};

export function createAudience(deps: AudienceDeps) {
  const logs = new Map<string, Line[]>();
  let npc: Npc | null = null;
  let focus = 0;
  let typing: number | null = null;
  let waiting = false;

  const key = (s: GameState, n: Npc) => `${s.turn}:${n.id}`;
  const minister = (s: GameState, n: Npc): Minister | undefined => Object.values(s.ministers).find((m) => m.name === n.name);
  const matters = (s: GameState, n: Npc) => s.pendingDilemmas.filter((d) => n.dilemmas.includes(d.id));
  const log = () => {
    const s = deps.state()!;
    const k = key(s, npc!);
    if (!logs.has(k)) logs.set(k, opening(s, npc!));
    return logs.get(k)!;
  };

  function opening(s: GameState, n: Npc): Line[] {
    const m = minister(s, n);
    const ds = matters(s, n);
    if (ds.length) {
      const said = deps.speechFor(n.name);
      if (said) return [{ who: 'them', text: said, fresh: true }];
      const d = ds[0];
      const a = m ? address(m, s.turn) : 'My Sultan';
      const more = ds.length > 1 ? ` And there ${ds.length === 2 ? 'is one more matter' : `are ${ds.length - 1} more matters`} I must lay before you.` : '';
      return [{ who: 'them', text: `*${n.kind === 'valide' ? 'She inclines her head.' : 'He bows low and kisses the hem of your robe.'}* ${a}, a matter awaits your judgement: ${d.title.replace(/\s*\(.*\)$/, '').toLowerCase()}. ${d.brief}${more}`, fresh: true }];
    }
    if (m) return [{ who: 'them', text: `*He bows.* ${address(m, s.turn)}, your servant has nothing before the Divan this month. What would you know?`, fresh: true }];
    return [];
  }

  const say = (who: Line['who'], text: string) => { log().push({ who, text, fresh: who === 'them' }); render(); };

  function ask(q: Ask, d?: PendingDilemma, eff?: OptionEffects[]) {
    const s = deps.state()!;
    const m = minister(s, npc!);
    if (!m) return;
    log().push({ who: 'sultan', text: ASK_TEXT[q] });
    let reply = '';
    if (q === 'report') reply = officeReport(s, m);
    else if (q === 'divan' && d && eff) reply = `*He glances along the bench.* ${address(m, s.turn + 3)}, the Divan is not of one mind.\n${divanVoices(s, d, eff, m.name).join('\n')}`;
    else if (d && eff) reply = q === 'advice' ? adviceLine(s, m, divanCounsel(s, d, eff).find((c) => c.name === m.name)!, eff, d) : answer(s, m, d, eff, q as 'cost');
    say('them', reply);
  }

  async function speak(text: string) {
    const s = deps.state()!;
    const n = npc!;
    const history: Turn[] = log().filter((l) => l.who !== 'note').map((l) => ({ who: l.who === 'sultan' ? 'sultan' : 'them', text: l.text }));
    log().push({ who: 'sultan', text });
    const oracle = deps.oracle();
    if (!oracle.online) {
      log().push({ who: 'note', text: 'Free speech needs Claude. Ask with the questions below, or rule with the buttons.' });
      return render();
    }
    const line: Line = { who: 'them', text: '…' };
    log().push(line);
    waiting = true;
    render();
    deps.speaking?.(n, true);
    const out = await oracle.converse(s, { name: n.name, title: n.title, kind: n.kind, dilemmas: n.dilemmas, note: n.note }, history, text, (t) => {
      line.text = t;
      if (npc === n) renderLog();
    });
    deps.speaking?.(n, false);
    waiting = false;
    if (out) line.text = out;
    else { line.who = 'note'; line.text = 'The courtier could not be heard (Claude is unavailable). Use the questions below.'; }
    if (npc === n) render();
  }

  function rule(d: PendingDilemma, optionId: string, eff: OptionEffects[]) {
    const s = deps.state()!;
    deps.rule(d.id, optionId);
    const label = d.options.find((o) => o.id === optionId)?.label ?? '';
    log().push({ who: 'sultan', text: `On ${d.title.replace(/\s*\(.*\)$/, '').toLowerCase()}: ${label}. So I have ruled.` });
    const m = minister(s, npc!);
    if (m) log().push({ who: 'them', text: reaction(s, m, eff, optionId), fresh: true });
    else log().push({ who: 'them', text: 'It shall be as you command.', fresh: true });
    const ds = matters(s, npc!);
    const next = ds.findIndex((x) => !deps.orders().some((o) => o.type === 'resolveDilemma' && o.dilemmaId === x.id));
    if (next >= 0 && next !== focus) { focus = next; log().push({ who: 'them', text: `And the next matter, ${ds[next].title.replace(/\s*\(.*\)$/, '').toLowerCase()}: ${ds[next].brief}`, fresh: true }); }
    render();
  }

  // ── rendering ──
  let logEl: HTMLElement | null = null;

  function renderLog() {
    if (!logEl) return;
    const lines = log();
    logEl.innerHTML = '';
    lines.forEach((l, i) => {
      const p = document.createElement('p');
      p.className = `ln ${l.who}`;
      const last = i === lines.length - 1;
      if (l.fresh && last) {
        l.fresh = false;
        typewrite(p, l.text);
      } else p.innerHTML = md(l.text).replace(/\n/g, '<br>');
      logEl!.append(p);
    });
    logEl.scrollTop = logEl.scrollHeight;
  }

  function typewrite(p: HTMLElement, text: string) {
    if (typing) cancelAnimationFrame(typing);
    if (npc) deps.speaking?.(npc, true);
    const who = npc;
    const start = performance.now();
    const cps = 70;
    const tick = () => {
      const n = Math.min(text.length, Math.floor(((performance.now() - start) / 1000) * cps));
      p.innerHTML = md(text.slice(0, n)).replace(/\n/g, '<br>');
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
      if (n < text.length && npc === who) typing = requestAnimationFrame(tick);
      else { typing = null; p.innerHTML = md(text).replace(/\n/g, '<br>'); if (who) deps.speaking?.(who, false); }
    };
    p.onclick = () => { if (typing) { cancelAnimationFrame(typing); typing = null; p.innerHTML = md(text).replace(/\n/g, '<br>'); if (who) deps.speaking?.(who, false); } };
    tick();
  }

  function render() {
    const s = deps.state();
    if (!npc || !s) return;
    const body = deps.body;
    body.innerHTML = '';
    logEl = document.createElement('div');
    logEl.className = 'aud-log';
    body.append(logEl);
    renderLog();
    const ctl = document.createElement('div');
    ctl.className = 'aud-ctl';
    body.append(ctl);

    const ds = matters(s, npc);
    const m = minister(s, npc);
    const busy = deps.busy() || waiting;
    const chip = (label: string, fn: () => void, title?: string) => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = label; b.disabled = busy; if (title) b.title = title; b.onclick = fn; return b; };
    const chips = document.createElement('div');
    chips.className = 'chips';
    let matterCard: HTMLElement | null = null;

    if (ds.length) {
      focus = Math.min(focus, ds.length - 1);
      const d = ds[focus];
      const eff = optionEffects(s, d);
      const counsel = divanCounsel(s, d, eff);
      const chosen = deps.orders().find((o) => o.type === 'resolveDilemma' && o.dilemmaId === d.id);
      const card = document.createElement('div');
      card.className = 'matter';
      if (ds.length > 1) {
        const tabs = document.createElement('div');
        tabs.className = 'tabs';
        ds.forEach((x, i) => {
          const done = deps.orders().some((o) => o.type === 'resolveDilemma' && o.dilemmaId === x.id);
          const t = chip(`${done ? '✓ ' : ''}${x.title.replace(/\s*\(.*\)$/, '')}`, () => { focus = i; render(); });
          if (i === focus) t.classList.add('on');
          tabs.append(t);
        });
        card.append(tabs);
      } else {
        const h = document.createElement('div');
        h.className = 'mt';
        h.textContent = d.title;
        card.append(h);
      }
      const acts = document.createElement('div');
      acts.className = 'acts';
      d.options.forEach((o, j) => {
        const backers = counsel.filter((c) => c.recommends === o.id).map((c) => short(c.title));
        const b = document.createElement('button');
        b.className = `opt${chosen?.optionId === o.id ? ' chosen' : ''}`;
        b.disabled = !o.available || busy;
        b.innerHTML = `<b>${LETTERS[j]}</b><span>${esc(o.label)}<span>${esc(o.summary)}${o.available ? '' : ' (not possible now)'}</span>${backers.length ? `<i class="backers">Favoured by ${esc(backers.length > 2 ? `${backers.slice(0, 2).join(', ')} and ${backers.length - 2} more` : backers.join(' and '))}</i>` : ''}</span>`;
        b.onclick = () => rule(d, o.id, eff);
        acts.append(b);
      });
      card.append(acts);
      const foot = document.createElement('p');
      foot.className = 'who2';
      foot.textContent = chosen ? 'Your ruling is recorded. It takes effect when the month ends; you may still change it.' : `If you give no ruling: ${d.options.find((o) => o.id === d.defaultOptionId)?.label ?? ''}.`;
      card.append(foot);
      matterCard = card;
      if (m) {
        (['advice', 'cost', 'who', 'divan', 'sound'] as Ask[]).forEach((q) => chips.append(chip(ASK_TEXT[q], () => ask(q, d, eff))));
        if (eff.some((e) => !e.available)) chips.append(chip(ASK_TEXT.alternatives, () => ask('alternatives', d, eff)));
      }
    } else {
      const extra = document.createElement('div');
      deps.extras(npc, extra);
      if (extra.childNodes.length) matterCard = extra;
      if (m) chips.append(chip(ASK_TEXT.report, () => ask('report')));
    }
    if (npc.kind !== 'guard') {
      const row = document.createElement('form');
      row.className = 'speak';
      const input = document.createElement('input');
      input.placeholder = deps.oracle().online ? `Speak to ${npc.name.split(' ')[0]}…` : 'Free speech needs Claude';
      input.disabled = busy || !deps.oracle().online;
      input.maxLength = 600;
      const go = document.createElement('button');
      go.textContent = 'Speak';
      go.disabled = input.disabled;
      row.append(input, go);
      row.onsubmit = (e) => { e.preventDefault(); const t = input.value.trim(); if (t) void speak(t); };
      ctl.append(row);
    }
    if (chips.childNodes.length) ctl.append(chips);
    if (matterCard) ctl.append(matterCard);
  }

  return {
    open(n: Npc) {
      npc = n;
      focus = 0;
      const s = deps.state();
      if (s) {
        const ds = matters(s, n);
        const open = ds.findIndex((x) => !deps.orders().some((o) => o.type === 'resolveDilemma' && o.dilemmaId === x.id));
        focus = Math.max(0, open);
      }
      render();
    },
    close() { if (typing) cancelAnimationFrame(typing); typing = null; if (npc) deps.speaking?.(npc, false); npc = null; logEl = null; },
    render,
    get current() { return npc; },
  };
}

function short(title: string) {
  return title.replace(/\s*\(.*\)/, '').replace(/^(The )?/, '').replace(/ of the Janissaries/, '').replace('Beylerbey of ', 'Bey of ');
}
