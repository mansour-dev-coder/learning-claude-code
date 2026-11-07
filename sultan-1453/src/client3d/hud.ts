// DOM overlay for the 3D map: HUD ledger, Divan panel, chronicle panel, command bar, tooltip, start screen.
export const HUD_CSS = `
.s3 { --bg: rgba(16,20,30,.82); --bg2: rgba(28,34,48,.92); --ink: #eef1f6; --muted: #a8b2c3; --line: rgba(255,255,255,.12);
  --gold: #e9c46a; --crimson: #e05a4f; --turq: #4fc3b8; --cobalt: #8fb0ff;
  --display: "Alegreya SC", "Palatino Linotype", Georgia, serif; --body: "Alegreya", Georgia, serif; --ui: "Alegreya Sans", system-ui, sans-serif;
  position: relative; width: 100%; height: 100%; overflow: hidden; background: #9fc4dc; color: var(--ink); font: 15px/1.45 var(--ui); color-scheme: dark; }
.s3 * { box-sizing: border-box; }
.s3 [hidden] { display: none !important; }
.s3 .map { position: absolute; inset: 0; }
.s3 .panel { position: absolute; background: var(--bg); backdrop-filter: blur(6px); border: 1px solid var(--line); border-radius: 10px; }
.s3 button { font: 600 14px/1.2 var(--ui); color: var(--ink); background: var(--bg2); border: 1px solid var(--line); border-radius: 7px; padding: 8px 12px; cursor: pointer; }
.s3 button:hover:not(:disabled) { border-color: var(--gold); }
.s3 button:focus-visible, .s3 input:focus-visible, .s3 select:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.s3 button:disabled { opacity: .45; cursor: default; }
.s3 button.primary { background: #9b2a22; border-color: #c2453a; }
.s3 h2, .s3 h3, .s3 h4 { font-family: var(--display); margin: 0; letter-spacing: .02em; }

/* top HUD */
.s3 .hud { top: max(10px, env(safe-area-inset-top, 0px)); left: max(10px, env(safe-area-inset-left, 0px)); right: max(10px, env(safe-area-inset-right, 0px));
  display: flex; flex-wrap: wrap; gap: 6px 18px; align-items: center; padding: 8px 12px; }
.s3 .hud .brand { font: 700 18px var(--display); color: var(--gold); }
.s3 .hud .date { font-weight: 700; }
.s3 .hud .date small { color: var(--muted); font-weight: 400; margin-left: 6px; }
.s3 .stat { display: grid; line-height: 1.1; }
.s3 .stat .k { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; }
.s3 .stat .v { font-weight: 700; font-variant-numeric: tabular-nums; }
.s3 .stat.bad .v { color: var(--crimson); } .s3 .stat.good .v { color: var(--turq); }
.s3 .facs { display: flex; gap: 5px; align-items: flex-end; height: 30px; }
.s3 .fac { width: 9px; height: 100%; background: rgba(255,255,255,.12); border-radius: 2px; position: relative; }
.s3 .fac i { position: absolute; bottom: 0; left: 0; right: 0; background: var(--turq); border-radius: 2px; }
.s3 .fac i.low { background: var(--crimson); }
.s3 .hud .spacer { flex: 1; }
.s3 .tabs { display: none; gap: 6px; }
.s3 .hud.min .stat:not(.keep), .s3 .hud.min .facs, .s3 .hud.min .brand { display: none; }
.s3 .phead h3 small { font: 500 13px var(--ui); color: var(--muted); margin-left: 8px; letter-spacing: 0; }
.s3 .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--gold); margin-left: 8px; vertical-align: 2px; }
.s3 .dot[hidden] { display: none; }
.s3 .legend { left: max(10px, env(safe-area-inset-left, 0px)); bottom: 150px; width: min(280px, calc(100% - 20px)); padding: 10px 12px; display: grid; gap: 5px; font-size: 13px; z-index: 3; }
.s3 .legend .sw { display: inline-block; width: 14px; height: 14px; border-radius: 3px; margin-right: 8px; vertical-align: -2px; border: 1px solid rgba(255,255,255,.35); }
.s3 .legend .sub { color: var(--muted); margin-left: 4px; }
.s3 .legend .kind { display: flex; gap: 8px; align-items: center; color: var(--muted); }

/* side panels */
.s3 .divan { top: 74px; right: max(10px, env(safe-area-inset-right, 0px)); bottom: 150px; width: 360px; display: flex; flex-direction: column; }
.s3 .chron { top: 74px; left: max(10px, env(safe-area-inset-left, 0px)); bottom: 150px; width: 420px; display: flex; flex-direction: column; }
.s3 .phead { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--line); }
.s3 .phead h3 { font-size: 17px; color: var(--gold); }
.s3 .pbody { overflow-y: auto; padding: 12px 14px; display: grid; gap: 12px; align-content: start; }
.s3 .chron .pbody { font: 16px/1.55 var(--body); }
.s3 .chron h2 { font-size: 22px; color: var(--gold); margin-bottom: 4px; }
.s3 .chron h3 { font-size: 16px; color: var(--turq); margin-top: 10px; }
.s3 .chron p { margin: 0 0 8px; }
.s3 .chron ul { margin: 0 0 8px; padding-left: 18px; }
.s3 .warn { font: 12px var(--ui); color: var(--crimson); margin: 0; }
.s3 .thinking { color: var(--muted); font-style: italic; }
.s3 .collapsed .pbody { display: none; }
.s3 .collapsed { bottom: auto !important; }
.s3 .collapsed .phead { border-bottom: none; }

.s3 .dl { border: 1px solid var(--line); border-radius: 8px; padding: 10px; display: grid; gap: 8px; background: rgba(255,255,255,.03); }
.s3 .dl header { display: flex; gap: 10px; }
.s3 .dl .num { flex: none; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--gold); color: #1a1a1a; font-weight: 700; font-size: 13px; }
.s3 .dl h4 { font-size: 15px; }
.s3 .dl .who { margin: 0; color: var(--muted); font-size: 13px; }
.s3 .dl .brief { margin: 0; color: #cfd6e2; font-size: 13.5px; }
.s3 .opt { text-align: left; display: flex; gap: 8px; padding: 7px 9px; font-weight: 500; }
.s3 .opt b { color: var(--gold); text-transform: uppercase; }
.s3 .opt span span { display: block; color: var(--muted); font-size: 12.5px; font-weight: 400; margin-top: 2px; }
.s3 .opt.chosen { border-color: var(--gold); background: rgba(233,196,106,.16); }
.s3 .dl .def { margin: 0; font-size: 12px; color: var(--muted); }
.s3 .ending { border: 1px solid var(--crimson); border-radius: 8px; padding: 12px; display: grid; gap: 8px; }

/* command bar */
.s3 .cmd { left: 50%; transform: translateX(-50%); bottom: max(10px, env(safe-area-inset-bottom, 0px)); width: min(900px, calc(100% - 20px)); padding: 10px; display: grid; gap: 8px; }
.s3 .cmd .row { display: flex; gap: 8px; }
.s3 .cmd input { flex: 1; min-width: 0; font: 15px var(--ui); color: var(--ink); background: rgba(0,0,0,.35); border: 1px solid var(--line); border-radius: 7px; padding: 9px 11px; }
.s3 .chips { display: flex; flex-wrap: wrap; gap: 6px; }
.s3 .chip { font-size: 12.5px; background: rgba(233,196,106,.14); border: 1px solid rgba(233,196,106,.4); border-radius: 999px; padding: 3px 4px 3px 10px; display: inline-flex; gap: 4px; align-items: center; max-width: 100%; }
.s3 .chip button { padding: 0 6px; border: none; background: none; color: var(--crimson); font-size: 16px; }
.s3 .reply { margin: 0; font-size: 13px; color: #d8dee8; white-space: pre-line; }
.s3 .reply:empty { display: none; }

/* tooltip */
.s3 .tip { position: absolute; pointer-events: none; max-width: 270px; padding: 9px 11px; font-size: 13px; z-index: 5; }
.s3 .tip h4 { font-size: 15px; color: var(--gold); margin-bottom: 3px; }
.s3 .tip p { margin: 0; color: #d3dae6; }
.s3 .tip .own { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }

/* start */
.s3 .start { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(10,14,22,.55); z-index: 10; padding: 16px; }
.s3 .start .card { width: min(560px, 100%); padding: 22px; display: grid; gap: 14px; position: relative; }
.s3 .start h2 { font-size: 34px; color: var(--gold); }
.s3 .start p { margin: 0; color: #d6dce6; }
.s3 .start label { display: grid; gap: 5px; font-size: 13px; color: var(--muted); }
.s3 .start select, .s3 .start input { width: 100%; font: 15px var(--ui); color: var(--ink); background: rgba(0,0,0,.35); border: 1px solid var(--line); border-radius: 7px; padding: 9px; }
.s3 .placebar { left: 50%; transform: translateX(-50%); top: 74px; display: flex; gap: 6px; align-items: center; padding: 6px 8px; flex-wrap: wrap; justify-content: center; max-width: calc(100% - 20px); }
.s3 .placebar b { font: 700 15px var(--display); color: var(--gold); margin: 0 6px; }
.s3 .placebar button { padding: 6px 10px; font-size: 13px; }
.s3 .prompt { left: 50%; transform: translateX(-50%); bottom: 168px; padding: 8px 14px; font-size: 14px; }
.s3 .dlg { left: 50%; transform: translateX(-50%); bottom: 150px; width: min(640px, calc(100% - 20px)); max-height: 58%; display: flex; flex-direction: column; z-index: 4; }
.s3 .dlg .pbody { font: 15.5px/1.5 var(--body); }
.s3 .dlg .speech { margin: 0; }
.s3 .dlg .who2 { color: var(--muted); font: 13px var(--ui); margin: 0; }
.s3 .dlg .acts { display: grid; gap: 6px; }
.s3 .hint { font: 12px var(--ui); color: var(--muted); }
.s3 .fps { position: absolute; right: 12px; bottom: 8px; font: 11px var(--ui); color: rgba(255,255,255,.7); text-shadow: 0 1px 2px #000; pointer-events: none; }

.s3 .menu { width: min(760px, 100%); max-height: calc(100% - 32px); overflow-y: auto; }
.s3 .menu-btns { display: grid; gap: 10px; }
.s3 .menu-btns.row { display: flex; gap: 8px; }
.s3 button.big { display: grid; text-align: left; gap: 2px; padding: 14px 16px; }
.s3 button.big b { font: 700 19px var(--display); letter-spacing: .03em; }
.s3 button.big span { font: 400 13px var(--ui); color: var(--muted); }
.s3 button.big.primary span { color: #f3d6cf; }
.s3 .fine { font-size: 13px; color: var(--muted); }
.s3 .vhead { display: flex; gap: 12px; align-items: center; }
.s3 .vhead h2 { font-size: 26px; }
.s3 .missions { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
.s3 .mission { text-align: left; display: grid; gap: 3px; padding: 12px; width: 100%; height: 100%; }
.s3 .mission .yr { font: 600 12px var(--ui); color: var(--muted); letter-spacing: .08em; }
.s3 .mission b { font: 700 17px var(--display); }
.s3 .mission .stars { color: var(--gold); letter-spacing: 2px; font-size: 15px; }
.s3 .stars .off { color: rgba(255,255,255,.18); }
.s3 .mission .lock { color: var(--muted); font-size: 12.5px; }
.s3 .mission.locked { opacity: .55; }
.s3 .mission.done { border-color: rgba(233,196,106,.6); }
.s3 .brief-body { display: grid; gap: 10px; font: 16px/1.5 var(--body); }
.s3 .brief-body dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; font: 14px/1.4 var(--ui); }
.s3 .brief-body dt { color: var(--muted); }
.s3 .brief-body dd { margin: 0; }
.s3 .results { width: min(620px, 100%); max-height: calc(100% - 32px); overflow-y: auto; }
.s3 .results .bigstars { font-size: 44px; letter-spacing: 8px; color: var(--gold); text-align: center; }
.s3 .results .bigstars .off { color: rgba(255,255,255,.18); }
.s3 .results h2 { text-align: center; }
.s3 .results dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; }
.s3 .results dt { color: var(--muted); }
.s3 .results dd { margin: 0; font-variant-numeric: tabular-nums; }
.s3 .results ul { margin: 0; padding-left: 18px; font: 15px/1.5 var(--body); color: #dfe4ec; }
.s3 .results .reward { border: 1px solid rgba(233,196,106,.5); border-radius: 8px; padding: 10px 12px; background: rgba(233,196,106,.1); }
.s3 .obj { top: 140px; left: max(10px, env(safe-area-inset-left, 0px)); width: 420px; }
.s3 .obj .pbody { font-size: 14px; gap: 6px; }
.s3 .obj .pbody p { margin: 0; }
.s3 .obj .k { color: var(--muted); }
.s3 .obj .ok { color: var(--turq); }
.s3 .tut { left: 50%; transform: translateX(-50%); bottom: 150px; width: min(560px, calc(100% - 20px)); padding: 12px 14px; display: grid; gap: 8px; z-index: 6; border-color: rgba(233,196,106,.6); }
.s3 .tut p { margin: 0; font: 15.5px/1.5 var(--body); }
.s3 .tut .tut-who { font: 700 14px var(--display); color: var(--gold); }
.s3 .tut .row { display: flex; gap: 8px; }
.s3 .pulse { outline: 2px solid var(--gold) !important; outline-offset: 3px; animation: s3pulse 1.4s ease-in-out infinite; }
@keyframes s3pulse { 50% { outline-color: rgba(233,196,106,.25); } }
@media (prefers-reduced-motion: reduce) { .s3 .pulse { animation: none; } }
.s3 .prov { width: 320px; z-index: 5; }
.s3 .prov .pbody { gap: 6px; }
.s3 .prov .note { font-size: 12.5px; color: var(--muted); margin: -2px 0 4px; }
.s3 .watch { justify-self: start; }

@media (max-width: 820px) {
  .s3 .obj { top: auto; bottom: 150px; left: 10px; right: 10px; width: auto; }
  .s3 .prov { left: 10px !important; right: 10px; width: auto; top: auto !important; bottom: 150px; }
  .s3 .tut { bottom: 205px; }
  .s3 .hud .facs, .s3 .hud .opt-stat { display: none; }
  .s3 .tabs { display: flex; }
  .s3 .divan, .s3 .chron { left: 10px; right: 10px; width: auto; top: auto; bottom: 150px; max-height: 52%; }
  .s3 .panel.hidden-m { display: none; }
  .s3 .hud .brand, .s3 .phead button { display: none; }
  .s3 .hud { gap: 4px 12px; padding: 6px 10px; }
  .s3 .collapsed .pbody { display: grid; }
  .s3 .collapsed { bottom: 150px !important; }
  .s3 .cmd .row { flex-wrap: wrap; }
  .s3 .cmd input { flex-basis: 100%; }
  .s3 .cmd button { flex: 1; }
  .s3 .placebar { top: auto; bottom: 150px; flex-wrap: nowrap; padding: 5px 6px; gap: 4px; }
  .s3 .placebar button { padding: 6px 8px; }
  .s3 .placebar .hint, .s3 .placebar b { display: none; }
  .s3 .dlg { bottom: 200px; max-height: 50%; }
  .s3 .prompt { bottom: 198px; font-size: 13px; padding: 6px 10px; }
}
`;

