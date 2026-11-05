# Economy & military numbers — reasoning and sources

All figures are **akçe** (the Ottoman silver coin) unless stated. Where the literature gives a range, I took a midpoint and say so. These are game-calibration numbers, not a reconstruction of a budget: no complete Ottoman budget survives before 1527–28.

**Main references** (from memory; please verify any figure you plan to rely on outside the game):
- Halil İnalcık, *The Ottoman Empire: The Classical Age 1300–1600*
- İnalcık & Quataert (eds.), *An Economic and Social History of the Ottoman Empire*, vol. 1
- Şevket Pamuk, *A Monetary History of the Ottoman Empire*
- Ömer Lütfi Barkan's edition of the 1527–28 budget
- Franz Babinger, *Mehmed the Conqueror and His Time*
- Steven Runciman, *The Fall of Constantinople 1453*
- Kelly DeVries on Ottoman gunpowder artillery
- The chroniclers Doukas, Kritoboulos, Sphrantzes and Aşıkpaşazade

## Coin

| Item | Game value | Reasoning |
|---|---|---|
| Silver per akçe, 1421 | 1.15 g | Pamuk: about 1.1–1.2 g in the early 15th c. |
| Silver per akçe, 1451 | 0.98 g | Pamuk: debasements in the 1440s; Mehmed II re-minted repeatedly (roughly every decade) |
| Ducat exchange | about 45 akçe | Pamuk: 40–45 akçe per Venetian ducat in the 1450s, rising later |

## Revenue (central treasury, 1451 start)

The first monthly ledger shows 3.2M akçe/month, or about 38M/year (≈850k ducats). By 1453 it rises to about 42M/year as prosperity and laws compound. For scale:
- The 1527–28 budget recorded about 538M akçe (Barkan) for an empire several times larger, including Egypt.
- Iacopo de Promontorio (c. 1475) estimated the Sultan's total income at about 1.8M ducats, after major conquests and including revenue that never reached the central treasury.

A central cash revenue of 0.8–1.0M ducats in 1451 sits between those anchors.

| Line | Mechanism | Calibration |
|---|---|---|
| Crown domains (hass) | Σ province land-tax base × prosperity × loyalty | About 22M at prosperity 100, so about 12–13M/yr at start |
| Cizye | non-Muslim households × rate × collection | About 320k liable households in Ottoman provinces × 35 akçe/yr, so about 8–9M/yr. Rates of 25–40 akçe per household are reported for the mid-15th c., rising to 40–50+ later. |
| Customs (gümrük) | Σ customs base × rate factor × trade conditions | 4% is the customary rate (Muslim traders paid less, foreign traders more). Bursa silk, Gelibolu straits tolls and Thessaloniki dominate. War with Venice cuts customs 40%. |
| Tax farms (mukataa) | base + special sources | 8.5M base (mint, salt pans, rice, Phocaea alum), plus Novo Brdo silver at about 6.5M/yr once taken. Novo Brdo was the richest mine in the Balkans. |
| Tribute (haraç) | from vassals | Serbia 1.2M/yr (estimate). Wallachia about 10,000 ducats ≈ 450k (attested in the 1450s–60s). |

## Expenses

| Line | Calibration |
|---|---|
| Janissaries | 5,000 in 1451 (chroniclers give about 5,000 at Mehmed's accession; 10,000–12,000 by the 1470s) × 3.5 akçe/day average (cadets 1–2, veterans 5–8) ≈ 525k/month |
| Porte cavalry (altı bölük) | 2,500 × about 12 akçe/day ≈ 900k/month. Elite salaried horsemen were paid far above Janissaries. |
| Fortress garrisons | 1.5 akçe/day per man in cash. Many garrison soldiers also held small timars, so the cash rate is below Janissary pay. |
| Court & chancery | about 450k/month base, plus princes' households and consorts |
| Fleet | 2,500/month per galley laid up and 9,000 at sea (crews of 150–200 azaps and oarsmen) |
| Orhan's pension | 300,000 akçe/yr paid to Byzantium from the Strymon revenues (Doukas). Mehmed's refusal to double it was part of the run-up to 1453. |

## Campaign costs

- Kapıkulu troops draw 40 akçe/man/month on campaign above their pay (provisions, transport).
- Timariots draw 6 (they supply themselves).
- Each gun draws 600 (oxen, powder, shot); a great bombard counts as five guns.
- A cast siege gun costs 6,000 akçe. A great bombard costs 60,000, an order of magnitude more: Orban's monster gun needed about 60 oxen and hundreds of men to move.

## Grain

- One Istanbul kile ≈ 25.6 kg of wheat. Consumption is about 200 kg of grain per person per year, so 0.65 kile per person per month.
- Base price is 6 akçe/kile. Late-15th-century official prices (*narh*) fall in a single-digit akçe range. Scarcity raises the price up to roughly double.
- Edirne's population is set at 30,000 in 1451 and 25,000 in 1421; both are estimates. After 1453 Constantinople had perhaps 40–50k people before the *sürgün* resettlements.

## Military anchors

| Item | Game value | Reasoning |
|---|---|---|
| Timariot cavalry (1451) | about 32,000 across 14 provinces | Registers suggest several tens of thousands of sipahis plus their armed retainers (cebelü) |
| Byzantine defenders, 1453 | 7,000 | Sphrantzes counted 4,983 Greeks plus about 2,000 foreigners |
| Ottoman army at Constantinople | about 60k effective | Contemporary claims of 160k+ are inflated; modern estimates are 50–80k combatants |
| Ottoman guns, 1453 | about 60, including about 10 great bombards | About 69 guns in 15 batteries is a common modern reconstruction |
| Rumeli Hisarı | 5 months, 3M akçe | Built April–August 1452 in about 4½ months |
| Siege of Constantinople | 2–4 months in the model | 6 April – 29 May 1453 (53 days) |
| Belgrade relief (1456) | relief armies can break sieges | Hunyadi relieved Belgrade with a field army and a river flotilla |

## Mortality

The Sultan's annual death hazard is 0.006 × e^(0.085 × (age − 20)), scaled by health:

| Age | Annual hazard |
|---|---|
| 20 | ≈ 0.6% |
| 40 | ≈ 3.3% |
| 50 | ≈ 7.7% |

Mehmed II died at 49 and Murad II at 46, both of illness.
