# US Grain Thesis Track Plan

Date: 2026-04-13
Goal: Add a parallel US grain thesis layer alongside the existing Canadian Bushel Board thesis so both Canadian and American market views can be generated from data.

## Why this matters

Right now Bushel Board is structurally Canadian-first:
- grain list is Canadian
- CGC drives the core weekly thesis
- USDA export sales are imported, but only as a supporting modifier concept
- X signals exist, but are inconsistent week to week and not yet deeply integrated into the publish path

A US thesis track would unlock two things:
1. A proper American bullish/bearish thesis for US crops and users
2. A cleaner global-demand and competing-origin layer for Canadian theses

## What exists already

### Already in place
- `grain_prices` for US futures-linked contracts
- `cftc_cot_positions`
- `usda_export_sales`
- xAI analyzer path with web_search + x_search support
- predictive framing and calibration helpers

### Missing for a true US thesis
- US grain entities / category in `grains`
- dedicated US supply-and-demand source tables
- USDA WASDE / stocks-to-use dataset
- USDA crop progress / crop condition dataset
- US-specific thesis prompt framing
- separate publish path for US market thesis rows

## Recommended scope for v1

Start with 5 core US thesis markets:
- Wheat
- Corn
- Soybeans
- Soybean Oil
- Oats

Optional later:
- Barley
- Durum
- Soybean Meal
- HRW / HRS split as separate products

## Data model recommendation

Do not overload the Canadian weekly thesis path.
Create a parallel US thesis lane.

### New data tables
1. `usda_crop_progress`
- commodity
- report_date
- crop_year / marketing_year if applicable
- metric_type (`planted`, `emerged`, `good_excellent`, etc.)
- current_pct
- prior_week_pct
- five_year_avg_pct
- source

2. `usda_wasde`
- report_date
- commodity
- region (`US`, `World`)
- production_mt
- exports_mt
- ending_stocks_mt
- stocks_to_use_pct
- revision_vs_prior_pct
- source

3. optional later: `us_market_analysis`
- same broad shape as `market_analysis`, but without forcing CGC/crop-year semantics where they do not fit

### Alternative v1 shortcut
If you want faster progress, keep publishing into the existing `market_analysis`/`grain_intelligence` tables but add:
- `market_region`: `Canada` or `US`
- separate US grain entries in `grains`

That is faster, but less clean long term.

## Thesis architecture recommendation

### Canada thesis remains
- anchored by CGC
- modified by USDA, COT, futures, and X

### US thesis becomes
- anchored by USDA export sales + WASDE + crop progress + futures + COT + X
- modified by regional cash/basis if added later

## Prompt design recommendation

Create a dedicated US analyst prompt instead of stretching the Canadian one.

### New files
- `lib/us-analyst-prompt.ts`
- `supabase/functions/_shared/us-analyst-prompt.ts`
- optional: `lib/us-agent-team.ts`

### Core US agents
- Export Program Agent
- Stocks-to-Use Agent
- Crop Condition Agent
- Futures Structure Agent
- Sentiment & Timing Agent
- Calibration Guard

### Core US weekly questions
- Is export demand improving or fading?
- Did WASDE tighten or loosen the balance sheet?
- Are crop conditions adding or removing weather premium?
- Are specs stretched enough to create reversal risk?
- Should a US farmer sell, hold, or price a slice this week?

## Minimum viable US thesis output

For each US grain:
- stance_score
- confidence_score
- initial_thesis
- bull_case
- bear_case
- final_assessment
- recommendation
- data_freshness card
- review trigger

## Recommended build order

### Phase 1 — make USDA really active in Canadian thesis
Before full US thesis, finish the easier win:
1. inject `usda_export_sales` into `analyze-grain-market` data brief
2. explicitly map USDA demand into key_signals and llm metadata
3. fix stored X signal field mismatch (`post_text` vs `post_summary`)
4. surface whether x_search was actually used in the run

This improves the current Canadian product immediately.

### Phase 2 — add US market data foundations
1. add USDA crop progress importer
2. add WASDE importer
3. normalize commodity mappings
4. create US grain/category rows

### Phase 3 — first US thesis generator
1. create US prompt builder
2. create US analyzer route or script
3. generate first weekly US thesis for 3-5 grains
4. write to dedicated US thesis storage

### Phase 4 — connect Canada and US views
1. show US thesis as global-context modifier for Canadian grains
2. compare Canada thesis vs US thesis on shared crops
3. add cross-border divergence notes

## Immediate practical recommendation

The next highest-value move is NOT to build the entire US thesis stack first.
It is to do these two fixes immediately:

1. wire USDA export sales into the live Canadian analyzer prompt/data brief
2. fix the X stored-signal integration bug and freshness issue

That gives you better Canadian bullish/bearish calls now and creates the right bridge into a US thesis track.

## Success criteria

You will know this is working when:
- Canadian theses explicitly cite USDA demand context where relevant
- week-level X evidence is actually visible and current
- a US wheat/corn/soy thesis can be published from real data without CGC dependencies
- the system can explain when the US thesis is bullish while the Canadian thesis is neutral or bearish, and why
