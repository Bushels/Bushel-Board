# Hermes Predictive Harness Results - Canola V1

**Created:** 2026-05-09 MT
**Author:** Codex local goal loop
**Status:** Phase 0 review packet. Automation ownership superseded on 2026-05-09.

**2026-05-09 operating correction:** Do not use Hermes automation for this harness. Codex Automation owns the scheduled no-write review path through `canola-predictive-harness-no-write-review`. Keep this file as the source-timing, sidecar, and scoring-risk review packet; use `docs/plans/2026-05-09-codex-automation-predictive-harness-ops.md` for the active operating path.

**2026-05-09 thesis-review correction:** The first learning loop is weekly thesis review, not price-only backtesting. Freeze the bull/bear thesis at Week N, reveal only next-week evidence, judge whether the drivers held up, and adjust before moving to Week N+1. Price scoring is useful when trustworthy price history exists, but incomplete price data must not block the thesis-review loop.

---

## Executive Verdict

**BUILD AFTER FIXES**

The core idea is worth building, but not by letting Hermes or any cheap LLM write into production intelligence tables. The repo already has the right foundations: a deterministic Canola market read, `score_trajectory`, `prediction_scorecard`, and an evaluator script. The missing pieces are an immutable experimental ledger, a strict point-in-time snapshot builder, a forecast JSON contract, and calibration metrics that go beyond hit rate.

Fix these before implementation:

- Create sidecar experiment storage instead of writing to `market_analysis`, `grain_intelligence`, or dashboard reads.
- Prove a no-future-leakage replay protocol before running any model backtest.
- Confirm Canola outcome price availability and settlement semantics before making price-skill claims.
- Define an explicit futures contract roll policy before using any price outcome.
- Treat historical LLM backtests before the model's training cutoff as pretraining-tainted unless proven otherwise.
- Use a separate experimental schema if possible, not just public tables with a prefix.
- Keep farmer/operator private data out of V1.
- Exclude Hermes automation from V1; Codex Automation owns scheduled harness review.

---

## Repo Evidence Read

All required files were present.

### `AGENTS.md`

- Confirms the stack: Next.js 16, Supabase PostgreSQL/Auth/Edge Functions, Claude Desktop Routine triggers, and disabled Vercel crons for active automation.
- Defines CGC weekly stats as the Canada movement source with strict worksheet accounting rules.
- Requires no unrelated dirty-file changes and separates rules files from state files.

### `CLAUDE.md`

- Current production weekly thesis owner is Claude Agent Desk, not Hermes and not Grok.
- V2 writes land in `market_analysis`, `us_market_analysis`, `score_trajectory`, and `us_score_trajectory`.
- The V1 Grok/xAI chain is tombstoned and must not be restored or used for recovery.
- `grain_prices` is the current futures settlement table for scoring, but Canola price availability has had source/mapping caveats across docs and should be verified before scoring claims.

### `PROJECT_STATE.md`

- Active branch work is the Data Layer Foundation / thesis board release candidate, so this harness must not disturb the existing dirty worktree.
- Confirms the deterministic Canola Market Read V1 exists and avoids `market_analysis` prose and LLM output.
- Confirms Grok/xAI workflow was retired on 2026-05-02.

### `docs/plans/2026-04-13-prediction-scorecard-and-twice-daily-pulse.md`

- Defines the scorecard as an evaluation layer beside `market_analysis` and `score_trajectory`.
- Requires 7, 14, and 28 day windows, futures-first scoring, and later cash/basis extensions.
- Explicitly says weekly anchors and daily modifiers must be scored separately and not overwrite each other.

### `supabase/migrations/20260413162000_create_prediction_scorecard.sql`

- Creates `prediction_scorecard` with unique key `(grain, crop_year, grain_week, source_recorded_at, eval_window_days)`.
- Stores direction, action, timing, price-change, freshness, and price-verification evaluation fields.
- Does not store raw experimental LLM predictions or point-in-time snapshots, so it is not enough for the proposed harness by itself.

