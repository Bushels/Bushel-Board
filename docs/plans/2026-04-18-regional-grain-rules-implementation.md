# Regional Grain Rules & Unified Tier-Based Debate — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship v1 of the three-layer rulebook (global + Canada + US), Rules 16-19 Coiled Spring patch, tier-based debate, and Unifier phase that produces a unified North American ranking table (20 rows) every Friday night.

**Architecture:** Three markdown rulebooks (`agent-debate-rules.md` + `-canada.md` + `-us.md`) injected into the CAD and US swarm prompts. Desk chiefs apply tier-based debate and emit per-grain stance_score + Compression Index. A new Unifier phase runs after both swarms finish and writes to a new `unified_rankings` table. No code-runtime changes — prompts and SQL only.

**Tech Stack:** Markdown (rulebooks + prompts), PostgreSQL 15 (Supabase, migrations in `supabase/migrations/`), Claude Opus (orchestration + unifier + meta-reviewer), Claude Desktop Routines (triggers), Mermaid (diagrams in design doc).

**Parent Design:** `docs/plans/2026-04-18-regional-grain-rules-design.md` (read this first).

---

## Task Ordering & Parallelization

The plan is sequential by default, but these tasks can be parallelized:
- **Batch A (parallel OK):** Tasks 2-6 (rulebook content authoring — independent markdown files, no runtime dependency on each other).
- **Batch B (sequential):** Tasks 7-9 (swarm prompt updates — Task 7 updates both CAD + US prompts to reference rulebooks; Task 8-9 add Unifier phase).
- **Batch C (sequential):** Tasks 10-12 (migration → Unifier prompt → backtest — strict dependency chain).
- **Batch D (parallel OK):** Tasks 13-14 (meta-reviewer updates + documentation refresh).

A single executor can run top-to-bottom. A parallel-session executor can split on Batch A then join at Task 7.

---

## Task 1: Expand `agent-debate-rules.md` with Rules 16-19 (Coiled Spring patch)

**Files:**
- Modify: `docs/reference/agent-debate-rules.md`
- No code changes, markdown only.

**Step 1: Read the current Price Action section**

Run:
```bash
grep -n "Rule 15" docs/reference/agent-debate-rules.md
```
Expected: line number near end of Price Action section (around line 111).

**Step 2: Add a new "## Coiled Spring Disambiguators (Rules 16-19)" section between "Price Action Rules" (ends at Rule 15) and "Claude-Grok Manual Debate Protocol"**

Insert immediately after the Rule 15 block. Full text to add:

```markdown
---

## Coiled Spring Disambiguators (Rules 16-19)

The Coiled Spring framework describes a physical-tightness regime where basis widens, carry tightens, stocks drain, and vessel queues grow until a catalyst releases the pressure. It applies cleanly to 7 Canadian grains (Canola, Lentils, Peas, Amber Durum, Mustard Seed, Canaryseed, Flaxseed) and misfires when applied uniformly. Rules 16-19 are the disambiguators that prevent false positives.

### Rule 16: Pipeline Congestion Requires Receipt Confirmation
Pipeline tension (vessel queue length, out-of-car time, terminal fill %) scores bullish **only if terminal receipts are simultaneously accelerating**. Congestion without accelerating receipts is supply-side (rail failure, port labor, weather) and is structurally bearish for basis.

**Test:** `vessel_queue > 1yr_avg AND terminal_receipts_4wk_chg > 0` → pipeline tension = bullish. If receipts are flat or declining, pipeline congestion is a logistics bottleneck, not demand pull.

**Anti-pattern:** "Vancouver vessel queue = 33 (1yr avg 20) → strongly bullish canola." Wrong without confirming terminal receipts accelerated in the same 2-3 week window. Otherwise the queue reflects CN/CP delivery failure, which widens basis and hurts the farmer.

### Rule 17: Elevator-vs-Crush Bid Spread Disambiguates "Withholding"
If Process (crusher) deliveries are rising while Primary (elevator) deliveries fall, farmers are **migrating to better-bidding crushers**, not withholding grain. The Coiled Spring is real but its release vector is **basis, not futures**. Recommendations should focus on cash/basis capture at the crusher, not futures speculation.

**Test:** `Process.Deliveries WoW > 0 AND Primary.Deliveries WoW < 0` → migration, not withholding. Check R-CA-CNL-04 (canola bid spread) before asserting futures-side thesis.

### Rule 18: Basis Veto Rule
If the basis component of any composite score reads -2 or worse on the Basis Signal Matrix (Rule 13), **cap the composite score at +2** regardless of other bullish inputs. Basis is the farmer's truth (Rule 12). Fundamentals cannot override a widening basis at the farmer's elevator.

**Example:** Canola flow strong (+4), COT supportive (+2), vessel queue tight (+3), but Moose Jaw basis has widened from -$50 to -$68 over 2 weeks. Basis component = -3 → composite CAPPED at +2.

### Rule 19: COT Short-Cover Requires 3-Week or Shipment Confirmation
One week of commercial short-cover is ambiguous between **sales completion** (bearish — crushers done buying) and **directional capitulation** (bullish — commercials forced to reprice). Do not score bullish on a 1-week COT move alone.

**Confirmation paths (either suffices):**
1. 3 consecutive weeks of same-direction commercial short-cover, or
2. USDA export shipments for the same week show accelerated pace vs prior 4-week average.

If neither is present, the COT move is flagged "ambiguous" and excluded from the composite.

```

**Step 3: Append to the Validation Checklist**

Locate the `## Validation Checklist (Post-Generation)` section and add these four lines to the end of the bulleted list (before `## Price Accountability Log`):

```markdown
- [ ] **Coiled Spring — pipeline confirmation:** If thesis cites vessel queue or port congestion, are terminal receipts simultaneously accelerating? (Rule 16)
- [ ] **Coiled Spring — bid spread check:** If thesis cites "withholding," is Process vs Primary delivery divergence ruled out? (Rule 17)
- [ ] **Basis veto applied:** If basis component ≤ -2, is composite score capped at +2? (Rule 18)
- [ ] **COT cover confirmation:** Is any short-cover signal backed by 3 weeks of same-direction moves OR matching USDA shipment acceleration? (Rule 19)
```

**Step 4: Update the "Last updated" line at the top of the file**

Change `**Last updated:** 2026-03-18 (Price Action rules + Claude-Grok manual debate protocol added)` to `**Last updated:** 2026-04-18 (Rules 16-19 — Coiled Spring disambiguators — added)`.

**Step 5: Verify the file renders**

Run:
```bash
grep -E "^### Rule 1[6-9]" docs/reference/agent-debate-rules.md
```
Expected: four lines for Rule 16, 17, 18, 19 headers.

**Step 6: Commit**

```bash
git add docs/reference/agent-debate-rules.md
git commit -m "docs(rules): add R-16..R-19 Coiled Spring disambiguators

- R-16 Pipeline Congestion requires receipt confirmation
- R-17 Elevator-vs-Crush bid spread disambiguates withholding
- R-18 Basis veto rule caps composite at +2 when basis ≤ -2
- R-19 COT short-cover requires 3-week or shipment confirmation
- Validation checklist updated with four matching checks"
```

---

## Task 2: Create `agent-debate-rules-canada.md` file skeleton + Canadian Market Context

**Files:**
- Create: `docs/reference/agent-debate-rules-canada.md`

**Step 1: Create the file with a header + imports line**

