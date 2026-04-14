# Prediction Scorecard + Daily Morning Modifier Implementation Plan

> For Hermes: Use test-driven-development and implement this in small steps.

Goal
Build a real prediction scorecard for Bushel Board so we can measure whether weekly and daily-modifier calls are getting better, then wire the pipeline into a once-daily morning autorun rhythm for fresher presence after grain markets open and after the latest global session has traded.

Architecture
The scorecard should not replace `market_analysis` or `score_trajectory`. It should sit beside them as an evaluation layer. `market_analysis` stores the weekly thesis, `score_trajectory` stores the path of the call through the week, and the new scorecard records whether the weekly anchor and each daily modifier worked over 1-week, 2-week, and 4-week windows using futures first, then cash and basis when available.

The once-daily morning autorun should lean on the existing pulse-scan pattern rather than inventing a new pipeline. The current repo already has `app/api/cron/scan-signals/route.ts` with pulse logic documented for multiple daily slots, but `vercel.json` has an empty `crons` array. We should activate a single morning modifier schedule first, then expand only if the evidence says we need more frequency.

Tech Stack
- Next.js / Vercel cron routes
- Supabase Postgres tables + RPC where needed
- Existing `market_analysis`, `score_trajectory`, `grain_prices`, `x_market_signals`
- Vitest for focused tests

---

## What the scorecard must answer

For each grain and each call, record:
- What was the call date and grain week?
- Was the direction right after 1 week, 2 weeks, and 4 weeks?
- Was the action right (`WATCH`, `PATIENCE`, `SCALE_IN`, `ACCELERATE`, `HOLD_FIRM`, `PRICE`)?
- Was the timing right, late, early, or unresolved?
- Was the call made on fresh data or stale data?
- Did the price-verification gate agree or disagree?
- Is the model systematically too bullish or too bearish for this grain?

## Proposed data model

Create a new table: `prediction_scorecard`

Suggested columns:
- `id`
- `grain`
- `crop_year`
- `grain_week`
- `source_recorded_at` (the exact `score_trajectory.recorded_at` being judged)
- `scan_type` (`weekly_debate`, `pulse_am`, `pulse_pm`)
- `stance_score`
- `recommendation`
- `model_source`
- `data_freshness` jsonb snapshot copied from `score_trajectory`
- `price_verification` jsonb snapshot copied from `market_analysis.llm_metadata.price_verification` when available
- `eval_window_days` (7, 14, 28)
- `start_price_date`
- `start_settlement_price`
- `end_price_date`
- `end_settlement_price`
- `price_change_pct`
- `direction_result` (`correct`, `wrong`, `neutral`, `unresolved`)
- `action_result` (`helpful`, `too_early`, `too_late`, `wrong`, `unresolved`)
- `timing_result` (`good`, `late`, `early`, `unclear`)
- `score_bias` (numeric difference between call direction strength and realized move bucket)
- `notes`
- `evaluated_at`

Later extension columns when cash/basis exists:
- `cash_start`
- `cash_end`
- `basis_start`
- `basis_end`
- `cash_result`
- `basis_result`

## Scoring logic v1

Direction scoring using futures:
- Bullish call (`stance_score >= 20`) + positive realized move over window => `correct`
- Bearish call (`stance_score <= -20`) + negative realized move => `correct`
- Neutral/watch call (`-19..19`) + small realized move band => `neutral`
- Otherwise => `wrong`

Action scoring (first pass):
- `HOLD_FIRM` / `PATIENCE` should not be rewarded if price falls materially over the chosen window
- `SCALE_IN` / `ACCELERATE` should be rewarded if price weakens after the call
- `WATCH` is rewarded when realized move stays mixed/small or when fresh contradictions existed
- `PRICE` is judged directionally neutral but timing-sensitive; reward when volatility or later weakness validated locking in levels

Timing scoring:
- `good` if the expected move begins within the first 2-3 trading days
- `late` if the move arrives only in the back half of the window
- `early` if the market first moves sharply against the call before later agreeing
- `unclear` if price stays flat/noisy

## Where to source evaluations from

Anchor source:
- `score_trajectory` should be the primary source of the call being judged because it captures both weekly anchor and pulse updates.

Context source:
- `market_analysis` provides thesis text and `llm_metadata.price_verification` / `llm_metadata.calibration`.

Outcome source:
- `grain_prices` for v1 realized follow-through.
- Future v2: add cash/basis table and score those separately.

## Build sequence