### `lib/prediction-scorecard.ts`

- Provides pure helpers for direction, action, timing, and row construction.
- Direction thresholds are currently simple: stance >= 20 bullish, <= -20 bearish, realized move >= 1% up or <= -1% down.
- Does not yet handle Brier score, confidence buckets, baselines, magnitude error, or model-vs-baseline comparison.

### `lib/__tests__/prediction-scorecard.test.ts`

- Covers bullish rally, bearish miss, watch/flat, action outcomes, timing good/late/early, and unresolved windows.
- Tests are useful seatbelts but do not cover confidence calibration or experimental forecasts.

### `scripts/evaluate-predictions.ts`

- Reads `score_trajectory`, `grain_prices`, and `market_analysis`, then upserts into `prediction_scorecard`.
- Supports `--dry-run`, `--limit`, and JSON output.
- Uses first price on or after the call date and first price on or after the window target date.
- It scores existing production calls; it does not build historical source snapshots or run experimental LLM forecasts.

### `docs/reference/cgc-market-mechanics-v1.md`

- Defines CGC source-to-interpretation boundaries and requires fact, interpretation, speculation, and quality flags to stay separate.
- Confirms country producer deliveries are not `Primary.Deliveries` alone.
- Confirms export movement is broader than terminal exports and must include direct export-destination and producer-car export rows where relevant.
- Provides a Canola Week 38 grounding snapshot as a known-good example, not a current-status promise.

### `docs/reference/source-registry.md`

- Defines source admission rules: identity, cadence, dating, units, lag, freshness, and failure modes must be known before a source can drive recommendations.
- Sets Canadian market precedence: CGC weekly stats first, Grain Monitor/Producer Cars second, COT/prices third, slower supply baselines after that.
- Marks weather, farmer inventory, posted prices, X/social, and Kalshi as bounded lanes rather than unrestricted thesis inputs.

### `lib/canola-market-read.ts`

- Exposes `CANOLA_MARKET_READ_VERSION = "canola-market-read-v1"`.
- Produces a structured Canola read with facts, changes, interpretation, speculation, watch items, freshness, warnings, and source links.
- Uses source confidence and quality flags, making it the best starting packet shape for a forecast snapshot.

### `scripts/generate-canola-market-read.ts`

- Reads `get_canada_thesis_packet('Canola', ...)` and outputs JSON or markdown.
- Supports explicit `--crop-year`, `--grain-week`, and `--format`.
- Does not call an LLM and does not fall back to `market_analysis` prose.

### `hermes/`

- Contains a separate TypeScript service skeleton with `server.ts`, `conversation-manager.ts`, and `compression-scheduler.ts`.
- Current service is chat/memory oriented, not a market-forecast harness.
- Requires `XAI_API_KEY` in the current server env validation, which conflicts with the retired Grok/xAI production rule and should not be copied into this harness.

### `docs/hermes/SOUL.md`

- Contains useful analyst rules: stance is not action, freshness cards matter, COT lag matters, and every recommendation needs a timeline.
- Contains stale assumptions around Grok correction and some production-Hermes framing. Use as analyst philosophy only, not as implementation authority.

---

## Recommended V1 Architecture

```text
Codex /goal control loop
  |
  +--> deterministic snapshot builder
       reads approved sources with cutoff <= as_of_date
       outputs immutable Canola packet JSON
  |
  +--> DeepSeek forecast runner
       strict JSON only, no private data
       writes sidecar prediction rows only
  |
  +--> deterministic scorer
       reads sidecar predictions + grain_prices
       computes baseline comparison + calibration metrics
  |
  +--> review packet
       Codex audit + Gemini critique
       no production integration until approved

Codex Automation
  |
  +--> active weekly no-write review gate
       runs tests/build/guardrail scan only
       cannot call model APIs or write Supabase in V1

Supabase
  |
  +--> read-only production sources
       cgc_observations, source_runs, thesis packets, grain_prices
  |
  +--> sidecar experiment tables
       forecast_experiment_runs
       forecast_experiment_predictions
       forecast_experiment_scores
       forecast_signal_rules

Dashboard
  |
  +--> unchanged in V1
```