```markdown
# Canadian Grain Market Rules & Grain-Specific Cards

**Purpose:** Country-specific rulebook for the Canadian grain desk swarm. Loaded by `docs/reference/grain-desk-swarm-prompt.md` alongside the global ruleset `agent-debate-rules.md`.

**Last updated:** 2026-04-18

**Rule citation format:** `R-CA-<GRAIN>-NN` (e.g., `R-CA-CNL-03` = Canada, Canola, rule 3).

**Scope:** 16 grains — Amber Durum (DUR), Barley (BAR), Beans (BEA), Canaryseed (CNR), Canola (CNL), Chick Peas (CHK), Corn (COR), Flaxseed (FLX), Lentils (LEN), Mustard Seed (MST), Oats (OAT), Peas (PEA), Rye (RYE), Soybeans (SOY), Sunflower (SUN), Wheat (WHT).

---
```

**Step 2: Add a "Canadian Market Context" section**

```markdown
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
```

**Step 3: Commit skeleton before starting grain cards**

```bash
git add docs/reference/agent-debate-rules-canada.md
git commit -m "docs(rules): scaffold Canadian rulebook with market context

Pre-populates header, rule citation format (R-CA-<GRAIN>-NN), and Canadian
market context covering regulators, ports, rail, data cadence, and
country-specific thesis traps. Grain cards added in subsequent commits."
```

---

## Task 3: Add STRONG-fit Coiled Spring grain cards (7 cards)

These 7 grains have a Compression Index computed. Canola is the reference card with maximum detail; others follow the same structure.

**Files:**
- Modify: `docs/reference/agent-debate-rules-canada.md`

**Step 1: Add Canola (Class A) reference card**

Append after the Canadian Market Context section:

```markdown
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

```

**Step 2: Add Lentils (Class B) card**

```markdown
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

```

**Step 3: Add Peas (Class B) card**

```markdown
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

```

**Step 4: Add Amber Durum (Class A) card**

```markdown
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

```

**Step 5: Add Mustard Seed (Class C) card**

```markdown
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

```

**Step 6: Add Canaryseed (Class C) card**

```markdown
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

```

**Step 7: Add Flaxseed (Class C) card**

```markdown
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

```

**Step 8: Commit strong-fit cards**

```bash
git add docs/reference/agent-debate-rules-canada.md
git commit -m "docs(rules): add 7 STRONG-fit Canadian grain cards

Canola (Class A reference), Lentils (Class B), Peas (Class B),
Amber Durum (Class A), Mustard Seed (Class C), Canaryseed (Class C),
Flaxseed (Class C). Each card follows the template from the design
doc: market structure fingerprint, grain-specific rules, thesis-killers,
debate tiebreakers, data freshness requirements where applicable."
```

---

## Task 4: Add WEAK-fit + N/A Canadian grain cards (9 cards)

These grains do not have a Compression Index — they are price-takers (CBOT-dominated), regional feed markets, or commodities with structural offsets (Oats US-dependent, Chick Peas Australia-offset).

**Files:**
- Modify: `docs/reference/agent-debate-rules-canada.md`

**Step 1: Add Wheat (WEAK fit) card**

```markdown
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

```

**Step 2: Add Barley (WEAK fit) card**

```markdown
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

```

**Step 3: Add Corn (WEAK — price-taker) card**

```markdown
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

```

**Step 4: Add Soybeans (WEAK — price-taker) card**

```markdown
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

```

**Step 5: Add Oats (N/A — US-dependent) card**

```markdown
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

```

**Step 6: Add Chick Peas (N/A — Australia offset) card**

```markdown
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

```

**Step 7: Add Rye (N/A — thin market) card**

```markdown
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

```

**Step 8: Add Sunflower (N/A — niche) card**

```markdown
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

```

**Step 9: Add Beans (N/A — niche) card**

```markdown
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

```

**Step 10: Commit weak-fit and N/A cards — completes the Canadian rulebook**

```bash
git add docs/reference/agent-debate-rules-canada.md
git commit -m "docs(rules): add 9 remaining Canadian grain cards (WEAK + N/A)

Wheat (WEAK — global substitution), Barley (WEAK — regional feed),
Corn (WEAK — CBOT price-taker), Soybeans (WEAK — CBOT price-taker),
Oats (N/A — US-dependent), Chick Peas (N/A — Australia offset),
Rye (N/A — thin), Sunflower (N/A — Black Sea-dominated),
Beans (N/A — variety-split niche).

All 16 Canadian grain cards now complete. File matches the 16 canonical
DB grain names from market_analysis."
```

**Step 11: Verify all 16 grain cards present**

Run:
```bash
grep -E "^## (🌱|🌾|🌼|🌽|🌻|🫘|🌿)" docs/reference/agent-debate-rules-canada.md | wc -l
```
Expected: `16`

---

## Task 5: Create `agent-debate-rules-us.md` file + 4 US market cards

**Files:**
- Create: `docs/reference/agent-debate-rules-us.md`

**Step 1: Create file with header + US Market Context**

```markdown
# US Grain Market Rules & Market-Specific Cards

**Purpose:** Country-specific rulebook for the US grain desk swarm. Loaded by `docs/reference/us-desk-swarm-prompt.md` alongside the global ruleset `agent-debate-rules.md`.

**Last updated:** 2026-04-18

**Rule citation format:** `R-US-<MARKET>-NN` (e.g., `R-US-COR-02` = US, Corn, rule 2).

**Scope (v1):** 4 markets — Corn (COR), Soybeans (SOY), Wheat (WHT), Oats (OAT). Wheat treated as one market; class expansion (HRW/SRW/HRS/SWW) deferred to v2.

---

## US Market Context

### Regulators and Data Sources
- **USDA NASS** — weekly crop progress (Apr-Nov), monthly crop production.
- **USDA FAS** — weekly export sales (Thursday AM).
- **USDA ERS + WAOB** — monthly WASDE (12th business day).
- **CFTC** — weekly Commitments of Traders (Friday PM, Tuesday positioning).
- **CBOT / KCBT / MGEX** — futures settlement prices.

### Primary Physical Infrastructure
- **Export ports:** Gulf (NOLA — most corn/soy/wheat), PNW (Portland, Tacoma — most to Asia), Great Lakes (minor), Atlantic (minor).
- **River system:** Mississippi/Illinois river barges feed Gulf. River stages matter for barge freight.
- **Rail:** BNSF + UP + CSX + NS. Shuttle train economics drive Gulf vs PNW routing.

### Data Cadence
- USDA Crop Progress: Monday 4pm ET (Apr-Nov).
- USDA Export Sales: Thursday 8:30am ET.
- WASDE: 12th business day, 12:00pm ET.
- CFTC COT: Friday 3:30pm ET (Tuesday positioning).

### US-Specific Thesis Traps
1. **US market = CBOT baseline.** Unlike Canada, the US has liquid futures on all 4 markets. Directional signal comes from futures + COT, not basis.
2. **China tariffs / PRC tenders are the single largest swing factor** for Corn and Soybeans.
3. **River/barge freight is the hidden basis driver.** Low river = Gulf basis widens vs PNW.
4. **USDA reports create discrete volatility steps** (not gradual compression). WASDE days and Prospective Plantings (March) are event risks, not spring formations.
5. **Condition ratings (good/excellent %) are lagging AND noisy.** Use as context, not as thesis driver.

---

```

**Step 2: Add US Corn card**

