# Design decisions & assumptions

Each entry is something I decided without asking you. To override one, tell me its number.

## Where I departed from the brief (pushback)

1. **No "timar land tax" revenue line.** Timar revenue never reached the treasury; it paid the sipahi directly, and the sipahi showed up with his horse and retainers. Counting it as cash *and* getting free cavalry would double-count. So timars show up as `timarCavalry` per province, and the treasury line is **Crown domains land tax (hass-ı hümayun)**. `grantTimars` turns crown land into timars, which trades cash for cavalry.
2. **"Chief Black Eunuch" is the wrong office for the 15th century.** The Kızlar Ağası became the senior harem officer only in the 1570s–80s. Before that, the palace gatekeeper and intelligence channel was the **Kapı Ağası (Chief White Eunuch)**, and that is who the game uses. The mechanics are the same.
3. **"Valide Sultan" as a title is 16th-century.** I kept the *role*, a senior palace woman who advises and rivals the Sultan, and fill it with whoever historically held that position:
   - 1451: **Mara Hatun** (Mara Branković), Murad II's Serbian widow and Mehmed's stepmother. Mehmed's own mother, Hüma Hatun, died in 1449.
   - 1421: **Emine Hatun**. Sources disagree on whether she was Murad's birth mother, and the game says so.
4. **Şeyhülislam and Kapudan Pasha** are shown as "Mufti (Şeyhülislam)" and "Kapudan". In the 1450s these were the Mufti of Edirne and the sancak bey of Gelibolu commanding the fleet. The pasha-rank admiralty dates from 1533.
5. **Added Albania (Skanderbeg's League of Lezhë)** as a tenth neighbour. Leaving out a war that ran from 1443 to 1468 would gut the realism of the Balkan front. Omitted for now: Bosnia, Moldavia, Trebizond, Candar, Dulkadir (handled through events) and Genoa (handled as the Galata event).

## Scope and time

6. **One turn is one month.** Each turn: orders are applied → unanswered dilemmas take their default → the month resolves → next month's Divan is drawn.
7. **Ignoring a dilemma applies its default option.** Defaults are usually "do nothing" and are rarely free. Every dilemma has one.
8. **Campaign season runs April–October.** Mustering in March is allowed. From November (Kasım) the timariots go home unless you order `winterInField`, which costs desertion, sickness and beys' goodwill.
9. **Travel times** assume about 20 km/day for an army with a siege train, plus mustering. Edirne→Belgrade is about 2 months, which matches the 1456 campaign (left in spring, siege began 4 July).

## Economy (numbers and sources in docs/economy.md)

10. **The treasury holds central cash only**, in akçe. Revenue is computed each month from province tax bases × prosperity × loyalty × laws × modifiers × difficulty.
11. **Janissary pay accrues monthly** even though the real *ulufe* was paid quarterly. Salaries are paid first. Anything unpaid becomes **arrears**, the most dangerous number in the game. Other unpaid bills stall construction and hurt campaign morale. The treasury never goes negative; there is no deficit financing except the bankers' loan event and debasement.
12. **Debasement** pays a one-off seigniorage of about 60% × the share debased × annual revenue. It also triggers a 24-month loyalty penalty (Janissaries −12, merchants −15, ulema −3) and probably a pay revolt 2–4 months later.
13. **Grain is modelled for the capital only.** Consumption is 0.65 Istanbul kile per person per month (about 200 kg/yr). Deliveries follow the harvest, peaking July–August. Shortage shocks the Janissaries, merchants and millets and reduces population.
14. **Starting treasuries** (25M akçe in 1451, 8M in 1421) are informed guesses. Murad II is reported to have left a full treasury.

## Factions and loyalty

15. **Loyalty is a shock plus mean reversion.** Each faction has an *equilibrium* computed from structural facts: pay, arrears, debased coin, wars, laws, the Sultan's traits and the minister who leads that faction. Events apply immediate shocks. Each month loyalty closes 12% of the gap to equilibrium, plus small noise. In practice a bribe fades within about a year, and a law that angers a faction keeps hurting while it stays in force. The ledger shows `current→equilibrium` so you can see where each faction is heading.
16. **Deposition:** if Janissary loyalty falls below 20, there is a monthly coup chance of (20 − loyalty) × 1.2%. If an heir exists, you are deposed. If not, they riot and loot the treasury instead.

## Ministers and deception

17. **Ministers lie according to their agenda, scaled by (100 − honesty).**
   - An embezzling Defterdar skims real money and hides it by under-reporting customs and tax-farm income, so his books still balance.
   - An Agha who patronises the corps overstates Janissary loyalty.
   - A peace-party Grand Vizier (Çandarlı Halil) shows Byzantium as friendlier and stronger than it is.
   - A war-party Beylerbey understates Balkan armies.
   `reportedView()` is what the UI and the LLM receive. The truth appears after an **audit** (60k akçe), when the Chief Eunuch's rumours come true, and in the sim output (the "Hidden:" line).
18. Ministers do not yet age, die or plot on their own. They change only through events and dismissal. (Deferred to Phase 4.)

## War

19. **Field battles:** each side's power = men × type weight (Janissary 1.6, Porte cavalry 1.8, levy 1.0) + guns, × quality × leadership × morale × dice (±35%).
20. **Sieges.** Each month, guns open a breach of (field guns + 12 × great bombards) × quality × weather × dice × 20 / walls. Defenders repair in proportion to their numbers.
   - A blockade drains the defenders' stores. A coastal city whose sea stays open hardly suffers. Closing it needs a fleet or, for Constantinople, Rumeli Hisarı plus half the enemy's navy.
   - The army storms automatically when the breach reaches your threshold (default 60%), or when you order it. Strong walls make storming harder even with a breach.
   - Garrisons ask for terms (*aman*) when their stores run out or their morale breaks.
21. **Calibration anchors (enforced by tests):**
   - 1453 with about 60 guns and 10 great bombards, a blockade and about 60k men: Constantinople falls in 2–4 months in more than 70% of runs. Historically it took 53 days.
   - The same walls without guns or a blockade hold for at least 6 months.
22. **Enemy AI:**
   - Hostile neighbours declare war in proportion to aggression × their strength ÷ yours, and more often while your army is away.
   - In season, enemies at war raid border provinces or besiege your forts. Those sieges use the same resolver.
   - Christian wars can draw in Venice and Hungary when the Pope is hostile.
23. **Peace:** acceptance depends on war score, months of war and the enemy's remaining strength against yours. Thresholds: white peace −5, tribute 25, cession 40, vassalage 50.
23a. **Resilience (0–10) for every power.** Albania 9, Byzantium 9, Wallachia 7, Aq Qoyunlu 7, Karaman 6, Hungary 6, Mamluks 6, Venice 4, Serbia 3, Papacy 3. Each point above 5 raises the score needed for any demand beyond white peace by 3.
   - **Resilient powers (≥6) never cede land or accept vassalage** on war score alone. One of these must hold first:
     - their capital's walls breached (≥50%) or the capital taken (capitals: Krujë, Târgoviște, Konya, Constantinople, Buda, Diyarbakır, Smederevo);
     - sustained devastation: at least 3 points of damage in each of 2 campaign seasons, or 3 seasons for resilience ≥8;
     - their coalition has collapsed (they began with allies and now fight alone).
   - **Devastation comes from:** each in-season month our army sits in their land (+1), field victories (+1), akıncı raids (+2), reprisal raids (+1) and taking a non-capital province (+2).
   - The gate's reason is returned to the player, so the narrator can say *why* Skanderbeg refused.
   - Krujë sieges still make about 1% breach a month against strength-80 walls with small guns. That is the historical answer: Mehmed failed there twice.

## Dynasty

24. **The Sultan's mortality follows a Gompertz curve:** about 0.5%/yr at 20 and about 6%/yr at 50, scaled by health and tripled in plague. He can also die in battle (4% when he loses a battle he leads) or by assassination, which is driven by ambitious princes with strong households and an unhappy corps.
25. **Only sons are modelled.** Daughters, who mattered for marriage alliances, are deferred. Children face about one-third mortality before adulthood.
26. **Succession:** on death or deposition you can continue as the best surviving son or brother. Surviving brothers remain claimants until the fratricide question is settled.
27. **Court politics only.** The harem is modelled as an institution — influence, households, appointments, intelligence. No romance and no sexual content, as specified.

## Engine and guardrails

28. **All randomness comes from a seeded mulberry32 RNG whose state lives in `GameState`.** Same save plus same orders gives the same result, which the tests check.
29. **`resolveTurn` is pure.** It deep-clones its input. The `Action` union is the only way to change state, and it has a runtime `default` branch that rejects unknown types, because Phase 2 actions arrive as LLM JSON.
30. **Fictional Sultans** start from the 1421 or 1451 map, adjusted by a timeline of conquests:
    - 1453 Constantinople
    - 1459 Serbia
    - 1460 Morea
    - 1474 Karaman
    - 1479 Albania
    The state's wealth scales up about 1.2% a year after 1451. This is approximate.

## Known balance issues to fix in Phase 4 (from the sim)

- ~~Peacetime surplus too generous~~ — **resolved (see 31)**: it was mostly a bot artefact plus a missing pressure class.
- The Janissaries settle around 70–80 loyalty under a random player. The corps may be too docile. **Deferred to Phase 4** so it can be tuned on human play.
- ~~Peace too easy against defiant small powers~~ — **resolved (23a)**.
- Under random play, Janissary numbers shrink (campaign losses outpace cadets). A human player recruits; the sim bot does not.
- Revenue grows about 1.6× from 1451 to 1475 under the scripted conquest reign. **Accepted** (see docs/economy.md, "Growth to 1475"). The missing provinces are in the Phase 4 backlog.

## Phase 1 review changes

31. **Discretionary spending.** The spending *actions* already existed: donatives, embassies, construction, galleys, cannon, devşirme. What was missing was the Divan *pushing* the Sultan to use them. Now:
   - **Four pressure events** whose weight grows with the treasury: the imperial külliye, the Kapudan's fleet programme, return gifts for foreign embassies, and the princes' circumcision festival. Refusing costs loyalty or stance.
   - ~~A "hoarding Sultan" loyalty penalty~~ — **removed at your request.** Faction pressure from money now comes only from the specific Divan requests above, the accession donative, and a new **victory donative** request: after a field victory or a captured fortress, the Agha asks at the next Divan (at most once per 3 months). Refusing costs Janissary loyalty.
   - **A full treasury emboldens rivals instead.** Above 12 months of expenses, adult princes and brothers gain ambition faster: up to +1 a month, scaling with the surplus. They build households and plot sooner. Other factions' loyalty is unaffected, and a test checks this.
   - **Result** (`npm run balance`, 20 seeds, 36 months of peace from 1451). Unchanged after removing the hoarding penalty, which never triggered inside three years:

     | Policy | Treasury change over 3 years |
     |---|---|
     | Frugal | +6.5M |
     | Random | −8.4M |
     | Generous | −24M |

     So the surplus now depends on the player's choices rather than being structural. Earlier sims showed +0.9M a month because the bot rarely spent and nothing pushed it to. The old sim figure was a bot artefact.
32. **Grain fixes found by the 25-year run.** Supply was calibrated against prosperity 70 while provinces sit near 65, which meant a permanent ~3% deficit and bread riots every spring. It is now normalised to 65 with a 6% margin. A coastal capital draws 30% of its grain by sea, flat through the year. The grain-shortage dilemma now defaults to buying, which was the grain administration's routine.
33. **Assassination was too frequent.** In the 25-year run young Sultans were assassinated about once per run. Base risk is now 0.02% a month, and an ignored plot adds 0.4% a month for 6 months (was 1%).
34. **Recovery and the capital.** Ruined provinces (prosperity below 50) rebuild at 2% of the gap a month instead of 0.6%. The capital's prosperity target follows its population. Constantinople's customs scale with population, from ×0.6 to ×2.5 against a 50k baseline.

## Phase 2 — LLM layer

35. **Model:** `claude-sonnet-5-5`, as the brief specified. You can override it with `SULTAN_MODEL`. Narration runs at effort `medium` and order parsing at `low`; both settings live in `src/llm/`. Thinking can't be turned off on this model, so the code doesn't try.
36. **No refusal fallback — removed at your request.** Declined scenes are not re-routed to another model. Instead the Game Master prompt now keeps narration in the register of a 15th-century chronicler: battles, executions and fratricide are recorded as events with political consequences, never described graphically (see "Register" in `prompts/game_master.md`). If Claude still declines, or the API is unreachable, the game shows the engine's plain summary of the month and play continues.
37. **Orders are one tool per action** (25 tools, `strict: true`), not a single tool taking a union of every action. Each schema stays small and well inside the API's strict-mode limits, which a test enforces. The model can issue several orders in one reply. The tool list never changes between requests, so it stays in the prompt cache.
38. **No forced tool calls.** `tool_choice: auto` is used because Sonnet 5.5 rejects forced tool use. The parser prompt tells the model to issue orders and to ask instead of guessing. When it calls no tool, its text is shown as the court secretary's question.
39. **Three checks between the model and the state:**
    1. every tool call is re-validated against the order schemas in `toolCallToAction`;
    2. every order is dry-run on a throwaway copy of the state (`previewOrders`), so refusals show before the month ends — the outcome of a peace offer is hidden so the preview can't be used to peek at the dice;
    3. `resolveTurn` validates everything again.
    Invalid calls go back to the model once for correction.
40. **What each model call sees.**
    - Narration and parsing are separate, stateless calls: the system prompt (cached) plus a fresh fact sheet. No conversation history is kept, only the last two narrations as a "chronicle" for continuity.
    - The narrator gets the *reported* figures from `reportedView()` and the ministers' secret agendas, labelled SECRET, so it can colour their speech.
    - The order parser gets ids and option letters only — no agendas, no hidden figures.
    - The narrator receives a frozen copy of the state.
41. **Number audit.** After each narration, every figure the narrator wrote is checked against its inputs (3% tolerance; years and small counts ignored). Anything unmatched is shown to the player as a warning. The engine never reads narration, so a slip misleads at worst and cannot corrupt the state.
42. **Terminal edition.** `npm run play` came early, so the game is playable before the Phase 3 UI. It saves to `saves/*.json`; Prisma arrives in Phase 3. With no `ANTHROPIC_API_KEY` set it runs offline, showing the engine's text and taking choices like `1a 2c`. Pass `--online` to use an `ant auth login` profile instead of a key.

## Phase 4 backlog

- **Map additions to close the revenue gap toward ~2× by 1475:**
  - Bosnia (1463), with the Srebrenica silver mines (tax-farm income)
  - Trebizond and Amasra (1461)
  - Kastamonu/Sinop (Candar, 1461), with the Küre copper mines
  - Lesbos (1462)
  - Caffa and the Genoese Crimea (1475)
  - Moldavian tribute
  - Ragusan tribute (Ragusa paid from the 1440s, with rises later)
  - When they're in, turn the `it.fails` ≥1.8× check in `tests/revenue.test.ts` into a normal test.
- **Janissary temper:** tune loyalty using notes from human play, not the random bot.
- **Ministers:** ageing, death, and plotting on their own.
- **Daughters and marriage alliances.**
- Historian mode (`/historian`) and `pause game`, as originally planned.
