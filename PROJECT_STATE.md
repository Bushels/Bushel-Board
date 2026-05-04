# Bushel Board - Current State

**Last verified commit:** `18a0935` on branch `codex/data-layer-foundation-v1` (= Data Layer Foundation local contracts pushed to GitHub)
**As of:** 2026-05-03

## Active task
Grain Monitor weekly importer - Week 37 parser regressions resolved on the codex branch (vessel-timing line wrap, "M ay" split-month artifact, singular "vessel" wording). All four parsers now have a Vitest seatbelt. Pending merge into `main`. The MPS portfolio cleanup pass also landed on this branch (6 cleanup commits, see `docs/journal/2026-05.md`).

CGC Week 38 source data is now imported via the new Codex routine path (`npm run import-cgc`).

Grok/xAI analysis workflow is retired. Claude/Codex owns analysis; future X API work is a data-input lane only.

Data Layer Foundation V1 integration is underway on `codex/data-layer-foundation-v1`. Local work now includes source-run ledger migrations, grain/market mappings, freshness RPC, Canada/US facts-only thesis packet RPCs, importer source-run hooks, and a data-layer validator. Commit `18a0935` is pushed to GitHub. Local SQL rollback check and `npm run build` passed; live Supabase apply is still blocked by remote migration-history drift.

GitHub CLI is authenticated for account `Bushels` with HTTPS protocol. `gh repo view` resolves this checkout as `Bushels/Bushel-Board` with default branch `master`.

## Known blockers
- `/api/pipeline/run` is permanently tombstoned as `grok_workflow_deprecated`; do not use it for CGC imports or analysis recovery.
- Grok-backed farm summary generation is tombstoned; personalized summary refresh needs a Claude/Codex replacement writer before it is current again.
- Supabase migration dry-run is blocked by remote-only migration version `20260429100000`; resolve migration-history drift before pushing Data Layer Foundation migrations.

## Next action
1. Resolve Supabase migration-history drift around remote-only `20260429100000`; do not blindly push until the drift is understood.
2. Apply Data Layer Foundation migrations to Supabase after drift is resolved, then run `npm run validate-data-layer`.
3. After DB migration status is clean, apply the migrations and open a PR for `codex/data-layer-foundation-v1`.
4. Keep the Codex CGC Thursday routine active; Friday CAD swarm can now read Week 38 source data.
5. Define the replacement Claude/Codex farm-summary writer before promising fresh `farm_summaries`.

## Recent milestones (rolling 30 days)
- 2026-05-03: Data Layer Foundation V1 contracts committed and pushed to GitHub on `codex/data-layer-foundation-v1` as `18a0935` (`Add data layer foundation contracts`). Working tree was clean after push.
- 2026-05-03: GitHub CLI authenticated successfully as `Bushels` using HTTPS. `gh repo view` resolves to `Bushels/Bushel-Board`, default branch `master`, with usable `repo` and `workflow` scopes.
- 2026-05-03: Data Layer Foundation V1 local integration started on `codex/data-layer-foundation-v1`: `source_runs`, `grain_market_mappings`, source freshness, Canada/US thesis packet RPC migrations, importer run-summary hooks, validator script, and seeding-drill price-query contract fix. Local SQL rollback check and `npm run build` passed; live DB push remains blocked by remote migration-history drift.
- 2026-05-02: CGC Week 38 imported via new Codex deterministic importer. Added `scripts/import-cgc-weekly-codex.mjs`, `npm run import-cgc`, Codex automation `cgc-weekly-grain-stats-import`, data-lineage map updates, collector docs, and journal note. Supabase verification: 4,313 Week 38 rows, validation pass, 16 `collector_cgc` heartbeats.
- 2026-05-02: Grok/xAI analysis workflow retired. Tombstoned `/api/pipeline/run` and legacy Grok Edge Functions, removed Grok scripts/adapters, and moved live dashboard reads away from `grain_intelligence` toward `market_analysis`.
- 2026-05-02: Data Layer Foundation V1 plan opened. Supabase check confirmed source data is ahead of thesis data: CGC Week 38 and USDA crop progress through 2026-04-26 are present, while Canada thesis rows are Week 36 and US thesis rows are Grok-written legacy.
- 2026-05-01: MPS portfolio cleanup pass complete - 6 commits (`757e2c5` -> `60413e6`). Anchored gitignore, AGENTS.md rules-only rewrite, PROJECT_STATE.md introduced, baoyu skills promoted to `~/.claude/skills/`, 135K-line `.bak` and Excel-lock junk removed from index, journal scaffolded. See `docs/journal/2026-05.md`.
- 2026-04-30: Grain Monitor parser seatbelt + tiered autonomy charter (`docs/hermes/skills/import-grain-monitor.md`).
- 2026-04-28: Sentiment voting paused; My Farm storage tracker promoted to headline. `LandingPage` retired.
- 2026-04-27: Bushel Board cohesion audit (`docs/plans/2026-04-27-bushel-board-cohesion-audit.md`).
- 2026-04-24: US Desk swarm GA - 8 scouts + 4-5 analysts + meta-reviewer.
- 2026-04-19: Section 3 + Section 4 audits - runtime bugs in swarm orchestration prompts fixed.
- 2026-04-17: Track 45-A (`get_intraweek_trajectory` RPC) + canonical 16-grain DB-name fix-up.

## What's where (truth files)
- `AGENTS.md`, `CLAUDE.md` - rules only.
- `PROJECT_STATE.md` (this file) - current truth, updated when state changes meaningfully.
- `docs/journal/YYYY-MM.md` - append-only history of structural / cleanup events.
- `docs/plans/STATUS.md` - feature track ledger.
- `docs/lessons-learned/issues.md` - bug post-mortems.