```markdown
## 🌽 US Corn (COR)

**Compression Index Class:** n/a (CBOT-liquid; use COT + WASDE instead)
**Coiled Spring Fit:** N/A (market too liquid to compress)
**Typical Stance Range:** -50 to +70

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| US world share       | ~30% of global corn production, ~35% of exports  |
| Futures              | CBOT Corn (highly liquid)                        |
| Key buyers           | China (tender-driven), Mexico (steady), Japan, EU|
| Domestic use         | ~40% ethanol, ~35% feed, ~25% export/other       |
| Primary export ports | Gulf (~70%), PNW (~25%)                          |
| Rail constraint      | Shuttle-train economics; Gulf vs PNW routing     |

### Market-Specific Rules
- **R-US-COR-01 · Ethanol pace is 40% of demand.** EPA RVO, ethanol crush margin, and blending economics drive steady demand. Weekly ethanol production (EIA) is a required data point.
- **R-US-COR-02 · China PRC tender is discrete bullish.** COFCO/SINOGRAIN tender announcements gap corn up. Not continuous — check for tender activity each week.
- **R-US-COR-03 · Mexico is steady 15% of exports.** Grind corn + feed corn; USMCA-stable.
- **R-US-COR-04 · Gulf vs PNW basis spread = freight signal.** When Gulf basis widens vs PNW, river freight is tight. Affects export pace.
- **R-US-COR-05 · USDA WASDE drives discrete steps.** Monthly ending-stocks revisions are event risk. Trade stance should flag "WASDE-in-2-days" and reduce position size.
- **R-US-COR-06 · COT reliable.** Managed money OI ~400k+ contracts. Apply Rules 9-11 with full confidence.
- **R-US-COR-07 · Condition ratings lagging.** G/E% matters for stance, not for this week's trade.

### Thesis-Killers
1. China tender cancellation or shift to Brazil/Ukraine.
2. EPA RVO reduction (ethanol demand compression).
3. South American (Brazil safrinha) bumper crop (Jul-Sep).
4. US ending stocks revision upward >200Mbu.

### Debate Tiebreakers (US-only; no Canadian overlap here)
1. Weekly ethanol production (EIA) vs 4wk avg
2. USDA export sales (Thursday) — net sales + shipments
3. COT managed money positioning
4. Gulf-PNW basis spread
5. WASDE event proximity

---

```

**Step 3: Add US Soybeans card**

```markdown
## 🌱 US Soybeans (SOY)

**Compression Index Class:** n/a (CBOT-liquid)
**Coiled Spring Fit:** N/A
**Typical Stance Range:** -40 to +70

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| US world share       | ~30% of global soybean production                |
| Futures              | CBOT Soybeans (highly liquid)                    |
| Key buyers           | China (~55% of exports), EU, Mexico, Japan       |
| Domestic crush       | ~55% of supply (ADM, Bunge, Cargill, Ag Processing)|
| Primary export ports | Gulf (~55%), PNW (~35%)                          |
| Brazil competition   | Feb-Jun Brazil window (peak export competition)  |

### Market-Specific Rules
- **R-US-SOY-01 · China is 55% of exports.** Single-buyer concentration. PRC trade policy dominates.
- **R-US-SOY-02 · Brazil Feb-Jun window is bearish US exports.** Brazil harvest + export overlap caps US price in Q2.
- **R-US-SOY-03 · Crush margin drives domestic demand.** Meal + oil combined. Watch soy oil crush margin — biodiesel RIN pricing affects this.
- **R-US-SOY-04 · Soy oil biodiesel demand.** Biodiesel RVO + RIN pricing adds demand layer. 45Z tax credit phase-out risk.
- **R-US-SOY-05 · Argentine crush competition.** Argentine peso policy shifts export pace (they export meal, we export beans).
- **R-US-SOY-06 · COT reliable.** Managed money OI ~300k+ contracts.
- **R-US-SOY-07 · Soy/Corn ratio.** When ratio >2.6, acreage shifts to soy next year (Feb-Mar Prospective Plantings).

### Thesis-Killers
1. China trade deal collapse or shift to 100% Brazil sourcing.
2. Brazil bumper harvest (Feb-Jun).
3. 45Z tax credit phase-out.
4. RIN price collapse (biodiesel demand crash).

### Debate Tiebreakers
1. USDA export sales (weekly Thursday)
2. Crush margin trajectory (soy oil + meal)
3. COT managed money
4. Soy/Corn ratio
5. China PRC tender status

---

```

**Step 4: Add US Wheat card (single-market v1; classes deferred to v2)**

```markdown
## 🌾 US Wheat (WHT)

**Compression Index Class:** n/a (CBOT-liquid, class-split complication)
**Coiled Spring Fit:** N/A
**Typical Stance Range:** -40 to +45

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| US world share       | ~8% of global wheat trade                        |
| Futures              | CBOT SRW, KCBT HRW, MGEX HRS (3 separate contracts)|
| Key buyers           | Mexico, Philippines, Japan, Indonesia, Egypt     |
| Classes              | HRW (Kansas), HRS (ND/SD), SRW (IL/IN/OH), SWW (PNW)|
| Primary export ports | Gulf, PNW, Great Lakes (seasonal)                |
| Global competition   | Russia, Ukraine, Australia, Canada, EU           |

### Market-Specific Rules
- **R-US-WHT-01 · Russia sets the floor price.** Russian export price is the effective global ceiling for US wheat.
- **R-US-WHT-02 · Class spreads matter.** HRW-SRW spread + protein premium (HRS vs HRW) tell different demand stories. v1 collapses to single score; v2 will split.
- **R-US-WHT-03 · USDA crop progress is the primary driver Apr-Nov.** G/E% revisions + drought classification (US Drought Monitor D0-D4) drive weekly sentiment.
- **R-US-WHT-04 · Egypt GASC tender is step-change.** GASC (Egyptian State Trading Corp) tender announcements drive SRW specifically.
- **R-US-WHT-05 · Winter wheat drought watch (Oct-Apr).** Kansas/Oklahoma drought conditions drive KCBT HRW.
- **R-US-WHT-06 · COT reliable per-class.** Managed money separated by contract (CBOT/KCBT/MGEX). Check all three.
- **R-US-WHT-07 · Class expansion v2.** v1 aggregates into single "US Wheat." v2 will split into 4 cards.

### Thesis-Killers
1. Russian wheat price collapse.
2. Australian bumper harvest (Dec-Jan).
3. GASC tender cancellation.
4. Black Sea corridor expansion.

### Debate Tiebreakers
1. USDA export sales (weekly)
2. HRW drought classification (US Drought Monitor)
3. Russian export price (SovEcon)
4. COT managed money (aggregate across 3 contracts)
5. US Dollar Index trajectory

---

```

**Step 5: Add US Oats card**