export const HUD_HTML = `
<div class="map"></div>
<div class="panel hud">
  <span class="brand">Sultan: 1453</span>
  <span class="date" id="s3-date"></span>
  <div class="stat keep"><span class="k">Treasury</span><span class="v" id="s3-tre"></span></div>
  <div class="stat" id="s3-net-w"><span class="k">Monthly</span><span class="v" id="s3-net"></span></div>
  <div class="stat opt-stat" id="s3-arr-w"><span class="k">Arrears</span><span class="v" id="s3-arr"></span></div>
  <div class="stat opt-stat" id="s3-bread-w"><span class="k">Bread</span><span class="v" id="s3-bread"></span></div>
  <div class="stat opt-stat"><span class="k">Army</span><span class="v" id="s3-army"></span></div>
  <div class="facs" id="s3-facs" title="Faction loyalty, as reported"></div>
  <span class="spacer"></span>
  <div class="tabs"><button id="s3-tab-divan">Divan</button><button id="s3-tab-chron">Chronicle</button></div>
  <button id="s3-mode" class="primary">Enter the palace</button>
  <button id="s3-legend-t" aria-pressed="false">Legend</button>
  <button id="s3-menu">Menu</button>
  <button id="s3-hud-t" aria-label="Collapse top bar">–</button>
</div>
<section class="panel chron collapsed" id="s3-chron"><div class="phead"><h3>Chronicle<small id="s3-chron-sub"></small><span class="dot" id="s3-chron-dot" hidden></span></h3><button id="s3-chron-t" aria-label="Expand chronicle">+</button></div><div class="pbody"><div id="s3-narr"></div><div id="s3-warn"></div></div></section>
<section class="panel divan" id="s3-divan"><div class="phead"><h3>The Divan<small id="s3-divan-sub"></small></h3><button id="s3-divan-t" aria-label="Collapse Divan">–</button></div><div class="pbody" id="s3-dilemmas"></div></section>
<section class="panel cmd">
  <div class="row"><input id="s3-cmd" placeholder="Your orders, my Sultan: e.g. pay the customary donative and cast twenty guns" autocomplete="off"><button id="s3-send">Record</button><button id="s3-end" class="primary">End month</button></div>
  <p class="reply" id="s3-reply"></p>
  <div class="chips" id="s3-orders"></div>
</section>
<div class="panel tip" id="s3-tip" hidden></div>
<div class="panel placebar" id="s3-place" hidden><b id="s3-room">The palace</b><button data-room="divan">Divan</button><button data-room="treasury">Treasury</button><button data-room="harem">Harem</button><button data-room="gate">Gate</button><span class="hint">WASD or tap to walk · drag to turn · E or tap a person to speak</span></div>
<div class="panel prompt" id="s3-prompt" hidden></div>
<section class="panel dlg" id="s3-dlg" hidden><div class="phead"><h3 id="s3-dlg-name"></h3><button id="s3-dlg-x" aria-label="Close">×</button></div><div class="pbody" id="s3-dlg-body"></div></section>
<div class="panel legend" id="s3-legend" hidden></div>
<div class="fps" id="s3-fps"></div>
<div class="start" id="s3-start">
  <div class="panel card menu">
    <section id="s3-v-main">
      <h2>Sultan: 1453</h2>
      <p>Rule the House of Osman month by month. Armies march, fleets sail and walls fall on the map; your ministers advise you, not always honestly.</p>
      <div class="menu-btns">
        <button id="s3-m-cont" class="big" hidden><b>Continue</b><span id="s3-cont-note"></span></button>
        <button id="s3-m-camp" class="big primary"><b>Campaign</b><span>Mehmed II, 1451–1481: nine missions</span></button>
        <button id="s3-m-sand" class="big"><b>Sandbox</b><span id="s3-sand-note">Free play from any reign</span></button>
      </div>
      <p id="s3-ai" class="fine"></p>
    </section>
    <section id="s3-v-camp" hidden>
      <div class="vhead"><button id="s3-camp-back">‹ Back</button><h2>The Conqueror’s campaign</h2></div>
      <ol class="missions" id="s3-missions"></ol>
    </section>
    <section id="s3-v-brief" hidden>
      <div class="vhead"><button id="s3-brief-back">‹ Missions</button><h2 id="s3-brief-title"></h2></div>
      <div id="s3-brief-body" class="brief-body"></div>
      <div class="menu-btns row"><button id="s3-brief-go" class="primary">Begin</button></div>
    </section>
    <section id="s3-v-sand" hidden>
      <div class="vhead"><button id="s3-sand-back">‹ Back</button><h2>Sandbox</h2></div>
      <label for="s3-scn">Reign<select id="s3-scn">
        <option value="mehmed1451">Mehmed II, February 1451</option>
        <option value="murad1421">Murad II, June 1421</option>
        <option value="fictional">An unknown Sultan, in a year you choose</option></select></label>
      <label for="s3-year" id="s3-year-w" hidden>Year of accession (1420–1500)<input id="s3-year" type="number" min="1420" max="1500" value="1460"></label>
      <label for="s3-dif">Difficulty<select id="s3-dif"><option value="easy">Gentle</option><option value="normal" selected>Historical</option><option value="hard">Harsh</option></select></label>
      <div class="menu-btns row"><button id="s3-new" class="primary">Ascend the throne</button></div>
    </section>
  </div>
</div>
<div class="start" id="s3-res" hidden><div class="panel card results" id="s3-res-card"></div></div>
<section class="panel obj" id="s3-obj" hidden><div class="phead"><h3 id="s3-obj-title">Mission</h3><button id="s3-obj-t" aria-label="Collapse mission panel">–</button></div><div class="pbody" id="s3-obj-body"></div></section>
<section class="panel tut" id="s3-tut" hidden><p class="tut-who">Çandarlı Halil Pasha, Grand Vizier</p><p id="s3-tut-text"></p><div class="row"><button id="s3-tut-next" class="primary">Next</button><button id="s3-tut-skip">Skip the tutorial</button></div></section>
<section class="panel prov" id="s3-prov" hidden><div class="phead"><h3 id="s3-prov-title"></h3><button id="s3-prov-x" aria-label="Close">×</button></div><div class="pbody" id="s3-prov-body"></div></section>`;
