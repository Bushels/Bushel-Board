# Canadian Grain Market Rules & Grain-Specific Cards

**Purpose:** Country-specific rulebook for the Canadian grain desk swarm. Loaded by `docs/reference/grain-desk-swarm-prompt.md` alongside the global ruleset `agent-debate-rules.md`.

**Last updated:** 2026-04-18

**Rule citation format:** `R-CA-<GRAIN>-NN` (e.g., `R-CA-CNL-03` = Canada, Canola, rule 3).

**Scope:** 16 grains — Amber Durum (DUR), Barley (BAR), Beans (BEA), Canaryseed (CNR), Canola (CNL), Chick Peas (CHK), Corn (COR), Flaxseed (FLX), Lentils (LEN), Mustard Seed (MST), Oats (OAT), Peas (PEA), Rye (RYE), Soybeans (SOY), Sunflower (SUN), Wheat (WHT).

---

## Canadian Market Context

### Regulators and Data Sources
- **CGC (Canadian Grain Commission)** — weekly grain statistics every Thursday ~1pm MST. 33 worksheet/metric combinations across 16 grains.
- **AAFC (Agriculture and Agri-Food Canada)** — monthly supply/disposition balance sheets.
- **StatsCan** — quarterly stocks-on-farm survey.
- **Grain Monitor (Quorum)** — weekly port throughput, vessel queues, out-of-car time.

### Primary Physical Infrastructure
- **Export ports:** Vancouver (95% of canola, most wheat/peas), Thunder Bay (wheat, durum to lake shipments), Prince Rupert (wheat, peas), Churchill (seasonal June-Nov).
- **Rail:** CN + CP duopoly. Producer Cars allow farmers to bypass elevators (forward-looking demand signal).
- **Container export:** Containerized pulse exports from Vancouver/Montreal — separate pipeline from bulk rail.

### Data Cadence (for scout timing)
- CGC weekly: Thursday ~1pm MST.
- Grain Monitor: Wednesday.
- USDA export sales (for US-exposure overlay): Thursday AM.
- CFTC COT: Friday PM (Tuesday positioning).
- WASDE: monthly, 12th business day.

### Canadian-Specific Thesis Traps
1. **Vancouver vessel queue is not always a demand signal.** Rail failure and labor action can create queues without any demand acceleration (see R-16).
2. **Producer Car allocations are forward-looking.** Rising producer cars = elevators pricing forward demand, even if CGC exports lag.
3. **Process worksheet only exists for crushable grains** (Canola, Soybeans, Flaxseed, Mustard). Do not look for "crush" data on Oats, Peas, Lentils.
4. **Containerized pulses bypass Vancouver bulk queues entirely.** Peas and lentils vessel-queue analysis must use container dwell time, not bulk vessel lineup.

---

## 🌱 Canola (CNL)

**Compression Index Class:** A (all 5 components valid)
**Coiled Spring Fit:** STRONG
**Typical Stance Range:** -40 to +80

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| Canada world share   | ~75% of global canola seed trade                 |
| Futures              | ICE Canola (Winnipeg) — liquid, continuous       |
| Key buyers           | China (~40%), Japan, UAE, Mexico                 |
| Domestic crush       | ~55% of supply (Richardson, Cargill, ADM, Viterra)|
| Primary export port  | Vancouver (95%+)                                 |
| Rail constraint      | Demand-pull sensitive; CN/CP strikes amplify     |

### Grain-Specific Rules
- **R-CA-CNL-01 · Crush dominates.** ~55% of demand. Never analyze exports alone — always include Process worksheet deliveries.
- **R-CA-CNL-02 · China tariff lag.** Policy moves (2025 anti-dumping, canola meal restrictions) take 2-4 weeks to appear in CGC export data. Do not wait for CGC confirmation before factoring policy into thesis.
- **R-CA-CNL-03 · Vancouver vessel queue is the canola bottleneck.** Port congestion = canola export ceiling. Always check vessel queue + OCT in concert with R-16.
- **R-CA-CNL-04 · Primary/Process delivery split is a basis tell.** If Process deliveries rise while Primary falls, farmers are migrating to crushers (R-17 invoked). Thesis shifts from futures to basis.
- **R-CA-CNL-05 · Compression Index Class A.** All 5 components apply: supply delta, demand delta, pipeline tension (conditional per R-16), basis strength, commercial position level.
- **R-CA-CNL-06 · Cobweb Trap watchpoint.** When current price is >20% above 5-year average, flag overplant risk for next crop year (farmers chase high price, plant too much, glut the following year).

