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
