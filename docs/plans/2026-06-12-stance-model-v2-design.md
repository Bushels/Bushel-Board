# Stance Model V2 — Relations, International Context, Price Patterns, X Sentiment

**Date:** 2026-06-12
**Status:** Approved design (Kyle, 2026-06-12)
**Owner:** Claude desk + Codex review
**Origin:** Week 44 wheat session (2026-06-11/12). Claude desk produced Canada +18 / US +30; Codex High independent review and the manual reasoning both had to hand-derive cross-domain relations, international ceilings, and price-pattern caps that the deterministic model cannot express today.

---

## 1. Problem

The deterministic stance score (`lib/thesis/rating-model.ts`) is a **pure weighted sum of independent domains** with freshness decay. Confirmed structural weaknesses:

1. **Domains do not interact.** "Commercial stocks drawing AND weekly deliveries −22% YoY AND export shipments +7%" is three small independent adds, when the *combination* is the single strongest signal on the board (implied absorption — debate Rules 1–2). Analysts re-derive this by hand every week.
2. **International context is absent** except the Canola veg-oil ±6 bounded tilt. No world or major-exporter S/U for wheat/feed grains, no Russia export wall, no CAD/USD, no wheat-class spread context. Codex High flagged all of these as misweights in the Week 44 review.
3. **Price domain is one day's `change_pct`.** No trend, no flat-tape detection (Rule 14 "dead-flat 5+ days = priced in" is prose only), no basis veto in code (Rule 18), no spread signals.
4. **Hermes/Grok X sentiment is fully quarantined.** Watch-only, no numeric path, and the `daily_pulse` 24-hour window frequently returns verified-quiet days while a 7-day window finds real, citable signal.
5. **The deterministic scorecard is never persisted.** It exists in memory for validation only, so the Saturday meta-reviewers cannot calibrate LLM-vs-deterministic drift, and the desk chief has no recorded baseline to justify deviations against.

Two scoring paths coexist (deterministic scorecard; LLM desk swarm writing `market_analysis` / `us_market_analysis`). They drift because the rules live in prose for one and partially in code for the other.

## 2. Goals

- Encode cross-domain **relations** as named, bounded, testable rules (codify debate Rules 1–3, 10–11, 13–14, 18–19).
- Admit a **bounded international lane**: world + major-exporter WASDE balance for the wheat/feed complex, and CAD/USD FX — both as `bounded_context` class (capped, weight-neutral, freshness-gated), the proven veg-oil pattern.
- Upgrade the **price domain** from a single-day change to pattern internals (trend, flat-tape, breakout, wheat-class spreads) without changing its weight.
- Give Hermes/Grok X sentiment a **gated, bounded ±5 numeric path** plus operational fixes (72h window, dedup, richer prompt shape).
- **Align the LLM desk** to the deterministic baseline: scorecard + fired relations injected into the desk brief; deviations >15 points must be justified; debate rules extended to mirror the relations.
- **Persist scorecards** so calibration and provenance are possible.

## 3. Non-Goals

- No learned/ML interaction model (no training history; opaque to farmers; silent-regression risk).
- No MATIF/Euronext feed in this track (licensing friction; exporter-S/U covers most of the EU signal). Revisit as Phase 5+.
- No Russia-specific export collector (exporter-stocks lane + desk prompt covers it).
- No change to the public stance scale (−100..+100), tables `market_analysis` / `us_market_analysis`, or the Friday swarm's authorship of the public thesis.
- X sentiment never **originates** a directional read — it can only amplify an official-source domain that already points the same way.

## 4. Architecture Overview

```
packet facts (thesis_packet_cache spine)
   │
   ├── domain mappers (existing, lib/thesis/rating-domain-mappers.ts)
   │      └── price domain REPLACED by mapPricePatternDomain()        [§7]
   ├── bounded contexts (existing veg-oil + NEW world-balance, fx,
   │      x-sentiment)                                                 [§6, §8]
   │
   ▼
relation overlay (NEW lib/thesis/rating-relations.ts)                  [§5]
   │   evaluates cross-domain predicates → bounded adjustments + caps
   ▼
buildRatingScorecard() (existing, extended)
   │   weighted sum + relation adjustments (±15 total) → caps → clamp
   │   output gains: relations_fired[], bounded_contexts[], caps_applied[]
   ▼
thesis_scorecards table (NEW persistence)                               [§9]
   │
   ▼
desk swarm brief injection (deterministic baseline + relations)         [§10]
   └── LLM desk authors market_analysis / us_market_analysis (unchanged authority)
```

