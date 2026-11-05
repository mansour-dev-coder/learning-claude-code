# Sultan: 1453

An LLM-narrated Ottoman strategy game. The Anthropic API plays Game Master and narrator. A deterministic TypeScript engine owns every number.

**Status:** Phase 1 (engine) is complete. Phases 2–4 (LLM layer, UI and saves, polish) are in [PLAN.md](PLAN.md).

```bash
npm install
npm test                                   # rng, turn resolver, siege math, event library
npm run sim                                # 24 months of random play, Mehmed II 1451, seed 1453
npm run sim -- --scenario murad1421 --seed 7 --months 60 --full
npm run sim -- --scenario fictional --seed 3
```

- Design assumptions: [DECISIONS.md](DECISIONS.md)
- Sources for the numbers: [docs/economy.md](docs/economy.md)
- Captured sim runs: `docs/sim-output-*.txt`