Core decision: **Codex owns both the local implementation loop and the scheduled review loop. Hermes is not part of this harness path; the scorer and storage contracts must remain deterministic and local-reviewable before any writer or production integration is added.**

---

## Sidecar Data Model

Do not reuse production `market_analysis` for experiment writes. Do not overload `score_trajectory` until the experiment has earned promotion.

### Create: `forecast_experiment_runs`

One row per forecast run or historical replay job.

Key columns:

- `id uuid primary key`
- `experiment_slug text`
- `grain text not null default 'Canola'`
- `crop_year text not null`
- `grain_week smallint not null`
- `as_of_date date not null`
- `source_cutoff_at timestamptz not null`
- `model_training_cutoff date`
- `pretraining_taint_status text check in ('not_applicable','untainted','tainted','unknown')`
- `snapshot_version text not null`
- `snapshot_json jsonb not null`
- `snapshot_hash text not null`
- `prompt_version text not null`
- `schema_version text not null`
- `llm_provider text not null`
- `llm_model text not null`
- `repo_commit text`
- `run_status text check in ('planned','completed','failed','reviewed')`
- `created_at timestamptz default now()`

Preferred schema location: `experimental.forecast_experiment_runs`, not `public.forecast_experiment_runs`, if Supabase grants/RLS can be kept simple. If implementation keeps these tables in `public`, every table and query must carry an explicit `experimental` naming boundary and no app-facing query helper may import them.

### Create: `forecast_experiment_predictions`

One row per run and horizon.

Key columns:

- `id uuid primary key`
- `run_id uuid references forecast_experiment_runs(id)`
- `horizon_days smallint check in (7,28)`
- `price_contract_code text not null`
- `price_contract_month text`
- `price_roll_policy text not null`
- `direction text check in ('bullish','bearish','neutral')`
- `stance_score smallint check between -100 and 100`
- `confidence_pct smallint check between 0 and 100`
- `expected_move_low_pct numeric`
- `expected_move_high_pct numeric`
- `recommendation text check in ('PATIENCE','WATCH','SCALE_IN','ACCELERATE','HOLD_FIRM','PRICE')`
- `forecast_json jsonb not null`
- `raw_model_output text`
- `parse_status text check in ('valid','invalid','repaired')`
- `validation_errors jsonb`
- `created_at timestamptz default now()`

### Create: `forecast_experiment_scores`

One row per prediction and scoring method.

Key columns:

- `id uuid primary key`
- `prediction_id uuid references forecast_experiment_predictions(id)`
- `eval_window_days smallint check in (7,28)`
- `price_contract_code text not null`
- `start_price_date date`
- `start_price_timestamp timestamptz`
- `start_price numeric`
- `end_price_date date`
- `end_price_timestamp timestamptz`
- `end_price numeric`
- `price_change_pct numeric`
- `direction_result text check in ('correct','wrong','neutral','unresolved')`
- `magnitude_error_pct numeric`
- `brier_score numeric`
- `baseline_results jsonb not null`
- `calibration_bucket text`
- `score_notes text`
- `evaluated_at timestamptz default now()`

### Create Later: `forecast_signal_rules`

Only after enough scored predictions exist.

Key columns:

- `id uuid primary key`
- `rule_key text unique`
- `rule_text text not null`
- `grain text not null`
- `evidence_count integer not null default 0`
- `hit_rate numeric`
- `avg_brier_score numeric`
- `status text check in ('candidate','promoted','demoted','retired')`
- `last_reviewed_at timestamptz`

### Existing Tables Untouched

- `market_analysis`
- `grain_intelligence`
- `farm_summaries`
- `score_trajectory`
- `prediction_scorecard`
- `posted_prices`
- `crop_plans`
- `chat_extractions`
- `knowledge_state`
- dashboard read surfaces

