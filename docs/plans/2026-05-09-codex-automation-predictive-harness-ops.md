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

## Gemini Review Notes

Gemini 3.1 Pro Preview reviewed the no-Hermes correction on 2026-05-09. Its material guidance was to replace future Hermes ownership language with Codex Automation ownership, keep the automation dry-run or sidecar-only, and require review before any production-table, private-data, dashboard, or writer boundary changes.