## 5. Relation Overlay Layer — `lib/thesis/rating-relations.ts` (new)

Pure functions evaluated after domain mapping, before final assembly. Contract per relation:

```ts
type RatingRelation = {
  id: string;                    // stable snake_case id
  lane: "canada" | "us" | "both";
  trigger: (ctx: RelationContext) => boolean;  // domain inputs + raw packet facts
  effect: { kind: "adjust"; points: number }   // bounded additive
        | { kind: "cap"; max: number }         // ceiling on overall score
        | { kind: "floor_domain"; domain: DomainKey; min: number }; // neutralize
  requires: FreshnessRequirement[];  // all involved sources ≥ watch; never fire on stale
  provenance: (ctx) => string;       // human-readable "why", surfaced to UI/desk
};
```

**V1 relation set:**

| ID | Lane | Trigger (all conditions ANDed) | Effect | Codifies |
|---|---|---|---|---|
| `pipeline_drain` | both | commercial stocks WoW draw; current-week deliveries below prior-year/5-yr pace; export pace ≥ flat | +8 | Rules 1–2 (implied absorption) |
| `pipeline_flood` | both | stocks building; deliveries above pace; export pace falling | −8 | mirror |
| `priced_in_cap` | both | `flat_tape` true (from price domain) while pre-cap composite > +30 | cap +30 | Rule 14 |
| `basis_veto` | canada | basis signal matrix ≤ −2 (SK cash / posted_prices vs futures); **inactive when basis sources empty** | cap +2 | Rules 13, 18 |
| `logistics_reclass` | canada | YTD export lag vs target; stocks drawing; port metrics clean (OCT < 15% AND total unloads ≥ 4-wk avg − 10%) | floor demand domain at 0 (strip its negative) | Rule 3 |
| `divergence_timing` | both | spec/commercial divergence flag; managed-money trim streak ≥ 3 weeks against the fundamentals direction | −5 | Rules 10–11, 19 |
| `quality_premium_watch` | canada | provincial cropland soil_moisture_adequate_surplus_pct ≥ 85 AND all-crops seeded_pct ≥ 5 pts behind 5-yr avg at any report in the trailing 6 weeks; grain ∈ {Wheat, Amber Durum} | +3 | Codex review (CWRS protein premium) |

**Bounds and ordering:** sum of `adjust` effects clamped to **±15**; `floor_domain` applies during assembly; `cap` effects apply **after** adjustments; final clamp ±100 unchanged. Every fired relation appended to `relations_fired[]` with provenance text.

## 6. International Bounded-Context Lane

**6a. World + major-exporter WASDE (wheat/feed complex).**
- Extend `scripts/import-usda-wasde.py` to pull PSD **world rows** (`country_code '00'`) for Wheat (0410000), Corn (0440000), Barley (0430000) — same `/world/` endpoint and `desk_heartbeat=False` convention as the 2026-06-09 veg-oil admission — **plus the same commodities for 8 major exporters**: US, Canada, Australia, EU, Russia, Ukraine, Argentina, Kazakhstan.
- New mapper `mapWorldBalanceContext(grain)` in `rating-domain-mappers.ts`, mirroring `mapCanolaGlobalVegOilDemandContext()`:
  - Computes **major-exporter aggregate S/U** YoY shift (preferred; exporter stocks set price — the ex-China principle), falling back to world S/U when exporter rows are incomplete.
  - Tilt: max **±6**, applied inside an already-active supply or demand domain; strong `usda_wasde_raw` freshness required; YoY S/U shift ≥ ±0.5 pp to fire; weight-neutral (`bounded_context` class).
  - Grain mapping: Wheat→wheat, Barley→barley, Corn→corn, Oats→(world rows unavailable; skip).

**6b. FX (CAD/USD).**
- New table `fx_rates` (`rate_date date PK, pair text, rate numeric, source text, imported_at`); collector `scripts/import-fx-rates.ts` hitting the **Bank of Canada Valet API** (`FXUSDCAD`, free/official/JSON); wrapper `collect:fx` so successful runs refresh the thesis cache; `source_runs` lane `cross_border`.
- Mapper `mapFxContext()` — Canada lane only: CAD weakened ≥0.5% WoW → **+3** price-context tilt (export competitiveness, CAD bid cushion); strengthened ≥0.5% → **−3**; else 0. `bounded_context` class, strong freshness only.