### Thesis-Killers
1. **China tariff walk-back** — pre-sold into futures, immediate bearish gap.
2. **Crush margin compression below $150/t** — crushers slow slates, domestic demand drops.
3. **Cobweb Trap triggered** — >20% above 5yr avg lingers 3+ weeks → plant-intention survey shift.

### Debate Tiebreakers (intra-tier ranking)
1. Compression Index score
2. Crush margin trajectory (Richardson/Cargill public gross margin)
3. Vancouver vessel queue vs 1yr avg
4. Primary/Process delivery divergence magnitude

### Data Freshness Requirements
- CGC: current week (Thursday)
- Grain Monitor: ≤7 days
- ICE Canola futures: current trading day
- Moose Jaw cash basis: ≤2 trading days

---

## 🌾 Lentils (LEN)

**Compression Index Class:** B (4 components — container dwell replaces vessel queue; no futures / no COT)
**Coiled Spring Fit:** STRONG
**Typical Stance Range:** -30 to +70

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| Canada world share   | ~50% of global red lentil trade                  |
| Futures              | None (cash-only market)                          |
| Key buyers           | India (30-40%), Turkey, UAE, Bangladesh          |
| Domestic use         | ~10-15% of supply                                |
| Primary export path  | Containerized — Vancouver, Montreal              |
| Rail constraint      | Container availability (not bulk rail)           |

### Grain-Specific Rules
- **R-CA-LEN-01 · India is the swing buyer.** Indian import tariff changes (currently 22% on red lentils) dominate weekly price action. Check tariff status before any thesis.
- **R-CA-LEN-02 · Container dwell time > vessel queue.** Bulk vessel queue at Vancouver is irrelevant for lentils. Track container lead time at Vancouver and Montreal.
- **R-CA-LEN-03 · No futures = basis is price.** Farmers cannot hedge via futures. Cash bid is the entire price signal.
- **R-CA-LEN-04 · Compression Index Class B.** 4 components: supply delta, demand delta, pipeline tension (container dwell), basis strength. COT omitted (no futures).
- **R-CA-LEN-05 · India tender is a discrete event.** State Trading Corporation (STC) tender announcements are step-change bullish, not gradual.

### Thesis-Killers
1. Indian tariff reduction below 11% — floods market.
2. Australia bumper red lentil crop (harvest Nov-Jan) — competing supply.
3. Container booking lead time normalizing to <3 weeks — pipeline releases.

### Debate Tiebreakers
1. Compression Index score
2. Active India tender status
3. Container dwell at Vancouver vs 1yr avg
4. Farmer-held stocks vs StatsCan Dec survey

---

## 🌿 Peas (PEA)

**Compression Index Class:** B (4 components; containerized; no futures)
**Coiled Spring Fit:** STRONG
**Typical Stance Range:** -30 to +60

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| Canada world share   | ~35% of global yellow pea trade                  |
| Futures              | None                                             |
| Key buyers           | China (fractionation), India, Bangladesh         |
| Domestic use         | Roquette + pea fractionation (growing)           |
| Primary export path  | Bulk (China) + containerized (India/Bangladesh)  |
| Rail constraint      | Split: bulk rail for China, container for others |

