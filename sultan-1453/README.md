# Sultan: 1453

An LLM-narrated Ottoman strategy game. The Anthropic API plays Game Master and narrator. A deterministic TypeScript engine owns every number.

**Status:** Phase 1 (engine) and Phase 2 (LLM layer) are complete; Phase 3 (UI and saves) and Phase 4 (polish) are in [PLAN.md](PLAN.md).

## Play in the browser

The browser edition is published as a private Claude artifact (`dist/sultan-1453.html`, built with `npm run build:web`). Claude narrates through the viewer's own Claude account, so no API key is needed. Saves go to the viewer's private artifact storage.

## Play it now (terminal)

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...      # or `ant auth login`, then add --online
npm run play                             # Mehmed II, 1451; Claude narrates and parses your orders
npm run play -- --scenario murad1421
npm run play -- --offline                # no API: engine text, choose with "1a 2c"
```

## Engine tools

```bash
npm install
npm test                                   # rng, turn resolver, siege math, event library
npm run sim                                # 24 months of random play, Mehmed II 1451, seed 1453
npm run sim -- --scenario murad1421 --seed 7 --months 60 --full
npm run sim -- --scenario fictional --seed 3
npm run balance                            # surplus under frugal / random / generous play
```

- Design assumptions: [DECISIONS.md](DECISIONS.md)
- Sources for the numbers: [docs/economy.md](docs/economy.md)
- Captured sim runs: `docs/sim-output-*.txt`