## 7. Price-Pattern Domain Upgrade

Replace the single-day mapper internals with `mapPricePatternDomain()` (same domain key, same 0.15 weight) computing from existing `grain_prices` daily history:

| Sub-signal | Computation | Contribution |
|---|---|---|
| trend | 5-day net change + 20-session linear slope, agreement required for full points | ±12 |
| flat_tape | abs(5-day net) < 1% AND each daily abs(change) < 0.5% | emits flag → `priced_in_cap` (no direct points) |
| breakout | close vs trailing 60-session high/low | ±4 |
| class_spread | MGEX−ZW and KE−ZW spread percentile vs trailing year (wheat lanes only) | ±4 |

Sub-signals logged in domain detail JSON. Confidence stays tied to source freshness (`barchart` scrape vs settlement, per existing convention). Domain total still clamped ±20.

## 8. Hermes/Grok X Sentiment

**Ops fixes (no score impact):**
- `daily_pulse` search window widens 24h → **trailing 72h**, with **URL-level dedup** against the prior 7 days of artifacts (a tweet counts once).
- `friday_deep` unchanged (7 days).
- Scout prompt gains the structured sentiment-summary shape proven in the 2026-06-11 one-shot (per-market `direction/confidence/themes/notable_posts`), so quiet-on-strict-validation days still return desk-usable context in `no_signal_notes`.
- Ad-hoc one-shots documented to run via Bash or prompt-file (PowerShell 5.1 mangles multiline quoted args).

**Bounded sentiment tilt (new numeric path):**
- Computed at artifact-import time into the summary JSON: per grain, `sentiment_consensus = {direction, distinct_trusted_handles, agreeing_official_domain}`.
- Fires **only when all hold**: ≥3 **distinct trusted handles** among *accepted* (validation-passed) signals agree on direction; ≥1 official-source domain (supply/demand/logistics/positioning at ≥ watch freshness) already points the same direction; artifact passes the existing Track 54 acceptance gate (`dry_run`, schema, date/mode match, price-fresh).
- Effect: **±5 max**, `bounded_context` class, weight-neutral. Mixed signals, quiet days, or missing official agreement → 0.
- Provenance: the 3+ handle names recorded in `bounded_contexts[]`; desk output citing the tilt must name them (new debate rule).
- Manipulation surface explicitly bounded: trusted-handle allowlist only, distinct-handle requirement, amplify-only gate, ±5 cap.

## 9. Persistence — `thesis_scorecards` (new table)

```sql
create table thesis_scorecards (
  id uuid primary key default gen_random_uuid(),
  lane text not null check (lane in ('canada','us')),
  item_slug text not null,           -- grain slug / us market slug
  crop_year text not null,
  grain_week smallint,               -- null for US lane off-week
  market_year smallint,
  overall_score smallint not null,
  overall_label text not null,
  confidence_score smallint not null,
  domains jsonb not null,            -- per-domain score/weight/freshness/detail
  relations_fired jsonb not null default '[]',
  bounded_contexts jsonb not null default '[]',
  caps_applied jsonb not null default '[]',
  packet_watermark timestamptz,
  model_version text not null,       -- 'v1' | 'v2'
  generated_at timestamptz not null default now()
);
create index thesis_scorecards_lookup_idx
  on thesis_scorecards (lane, item_slug, crop_year, grain_week, model_version, generated_at desc);
```

Multiple rows per item/week are intentional (every refresh writes one; shadow period writes v1 and v2 side by side). Reads take the latest `generated_at` per `(item, model_version)`.

Written on every `refresh_thesis_packet_cache` run (and `collect:*` wrapper success). Service-role writes only; public read via existing packet surfaces is **not** added in this track (internal calibration table). Retention: keep all rows (low volume: ~12 items/week × versions).

## 10. Desk (LLM) Alignment

- **Debate rules** (`docs/reference/agent-debate-rules.md`) gain Rules 20–23:
  - 20: Relation provenance — when the deterministic scorecard fires a relation, the desk thesis must either incorporate it or explicitly rebut it.
  - 21: International reads key off **major-exporter S/U**, not world-including-China; Russia's export program is the rally ceiling until exporter stocks tighten.
  - 22: FX cushion — a weakening CAD partially offsets futures weakness in Canadian bids; note it before calling cash-market panic.
  - 23: X sentiment citations — any thesis leaning on the sentiment tilt must name the ≥3 trusted handles; X amplifies, never originates.