### Grain-Specific Rules
- **R-CA-PEA-01 · China pea-protein demand is the floor.** Roquette Portage la Prairie + domestic pea fractionation absorb a growing domestic share (5-10%/yr growth). Not export-only.
- **R-CA-PEA-02 · India import policy swings.** Yellow pea import duty (currently 50%) — any reduction triggers a demand spike.
- **R-CA-PEA-03 · Low producer car allocation is normal.** Peas move via containers + direct-to-crusher. Low producer car numbers are NOT a bearish signal.
- **R-CA-PEA-04 · Compression Index Class B.** Same structure as Lentils.
- **R-CA-PEA-05 · Container lead time at Vancouver.** Primary logistics constraint. Bulk vessel queue irrelevant.

### Thesis-Killers
1. India pea tariff walk-back below 20% — immediate bearish.
2. Russian pea export surge into Bangladesh.
3. Roquette capacity utilization drop (domestic demand signal).

### Debate Tiebreakers
1. Compression Index score
2. India tender activity
3. China pea-protein crush margin
4. Container dwell time

---

## 🌾 Amber Durum (DUR)

**Compression Index Class:** A (all 5 components valid; liquid MGEX durum futures)
**Coiled Spring Fit:** STRONG
**Typical Stance Range:** -30 to +60

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| Canada world share   | ~60% of global durum trade                       |
| Futures              | MGEX Spring Wheat (proxy), no direct durum futures|
| Key buyers           | Italy, Algeria, Morocco, Turkey                  |
| Primary export ports | Vancouver, Thunder Bay (lake shipments)          |
| Rail constraint      | Bulk rail sensitive                              |
| Key tender           | Algeria OAIC (quarterly)                         |

### Grain-Specific Rules
- **R-CA-DUR-01 · Algeria OAIC tenders are step-change bullish.** OAIC is the world's largest durum buyer. Tender announcements drive weekly moves.
- **R-CA-DUR-02 · Italian pasta demand is seasonal.** Peaks Oct-Feb for pasta production — check import licenses.
- **R-CA-DUR-03 · Substitution ceiling.** Durum can substitute for other wheat classes if price premium shrinks below $20/t. Watch protein-premium spread.
- **R-CA-DUR-04 · Compression Index Class A.** All 5 components apply. Use MGEX Spring Wheat as futures proxy for commercial position level.
- **R-CA-DUR-05 · Lake shipment window.** Thunder Bay lake shipments freeze Dec-April. Off-season = Vancouver-only, basis widens.

### Thesis-Killers
1. OAIC tender cancellation or lower volume.
2. Turkish/Kazakh durum surplus redirected to Algeria.
3. Italian pasta demand slump (EU disposable income).

### Debate Tiebreakers
1. Compression Index score
2. Active OAIC tender status
3. Italy/Morocco import license issuance pace
4. Protein premium vs CWRS

---

## 🌼 Mustard Seed (MST)

**Compression Index Class:** C (3 components; basis-dominant; no futures)
**Coiled Spring Fit:** STRONG (supply-concentrated, single-buyer-sensitive)
**Typical Stance Range:** -25 to +55

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| Canada world share   | ~35% of global mustard seed trade                |
| Futures              | None                                             |
| Key buyers           | US (food processors), EU, UAE                    |
| Primary use          | Condiment, oil, forage                           |
| Primary export path  | Containerized + bulk                             |

### Grain-Specific Rules
- **R-CA-MST-01 · Basis is the market.** No futures, no COT. Cash bid is the entire price signal.
- **R-CA-MST-02 · Single-buyer concentration.** Three grain cos (Olds Products, Viterra, Cargill) dominate — bid competition indicator replaces commercial position velocity.
- **R-CA-MST-03 · Compression Index Class C.** 3 components: supply delta, demand delta, basis strength. Replace commercial velocity with multi-buyer bid competition indicator. Omit COT.
- **R-CA-MST-04 · Yellow vs Brown/Oriental split.** Different end-uses. Yellow = condiment, Brown = oil. Do not aggregate.