```markdown
## 🌾 US Oats (OAT)

**Compression Index Class:** n/a (CBOT oats OI too thin for COT; Canadian-import-dependent)
**Coiled Spring Fit:** N/A
**Typical Stance Range:** -50 to +35

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| US world share       | ~5% of global oat production; net importer       |
| Futures              | CBOT Oats (low OI ~5-10k contracts)              |
| Key producers        | North Dakota, Minnesota, Wisconsin, South Dakota |
| Primary use          | Milling (Quaker, General Mills), horse feed      |
| Canadian import share| 75-85% of US oat supply is imported from Canada  |

### Market-Specific Rules
- **R-US-OAT-01 · US is net importer from Canada.** 75-85% of US oat supply comes from Canadian producer car shipments. US market moves with Canadian supply.
- **R-US-OAT-02 · CBOT oats COT unreliable.** Low OI — do not apply Rules 9-11 to oats.
- **R-US-OAT-03 · Quaker + General Mills are the market.** Annual contract cycles (Sep-Oct) create discrete demand steps.
- **R-US-OAT-04 · Cross-border rail + FDA import channel.** Canadian producer car shipments to US millers cross at Emerson, MB / Noyes, MN and other ports.
- **R-US-OAT-05 · US oat price = Canadian producer car price + cross-border friction.** Canadian supply constraint passes through directly.
- **R-US-OAT-06 · Weak futures signal.** Directional only; no meaningful timing from COT or term structure.

### Thesis-Killers
1. Quaker contract cycle contraction.
2. European oat import surge (rare — logistics).
3. Canadian rail allocation squeeze reducing US supply.

### Debate Tiebreakers
1. Canadian producer car oat allocation (primary feed-in signal)
2. Quaker contract cycle phase
3. CBOT Oats front-month (directional only)
4. US miller inventory signals

---

```

**Step 6: Commit US rulebook**

```bash
git add docs/reference/agent-debate-rules-us.md
git commit -m "docs(rules): create US rulebook with 4 market cards

- File scaffold with US market context (regulators, ports, data cadence)
- US Corn (R-US-COR-01..07) — ethanol, China PRC, Gulf/PNW basis
- US Soybeans (R-US-SOY-01..07) — China dependence, Brazil window, biodiesel
- US Wheat (R-US-WHT-01..07) — Russia floor, class spreads, GASC, Drought Monitor
- US Oats (R-US-OAT-01..06) — Canadian-import-dependent, Quaker cycles

v1 scope: 4 markets only. Wheat class expansion (HRW/SRW/HRS/SWW)
deferred to v2 per brainstorm decision."
```

---

## Task 6: Update `docs/reference/grain-desk-swarm-prompt.md` with rule injection + tier debate

**Files:**
- Modify: `docs/reference/grain-desk-swarm-prompt.md`

**Step 1: Verify current Phase 3 structure**

Run:
```bash
grep -n "^## Phase 3" docs/reference/grain-desk-swarm-prompt.md
```
Expected: single match at line 183.

**Step 2: Add rule-loading instructions to Phase 3 (Specialist Dispatch)**

At the top of the Phase 3 section (right after the `## Phase 3: Specialist Dispatch (4 agents in parallel)` heading), insert this block:

```markdown
### Rule Context (MANDATORY — load before dispatching specialists)

Each specialist prompt MUST include these three rule contexts, concatenated in this order:

1. **Global rules:** Full contents of `docs/reference/agent-debate-rules.md` (Rules 1-19 + Validation Checklist).
2. **Country rules:** Full contents of `docs/reference/agent-debate-rules-canada.md` (Canadian market context + all 16 grain cards).
3. **Target grain card (emphasized):** Extract the single grain card for the grain being analyzed and include it a second time under an "ACTIVE GRAIN CARD" heading at the top of the specialist prompt.

**Rule citation convention:** Every specialist brief MUST cite rule IDs in evidence chains. Format: `R-NN` for global, `R-CA-<GRAIN>-NN` for Canadian grain-specific. Example: "Vancouver vessel queue tight (R-16 requires receipt check: PASS; R-CA-CNL-03 applies)."

**Thesis-killer tracking:** Every specialist MUST scan its target grain's "Thesis-Killers" list and explicitly flag whether any is currently active. Output field: `active_thesis_killers[]`.
```

**Step 3: Replace the Phase 4 "Resolution Protocol" section with tier-based debate**

Locate the `### Resolution Protocol` subsection inside Phase 4 (around line 212). Add a new subsection titled `### Tier Assignment (NEW — v1 tier-based debate)` immediately after the existing Resolution Protocol content and before the `### Viking Knowledge for Resolution` section.

New subsection text:

```markdown
### Tier Assignment (NEW — v1 tier-based debate)

After per-grain stance scoring, assign each grain to one of 5 tiers:

| Tier          | Stance score range | Action                                   |
|---------------|---------------------|------------------------------------------|
| Strong Bull   | > +50               | High-conviction bullish, actionable this week |
| Mild Bull     | +20 to +50          | Directional lean; watch for confirmation |
| Neutral       | -20 to +20          | No clear signal; mixed fundamentals      |
| Mild Bear     | -50 to -20          | Directional lean bearish; watch for weakness |
| Strong Bear   | < -50               | High-conviction bearish, actionable this week |

**Boundary flag:** If stance_score is within ±3 of any tier edge, add `boundary_flag: true` to the output row so meta-reviewer can audit.

### Intra-Tier Ranking

Within each tier, rank grains in this order:

1. **Compression Index score** (primary key) — applies only to STRONG-fit grains (Canola Class A; Lentils, Peas, Amber Durum Class B; Mustard, Canaryseed, Flaxseed Class C). Higher composite = higher rank.
2. **Grain-specific tiebreakers** (from the grain card's "Debate Tiebreakers" list) — fallback for non-Compression-Index grains and for ties within STRONG-fit group.
3. **Data freshness** (from the grain card) — in a tie, grain with fresher data ranks higher.

### Rule Citation Requirement

The desk chief's Step 5.1 output row for each grain MUST include a `rule_citations[]` array with at least ONE grain-specific rule ID. If the analysis relies solely on global rules, meta-reviewer will flag the row.

### Compression Index Output Format

For STRONG-fit grains, output format: `compression_index: +4`, `compression_class: "A"`. For all other grains, output: `compression_index: null`, `compression_class: null`.

### Basis Veto Check (Rule 18)

Before finalizing any stance_score > +2, verify the basis component. If basis_component ≤ -2, CAP the stance_score at +2 and add `basis_vetoed: true` to the output.
```

**Step 4: Update Step 5.1.5 In-run Meta-Review to add rule coverage checks**

Locate the `### Step 5.1.5 — In-run Meta-Review (MANDATORY before write)` section. Add these bullets to its existing checklist:

```markdown
- [ ] **Rule citation coverage:** Every grain row has at least ONE grain-specific rule ID in `rule_citations[]`. FAIL if any row cites only global rules.
- [ ] **Thesis-killer scan:** Every grain row has `active_thesis_killers[]` populated (can be empty array, but must be present).
- [ ] **Tier boundary check:** Any row with `boundary_flag: true` is reviewed manually for tier classification risk.
- [ ] **Compression Index coverage:** STRONG-fit grains (Canola, Lentils, Peas, Amber Durum, Mustard, Canaryseed, Flaxseed) have non-null compression_index; all others are explicitly null.
- [ ] **Basis veto applied:** Any stance_score > +2 has been checked against basis component (Rule 18).
```

**Step 5: Update the output row schema in Phase 5 Step 5.1**

Locate the specification for what fields a Step 5.1 output row contains. Add these new fields to the schema:

```markdown
- `tier` — one of "Strong Bull", "Mild Bull", "Neutral", "Mild Bear", "Strong Bear"
- `compression_index` — integer or null (STRONG-fit grains only)
- `compression_class` — "A" | "B" | "C" | null
- `rule_citations` — array of rule IDs, must include at least one grain-specific rule
- `active_thesis_killers` — array of strings (killer names from the grain card)
- `boundary_flag` — boolean (true if stance_score within ±3 of a tier edge)
- `basis_vetoed` — boolean (true if stance capped per Rule 18)
```

**Step 6: Commit CAD swarm prompt updates**