- **Swarm prompts** (`docs/reference/grain-desk-swarm-prompt.md`, `us-desk-swarm-prompt.md`): desk chief brief gains a `DETERMINISTIC BASELINE` block — scorecard score/label/confidence + `relations_fired` provenance strings; instruction: *"Your published stance may deviate from the baseline; deviations >15 points require an explicit justification paragraph naming which baseline input you are overriding and why."*
- **Analyst agent defs**: price-analyst / us-price-analyst reference the new sub-signals (trend, flat_tape, breakout, class_spread) instead of single-day change.

## 11. Testing

- **Unit:** every relation trigger is a pure function with fixture tests (`lib/__tests__/rating-relations.test.ts`); both firing and non-firing cases; freshness-gate refusal cases (stale inputs never fire).
- **Golden packet:** the **Week 44 wheat packet** (2026-06-07 data) saved as a fixture; asserts `pipeline_drain` fires (+8), `divergence_timing` fires (−5, MGEX 4-week trim against bullish fundamentals), `quality_premium_watch` fires (+3), composite within expected band.
- **Price patterns:** synthetic series fixtures for flat-tape, trend-agreement, breakout, and spread percentile.
- **International/FX/sentiment mappers:** threshold-edge fixtures (±0.5 pp S/U, ±0.5% FX, 2-vs-3 handle consensus).
- **Existing seatbelts** (thesis-board, packet RPC tests) must stay green; `npm run build` + `npm run test` per Definition of Done.

## 12. Rollout

1. All new behavior behind env/config flag `RATING_RELATIONS_V2` (default off). With the flag off, scorecards persist with `model_version='v1'` (persistence ships first regardless — it is pure observability).
2. **Two-week shadow period:** both versions computed and persisted side-by-side on every refresh; Saturday meta-reviewers (`desk-meta-reviewer`, `us-desk-meta-reviewer`) get a comparison query and flag divergences >20 points.
3. Flag flips default after one clean shadow week per lane + Kyle sign-off; v1 computation retained one further month for rollback.
4. Standard gates apply per CLAUDE.md DAG: data-audit after migrations/RPC changes, security-auditor on the new table grants, documentation-agent for CLAUDE.md/STATUS.md/README updates, qc-crawler post-deploy.

## 13. Phasing

| Phase | Scope | New data? |
|---|---|---|
| **P1** | `rating-relations.ts` + relation set; `mapPricePatternDomain()`; `thesis_scorecards` persistence; golden-packet tests | none |
| **P2** | WASDE world + 8-exporter rows for Wheat/Corn/Barley; `mapWorldBalanceContext()`; `fx_rates` + `collect:fx`; `mapFxContext()` | PSD extension + BoC Valet |
| **P3** | X scout 72h window + dedup + sentiment-summary prompt shape; `sentiment_consensus` + ±5 bounded tilt | none (existing gateway) |
| **P4** | Debate Rules 20–23; swarm prompt baseline injection; analyst agent def updates | none |

P4 items that document P1–P3 behavior ship alongside their phase. Exception: a **minimal prompt addendum** (the `DETERMINISTIC BASELINE` block + deviation-justification instruction) ships with P1, since the persisted baseline exists from P1 onward; the fuller Rules 20–23 rewrite and analyst agent def updates remain P4.

## 14. Risks & Mitigations

- **Relation double-counting** (relation re-adds what a domain already scored): mitigated by the ±15 total bound, golden-packet review of composite bands, and shadow-period comparison.
- **Sparse basis data** keeps `basis_veto` inactive: acceptable — it is explicitly gated on source availability; posted_prices/SK cash growth re-activates it naturally.
- **PSD exporter rows incomplete** for some commodities: mapper falls back to world S/U; missing rows reduce to no-fire, never error.
- **X manipulation:** bounded by allowlist + distinct-handle + amplify-only + ±5 cap; meta-reviewer audits fired tilts weekly.
- **Two-path drift recurring:** the deviation-justification rule plus persisted baselines makes drift visible weekly instead of silently.

## 15. Decisions Log

- 2026-06-12 (Kyle): improvements land in **both** layers, tiered; international admitted as **bounded set** (WASDE world/exporter + FX; MATIF deferred); X sentiment gets the **bounded ±5 tilt**, not a weighted domain.
- Approach A (relation overlays) chosen over learned interaction model (no training history, opacity) and prompt-only (auditability, drift history).
