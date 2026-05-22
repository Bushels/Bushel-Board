# US Thesis Data Spine — Gaps, Releases & Staleness Rules

**Purpose:** Define the minimum viable data foundation for high-quality US Bullish/Bearish thesis generation on the `/thesis` board. This document prioritizes missing data, identifies powerful compound signals, and establishes clear staleness rules so the thesis never relies on outdated information.

**Last Updated:** 2026-05-22
**Owner:** Bushel Board US Desk

---

## 1. Current US Data Coverage (What We Have)

| Source | Table | Cadence | Used in Thesis? | Notes |
|--------|-------|---------|------------------|-------|
| Export Sales | `usda_export_sales` | Weekly (Thu 8:30 AM ET) | Partially | Good pace + outstanding data |
| Crop Progress | `usda_crop_progress` | Weekly (Mon) | Yes (after fix) | National + state level |
| WASDE | `usda_wasde_mapped` | Monthly | Improving | Full balance sheet exists; local packet migration now computes month-over-month revision deltas, pending live application/cache refresh. |
| CFTC COT | `cftc_cot_positions` | Weekly (Fri) | Limited | Strong on wheat classes |
| Grain Prices | `grain_prices` | Daily | Indirect | Futures settlement |
| Quarterly Stocks | `usda_quarterly_stocks` | Quarterly | Yes | Measured NASS stocks now flow into `get_us_thesis_packet()` and `/thesis` cache as stocks-surprise supply context. |
| Acreage | `crop_acreage_estimates` | Annual (Mar/Jun/Jan revisions) | Yes | National USDA acreage rows now flow into `get_us_thesis_packet().supply.acreage`, thesis freshness, cache, and acreage-aware planting-progress drivers. |

**Assessment:** We have decent raw feeds, and USDA quarterly grain stocks plus acreage are now admitted into the US packet spine. Synthesis into compound thesis drivers remains thin on the US side compared to Canada, especially export inspections, live WASDE revision cache rollout, and cross-source scoring rules.

---

## 2. Prioritized US Data Gaps

### Tier 1 – High Impact

| Priority | Data Source | Why It Matters | Compound Value | Suggested Table |
|----------|-------------|----------------|----------------|-----------------|
| 1 | **USDA Quarterly Grain Stocks** | Actual measured stocks vs WASDE estimates. Large surprises move markets. | Ending Stocks revision + Export pace | `usda_quarterly_stocks` |
| 2 | **USDA Prospective Plantings + June Acreage** | Planted acres for corn, soybeans, spring wheat. Critical for supply thesis. | Planted acres + Crop Progress trajectory | `crop_acreage_estimates` |
| 3 | **WASDE Revision Analysis** | Track month-over-month changes in ending stocks, exports, and crush. | WASDE revision magnitude + COT shift | Local packet migration added; live apply/cache refresh pending |
| 4 | **Weekly Export Inspections** | More timely than cumulative Export Sales. Often cited in market commentary. | Inspections vs Export Sales pace | `usda_export_inspections` |

### Tier 2 – Medium Impact (Next quarter)

| Priority | Data Source | Why It Matters | Compound Value |
|----------|-------------|----------------|----------------|
| 5 | Soybean Crush (weekly/monthly) | Direct demand indicator for soybeans | Crush + Export Sales to China |
| 6 | Corn for Ethanol (weekly) | Major demand driver for corn | Ethanol grind + Export pace |
| 7 | State-level Crop Condition details | Better than national aggregate for wheat classes | State progress + basis strength |
| 8 | US vs Canada spring wheat competition signals | Direct substitution effect | US HRS progress + Canadian CWRS progress |

---

## 3. Release Calendar & Staleness Rules

### Official Release Schedule (US Central Time)