Read-only access is acceptable where needed. Writes are sidecar only.

Security boundary:

- Prefer a dedicated `experimental` schema.
- Do not create dashboard query helpers for experiment tables in V1.
- Do not expose experiment tables to public Supabase select policies.
- Service-role scripts must name the experimental schema/table explicitly.

---

## Forecast JSON Schema

V1 requires strict JSON. No markdown wrapper, no prose-only forecasts.

```json
{
  "schema_version": "canola-forecast-v1",
  "grain": "Canola",
  "crop_year": "2025-2026",
  "grain_week": 38,
  "as_of_date": "2026-05-05",
  "source_cutoff_at": "2026-05-05T23:59:59-06:00",
  "model_training_cutoff": "2026-04-30",
  "pretraining_taint_status": "unknown",
  "horizon_days": 28,
  "price_contract": {
    "exchange": "ICE",
    "commodity": "Canola",
    "contract_code": "RSN26",
    "contract_month": "Jul 2026",
    "roll_policy": "fixed_contract_no_roll"
  },
  "direction": "bullish",
  "stance_score": 32,
  "confidence_pct": 61,
  "expected_move_pct_range": {
    "low": 1.0,
    "high": 4.0
  },
  "recommendation": "HOLD_FIRM",
  "top_drivers": [
    {
      "driver": "Commercial stocks drawing while export movement remains active",
      "directional_effect": "bullish",
      "evidence_source": "cgc_observations",
      "evidence_clock": "CGC Week 38, week ending 2026-04-26",
      "confidence": "medium"
    },
    {
      "driver": "Grain Monitor logistics lag limits confidence",
      "directional_effect": "neutral",
      "evidence_source": "grain_monitor_snapshots",
      "evidence_clock": "latest available report before cutoff",
      "confidence": "low"
    }
  ],
  "invalidating_triggers": [
    "ICE Canola settlement falls more than 1 percent below the as-of settlement over the evaluation window",
    "Next CGC packet shows export movement below the prior 5-year median"
  ],
  "known_blind_spots": [
    "No verified prairie cash basis in V1",
    "Private farmer inventory excluded from model input"
  ],
  "source_warnings": [
    {
      "source": "grain_prices",
      "warning": "Canola contract mapping and settlement status must be verified before scoring"
    }
  ]
}
```

Validation rules:

- `schema_version` must equal `canola-forecast-v1`.
- `grain` must equal `Canola`.
- `horizon_days` must be `7` or `28`.
- `price_contract.contract_code` must be present and must map to the outcome price series being scored.
- `price_contract.roll_policy` must be one of `fixed_contract_no_roll`, `front_month_with_declared_roll`, or `continuous_adjusted_series`.
- `direction` must be `bullish`, `bearish`, or `neutral`.
- `stance_score` must be integer `-100..100`.
- `confidence_pct` must be integer `0..100`.
- Initial live confidence cap should be `65` until at least 30 scored predictions exist.
- `recommendation` must be one of the six existing recommendation values.
- `top_drivers` must have 1-5 items and each item must name an evidence source.
- `known_blind_spots` must be non-empty.
- Output is invalid if it cites data after `source_cutoff_at`.
- Historical backtests before the model's own training cutoff must be labelled `pretraining_taint_status = 'tainted'` or excluded from skill claims.

---

## Backtest Protocol

### Replay Unit

One replay unit is:

```text
Canola + crop_year + grain_week + as_of_date + source_cutoff_at
```

### Snapshot Construction

For each replay week:

1. Pick the forecast time first.
2. Use an exact timestamp, not a date-only cutoff.
3. Include only source rows with publication/import timestamps at or before `source_cutoff_at`.
4. Build a deterministic snapshot JSON from approved Tier 1 sources.
5. Store the snapshot hash before calling the LLM.
6. Pass only the snapshot JSON, the schema, and the instruction prompt to DeepSeek.
7. Store the parsed forecast before outcome prices are queried.

