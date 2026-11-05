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