| Data | Typical Release Day/Time | Stale After | Thesis Weight Rule |
|------|---------------------------|-------------|--------------------|
| **Export Sales** | Thursday 8:30 AM | 21 days | Full weight for 14 days, then decay |
| **Crop Progress** | Monday 4:00 PM | 14 days | Full weight until next report |
| **WASDE** | 12th of month (or nearest business day) ~11:00 AM | 45 days | Full weight for current month only |
| **CFTC COT** | Friday 3:30 PM | 14 days | Full weight for 10 days |
| **Quarterly Stocks** | Jan, Mar, Jun, Sep (last week of month) | 90 days | High weight for 60 days |
| **Prospective Plantings** | March 31 | Until June Acreage | Very high weight until June report |
| **June Acreage** | Late June | Until next March | High weight for 6 months |
| **Export Inspections** | Weekly (usually Wed) | 10 days | Full weight for 7 days |

### Staleness Rules for Thesis Packet

When building `get_us_thesis_packet()`:

- **Export Sales** older than 21 days should be labeled “Aging” and down-weighted in stance scoring.
- **WASDE** from previous month should be treated as baseline only; current month revision takes precedence.
- **Crop Progress** from more than 2 reports ago should be shown with clear “as of” date and reduced influence on current bull/bear drivers.
- Any data point whose official replacement has already been published must be marked with its effective date.

---

## 4. High-Value Compound Signals

These combinations are more powerful than individual data points:

| Compound Signal | Bullish Trigger | Bearish Trigger | Data Sources Required |
|-----------------|-----------------|-----------------|-----------------------|
| **Export Pace vs WASDE Export Projection** | Current pace running >15% above WASDE projection | Pace lagging projection significantly | Export Sales + WASDE |
| **Stocks Surprise + Managed Money** | Quarterly Stocks much tighter than WASDE + Specs net long | Stocks much larger + Specs adding shorts | Quarterly Stocks + CFTC COT |
| **Spring Wheat Condition + Canadian Progress** | US poor + Canada also poor | US strong + Canada strong | Crop Progress (US + Canada) |
| **China Outstanding Sales + Basis Strength** | Large outstanding sales to China + strong basis | Outstanding sales dropping + wide basis | Export Sales + local basis |
| **WASDE Revision Magnitude + COT Shift** | WASDE cuts ending stocks + Managed Money adds longs | WASDE raises stocks + Specs liquidating | WASDE + CFTC COT |

---

## 5. Integration Plan into Thesis Workflow

1. **Data Layer**
   - Keep `usda_quarterly_stocks` refreshed through scheduled/collector operation.
   - Keep `crop_acreage_estimates` refreshed for March/June/January acreage revisions.
   - Add new importers for remaining Tier 1 gaps (Export Inspections).
   - Continue using `get_thesis_data_freshness()` as the shared staleness/freshness helper per source.

2. **Thesis Packet Layer**
   - Update `get_us_thesis_packet()` to pull from `usda_wasde_mapped`, `usda_export_sales`, `usda_crop_progress`, and new tables.
   - Add `data_freshness` and `revision_magnitude` fields to the US packet.

3. **Scoring Layer**
   - Create compound signal functions (e.g., `compute_export_vs_wasde_signal()`).
   - Feed these into stance score and bull/bear driver generation.

4. **Board Display**
   - Show “Data as of” dates clearly.
   - Surface staleness warnings when a key input is aging.
   - Highlight compound signals in the driver cards.

---

## 6. Next Actions

- [x] Build importer for `usda_quarterly_stocks`
- [x] Wire `usda_quarterly_stocks` into `get_us_thesis_packet()`, source freshness, `/thesis` cache, and deterministic US supply drivers
- [x] Wire `crop_acreage_estimates` acreage into `get_us_thesis_packet()`, source freshness, `/thesis` cache, and deterministic planting-progress drivers
- [x] Add WASDE revision fields to US thesis packet migration and deterministic board drivers
- [x] Apply WASDE revision migration live and refresh thesis packet cache
- [x] Add source-freshness quality warnings to thesis packet RPC
- [ ] Define compound signal scoring rules for Export Sales + WASDE

---

**Document Owner:** US Desk Chief (Claude Opus routine)  
**Review Cadence:** Every time a new Tier 1 source is added or a major WASDE revision occurs.