### No Future Leakage Rules

- No prices after `source_cutoff_at` in the forecast prompt.
- No `prediction_scorecard`, `forecast_experiment_scores`, or later `market_analysis` rows in the forecast prompt.
- No later CGC corrections unless the run is explicitly labelled `revision_tainted`.
- No news/events after the cutoff.
- No production thesis generated after the cutoff.
- No historical skill claims for forecast dates before the LLM model's training cutoff unless labelled as pretraining-tainted.

### Revised Source Data

V1 has two possible modes:

- `strict_artifact_mode`: only use immutable imported artifacts or source-run snapshots available at the time.
- `current_table_replay_mode`: use current historical table rows but mark every result `revision_tainted`.

Only `strict_artifact_mode` should support public claims. `current_table_replay_mode` is for tooling development only.

If source tables update historical rows in place, they are not acceptable for strict backtests unless an immutable raw artifact or a system-versioned table can recreate the exact row state available at the forecast time.

### LLM Pretraining Leakage

Historical LLM backtests have a unique leakage path: the model may already know later market events from training data. Guardrail:

- Record model name, provider, provider release date, and stated training cutoff.
- Exclude forecast dates before the model training cutoff from skill claims, or label them `pretraining_tainted`.
- Use those tainted runs only for harness plumbing, schema validation, and scorer testing.
- Treat live forward runs after the model cutoff as the first trustworthy calibration sample.

### Price Contract Policy

Every prediction and score must bind to a price contract policy:

- `fixed_contract_no_roll`: predict one named contract month, such as ICE Canola Jul 2026.
- `front_month_with_declared_roll`: if using front month, the exact roll rule and roll date must be predeclared.
- `continuous_adjusted_series`: if using an adjusted continuous series, the adjustment method must be named.

Do not score 28-day horizons across an implicit roll. That creates false magnitude errors and false direction calls.

### Price Timing Policy

The start price must be the last available settlement before the forecast timestamp. Do not use same-day settlement if the forecast was produced before the market close.

### Baselines

Every model result must be scored against:

- `no_change`: predicts neutral/flat every week.
- `previous_week_direction`: repeats the prior settlement-window direction.
- `moving_average_momentum`: predicts direction from the latest available 4-week price trend before cutoff.
- `production_thesis_when_available`: copies point-in-time `market_analysis` stance only when the row existed before cutoff.

No model skill claim is allowed unless it beats at least `no_change` and `previous_week_direction` over the same sample.

---

## Scoring And Calibration

### Direction Result

Use a neutral band to avoid rewarding noise:

- `up`: price change >= `+1.0%`
- `down`: price change <= `-1.0%`
- `flat`: otherwise

Directional call is:

- bullish + up = correct
- bearish + down = correct
- neutral + flat = neutral/correct-for-neutral
- otherwise = wrong

### Magnitude Error

If the realized move lands inside `expected_move_pct_range`, magnitude error is `0`.

Otherwise:

```text
magnitude_error_pct = distance from nearest range bound
```

Example: expected `+1%..+4%`, realized `-2%`, magnitude error = `3`.

### Brier Score

For each directional event:

```text
p = confidence_pct / 100
event = 1 if called direction realized, else 0
brier_score = (p - event)^2
```

For neutral forecasts, event = 1 if realized direction is flat.

### Calibration Buckets

Group scored predictions by confidence:

- `0-50`
- `51-60`
- `61-70`
- `71-80`
- `81-90`
- `91-100`

For each bucket:

- prediction count,
- observed success rate,
- average Brier score,
- overconfidence gap = average confidence - observed success rate.

### Bias

Track:

- bullish call rate,
- bearish call rate,
- neutral call rate,
- wrong bullish calls,
- wrong bearish calls,
- average signed error by horizon.

If the model misses 3 times in the same direction, next-run confidence must be capped and the prompt must include a calibration warning.

