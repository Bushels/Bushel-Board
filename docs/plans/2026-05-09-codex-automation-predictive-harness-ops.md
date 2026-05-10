# Codex Automation Predictive Harness Ops - Canola V1

**Created:** 2026-05-09 MT
**Status:** Active no-write automation path
**Automation:** `canola-predictive-harness-no-write-review`

## Direct Answer

Codex Automation owns the scheduled Canola predictive harness review. Hermes automation is out.

This automation is a weekly guardrail and readiness check, not a production writer. It can prove the local harness still builds, tests, and preserves its no-write boundaries. It cannot promote forecasts, call model APIs, write Supabase, write sidecar tables, edit dashboard/source files, or use private farmer/operator/chat data.

## Schedule Slot

Run Friday at 4:30 PM MT.

Reason: this lands after the Friday CFTC COT release/import window and before the weekly desk swarm. It gives the harness a current-data readiness check without interfering with the thesis-of-record flow.

## Automation Contract

The automation must:

- Treat Codex Automation as the scheduled workflow owner.
- Explicitly avoid Hermes.
- Check branch/worktree status before running review commands.
- Run `npm run test:forecast`.
- Run `npm run build` only if forecast tests pass.
- Scan `lib/forecast-experiments` and forecast scripts for forbidden Supabase/model/dashboard/write imports or calls.
- If reviewed local input artifacts are present, run only local no-write harness scripts and report output hashes.
- If reviewed input artifacts are absent, report the missing paths and stop without retrying.
- Report test/build result, guardrail result, artifact hashes or missing inputs, branch/PR context if available, and the next human review gate.

The automation must not:

- Call a model API.
- Read private farmer/operator/chat data.
- Write Supabase.
- Write sidecar experiment tables.
- Edit repo source files.
- Connect dashboard reads.
- Touch `market_analysis`, `grain_intelligence`, `score_trajectory`, `prediction_scorecard`, or dashboard query layers.
- Use Hermes, Grok, or the tombstoned `/api/pipeline/run`.

## Promotion Gates

Fresh review is required before any of these are added:

- Sidecar write executor.
- Live Supabase read adapter.
- Live Supabase writer.
- Model/API runner.
- Dashboard display surface.
- Production thesis or scorecard integration.

The current useful product outcome is boring on purpose: weekly proof that the harness remains deterministic, isolated, and ready for a reviewed live-data or model-runner patch when that becomes worth doing.

## Weekly Thesis Review Loop

The first learning loop is not price-only. Freeze a weekly Canola bull/bear thesis, stop the clock, then reveal only next-week evidence: official data, public news, market context, analyst interpretation, and warnings available by the review cutoff.

Use `npm run forecast:canola:review-prompt-pack` to build the reviewer packet from the frozen run artifact and next-week evidence. The prompt pack contains only accepted evidence, blocked-evidence audit rows, required driver indexes, allowed evidence keys, and the exact JSON response contract.

Use `npm run forecast:canola:review-thesis` to package the completed review locally. The package does not require complete grain price history. It records:

- the frozen run artifact,
- accepted next-week evidence,
- blocked evidence that was already known, too late, or from forbidden sources,
- driver-level support/contradiction labels,
- missed signals,
- next-week adjustments,
- whether the review can become a forward-calibration candidate.

Price scoring remains a separate optional lane. It should support the thesis review when trustworthy price data exists, not block the evidence-review loop.

## Historical Replay Training Loop

Historical data can be used for learning, but it must be packaged as historical replay instead of forward proof.

Use `npm run forecast:canola:historical-replay` to build local no-write replay packages from point-in-time source rows, next-window evidence, and outcome labels. The output candidate mode is `historical_training_candidate`, not `forward_calibration_candidate`.

The historical replay lane must:

- keep the review cutoff inside the declared 7-day or 28-day window,
- block evidence available before the forecast cutoff,
- block evidence available after the historical review cutoff,
- block forbidden/private/proprietary source families,
- mark current-table/revised snapshots as review-only,
- mark model-assisted labels as pretraining-tainted when the model cutoff can include later outcomes,
- require review before any training export.

This lane can generate training candidates faster than forward waiting, but it cannot prove live market skill by itself.

The first real CGC-backed historical replay bundle is `docs/reference/forecast-experiments/canola-historical-replay-cgc-2025-weeks-1-3/`. It was generated from `data\CGC Weekly\gsw-shg-en.csv` for 2025-2026 Weeks 1-3. The package hash is `sha256:00d5b0053a99929343355a77ef41af66012952bbe4c3bd20cd46340ee1cf5122`; it produced 0 `historical_training_candidate` weeks and 3 review-only revision-tainted weeks because annual CGC CSV history is not certified as as-published point-in-time data. The CGC input builder records its publication-time assumption in every generated row and the tracked artifact has a regression test that rebuilds the package hash from the tracked CSV.

Point-in-time CGC capture now has a separate local lane: `scripts/capture-cgc-weekly-snapshot.ts`. It fetches the current public CGC weekly CSV, saves a compressed local raw artifact plus metadata under ignored `data\CGC Weekly Snapshots\`, and reports the CSV hash. The first local capture on 2026-05-10 saved 2025-2026 Week 39, week ending 2026-05-03, with raw CSV hash `sha256:6d75c3b7fda56997416ce0234228809a63325bfa30538a916aa1f03484d20c2a`. This lane does not read or write Supabase and is separate from the CGC importer.

The tracked example bundle is `docs/reference/forecast-experiments/canola-walk-forward-week-38/`. It uses synthetic, human-authored fixture values to demonstrate the operating loop and must not be cited as market-performance proof, model-output proof, training proof, live Supabase output, or price-skill proof. Its generated review package must stay `review_only_fixture`.

The first real source artifact is `docs/reference/forecast-experiments/canola-forward-week-38-2026-05-10/`. It contains filtered rows exported from a saved deterministic Canola Market Read. The raw market-read JSON is not tracked because it can contain forbidden source lanes. The committed source rows redact unadmitted/forbidden omitted lanes, include a no-training/no-skill-proof disclaimer, and build only a frozen source snapshot. It is not a training set or performance claim.

The first real frozen bull/bear thesis now lives in that artifact as `forecast.json`, with `output/prompt-pack.json` and `output/run-artifact.json`. The prompt pack hash is `sha256:d368cefe0bc578826793c5ec6a34b712389b0098d54695a713a28110a230af72`; the run hash is `sha256:ce840bc5aae95129cb7cab67b3bdf18fb736ed1c52359a93de63a841d9edc56a`. It is a bullish `WATCH` thesis for ICE Canola RSN26 July 2026 with confidence `61`, stance score `32`, and model training cutoff `2024-06-01`. It is not a training candidate until a next-week review package is built and accepted.

If any future forecast output marks `pretraining_taint_status` as `unknown` or `not_applicable`, the review must remain `review_only_pretraining_unknown`.

## Gemini Review Notes

Gemini 3.1 Pro Preview reviewed the no-Hermes correction on 2026-05-09. Its material guidance was to replace future Hermes ownership language with Codex Automation ownership, keep the automation dry-run or sidecar-only, and require review before any production-table, private-data, dashboard, or writer boundary changes.

Gemini 3.1 Pro Preview reviewed the real source-row exporter on 2026-05-10. Its material blockers were omission-name leakage, current-table replay overclaim, and artifact misuse. The exporter now redacts unknown/forbidden omitted lanes by default, marks replay rows as revision-tainted warnings with raw payload omitted, and writes an explicit no-training/no-skill-proof disclaimer.
