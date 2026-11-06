# Sultan: 1453 — Build Plan

The engine is the single source of truth. The LLM reads engine output and writes prose, or turns free text into
structured `Action`s that the engine validates. Nothing the LLM says ever writes to state.

## File tree (all four phases; Phase 1 is built now)

```
sultan-1453/
├── PLAN.md                     this file
├── DECISIONS.md                every design assumption, so you can override
├── docs/
│   ├── economy.md              sources / reasoning for akçe figures, troop counts, siege times
│   └── sim-output-*.txt        captured `npm run sim` runs
├── scripts/
│   └── sim.ts                  Phase 1 CLI: 24 months of random play, prints the ledger
├── src/
│   ├── engine/                 PHASE 1. Pure TypeScript, no I/O, no LLM
│   │   ├── types.ts            GameState and every sub-type (JSON-serialisable)
│   │   ├── rng.ts              seeded RNG (mulberry32); its state lives inside GameState
│   │   ├── calendar.ts         months, campaign season, weather
│   │   ├── constants.ts        tunable numbers (pay rates, prices, difficulty multipliers)
│   │   ├── data/
│   │   │   ├── provinces.ts    provinces, adjacency, travel times, walls, tax base
│   │   │   ├── neighbours.ts   the nine powers (+ Albania)
│   │   │   ├── laws.ts         kanunname / reform library
│   │   │   ├── projects.ts     waqf & construction library
│   │   │   └── scenarios.ts    Murad II 1421, Mehmed II 1451, fictional Sultan
│   │   ├── state.ts            mutation helpers (adjust faction, treasury, log, schedule)
│   │   ├── economy.ts          revenue / expense lines, arrears, grain
│   │   ├── loyalty.ts          faction equilibria + mean-reverting drift; province loyalty
│   │   ├── war.ts              field battles, siege resolver, campaigns, enemy AI, peace terms
│   │   ├── dynasty.ts          ageing, mortality, princes, assassination, deposition, succession
│   │   ├── intel.ts            what ministers *report* vs. the true figures
│   │   ├── events/
│   │   │   ├── types.ts        EventDef / OptionDef
│   │   │   ├── library.ts      ≥40 dilemmas with conditions and effects
│   │   │   └── select.ts       weighted selection of 2–4 dilemmas per month
│   │   ├── actions.ts          the Action union (also the LLM tool schema target), validation, apply
│   │   ├── turn.ts             resolveTurn(state, actions) → { state, report }
│   │   ├── newGame.ts          createGame(options)
│   │   ├── ledger.ts           plain-text ledger formatter (used by the sim and the LLM context)
│   │   └── index.ts
│   ├── llm/                    PHASE 2
│   │   ├── client.ts           Anthropic SDK wrapper, streaming
│   │   ├── prompts/game_master.md
│   │   ├── prompts/ministers/*.md
│   │   ├── narrate.ts          engine report → streamed prose
│   │   ├── parseCommand.ts     free text → Action[] via tool use (validated by engine)
│   │   └── context.ts          builds the read-only fact sheet the LLM sees
│   └── app/                    PHASE 3 (Next.js App Router)
│       ├── page.tsx            narrative | ledger | command box
│       ├── api/turn/route.ts   POST actions → engine → stream narration
│       ├── api/save/route.ts   Prisma save/load
│       └── components/         Ledger, Narrative, CommandBox, ProvinceMap (SVG)
├── prisma/schema.prisma        PHASE 3
└── tests/
    ├── rng.test.ts
    ├── turn.test.ts            turn resolver invariants, determinism, accounting identity
    ├── siege.test.ts           siege math against historical anchors
    └── events.test.ts          library size, every option applies without throwing
```

## Phases

1. **Engine** — state, turn resolver, economy, loyalty, war/siege, 40+ events, seeded RNG, tests, `npm run sim`. ⟵ stop for review
2. **LLM layer** — GM prompt, minister personas, narration (streaming), command-parsing tool schema, guardrails.
3. **UI + saves** — Next.js three-pane screen, Prisma/SQLite saves, streaming narration, SVG province map.
4. **Polish** — `/historian`, `pause game`, balance pass with the sim.


## Phase 3 (revised): 3D front end

The engine and LLM layer are unchanged. The 3D layer only reads `GameState` and sends `Action`s.

```
src/client3d/                 framework-agnostic 3D game (Three.js + plain DOM), shared by both front ends
├── geo.ts                    map extent, lon/lat → world, hand-drawn coastlines, mountain ridges, province centres
├── terrain.ts                voxel terrain: land/sea grid, heights, biomes, province ownership tint (one InstancedMesh)
├── models.ts                 procedural low-poly models: city, Constantinople, army, galley, siege works, banners
├── markers.ts                armies, fleets and sieges derived from state, tweened month to month
├── scene.ts                  renderer, camera + orbit controls, lights, water, hover picking, render loop
├── hud.ts                    DOM overlay: top HUD (ledger), Divan panel, chronicle panel, command bar, tooltip
├── oracle.ts                 interface for narration and order parsing (HTTP, artifact `sample`, or offline)
├── md.ts                     tiny markdown renderer for the chronicle
└── app.ts                    mountGame(root, oracle, storage): start screen, turn flow, wiring
app/                          Next.js App Router
├── layout.tsx, page.tsx      mounts client3d (client-only)
├── api/narrate/route.ts      streams narration from src/llm (server-side API key)
└── api/orders/route.ts       parses free-text orders via src/llm
web3d/                        artifact build: same client3d + `sample`-based oracle, bundled to one HTML file
├── artifact.ts, template.html, build.mjs
```

**Stages** (stop for review after each):
- **A — strategic map:** terrain, provinces by owner, hover info, armies, fleets, sieges, the HUD ledger, command bar, chronicle panel.
- **B — the palace:** walkable Edirne/Topkapı, with the Divan in the throne room, plus the treasury, harem and Gate.
- **C — cinematics:** siege and battle scenes driven by the engine's result.