The cap is a safety brake, not the calibration system. Real calibration requires feeding the empirical curve back into the next prompt:

```text
Your last 20 Canola calls:
- 61-70 confidence bucket: 9 calls, 4 correct, average Brier 0.39.
- Bullish calls are overconfident by 18 points.
Adjust today's confidence downward unless evidence is stronger than the prior miss pattern.
```

Also track under-confidence: if low-confidence calls are repeatedly correct with large moves, the system should flag missed conviction, not only overconfidence.

### Unresolved Cases

Mark unresolved when:

- no start price exists on or after the forecast date,
- no end price exists on or after the target horizon,
- the contract mapping is missing,
- the price source is stale beyond a defined tolerance,
- the forecast JSON failed validation.

Unresolved rows count toward operational reliability but not directional accuracy.

---

## Risks And Failure Modes

1. **Future leakage:** replay accidentally includes later prices, later reports, or later scored lessons.
2. **LLM pretraining leakage:** the model may already know historical outcomes before its training cutoff.
3. **Revision leakage:** current historical tables may include corrected values not available at forecast time.
4. **Contract roll illusion:** a generic Canola price series crosses a futures roll and creates fake performance.
5. **Market-close leakage:** same-day settlement is used even though the forecast was produced before close.
6. **Production contamination:** experimental rows pollute `market_analysis`, `score_trajectory`, or dashboard reads.
7. **Public-schema leakage:** a future service-role query or dashboard helper accidentally reads experimental tables.
8. **Canola price ambiguity:** the outcome price feed may be missing, delayed, proxy-mapped, or not a final settlement.
9. **Cash/basis blind spot:** futures direction can be right while farmer cash decision value is wrong.
10. **Overfitting:** the loop promotes rules from too few weeks or a single regime.
11. **LLM narrative bias:** DeepSeek may produce plausible reasons that do not actually drive price.
12. **Prompt drift:** changing prompts without versioning can make backtest results incomparable.
13. **Model/provider drift:** DeepSeek model behavior may change under the same name.
14. **Parse failure:** invalid JSON or repaired JSON can hide model unreliability.
15. **Source timing confusion:** CGC week, publication date, live price clock, COT lag, and news timing get blended.
16. **Proxy misuse:** soybeans, soybean oil, palm oil, FX, or crude become treated as Canadian canola facts.
17. **Private-data exposure:** farmer inventory, operator posted prices, or chat data sent to an external model.
18. **Legal/reputation risk:** public-facing claims imply trading advice, guaranteed prediction, or unsupported misconduct/economic causality.
19. **Wrong benchmark:** hit rate looks good only because flat/noisy weeks are handled poorly.
20. **Operational false confidence:** a green test suite validates parsing but not economic validity.

---

## Implementation Patch Plan

No code is approved in this Phase 0 packet. This is the proposed patch sequence after review.

### Create

- `supabase/migrations/YYYYMMDDHHMMSS_create_forecast_experiment_tables.sql`
  - Sidecar tables only, preferably in `experimental` schema.
  - RLS/read policies should be restrictive until the experiment is intentionally surfaced.

- `lib/forecast-experiments/schema.ts`
  - JSON schema / Zod parser for `canola-forecast-v1`.
  - No model calls.

- `lib/forecast-experiments/scoring.ts`
  - Pure scoring helpers for direction, magnitude, Brier score, calibration buckets, baselines, price contract roll policy, and market-close timing.

- `lib/forecast-experiments/snapshot.ts`
  - Build immutable Canola forecast packets from approved source tables/RPCs.
  - Must accept `asOfDate` and `sourceCutoffAt`.
  - Must mark `strict_artifact_mode` vs `current_table_replay_mode`.
  - Must mark model pretraining taint status.

- `scripts/build-canola-forecast-snapshot.ts`
  - CLI for snapshot generation.
  - Supports `--help`, `--crop-year`, `--grain-week`, `--as-of`, `--dry-run`.