```bash
git add docs/reference/grain-desk-swarm-prompt.md
git commit -m "docs(swarm): add rule injection + tier debate to CAD swarm prompt

- Phase 3: mandatory rule context loading (global + country + active grain card)
- Phase 3: rule citation convention, thesis-killer tracking
- Phase 4: tier assignment (5 bands), intra-tier ranking, compression index format
- Phase 4: basis veto check per Rule 18
- Phase 5.1.5 meta-review: rule coverage, thesis-killer, boundary, compression, veto checks
- Phase 5.1 output schema: tier, compression_index, compression_class,
  rule_citations, active_thesis_killers, boundary_flag, basis_vetoed"
```

---

## Task 7: Update `docs/reference/us-desk-swarm-prompt.md` with equivalent changes

**Files:**
- Modify: `docs/reference/us-desk-swarm-prompt.md`

**Step 1: Apply the same rule injection block to US swarm Phase 3**

Locate `## Phase 3: Specialist Dispatch` (around line 174). Add at the top:

```markdown
### Rule Context (MANDATORY — load before dispatching specialists)

Each US specialist prompt MUST include these three rule contexts:

1. **Global rules:** Full contents of `docs/reference/agent-debate-rules.md` (Rules 1-19 + Validation Checklist).
2. **Country rules:** Full contents of `docs/reference/agent-debate-rules-us.md` (US market context + all 4 market cards).
3. **Target market card (emphasized):** Extract the single market card for the market being analyzed (Corn, Soybeans, Wheat, or Oats) and include it under "ACTIVE MARKET CARD" heading.

**Rule citation convention:** `R-NN` for global, `R-US-<MARKET>-NN` for US market-specific. Example: "USDA export sales 1.2Mt (R-US-COR-01 requires ethanol cross-check: PASS; R-US-COR-04 Gulf-PNW spread stable)."

**Thesis-killer tracking:** Every specialist MUST scan the active market card's Thesis-Killers and populate `active_thesis_killers[]`.
```

**Step 2: Apply the same tier assignment section to US Phase 4**

Insert the same "### Tier Assignment" + "### Intra-Tier Ranking" + "### Rule Citation Requirement" + "### Compression Index Output Format" + "### Basis Veto Check" block into `docs/reference/us-desk-swarm-prompt.md` Phase 4.

**Note for US:** Compression Index is n/a for all 4 US markets in v1 (all are CBOT-liquid price-takers or structurally unfit for spring formation). Intra-tier ranking falls through to market-specific tiebreakers only.

**Step 3: Update US Step 5.1.5 meta-review with the same 5 bullets**

Same bullets as Task 6 Step 4, with the adjustment: Compression Index coverage bullet becomes: "All 4 US markets have `compression_index: null` in v1 (explicitly). Any non-null value is a drift flag."

**Step 4: Update US Phase 5.1 output row schema**

Add the same 7 new fields: `tier`, `compression_index` (will be null for all US v1), `compression_class` (null), `rule_citations`, `active_thesis_killers`, `boundary_flag`, `basis_vetoed`.

**Step 5: Commit US swarm prompt updates**

```bash
git add docs/reference/us-desk-swarm-prompt.md
git commit -m "docs(swarm): mirror rule injection + tier debate into US swarm prompt

- Phase 3: rule context loading (global + US rulebook + active market card)
- Phase 3: R-US-<MARKET>-NN citation convention, thesis-killer tracking
- Phase 4: tier assignment + intra-tier ranking (compression_index null for US v1)
- Phase 4: basis veto per Rule 18 (applicable despite US liquidity)
- Phase 5.1.5: rule coverage, thesis-killer, boundary, compression-null, veto
- Phase 5.1 output schema: same 7 new fields as CAD swarm"
```

---

## Task 8: Create `unified_rankings` Supabase migration

**Files:**
- Create: `supabase/migrations/20260419130000_create_unified_rankings.sql`

**Step 1: Check the next available migration filename**

Run:
```bash
ls supabase/migrations/ | tail -3
```
Expected last file: `20260419120000_bio_trial_vendor_status_derive.sql`. Next numeric slot: `20260419130000`.

**Step 2: Write the migration SQL**

```sql
-- 20260419130000_create_unified_rankings.sql
-- Unified North American grain ranking — written by the Unifier phase
-- after both CAD and US Friday swarms complete.

BEGIN;

CREATE TABLE IF NOT EXISTS public.unified_rankings (
  id                    BIGSERIAL PRIMARY KEY,
  week_ending           DATE NOT NULL,
  region                TEXT NOT NULL CHECK (region IN ('CAD', 'US')),
  grain                 TEXT NOT NULL,
  tier                  TEXT NOT NULL CHECK (tier IN (
                          'Strong Bull', 'Mild Bull', 'Neutral', 'Mild Bear', 'Strong Bear'
                        )),
  rank_overall          SMALLINT NOT NULL,       -- 1-based rank across 20 rows
  stance_score          SMALLINT NOT NULL CHECK (stance_score BETWEEN -100 AND 100),
  compression_index     SMALLINT,                -- null for non-STRONG-fit grains
  compression_class     TEXT CHECK (compression_class IN ('A', 'B', 'C') OR compression_class IS NULL),
  primary_driver        TEXT NOT NULL,           -- one-line human-readable driver
  rule_citations        TEXT[] NOT NULL DEFAULT '{}',
  active_thesis_killers TEXT[] NOT NULL DEFAULT '{}',
  thesis_killer_watch   TEXT,                    -- narrative: "watch for X next week"
  boundary_flag         BOOLEAN NOT NULL DEFAULT FALSE,
  basis_vetoed          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Natural key: one row per (week, region, grain)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unified_rankings_week_region_grain
  ON public.unified_rankings (week_ending, region, grain);

-- Read path: "give me this week's ranking, ordered"
CREATE INDEX IF NOT EXISTS idx_unified_rankings_week_rank
  ON public.unified_rankings (week_ending DESC, rank_overall);

-- Tier-filter queries
CREATE INDEX IF NOT EXISTS idx_unified_rankings_tier
  ON public.unified_rankings (tier, week_ending DESC);

-- RLS: public read (anyone can see the ranking), write is service-role only
ALTER TABLE public.unified_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "unified_rankings_public_read"
  ON public.unified_rankings
  FOR SELECT
  TO anon, authenticated
  USING (TRUE);

-- Service-role writes only (no INSERT/UPDATE/DELETE policies for anon/authenticated)

COMMENT ON TABLE public.unified_rankings IS
  'Unified North American grain ranking. Written by the Unifier phase every Friday night after CAD + US desk swarms complete. One row per grain per week. 20 rows expected per week in v1 (16 CAD + 4 US).';

COMMENT ON COLUMN public.unified_rankings.rank_overall IS
  '1-based overall rank across all rows for a given week_ending. Ordered bull-to-bear: rank 1 = most bullish stance.';

COMMENT ON COLUMN public.unified_rankings.compression_index IS
  'Composite compression score. NULL for non-STRONG-fit grains (WEAK, N/A fit). Present for the 7 STRONG-fit Canadian grains only in v1.';

COMMENT ON COLUMN public.unified_rankings.boundary_flag IS
  'TRUE if stance_score is within ±3 of a tier edge. Flags potential misclassification for meta-reviewer audit.';

COMMIT;
```

**Step 3: Apply the migration locally and verify**

Run:
```bash
npx supabase db push
```
Expected: "Applied migration 20260419130000_create_unified_rankings.sql" (or equivalent success message).

