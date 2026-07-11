# Wheat Bull/Bear Thesis Swarm Redesign

Date: 2026-06-23

## Objective

Make `/thesis` a Wheat-first decision board that a busy farmer can read in under a minute.

The page must show one Wheat bullish/bearish read. Canada and the U.S. are evidence geographies, not the product structure. The board should answer:

- Is Wheat leaning bullish, bearish, or balanced?
- What moved the read?
- Which evidence is strongest?
- How confident is the read?
- What should be inspected next?

## Current USDA Update To Admit As Evidence Context

USDA Crop Progress released 2026-06-22 for the week ending 2026-06-21:

- Winter crop harvest: 40%, up from 25% last week, 18% last year, and 24% five-year average.
- Winter crop good/excellent: 26%, down from 27% last week and well below 49% last year.
- Spring crop headed: 16%, up from 6% last week, in line with 15% last year and 16% five-year average.
- Spring crop good/excellent: 54%, down from 55% last week and equal to 54% last year.

Interpretation for the board:

- Poor winter crop condition is bullish supply/quality pressure.
- Fast harvest progress is bearish/neutral near-term supply availability.
- Spring crop condition and heading pace are broadly neutral for now.
- The data belongs in the supply/weather pressure lane. Harvest and heading explain crop stage; condition is the deterministic scoring input today.

## Source Lanes

Each lane agent traces source rows to one pressure score and must avoid double-counting evidence already used by another lane.

| Lane | Primary sources | What the lane decides |
| --- | --- | --- |
| Supply/weather pressure | USDA Crop Progress, Canada crop progress, WASDE, Statistics Canada where admitted | Crop stress, development timing, acreage, carryout, harvest pace |
| Demand/export flow | CGC exports, USDA Export Sales, WASDE demand revisions | Whether demand is absorbing supply faster or slower than expected |
| Movement | CGC deliveries, terminal receipts, producer cars | Whether farmer selling and elevator flow are tightening or loosening basis pressure |
| Logistics | Grain Monitor, terminal/vessel metrics, producer-car allocation | Whether movement constraints are blocking or accelerating export flow |
| Price/FX confirmation | Grain prices, FX, futures/basis context | Whether price action confirms or contradicts official-flow evidence |
| Positioning | CFTC COT where admitted | Whether managed money positioning is amplifying or fading the move |
| Watch leads | X/social, news, farmer field reports | What to inspect next; cannot move the score alone |

## Swarm Contract

Use the existing grain-report skill and project agents before creating new standing agents. The swarm should produce small, auditable packets instead of prose essays.

Each lane agent returns:

```json
{
  "grain": "Wheat",
  "lane": "supply_weather",
  "source_ids": ["usda_crop_progress"],
  "freshness": "2026-06-22 release / 2026-06-21 week ending",
  "rows_checked": 451,
  "calculation": "Winter good/excellent 26%, YoY -23 pts; harvest 40% vs 24% five-year average.",
  "bull_case": "Poor winter crop condition raises supply/quality risk.",
  "bear_case": "Fast harvest progress adds near-term availability.",
  "score_recommendation": 35,
  "confidence": 0.8,
  "blocked_claims": ["Do not make spring/winter class-specific public thesis claims until class-safe mapping is admitted."],
  "visual_hint": "Small metric strip plus diverging supply/weather bar."
}
```

## Reconciliation Judge

The judge agent compares lane packets and returns one Wheat read.

Responsibilities:

- Detect contradictions, such as bullish condition risk offset by bearish harvest pace.
- Prevent double-counting, especially WASDE supply revisions plus crop-progress condition.
- Apply the deterministic rating model before any prose.
- Enforce the public-board wording guardrail: no advice language and no class-specific Wheat claims until mappings are admitted.
- Choose the one deciding datum when evidence is mixed.
- Return both a score and a short farmer-facing reason.

Output:

```json
{
  "grain": "Wheat",
  "rating": "balanced",
  "score": 0,
  "confidence": 70,
  "deciding_datum": "Canada export flow is bullish but U.S. crop condition/harvest evidence offsets it.",
  "top_bull": "Canada export basis stays firm.",
  "top_bear": "U.S. condition and harvest evidence add supply-side offset.",
  "watch_next": ["Next USDA Crop Progress condition move", "CGC export pace", "local basis confirmation"],
  "public_copy": "Mixed Wheat read. The strongest support is export flow; the offset is crop-stage supply pressure."
}
```

## Visual Direction

Farmer-facing first screen:

- One large Wheat score and stance meter.
- Confidence shown as visual scale, not a separate technical panel.
- Two compact evidence-geography chips for CA and US.
- One bull evidence card and one bear evidence card.
- A small "how the data connects" flow: sources -> pressure lanes -> one Wheat read.
- Latest USDA crop-progress card below the main read.
- Pressure-lane bars sorted by absolute score so the biggest drivers are easiest to see.

Operator/audit surfaces stay behind `?audit=1`.

## V1 Implemented In This Pass

- Replaced the country-vs-country hero with one Wheat decision board.
- Added a USDA Crop Progress card for the 2026-06-22 release.
- Reworked pressure lanes into sorted diverging bars.
- Kept CA/US as evidence chips inside the Wheat read.
- Preserved the existing deterministic scorecard and public wording guards.
- Added focused page tests for the new wording and source-backed USDA context.

## V2 Backlog

- Add live packet fields for harvest and heading as explanation metrics while keeping condition as the current score driver unless replay proves harvest timing has predictive value.
- Build a lane-agent runner that writes local no-write audit packets before any Supabase write path.
- Add a replay harness for Wheat lane weights: compare prior weekly source packets against subsequent price/basis movement.
- Add a visual "driver changed this week" sparkline once historical lane deltas are reliable.
- Build the Wheat relationship spiderweb: center one Wheat read, place high-weight official/price/demand lanes close, place lower-authority watch/global/local-basis gaps farther out, and use edge color/thickness for bull/bear effect size.
- Done after this redesign: Wheat weekly-packet headlines now use the deterministic rating scorecard when populated.
- Done after this redesign in the mapper: the Wheat price lane now uses a Spring Wheat / HRW / SRW basket when multiple Wheat-class futures rows are present.
- Done as first UI pass after this redesign: expose the three-contract price split visually and add a reconciliation judge that explains which datum decides the read when lanes disagree.
- Still needed: refresh stale source rows, refine the judge language, and make the spiderweb more radial/instant-read instead of only a ring summary.
- Admit class-safe spring/winter mappings only when source identity, public wording, and tests prove they cannot leak unsupported class claims.