- `scripts/run-canola-forecast-experiment.ts`
  - Calls DeepSeek after snapshot creation.
  - Strict JSON parse and validation.
  - Writes only sidecar tables.

- `scripts/score-canola-forecast-experiments.ts`
  - Scores sidecar predictions against price outcomes and baselines.
  - Does not touch `prediction_scorecard` until promotion is approved.

- `lib/__tests__/forecast-experiments-schema.test.ts`
- `lib/__tests__/forecast-experiments-scoring.test.ts`
- `lib/__tests__/forecast-experiments-snapshot.test.ts`

### Modify

- `package.json`
  - Add scripts such as `forecast:canola:snapshot`, `forecast:canola:run`, and `forecast:canola:score`.

- `docs/plans/STATUS.md`
  - Only after implementation starts, add a feature-track row.

- `docs/lessons-learned/issues.md`
  - Only if implementation finds a non-obvious bug.

### Read-Only

- `market_analysis`
- `grain_intelligence`
- `farm_summaries`
- `score_trajectory`
- `prediction_scorecard`
- `cgc_observations`
- `grain_prices`
- `source_runs`
- `posted_prices`
- `crop_plans`
- `chat_extractions`
- `knowledge_state`
- dashboard components and query layers

---

## Review Gate For Codex And Gemini

### Codex Checklist

- Does the plan keep Codex Automation no-write and exclude Hermes automation?
- Are production tables protected from experiment writes?
- Is a point-in-time source cutoff present in every run and prediction?
- Does snapshot storage make future leakage auditable?
- Does the packet account for LLM pretraining leakage?
- Are current-table replays labelled as revision-tainted?
- Is a specific Canola futures contract/roll policy required before scoring?
- Does start-price selection avoid same-day market-close leakage?
- Are baselines required before skill claims?
- Does scoring include Brier score and calibration, not just hit rate?
- Is the confidence cap backed by empirical calibration feedback, not just arbitrary thresholds?
- Are private farmer/operator/chat inputs excluded from V1?
- Is Canola price outcome availability explicitly verified before scoring?
- Are experiment tables isolated from public/dashboard/service-role accidental reads?
- Is implementation small enough to build in reviewable patches?

### Gemini Prompt

```text
@docs/plans/2026-05-08-hermes-predictive-harness-results.md
Identify every missing guardrail or weak assumption that could make this Canola predictive harness look accurate in backtests but fail in real use. Focus on future leakage, source timing, confidence calibration, price-outcome validity, and contamination of production Bushel Board tables.
```

### Gemini Review Applied

Gemini CLI review was run with `gemini-3.1-pro-preview` on 2026-05-09. Its material findings were incorporated into this packet:

- LLM training-cutoff leakage can taint historical backtests.
- Canola futures contract roll policy must be explicit.
- Snapshot timestamp and market-close timing must determine start price.
- Mutable source tables can leak revised history.
- Confidence caps must be supplemented with empirical calibration feedback.
- Experimental tables should preferably live outside the public schema to reduce accidental reads.

### Codex Review Applied

Codex review outcome: **ACCEPT FOR PLANNING, HOLD FOR IMPLEMENTATION**.

Accepted:

- Hermes automation is excluded; Codex Automation owns scheduled no-write review.
- Production tables remain read-only for V1.
- The plan now includes point-in-time cutoffs, model pretraining taint, revision taint, price contract policy, market-close timing, baselines, Brier score, calibration buckets, private-data exclusion, and experimental schema isolation.

Still blocking implementation:

- Kyle must approve the first patch set.
- Canola price outcome source and contract-roll policy must be verified before scorer work claims market skill.
- The first implementation patch must be sidecar-only and must not add dashboard reads.

### Hold Decision

Do not implement until:

- Kyle accepts this Codex/Gemini-reviewed packet or requests revisions.
- Gemini review findings above are accepted or challenged.
- Kyle approves the first patch set.

STOPPING FOR REVIEW