Then verify table shape:
```bash
npx supabase db execute "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'unified_rankings' ORDER BY ordinal_position;"
```
Expected 14 columns matching the CREATE TABLE.

**Step 4: Insert a synthetic test row**

Run:
```sql
INSERT INTO public.unified_rankings (
  week_ending, region, grain, tier, rank_overall, stance_score,
  compression_index, compression_class, primary_driver,
  rule_citations, active_thesis_killers, thesis_killer_watch,
  boundary_flag, basis_vetoed
) VALUES (
  '2026-04-17', 'CAD', '_TEST_CANOLA', 'Strong Bull', 99, 72,
  4, 'A', 'Test row — delete me',
  ARRAY['R-16', 'R-CA-CNL-03'], ARRAY[]::text[], 'Test watch',
  FALSE, FALSE
);
```
Expected: `INSERT 0 1`.

Then:
```sql
DELETE FROM public.unified_rankings WHERE grain = '_TEST_CANOLA';
```
Expected: `DELETE 1`.

**Step 5: Commit migration**

```bash
git add supabase/migrations/20260419130000_create_unified_rankings.sql
git commit -m "feat(unified-rankings): create unified_rankings table

New table for the unified North American grain ranking written by
the Unifier phase every Friday night. 20 rows/week in v1 (16 CAD + 4 US).

- Natural key: (week_ending, region, grain)
- Indexed for tier-filter + weekly-ranked read patterns
- RLS: public read, service-role write only
- CHECK constraints on tier, compression_class, stance_score range, region
- Boundary flag for tier-edge rows surfaces meta-reviewer audit candidates"
```

---

## Task 9: Create Unifier orchestration prompt

**Files:**
- Create: `docs/reference/unifier-prompt.md`

**Step 1: Write the Unifier prompt document**

```markdown
# Unifier Phase — Prompt

**Purpose:** After both the CAD grain desk swarm (Fri 6:47 PM ET) and the US desk swarm (Fri 7:30 PM ET) complete, the Unifier merges their per-region outputs into a single unified North American ranking of 20 entries (16 CAD + 4 US).

**Model:** Claude Opus (single call, low temperature).

**Trigger:** Claude Desktop Routine `unifier-weekly` — scheduled Fri 8:15 PM ET (both swarms have completed by this time; 45-min buffer built in).

**Writes to:** `public.unified_rankings` (service-role via Supabase Edge Function).

**Reads from:**
- `public.market_analysis` — all rows where `grain_week = MAX(grain_week) FROM cgc_observations`
- `public.us_market_analysis` — all rows where `report_date = MAX(report_date) FROM us_market_analysis` constrained to same week_ending

---

## Inputs

1. Per-grain CAD rows (16) with: grain, stance_score, compression_index (null or +N), compression_class (A|B|C|null), tier, rule_citations[], active_thesis_killers[], primary_driver narrative, boundary_flag, basis_vetoed
2. Per-market US rows (4) with: same schema, region='US', compression_index always null in v1
3. Global rules (`agent-debate-rules.md`) — for cross-region validation reference only

## Tasks

### Step 1 — Validation
- Assert 16 CAD rows + 4 US rows present. If not, HALT and emit `reason: "missing_region_input"`.
- Assert every row has non-null stance_score, tier, at least one rule_citation.
- Assert stance_score is within tier bounds (e.g., Strong Bull row must have stance_score > +50). If not, flag `calibration_drift` and continue.

### Step 2 — Unified Ranking (bull → bear)
Apply this sort key:

1. **Tier ordinal:** Strong Bull (1) < Mild Bull (2) < Neutral (3) < Mild Bear (4) < Strong Bear (5).
2. **Within tier — STRONG-fit bonus:** For STRONG-fit Canadian grains only, apply a small rank bonus if `compression_index >= +3` (rank ahead of non-STRONG-fit peers with same stance_score).
3. **Within tier — stance_score descending.**
4. **Final tiebreaker:** grain-specific tiebreaker #1 from that grain's card (for STRONG-fit: compression component direction).

Compute `rank_overall` as 1..20.

### Step 3 — Write Output Rows
For each of the 20 rows, emit one `unified_rankings` INSERT with all fields populated from the swarm inputs. `thesis_killer_watch` is a 1-sentence summary synthesized from `active_thesis_killers` — if empty, write "No active thesis-killers this week."

### Step 4 — Coverage Audit
After writing, run:
- Tier distribution summary: Strong Bull N, Mild Bull N, ..., Strong Bear N (report in Unifier log).
- Cross-border Wheat check: CAD Wheat + US Wheat ranks — if the spread is > 10 ranks, flag `cross_border_wheat_divergence: true` for meta-reviewer.
- Corn, Soybean, Oats same-market check — same 10-rank spread flag.

### Step 5 — Emit Summary
Output JSON summary for logs:
```json
{
  "week_ending": "2026-04-17",
  "rows_written": 20,
  "tier_distribution": {
    "Strong Bull": 4, "Mild Bull": 3, "Neutral": 5,
    "Mild Bear": 5, "Strong Bear": 3
  },
  "boundary_flags": 2,
  "basis_vetoes": 1,
  "cross_border_divergence_flags": 0
}
```

## Error Handling
- Missing region input → HALT, do NOT partially write.
- Calibration drift (row inside wrong tier for its stance_score) → write anyway, flag via `boundary_flag`, emit note.
- Duplicate (week_ending, region, grain) → UPSERT on natural key (overwrite prior Unifier attempt for the same week).

## Human-Readable Output (for desk publication)
In addition to the DB write, emit a Markdown ranked table for the Friday desk publication. Format matches `docs/plans/mockups/2026-04-18-regional-rules-ranked-output.html`: # | Region flag | Grain | Tier | Stance | Compression | Primary Driver | Rules cited.
```

**Step 2: Commit Unifier prompt**

```bash
git add docs/reference/unifier-prompt.md
git commit -m "docs(unifier): add Unifier phase orchestration prompt

- Triggered Fri 8:15 PM ET after both CAD + US swarms complete
- Opus single-call; reads market_analysis + us_market_analysis
- Sorts by tier ordinal → STRONG-fit compression bonus → stance_score
- Writes 20 rows to unified_rankings (16 CAD + 4 US)
- Cross-border Wheat/Corn/Soy/Oats divergence flag for meta-reviewer
- Emits JSON summary for logs + Markdown table for publication"
```

---

## Task 10: Wire Unifier trigger into Claude Desktop Routines documentation

**Files:**
- Modify: `docs/reference/collector-task-configs.md`

**Step 1: Add `unifier-weekly` routine documentation**

Append to the Claude Desktop Routines section:

```markdown
## unifier-weekly

**Trigger:** Friday 8:15 PM ET (weekly)
**Model:** Opus
**Prompt:** `docs/reference/unifier-prompt.md`
**Depends on:** `grain-desk-weekly` (Fri 6:47 PM ET) + `us-desk-weekly` (Fri 7:30 PM ET) must complete first.
**Writes to:** `public.unified_rankings`

This routine is the 7th phase of the Friday desk pipeline. It does not dispatch scouts or specialists — it only reads the two per-region weekly outputs and emits a unified ranking.

**Buffer rationale:** US desk completes around 7:45-8:00 PM ET on average. The 8:15 PM trigger leaves a 15-30 min safety buffer. If either swarm fails to complete, the Unifier halts with `missing_region_input` reason code and must be manually re-triggered.
```

**Step 2: Commit**