### Thesis-Killers
1. US condiment manufacturer inventory build (French's, Kraft).
2. Indian/Nepalese mustard surplus entering EU market.
3. Single grain co walking from market (bid competition collapses).

### Debate Tiebreakers
1. Compression Index score
2. Yellow vs Brown bid spread
3. Bid competition (# of cos quoting this week)
4. Farmer-held stocks vs 5yr avg

---

## 🌾 Canaryseed (CNR)

**Compression Index Class:** C (3 components; tightly held)
**Coiled Spring Fit:** STRONG (thin market, fast compression)
**Typical Stance Range:** -20 to +50

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| Canada world share   | ~70% of global canaryseed trade                  |
| Futures              | None                                             |
| Key buyers           | Mexico, Belgium, Spain (bird seed)               |
| Primary use          | Bird seed (human consumption growing — Inca variety)|
| Primary export path  | Containerized                                    |

### Grain-Specific Rules
- **R-CA-CNR-01 · Thin market — 2-week decay.** Compression Index decay is 2 weeks (vs Canola 4wk, Lentils 6wk). Signals fade fast.
- **R-CA-CNR-02 · Mexico is the swing buyer.** 40-50% of exports. Mexican peso + bird-seed import policy drive weekly action.
- **R-CA-CNR-03 · Container dwell dominates.** No bulk rail — ignore vessel queues.
- **R-CA-CNR-04 · Compression Index Class C.** Same as Mustard — basis-dominant, multi-buyer competition.
- **R-CA-CNR-05 · Inca variety premium.** Food-grade canaryseed commands $150-$200/t premium. Separate analysis.

### Thesis-Killers
1. Mexican peso devaluation >10%.
2. Argentine canaryseed harvest surprise (Nov-Feb).
3. Bird-seed retail demand softness (feed-store inventory reports).

### Debate Tiebreakers
1. Compression Index score
2. Mexican import license issuance
3. Container dwell at Vancouver
4. Inca premium trajectory

---

## 🌱 Flaxseed (FLX)

**Compression Index Class:** C (3 components; some crush but thin)
**Coiled Spring Fit:** STRONG
**Typical Stance Range:** -25 to +50

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| Canada world share   | ~25% of global flax trade                        |
| Futures              | None                                             |
| Key buyers           | EU (feed + human), China (industrial), US        |
| Domestic crush       | Minor (10-15%)                                   |
| Primary export path  | Bulk rail + containerized (EU)                   |

### Grain-Specific Rules
- **R-CA-FLX-01 · EU is the dominant destination.** EU import licenses issued pattern-wise — batch buying, not continuous.
- **R-CA-FLX-02 · Russian competition.** Post-2022 sanctions reshaped flax flow. Russia still exports but via Kazakhstan/Belarus reroutes.
- **R-CA-FLX-03 · Compression Index Class C.** Basis-dominant.
- **R-CA-FLX-04 · Brown vs Yellow flax.** Yellow flax (edible oil) commands premium. Separate analysis from Brown (industrial).

### Thesis-Killers
1. EU license batch cancellation (rare but high-impact).
2. Chinese industrial demand slump (paint, linoleum).
3. Russian flax entering EU via gray channels.

### Debate Tiebreakers
1. Compression Index score
2. EU import license issuance pace
3. Chinese industrial-flax demand signal
4. Yellow vs Brown flax spread

---

## 🌾 Wheat (WHT)

**Compression Index Class:** n/a (Global substitution caps CWRS; tracks US wheat)
**Coiled Spring Fit:** WEAK
**Typical Stance Range:** -30 to +35

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| Canada world share   | ~15% of global wheat trade                       |
| Futures              | MGEX Spring Wheat (CWRS proxy), CBOT (loose)     |
| Key buyers           | Indonesia, China, Japan, Peru, Algeria           |
| Domestic use         | Milling, feed                                    |
| Primary export ports | Vancouver, Thunder Bay, Prince Rupert            |

### Grain-Specific Rules
- **R-CA-WHT-01 · CWRS is price-taker on global wheat.** Russian, Ukrainian, Australian, and US wheat set ceiling. Use US Wheat card (R-US-WHT-*) for directional signal.
- **R-CA-WHT-02 · Protein premium matters.** CWRS 13.5% vs 11.5% spreads into millers' cost. Watch MGEX spring wheat / KCBT HRW spread.
- **R-CA-WHT-03 · Indonesia-Pakistan feed wheat window.** Seasonal Nov-Feb arbitrage opportunity for feed wheat blend.
- **R-CA-WHT-04 · No Compression Index.** Global substitution caps Canadian-specific spring compression.

### Thesis-Killers
1. Russian wheat export quota increase.
2. Australian bumper harvest (Dec-Jan).
3. US HRW/HRS condition surprise (USDA NASS crop progress).

### Debate Tiebreakers
1. MGEX/KCBT spring-HRW spread
2. Indonesia import license issuance
3. Producer Car allocation trajectory
4. Terminal receipts vs 1yr avg (aggregate wheat)

---

## 🌾 Barley (BAR)

**Compression Index Class:** n/a (regional feed market; low export share)
**Coiled Spring Fit:** WEAK
**Typical Stance Range:** -25 to +25

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| Canada world share   | ~10% of global barley trade                      |
| Futures              | None (weak proxy: CBOT Corn for feed barley)     |
| Key buyers           | China, Japan, Mexico, Saudi Arabia               |
| Domestic use         | ~70% feed (Alberta feedlots), ~15% malt          |
| Primary export port  | Vancouver                                        |

### Grain-Specific Rules
- **R-CA-BAR-01 · Feed vs Malt split.** Alberta feedlot activity drives feed; global brewers drive malt. Do not aggregate.
- **R-CA-BAR-02 · Low producer car allocation is normal.** Regional, feed-driven. Not a bearish signal.
- **R-CA-BAR-03 · China feed barley swings.** China re-entered post-2023 tariff thaw. Watch China USDA export sales for directional.
- **R-CA-BAR-04 · Corn substitution ceiling.** When US Corn < C$200/t delivered Alberta, barley demand caps.
- **R-CA-BAR-05 · No Compression Index.** Regional feed dynamics prevent country-wide spring formation.

### Thesis-Killers
1. US corn price collapse.
2. Alberta feedlot placement slump.
3. Saudi grain reserve release.

### Debate Tiebreakers
1. Alberta feedlot activity vs 1yr avg
2. China USDA export sales trajectory
3. Corn-barley spread in Alberta
4. Malt barley premium vs feed

---

## 🌽 Corn (COR)

**Compression Index Class:** n/a (CBOT-dominated; Canadian volumes too small)
**Coiled Spring Fit:** WEAK
**Typical Stance Range:** -20 to +20

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| Canada world share   | <2% of global corn trade                         |
| Futures              | CBOT Corn (directly applicable)                  |
| Primary production   | Ontario, Quebec, Manitoba (small prairie share)  |
| Domestic use         | Feed (Ontario), ethanol, minor processing        |

### Grain-Specific Rules
- **R-CA-COR-01 · Canadian corn is price-taker on CBOT.** Use US Corn card (R-US-COR-*) for directional thesis; Canadian layer only addresses basis.
- **R-CA-COR-02 · Ontario basis is the actionable variable.** Check Ontario corn basis vs CBOT for local signal.
- **R-CA-COR-03 · Import corn from US.** When CBOT low, Prairie feeders import US corn — Alberta/Saskatchewan basis tells the story.
- **R-CA-COR-04 · No Compression Index.** CBOT dominates.

### Thesis-Killers
1. CBOT Corn breakdown (any direction).
2. US ethanol policy shift.
3. Ontario basis widening >$20/t vs CBOT.

### Debate Tiebreakers
1. CBOT Corn trajectory
2. Ontario cash basis
3. Prairie feedlot corn imports (Alberta delivered price)

---

## 🌱 Soybeans (SOY)

**Compression Index Class:** n/a (CBOT-dominated; Canadian volumes modest)
**Coiled Spring Fit:** WEAK
**Typical Stance Range:** -25 to +25

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| Canada world share   | ~2% of global soybean trade                      |
| Futures              | CBOT Soybeans (directly applicable)              |
| Primary production   | Ontario, Quebec, Manitoba (growing)              |
| Domestic crush       | ADM Windsor, Bunge Hamilton (Ontario-centric)    |

### Grain-Specific Rules
- **R-CA-SOY-01 · Canadian soy is price-taker on CBOT.** Use US Soybeans card (R-US-SOY-*) for directional thesis.
- **R-CA-SOY-02 · Ontario soy is food-grade.** IP (identity-preserved) premium market for Japan/EU. Separate signal from commodity CBOT.
- **R-CA-SOY-03 · Manitoba soy is GMO commodity.** Follows CBOT directly.
- **R-CA-SOY-04 · No Compression Index.** CBOT dominates.

### Thesis-Killers
1. CBOT Soybeans breakdown (any direction).
2. China trade policy shift.
3. Japanese IP non-GMO tender volume drop.

### Debate Tiebreakers
1. CBOT Soybean trajectory
2. IP premium (Ontario) vs commodity (Manitoba)
3. Canadian soy export sales (USDA FAS weekly)

---

## 🌾 Oats (OAT)

**Compression Index Class:** n/a (90% producer cars US-bound; CBOT oats OI too thin for reliable COT)
**Coiled Spring Fit:** N/A (US-dependent demand, not a Canadian spring)
**Typical Stance Range:** -50 to +25

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| Canada world share   | ~70% of global oat trade                         |
| Futures              | CBOT Oats (thin OI — directional only, no reliable COT) |
| Key buyer            | US (Quaker, General Mills — milling)             |
| Domestic use         | ~15% milling, minor feed                         |
| Primary export path  | Producer Cars direct to US (90%)                 |

### Grain-Specific Rules
- **R-CA-OAT-01 · 90%+ of producer car oat shipments go to US.** "Collapsing exports" and high US-bound producer cars are contradictory — one of them is wrong.
- **R-CA-OAT-02 · Oats are a MILLING grain.** Never reference "crush" — use "processing" or "milling."
- **R-CA-OAT-03 · Rail is the binding constraint.** Oats claim 30-40% of weekly producer car allocation despite being a minor grain. High allocation = strong demand.
- **R-CA-OAT-04 · CBOT oats COT is unreliable.** Open interest too thin (<5k contracts typical). Ignore COT signals.
- **R-CA-OAT-05 · No Compression Index.** US-dependent demand precludes Canadian spring formation.
- **R-CA-OAT-06 · Quaker contract cycle.** Annual contract negotiations (Sep-Oct) create discrete demand steps, not continuous compression.

### Thesis-Killers
1. Quaker/General Mills contract cycle drop.
2. US millers substituting to imported European oats.
3. CN/CP producer car allocation squeeze.

### Debate Tiebreakers
1. US-bound producer car allocation trajectory
2. CBOT Oats front-month vs prior 4wk
3. US miller inventory (Quaker SEC filings)
4. Quaker contract cycle phase

---

## 🌱 Chick Peas (CHK)

**Compression Index Class:** n/a (Australia Dec-Feb harvest provides reliable competing supply)
**Coiled Spring Fit:** N/A
**Typical Stance Range:** -20 to +25

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| Canada world share   | ~10% of global chickpea trade                    |
| Futures              | None                                             |
| Key buyers           | India, Pakistan, Bangladesh, UAE                 |
| Primary export path  | Containerized                                    |

### Grain-Specific Rules
- **R-CA-CHK-01 · Australia is the Nov-Feb offset.** Australian harvest (Nov-Feb) releases ~1.5Mt into the same markets. Compression cannot form during this window.
- **R-CA-CHK-02 · India tariff walk-cycle.** Indian chickpea tariff (currently 44%) — follows a 2-3 yr cycle of hike/walk-back.
- **R-CA-CHK-03 · Desi vs Kabuli split.** Desi (small, dark) vs Kabuli (large, white) have different end-markets. Do not aggregate.
- **R-CA-CHK-04 · No Compression Index.** Australia offset breaks spring formation.

### Thesis-Killers
1. Australian harvest surplus (>1.8Mt).
2. India tariff cut.
3. Turkish/Mexican Kabuli entering EU market.

### Debate Tiebreakers
1. Australian harvest progress (ABARES reports)
2. India tariff status
3. Kabuli vs Desi premium

---

## 🌾 Rye (RYE)

**Compression Index Class:** n/a (thin market, irregular demand)
**Coiled Spring Fit:** N/A
**Typical Stance Range:** -15 to +20

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| Canada world share   | <5% of global rye trade                          |
| Futures              | None                                             |
| Key buyers           | US (distilling — Kentucky, Indiana), EU          |
| Domestic use         | Distilling (Alberta Premium), minor bread        |

### Grain-Specific Rules
- **R-CA-RYE-01 · US distilling is the swing buyer.** Bourbon/rye whiskey demand cycles drive weekly price.
- **R-CA-RYE-02 · No futures, no COT.** Basis-only market.
- **R-CA-RYE-03 · Ergot discount sensitivity.** Weather-sensitive quality discounts.
- **R-CA-RYE-04 · No Compression Index.** Market too thin.

### Thesis-Killers
1. US distiller inventory build (TTB data).
2. European rye surplus.
3. Ergot outbreak (quality crash).

### Debate Tiebreakers
1. US distiller demand signal
2. Canadian farm-held stocks (StatsCan)
3. Alberta Premium procurement

---

## 🌻 Sunflower (SUN)

**Compression Index Class:** n/a (niche market; world flow dominated by Black Sea)
**Coiled Spring Fit:** N/A
**Typical Stance Range:** -15 to +20

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| Canada world share   | <2% of global sunflower trade                    |
| Futures              | None                                             |
| Key buyers           | US (confection), EU                              |
| Domestic production  | Manitoba-concentrated                            |
| Primary use          | Confection (in-shell, dehulled), limited crush   |

### Grain-Specific Rules
- **R-CA-SUN-01 · Black Sea (Ukraine, Russia, Argentina) sets world price.** Canada is price-taker.
- **R-CA-SUN-02 · Confection vs Oil types.** Confection (NuSun, black oil) vs oil-type. Different end-markets.
- **R-CA-SUN-03 · US confection demand seasonality.** Peaks May-Oct (outdoor/baseball season).
- **R-CA-SUN-04 · No Compression Index.** Niche market.

### Thesis-Killers
1. Ukrainian export corridor reopening fully.
2. Argentine crop surprise (Feb-May).
3. US confection retail softness.

### Debate Tiebreakers
1. US confection demand trajectory
2. Black Sea export pace
3. Confection/oil-type spread

---

## 🫘 Beans (BEA)

**Compression Index Class:** n/a (niche market; Ontario/Manitoba specialty)
**Coiled Spring Fit:** N/A
**Typical Stance Range:** -15 to +20

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| Canada world share   | ~5% of global dry bean trade                     |
| Futures              | None                                             |
| Key buyers           | US (repackers), UK, Italy, Algeria               |
| Primary production   | Ontario, Manitoba                                |
| Varieties            | Navy, Pinto, Black, Cranberry, Kidney            |

### Grain-Specific Rules
- **R-CA-BEA-01 · Navy bean demand is UK-seasonal.** UK Heinz baked beans procurement cycle.
- **R-CA-BEA-02 · Variety matters.** Navy, Pinto, Black, etc. each have different primary buyers. Do not aggregate.
- **R-CA-BEA-03 · US dry bean competition.** Michigan/North Dakota compete directly in same markets.
- **R-CA-BEA-04 · No Compression Index.** Niche, variety-split market.

### Thesis-Killers
1. US dry bean bumper crop (Michigan/ND).
2. UK Heinz procurement shift (to US).
3. Algeria bean tender cancellation.

### Debate Tiebreakers
1. Variety-specific (Navy, Pinto, Black)
2. US dry bean stocks vs 1yr avg
3. UK repacker procurement trajectory

---