### Task 1: Add the schema
Files:
- Create: `supabase/migrations/20260413_create_prediction_scorecard.sql`
- Reference: `docs/plans/2026-03-28-hermes-pipeline-design.md` for `score_trajectory`

Requirements:
- Unique key should prevent duplicate evals for the same trajectory record + window
- Include indexes on `(grain, crop_year, grain_week)` and `(source_recorded_at)`

### Task 2: Add pure scoring helpers
Files:
- Create: `lib/prediction-scorecard.ts`
- Test: `lib/__tests__/prediction-scorecard.test.ts`

Helpers to add:
- `classifyDirectionResult(...)`
- `classifyActionResult(...)`
- `classifyTimingResult(...)`
- `buildPredictionScorecardRows(...)`

Write tests first for:
- bullish call + rally => correct
- bearish call + selloff => correct
- bullish call + selloff => wrong
- watch call + flat market => neutral/helpful
- accelerate call + later break lower => helpful
- stale/missing price window => unresolved

### Task 3: Add an evaluation script / function
Files:
- Create: `scripts/evaluate-predictions.ts`
- Optional later: `app/api/cron/evaluate-predictions/route.ts`

Behavior:
- read recent `score_trajectory` rows lacking 7d / 14d / 28d evaluation
- fetch matching start/end prices from `grain_prices`
- compute scorecard rows
- upsert into `prediction_scorecard`
- output JSON summary

### Task 4: Add a summary query layer
Files:
- Create: `lib/queries/prediction-scorecard.ts`
- Optional UI later: dashboard card or admin page

Metrics to expose:
- hit rate by grain
- hit rate by recommendation type
- hit rate by scan type (`weekly_debate` vs pulse)
- average score bias by grain
- last 8 weeks rolling accuracy

### Task 5: Add once-daily morning modifier autorun
Files:
- Modify: `vercel.json`
- Use existing: `app/api/cron/scan-signals/route.ts`
- Create or wire: `app/api/cron/evaluate-predictions/route.ts` if needed

Recommended first schedule:
- one morning modifier run, about an hour after grain markets open

Why once daily first:
- it gives the system time to digest the latest global session and the previous domestic session
- it gives a clean market-open read instead of noisy intraday churn
- it keeps the weekly thesis as the anchor while daily modifiers explain what changed
- it lowers cost and false-positive risk while we calibrate the paid-subscriber experience

Suggested first cron slot:
- choose one morning UTC schedule that lands roughly one hour after the relevant market open for your target user base

Behavior:
- the weekly thesis remains the anchor
- the daily run produces a modifier read, not a brand-new thesis
- the modifier must include a short explanation of what changed
- if nothing material changed, skip writing a new modifier row

### Task 6: Feed scorecard back into the thesis
Files:
- Modify: `lib/market-calibration.ts`
- Modify: `supabase/functions/_shared/market-calibration.ts`
- Modify: `supabase/functions/analyze-grain-market/index.ts`

Behavior:
- if a grain has 3+ recent misses in the same direction, reduce confidence automatically
- if a grain has persistent bullish or bearish bias, append a short calibration note
- keep this as a confidence modifier, not a thesis override

## Daily modifier behavior

What changes day to day:
- X / web signals
- price action
- maybe logistics headlines
- not the weekly CGC anchor data

So the daily morning modifier should:
- refresh live signals
- refresh price verification
- compare against the weekly thesis anchor
- write a new `score_trajectory` modifier row only when the call materially changes
- attach a short explanation of what changed

Good daily-modifier behavior:
- small, evidence-led adjustments
- explicit trigger notes
- no dramatic score swings without catalyst
- clear separation between the weekly anchor and the modifier

## Guardrails

- Do not let daily modifier runs overwrite the weekly anchor thesis silently.
- Weekly debate remains the anchor. Daily runs are modifiers.
- Evaluate weekly and daily-modifier calls separately in the scorecard.
- Do not overfit on one or two weeks of results. Use rolling windows.
- Futures-only evaluation is v1. Do not pretend it fully measures farmer value until cash/basis are added.

## Definition of done

Phase 1 done when:
- `prediction_scorecard` table exists
- scoring helpers and tests pass
- evaluation script can populate 7/14/28 day windows from existing data
- summary query can show hit rate by grain
- once-daily morning modifier cron is active
- a grain with repeated misses visibly lowers confidence in subsequent analysis

## Recommended immediate implementation order

1. Schema + pure scoring helpers
2. Tests for score classification
3. Evaluation script
4. Summary query layer
5. Vercel once-daily morning modifier activation
6. Calibration feedback loop into analyze-grain-market