```bash
git add docs/reference/collector-task-configs.md
git commit -m "docs(routines): document unifier-weekly Claude Desktop Routine

Fri 8:15 PM ET trigger, Opus model, depends on CAD + US desk completion.
15-30 min buffer built in. Halts on missing region input."
```

---

## Task 11: Add 2-week recalibration protocol to meta-reviewers

**Files:**
- Modify: `.claude/agents/desk-meta-reviewer.md`
- Modify: `.claude/agents/us-desk-meta-reviewer.md`

**Step 1: Read current desk-meta-reviewer.md structure**

Run:
```bash
grep -n "^##" .claude/agents/desk-meta-reviewer.md
```
Expected: multiple section headers. Note the location where recommendations are authored.

**Step 2: Append a "Tier Threshold Recalibration Protocol (v1 — 2-week review)" section at the bottom of both files**

Full text (reuse for both files):

```markdown
## Tier Threshold Recalibration Protocol (v1 — 2-week review)

**Context:** v1 tier thresholds (Strong Bull > +50, Mild Bull +20 to +50, Neutral -20 to +20, Mild Bear -50 to -20, Strong Bear < -50) were set by eyeballed intuition during the 2026-04-18 brainstorm. Empirical calibration requires at least 2 weeks of live production output + 4 weeks of subsequent price action.

**Run cadence:** After the 2nd and 4th weekly production cycles, then monthly thereafter.

### Inputs
1. `unified_rankings` rows from the last 2 weeks (40 total v1).
2. `grain_prices` or equivalent future settlement movements for the 4-week window following each ranking.
3. For grains without futures: elevator cash bid moves from posted_prices + Moose Jaw reference.

### Analysis
For each row in the 2-week sample:
- Compute the 4-week forward price move for the grain.
- Compare actual move direction and magnitude to the tier assigned at ranking time.
- Flag discrepancies:
  - **False Strong Bull:** tier was Strong Bull but 4-wk move was negative or < +1%.
  - **False Strong Bear:** tier was Strong Bear but 4-wk move was positive or > -1%.
  - **Missed Strong signal:** tier was Neutral but 4-wk move was > +5% or < -5%.

### Output
Append a `tier_calibration_review` section to the meta-reviewer's weekly recommendation record. Include:
- Count of each discrepancy class.
- Specific grains mismatched.
- Proposed threshold adjustments (e.g., "Strong Bull should move to > +60 based on 3 false positives in the sample").

**Do NOT auto-apply threshold changes.** Recommendations go into `desk_performance_reviews` (CAD) or `us_desk_performance_reviews` (US) for human review.

### Success Criteria (for graduating out of v1 thresholds)
- Less than 1 false-Strong per 2-week window on average across 4 consecutive reviews.
- Less than 2 Neutral misses per 2-week window.
- Tier boundary_flag rate (stance within ±3 of edge) stabilizes at <15% of rows.
```

**Step 3: Commit meta-reviewer updates**

```bash
git add .claude/agents/desk-meta-reviewer.md .claude/agents/us-desk-meta-reviewer.md
git commit -m "feat(meta-reviewer): add 2-week tier recalibration protocol

Both CAD and US meta-reviewers now audit tier thresholds after each
2-week window against 4-week forward price moves. Recommendations land
in desk_performance_reviews for human approval — no auto-apply.

Exit criteria for v1 thresholds: <1 false-Strong per window, <2 Neutral
misses, boundary_flag rate <15%."
```

---

## Task 12: Run backtest on Weeks 30-35 (validation gate before go-live)

**Files:** None created or modified — this is a manual validation step.

**Step 1: Export historical market_analysis + us_market_analysis rows**

Run:
```bash
npx supabase db execute "
  SELECT grain, grain_week, stance_score, model_used, generated_at
  FROM market_analysis
  WHERE crop_year='2025-2026' AND grain_week BETWEEN 30 AND 35
  ORDER BY grain_week, grain;
"
```
Expected: ~96 rows (16 grains × 6 weeks).

Same for US:
```bash
npx supabase db execute "
  SELECT market, report_date, stance_score, model_used
  FROM us_market_analysis
  WHERE report_date >= (CURRENT_DATE - INTERVAL '8 weeks')
  ORDER BY report_date, market;
"
```
Expected: ~24 rows (4 markets × 6 weeks). If less (US swarm newer), note the partial coverage.

**Step 2: Manually assign tiers to each historical row using v1 thresholds**

Build a scratch spreadsheet (or SQL) that bins each stance_score into one of the 5 tiers. For each week:
- Verify tier distribution looks plausible (no week should have 15/20 grains in the same tier without explanation).
- Verify no tier is empty for every week (if Strong Bull is empty every week, thresholds are too tight).

**Step 3: Compare to forward price moves**

For each of the last 6 weeks, pull the 4-week forward price move (or 2-week if only 4 weeks of data are available) from `grain_prices` for each grain with a futures contract. Compute:
- Proportion of Strong Bull rows with positive 4-week move
- Proportion of Strong Bear rows with negative 4-week move
- Proportion of Neutral rows with |move| < 3%

**Step 4: Write findings to a validation doc**

Create `docs/lessons-learned/2026-04-19-tier-threshold-backtest.md` with:
- Tier distribution table for Weeks 30-35
- False-positive/false-negative rates
- Go/no-go recommendation for v1 production launch
- If no-go: proposed threshold adjustments before launch

**Step 5: Commit backtest findings**

```bash
git add docs/lessons-learned/2026-04-19-tier-threshold-backtest.md
git commit -m "docs(backtest): v1 tier threshold validation against Weeks 30-35

[Include go/no-go summary and any pre-launch threshold adjustments.]"
```

**Note:** If the backtest reveals thresholds are badly miscalibrated, DO NOT proceed to Task 13. Revise the thresholds in the swarm prompts (Tasks 6 and 7) first.

---

## Task 13: Update project documentation (CLAUDE.md, STATUS.md, README.md)

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/plans/STATUS.md`
- Modify: `README.md`

**Step 1: Update `CLAUDE.md` — Tables section**

In the `**Tables:**` paragraph (under Intelligence Pipeline), append `unified_rankings` (unified North American ranking written by Unifier phase every Friday night — 20 rows/week in v1, 16 CAD + 4 US).

**Step 2: Update `CLAUDE.md` — Reference Files section**

Add these three lines under Reference Files:
```
- `docs/reference/agent-debate-rules-canada.md` — Canadian country rulebook with 16 grain cards (R-CA-<GRAIN>-NN)
- `docs/reference/agent-debate-rules-us.md` — US country rulebook with 4 market cards (R-US-<MARKET>-NN)
- `docs/reference/unifier-prompt.md` — Unifier phase orchestration prompt (Fri 8:15 PM ET)
- `docs/plans/2026-04-18-regional-grain-rules-design.md` — Regional rules + tier-based debate design doc
```

**Step 3: Update `CLAUDE.md` — Intelligence Pipeline section**

Locate the `**V2 (current) — Claude Agent Desk swarm:**` bullet and append after the existing CAD + US sub-bullets:

```
- **Unifier phase (NEW, Track 46):** Single Opus call Fri 8:15 PM ET. Reads market_analysis + us_market_analysis; writes 20 rows to unified_rankings (16 CAD + 4 US). Produces a bull→bear tier-ranked North American desk output. Routine `unifier-weekly`. Prompt: `docs/reference/unifier-prompt.md`.
```

**Step 4: Update `docs/plans/STATUS.md`**

Add a new track entry:

```markdown
### Track 46 — Regional Grain Rules + Tier-Based Unified Ranking (V1)

