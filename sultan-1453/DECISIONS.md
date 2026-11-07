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

## Phase 3 Stage A — 3D strategic map

43. **One 3D client, two front ends.** `src/client3d/` uses Three.js and plain DOM, with no React inside.
    - **Next.js app:** `app/page.tsx` mounts it, and Claude is reached through `/api/narrate` (streaming) and `/api/orders`, with the API key kept on the server.
    - **Artifact build:** `web3d/` bundles the same client into one HTML file. Claude is reached through the artifact's `sample` capability, so you can play from the link with no API key.
    - The 3D layer only reads `GameState` and sends `Action`s; neither the engine nor the LLM layer was changed for it.
44. **No third-party art assets.** All terrain and models are procedural: hand-drawn coastline polygons, ridge lines for mountains, and models built from boxes, cones and cylinders. There are no asset licences to track. Code dependencies: three.js (MIT), Next.js (MIT), React (MIT), esbuild (MIT, build only). The Alegreya type families load from Google Fonts (SIL Open Font License).
45. **The map is stylised, not surveyed.**
    - Coastlines are about 150 hand-placed points sampled onto a 0.25° grid (about 25 km cells).
    - Small islands and the straits are drawn explicitly. The Bosporus and Dardanelles are widened to stay visible at that resolution.
    - Province borders are weighted Voronoi regions around each seat, kept on their own landmass (Thrace can't fall to Bursa across the Marmara).
    - Lands outside the game's provinces (Italy, the Danube plain north of Buda, Cyrenaica) are drawn muted.
46. **Performance.**
    - The terrain is one `InstancedMesh` of about 4,000 columns: one draw call, with shading baked into vertex colours.
    - Each model is a single merged geometry, and labels are screen-space sprites.
    - The scene is about 50 draw calls in total, and hover picking runs at most every other frame.
    - Press **F** to show the measured frame rate.
47. **Markers follow engine state.**
    - The Sultan's army moves along the capital→target line according to its campaign phase and months remaining.
    - Enemy field armies stand at their capital, or at their siege.
    - Siege works lose wall blocks on the gun side as the breach grows, with a breach bar and percentage above.
    - The fleet sits at Gelibolu or off the target's coast.
    - Markers glide to their new positions over about 1.6 seconds when a month ends, and the camera pans to the action.
48. **Saves:** browser storage in the Next.js app; private per-user artifact storage, with a local fallback, in the artifact build. **Prisma/SQLite saves are deferred** until after Stage C, unless you want them sooner.
49. **Missing credentials** (no `ANTHROPIC_API_KEY`) degrade the Next.js app to the plain chronicle plus buttons and shortcuts, and never cause a server error.

### Stage A review fixes

50. **Fixed palette, owned land in full colour.**
    - The colours: Ottoman crimson, Byzantine purple, Venice teal, Hungary green, Serbia blue, Wallachia white, Albania black, Karaman ochre, Mamluk gold, Aq Qoyunlu sand.
    - Owned cells now take the power's colour outright, shaded only by height. Before, they were blended with the terrain, which turned Ottoman crimson orange.
    - Ochre, gold and sand are separated by lightness.
    - Albanian black borders are drawn lighter, so they stay visible.
    - A **Legend** toggle lists each power's colour and its current relation to you.
51. **One-line panels.** The top bar, the Divan and the chronicle each collapse to a single line. On desktop the chronicle starts collapsed, and a gold dot marks a new entry.
52. **Labels.**
    - Each kind looks different: towns are dark pills, capitals have a gold rim, armies are pills in the side's colour with crossed swords, fleets have a ship mark, and sieges carry their breach bar.
    - Labels keep the same on-screen size at every zoom.
    - Where labels collide, the less important one tries three other positions before hiding. The order of importance is siege > army > fleet > capital > town.
    - A besieging army is named on its siege label ("Imperial army 19k besieging Constantinople: breach 36%").
    - Armies stand on a coloured ground ring and grow with zoom-out, up to 2.6×, so they can't be mistaken for towns.

## Phase 3 Stage B — the palace

53. **One plan, two palaces.** Both have the Gate (first court), the second court, the Divan hall, the Treasury, and the Harem through the Gate of Felicity.
    - **Topkapı** is used when the capital is Constantinople. It has stone walls, lead domes, the twin octagonal towers of the Gate of Salutation, the Tower of Justice and cypresses.
    - **Edirne** is used before the move. It has timber galleries, tiled pyramid roofs, a single gate tower, plane trees and the Tunca along the east side.
    - Both are stylised. The real Edirne New Palace was only begun in 1450, so in the 1421 scenario it stands for whichever palace Murad used.
54. **The "throne room" is the Divan hall** (the Kubbealtı at Topkapı). Historically, from Mehmed II's later reign the Sultan stopped sitting in the Divan and listened from behind a grilled window, the *kafes*, which is modelled above the throne. Here the Sultan walks in and the ministers present in person, for playability.
55. **Who stands where.**
    - **The Divan hall:** the nine ministers, in a half-circle before the throne. Anyone with an unanswered matter has a gold banner, which turns green once you've ruled.
    - **The Treasury:** the Hazinedarbaşı reports the Defterdar's figures and offers quick orders (pay arrears, audit, cast guns, donative). The chests on the floor scale with the treasury, one per million akçe, up to thirty.
    - **The Harem:** the Valide (or the senior lady), consorts and the princes kept at the palace, with the Chief Eunuch at the door. Dilemmas presented by the Valide or the Chief Eunuch are raised here.
    - **The Gate:** petitioners repeat last month's news, and Janissary guards stand watch.
56. **Speech.** If this month's chronicle gave a minister a speech under "The Divan", his dialogue opens with those words. Otherwise it opens with the engine's brief. The options are the same as the Divan panel's and record the same orders. The month still ends from the command bar.
57. **Movement and camera.**
    - Move with WASD/arrow keys, or click or tap to walk. Drag to turn, scroll to zoom. Press E or tap a person to speak.
    - Quick-travel buttons cover each room.
    - Inside a room, everything above 2.3 m is trimmed (a Sims-style cutaway), so walls never hide you.
    - Outdoors, the camera pulls in front of any wall between it and the Sultan.
    - People turn to face the Sultan when he comes within 5 m.
    - When a month ends while you are in the palace, you are taken to the Divan hall for the new matters.
58. **Rendering.** The map pauses while you are in the palace, so only one scene renders at a time. Each building set is a single merged mesh, and each person is one mesh plus a label.

## Campaign layer

59. **Missions wrap the engine; they don't change its rules.** A mission (`src/campaign/missions.ts`) has:
    - a starting state
    - an objective with a win check
    - a time limit and a par
    - a bonus condition
    - a reward
    - optionally, a script and an end cinematic

    `advanceMission` calls `resolveTurn`, runs the mission's script (scripted history between months, such as Karaman rising in April 1451), checks the objective, and keeps score. The engine's only campaign change is four capability locks in `state.flags`: `lockBombards`, `lockFleet` (building galleys), `lockNavalInvasion` and `lockTopkapi`. Rewards lift them; sandbox games have none.
60. **Starting states come from the scripted conquest timeline** (`src/campaign/timeline.ts`), which the 1451–75 revenue test also uses now.
    - **What it applies:** conquests, reforms, Grand Viziers (Zaganos 1453, Mahmud Pasha 1456), the dynasty (Küçük Ahmed dead after the accession, Orhan dead in 1453, Cem from 1459), the Hungarian truce lapsing, and the Bosporus fortress after August 1452.
    - **No months are simulated,** so a mission starts instantly and is identical for a given seed.
    - **Rewards change the start:** with *bombards* unlocked, Mission 3 starts with 10 great bombards (Orban's monster and the guns cast over the winter of 1452–53). Without them it starts with field guns only, and the city usually falls only when its stores run out.
61. **Stars:** 1 for the objective, +1 for finishing within par, +1 for the bonus. A failed mission scores 0. Replays keep the best result, and the reward is granted on the first win.

    | Mission | Objective | Limit | Par | Bonus | Reward |
    |---|---|---|---|---|---|
    | 1. Accession 1451 | Bring Karaman to terms, Janissaries 45+ | 14 | 9 | no arrears ever, corps 60+ at the end | +10 Janissary loyalty in later missions |
    | 2. Rumeli Hisarı 1452 | Complete the fortress | 9 | 6 | hire Orban | great bombards |
    | 3. Constantinople 1453 | Take the City | 8 | 5 | no failed assault | fleet programme, Topkapı, Sandbox |
    | 4–9 | stubs (Serbia, Morea, Trebizond, Skanderbeg, Otlukbeli, Otranto) | | | | silver, naval invasion, Black Sea, mountain war, field artillery, Conqueror |

    **Calibration (tests/campaign.test.ts):**
    - **Mission 1:** a sensible player wins in at least 6 of 8 seeds.
    - **Mission 2:** building at once and hiring Orban gives 3 stars; never ordering the fortress fails on the clock.
    - **Mission 3:** with bombards and a direct march it was won in all 8 test seeds, usually in 5–7 months, so par 5 is hard and the no-failed-assault bonus is harder. The historical 53 days is a perfect run.
62. **"Fleet after Mission 3"** means the *programme*: building galleys and, later, naval invasion. Baltaoğlu's historical fleet of about 100 vessels is part of Mission 3's starting state, because the blockade of 1453 needs it.
63. **Missions 6 and 9 need map additions.** Trebizond, and Otranto in southern Italy, are not on the map yet; they are in the Phase 4 backlog. Missions 4–9 are listed on the mission map as "in development".
64. **Results screen:**
    - stars;
    - how each star was earned;
    - treasury change (start → end), plus the total paid out over the mission;
    - soldiers lost;
    - up to six chronicle highlights (battles, captures, declarations, peace, deaths), with routine siege-progress lines left out;
    - the reward unlocked.
65. **Main menu:**
    - **Continue** resumes the current game, or reopens the last results.
    - **Campaign** opens the mission map: nine cards showing locked, ready or starred, and the map pans to each mission's place.
    - **Sandbox** is locked until Mission 3 is won.
    - Campaign progress is saved separately from the current game: in your private artifact storage, or in browser storage in the Next.js app.
66. **The tutorial (Mission 1)** is eleven steps from Çandarlı Halil, in `src/client3d/tutorial.ts`.
    - Each step waits for the player's action (answering the two accession matters, opening a province, finding him in the Divan hall, ending a month, reacting to Karaman) or for "Next".
    - Steps highlight the relevant panel, and the tutorial can be skipped.
67. **Click-to-order on the map.** So the game is fully playable without Claude, clicking a province opens its orders:
    - **Enemy province:** declare war, send an embassy, march on it, or offer peace terms.
    - **Your province:** relieve a siege, reinforce, build Rumeli Hisarı from Edirne or Gelibolu, or rebuild the walls.
    - **A siege you are running:** order an assault, or lift the siege.

## Phase 3 Stage C — cinematics

68. Three scenes in `src/client3d/cinematic.ts`, each a stylised voxel scene of about 16–23 seconds, with letterboxing, captions and a Skip button:
    - **Siege:** the wall is built of individual blocks. Bombards fire in turn and knock out blocks until the breach shown matches the engine's breach for that month. The assault storms or is thrown back, or a white flag goes up, and the tower banner changes colour on capture. Constantinople gets the outer wall, the moat and Hagia Sophia.
    - **Field battle:** the two lines close, and the loser breaks and runs. Troop numbers scale with the engine's figures.
    - **The Throat-Cutter:** Rumeli Hisarı's guns sink a Venetian ship (Antonio Rizzo, November 1452).
69. **When they play:**
    - **Mission ends:** the Bosporus scene closes a won Mission 2. Mission 3 ends with the siege scene of its final month (the storm or the surrender, or the siege still in progress if time ran out).
    - **During play:** after any month in which your army fought a siege month or a field battle, the chronicle offers "▶ Watch".
    - **The engine already decided the result;** the scene only shows it.
