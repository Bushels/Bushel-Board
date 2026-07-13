# Track 54 Daily Bull/Bear Thesis Flow

This is the operator map for how Bushel Board turns official sources, prices, and X sentiment into the daily Bull/Bear board.

Track 54 does not make Grok or Hermes a thesis writer. They are evidence scouts. The thesis base remains official source data plus the Friday desk workflow.

## One-Screen Flow

```text
Official source collectors
  -> source tables + source_runs
  -> thesis_packet_cache
  -> /thesis weekly Bull/Bear base

Daily prices + FX
  -> grain_prices
  -> price freshness proof
  -> daily review context

Grok or Hermes X scout
  -> local no-write artifact files
  -> deterministic artifact reviewer
  -> accepted/rejected X watch evidence

Artifact gate
  -> promotion brief
  -> Kyle approval
  -> bounded daily trajectory writer
  -> score_trajectory / us_score_trajectory
  -> /thesis daily overlay

Friday accepted X bundle
  -> CAD/US desk swarms
  -> market_analysis / us_market_analysis
  -> thesis_packet_cache refresh
  -> Friday thesis of record
```

## Authority Order

1. Official source rows are the thesis authority.
2. Prices confirm or challenge pressure; stale prices block price-based moves.
3. X sentiment is watch evidence only.
4. Daily updates are bounded trajectory ticks, not a new thesis of record.
5. Friday desk swarms own the thesis of record.

## External Review Lane

For Gemini-family second-opinion reviews, use AGY CLI with `Gemini 3.5 Flash (High)` and follow `docs/reference/agy-gemini-review-routing.md`. Do not use the deprecated Gemini CLI. AGY review is adversarial QA only: it can flag stale evidence, missing data, bad prompts, rating contradictions, and publish risk, but the Wheat board rating still has to trace back to source-backed rows.

## Data Lanes

### Official Source Lane

Official collectors write source-backed rows and source-run proof. Those rows feed Canada and US thesis packets, then `thesis_packet_cache`.

This lane can change the public Bull/Bear base read.

Examples:

- CGC weekly grain stats
- USDA Export Sales
- WASDE
- CFTC COT
- Canada crop progress
- Grain Monitor logistics
- Producer cars

### Price Lane

The price/cache automation refreshes FX, grain prices, and thesis cache before the X scout window.

Price proof is used as context for the daily review. If price proof is stale or missing, the daily writer should not make price-based deltas.

### X Scout Lane

The scout searches X for farmer, logistics, crop, basis, export, and policy chatter that may matter to prairie grain context.

Allowed scout runners:

- Grok CLI/API runner, after `npm run track54:grok-preflight` passes.
- Hermes terminal runner, after `npm run track54:hermes-preflight` passes, using `--provider xai-oauth` and `--model grok-4.3`.

Scout output first becomes local artifact files under `data/X Scout Runs/<date>/`. No-write artifacts must prove:

- `dry_run = true`
- `write = false`
- `scout_run_id = null`
- date and mode match the reviewed window
- artifact summary and raw payload match
- price context is fresh when required
- accepted signals pass deterministic validation

X evidence can suggest review leads, but cannot directly author a thesis, refresh thesis cache, or write `market_analysis` / `us_market_analysis`.

## Artifact Gate

The artifact gate decides whether the no-write evidence is mature enough for approval.

Daily candidate threshold:

```text
daily_pulse clean artifact days: 5/5
decision-grade accepted signals: at least 1
write-mode artifact days: 0
identity mismatches: 0
summary-count mismatches: 0
production_writes_enabled: false
```

Friday candidate threshold:

```text
friday_deep clean Friday artifacts: 1/1
decision-grade accepted signals: at least 1
write-mode artifact days: 0
production_writes_enabled: false
```

The daily gate uses a rolling seven-day review window. A raw artifact count is not enough; the operator must inspect `clean_artifact_days_found`.

Current proof should come from:

```powershell
npm --silent run track54:heartbeat-summary
npm --silent run track54:automation-runs
```

## Promotion And Write Boundary

Promotion is a human decision, not an automatic script state.

Before write mode:

1. Build the mode-scoped promotion brief.
2. Confirm selected artifact paths and SHA-256 hashes.
3. Confirm the approval review window.
4. Get explicit Kyle approval for that exact mode/window.
5. Disable the matching no-write collector before registering the matching write-mode automation.

The approval phrase alone is not enough. Write commands must include the exact reviewed window:

```powershell
npm run daily-thesis-review -- --write --approval-phrase "<approval>" --approval-review-from <YYYY-MM-DD> --approval-review-to <YYYY-MM-DD>
```

The daily writer may write only bounded rows to `score_trajectory` or `us_score_trajectory` with scan type `opus_review_daily_pulse`.

It must not write:

- `market_analysis`
- `us_market_analysis`
- `thesis_packet_cache`
- retired Grok/xAI thesis-writing paths

## Automation Cadence

```text
3:45 PM MT  price/cache refresh
3:55 PM MT  Grok auth preflight
4:10 PM MT  daily_pulse no-write scout
4:20 PM MT  Hermes shadow recovery only if same-day artifact is missing/invalid/stale
4:45 PM MT  daily artifact health check
5:05 PM MT  late auth recovery
5:30 PM MT  promotion-review heartbeat

Friday also:
4:50 PM MT  friday_deep no-write scout
5:15 PM MT  Friday artifact health check
```

## Current Operating State As Of 2026-06-24 Closeout

- `production_writes_enabled = false`
- latest manual daily_pulse proof: 2026-06-23 Hermes terminal artifact with fresh price proof, 0 raw signals, 0 accepted signals
- latest reviewer verdict: `insufficient_artifacts`
- Grok CLI/API credential issue: `expired_auth`; local CLI auth expired 2026-06-10 and no `XAI_API_KEY` is configured
- Hermes terminal scout proof: OK with `xai-oauth`, `grok-4.3`, and `x_search` listed
- `grok-composer-2.5-fast`: referenced by recovery commands but not callable until Grok CLI auth or `XAI_API_KEY` is repaired
- write-mode automations: missing/inactive by design

Next safe action: keep X pulse watch-only, repair Grok auth only if Composer/CLI scouting is required, and do not enable write-mode automation until a mode-scoped artifact gate passes and Kyle approves the exact reviewed window.