**Status:** In progress (design + implementation plan approved 2026-04-18)
**Design:** `docs/plans/2026-04-18-regional-grain-rules-design.md`
**Implementation:** `docs/plans/2026-04-18-regional-grain-rules-implementation.md`

**Scope:**
- Rules 16-19 (Coiled Spring disambiguators) added to global rulebook
- 16 Canadian grain cards in `agent-debate-rules-canada.md`
- 4 US market cards in `agent-debate-rules-us.md`
- CAD + US swarm prompts updated with rule injection + tier debate
- Unifier phase producing `unified_rankings` table (20 rows/week)
- Meta-reviewer 2-week recalibration protocol

**Gates:** Backtest Weeks 30-35 before first live production publication.
```

**Step 5: Update `README.md`**

Add a one-line entry in the compressed feature log (same format as prior tracks).

**Step 6: Commit documentation updates**

```bash
git add CLAUDE.md docs/plans/STATUS.md README.md
git commit -m "docs: announce Track 46 — regional rules + tier-based unified ranking

- CLAUDE.md: unified_rankings table, 3 new reference files, Unifier phase
- STATUS.md: Track 46 entry with scope + gates
- README.md: compressed-log entry"
```

---

## Task 14: Update auto-memory with the new rule citation convention

**Files:**
- Create/Modify: `C:\Users\kyle\.claude\projects\C--Users-kyle-Agriculture-bushel-board-app\memory\` files

**Step 1: Write a new `project_regional_rules.md` memory entry**

```markdown
---
name: Regional grain rules + tier debate (Track 46)
description: Three-layer rulebook (global R-NN + R-CA-<GRAIN>-NN + R-US-<MARKET>-NN), tier-based debate, Unifier phase, unified_rankings table
type: project
---

Track 46 (2026-04-18 design, implementation plan cf7b956+): The grain desk swarm now uses three rulebooks:
- `docs/reference/agent-debate-rules.md` (global, Rules 1-19)
- `docs/reference/agent-debate-rules-canada.md` (16 grain cards, R-CA-<CODE>-NN)
- `docs/reference/agent-debate-rules-us.md` (4 market cards, R-US-<CODE>-NN)

**Why:** Implicit Canadian-only rules drifted when US swarm was added. Coiled Spring framework (validated by risk-analyst for 7 specific Canadian grains) needed codification as Rules 16-19. Desk needed a unified bull→bear ranking across all 20 NA markets.

**How to apply:**
- When reading market analysis, expect rule citations (`R-16`, `R-CA-CNL-03`) in evidence chains.
- The 7 STRONG-fit Canadian grains (Canola, Lentils, Peas, Amber Durum, Mustard, Canaryseed, Flax) have a Compression Index (Class A/B/C); others have `compression_index: null`.
- Unified output lives in `unified_rankings` table; Unifier runs Fri 8:15 PM ET after both CAD (6:47 PM) and US (7:30 PM) swarms.
- Tier thresholds are v1 eyeballed; meta-reviewer recalibrates after 2 weeks of live data.
```

**Step 2: Append to `MEMORY.md` index**

Add one line under "Active Projects":
```
- [Regional grain rules + tier debate](project_regional_rules.md) — Track 46: global + CAD + US rulebooks, R-CA-<GRAIN>-NN citation convention, Unifier writes unified_rankings
```

**Step 3: Commit is not required for memory files** (they're outside the repo).

---

## Bite-Sized Commit Summary

By the end of execution, this plan produces these commits on top of `cf7b956`:

| # | Commit message                                                       | Files touched                                  |
|---|----------------------------------------------------------------------|------------------------------------------------|
| 1 | docs(rules): add R-16..R-19 Coiled Spring disambiguators             | agent-debate-rules.md                          |
| 2 | docs(rules): scaffold Canadian rulebook with market context          | agent-debate-rules-canada.md                   |
| 3 | docs(rules): add 7 STRONG-fit Canadian grain cards                   | agent-debate-rules-canada.md                   |
| 4 | docs(rules): add 9 remaining Canadian grain cards (WEAK + N/A)       | agent-debate-rules-canada.md                   |
| 5 | docs(rules): create US rulebook with 4 market cards                  | agent-debate-rules-us.md                       |
| 6 | docs(swarm): add rule injection + tier debate to CAD swarm prompt    | grain-desk-swarm-prompt.md                     |
| 7 | docs(swarm): mirror rule injection + tier debate into US swarm prompt| us-desk-swarm-prompt.md                        |
| 8 | feat(unified-rankings): create unified_rankings table                | migrations/20260419130000_*.sql                |
| 9 | docs(unifier): add Unifier phase orchestration prompt                | docs/reference/unifier-prompt.md               |
|10 | docs(routines): document unifier-weekly Claude Desktop Routine       | collector-task-configs.md                      |
|11 | feat(meta-reviewer): add 2-week tier recalibration protocol          | .claude/agents/*-meta-reviewer.md              |
|12 | docs(backtest): v1 tier threshold validation against Weeks 30-35     | lessons-learned/2026-04-19-*.md                |
|13 | docs: announce Track 46                                              | CLAUDE.md, STATUS.md, README.md                |

(Memory file update is not in git.)

---

## Validation Gates

Before marking the plan complete, verify each of these:

- [ ] `grep -cE "^### Rule [1-9][0-9]?:" docs/reference/agent-debate-rules.md` returns `19`.
- [ ] `grep -cE "^## (🌱|🌾|🌼|🌽|🌻|🫘|🌿)" docs/reference/agent-debate-rules-canada.md` returns `16`.
- [ ] `grep -cE "^## (🌱|🌾|🌽|🫘)" docs/reference/agent-debate-rules-us.md` returns `4`.
- [ ] `npx supabase db push` applies migration without error.
- [ ] `SELECT COUNT(*) FROM information_schema.columns WHERE table_name='unified_rankings'` returns ≥ 14.
- [ ] Backtest doc exists at `docs/lessons-learned/2026-04-19-tier-threshold-backtest.md` with go/no-go recommendation.
- [ ] `npm run build` passes.
- [ ] `CLAUDE.md` mentions `unified_rankings`.

---

## Out of Scope (v2+)

Deferred items from the design doc — do NOT attempt in v1 execution:
- US wheat class split (HRW/SRW/HRS/SWW → 4 separate cards).
- Sub-regional rules (Prairie vs Ontario, Midwest vs PNW).
- Empirically calibrated tier thresholds (happens at Task 11 meta-reviewer cadence, not in v1 ship).
- Consumer-facing dashboard UI for unified ranking (frontend-design skill later).
- Farmer-action CTA layer on ranked grains.
- Historical-replay harness automation.

---

## Execution Notes for the Implementer

- **Every task that modifies markdown ends with a commit.** Never batch commits across tasks — each commit should be atomic and independently reviewable.
- **Tasks 1-5 are pure markdown authoring.** Low runtime risk. Can be done in a single focused session (~2-3 hours).
- **Tasks 6-7 (swarm prompt updates) require careful sectional edits.** Re-read the surrounding Phase structure before inserting new subsections — the prompts are long (~500 lines each) and section indentation matters.
- **Task 8 (migration) is the only runtime-affecting task.** Apply and verify before proceeding to Tasks 9-10 which depend on the table existing.
- **Task 12 (backtest) is a manual analytical step.** Do not skip — it is the v1 launch gate.
- **If backtest reveals miscalibration, return to Task 6-7 and adjust thresholds before Task 13.**
