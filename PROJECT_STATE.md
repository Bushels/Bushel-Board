# Bushel Board - Current State

**Last verified commit:** `d961d9e` on branch `codex/data-layer-foundation-v1` (= source spine, Canola read, `/source-spine`, and CGC automation hardening)
**As of:** 2026-05-04

## Active task
Grain Monitor weekly importer - Week 37 parser regressions resolved on the codex branch (vessel-timing line wrap, "M ay" split-month artifact, singular "vessel" wording). All four parsers now have a Vitest seatbelt. Pending merge into `main`. The MPS portfolio cleanup pass also landed on this branch (6 cleanup commits, see `docs/journal/2026-05.md`).

CGC Week 38 source data is now imported via the new Codex routine path (`npm run import-cgc`).

Grok/xAI analysis workflow is retired. Claude/Codex owns analysis; future X API work is a data-input lane only.

Data Layer Foundation V1 integration is underway on `codex/data-layer-foundation-v1`. Local work now includes source-run ledger migrations, grain/market mappings, freshness RPC, Canada/US facts-only thesis packet RPCs, importer source-run hooks, a data-layer validator, a deterministic Canola Market Read V1 generator, `/source-spine`, and CGC automation hardening. Commits `18a0935`, `cd7bbda`, `2419e6b`, and `d961d9e` are pushed to GitHub.

Sprint-1 pivot toward a source-truth grain intelligence spine is active. Local working tree now includes source-registry, canonical grain fact model, canola market-read V1 contract, CGC market-mechanics contract, `/source-spine` source-watch dashboard, a local mirror of remote migration `20260429100000_predictive_market_briefs.sql`, follow-up migration `20260504021340_optimize_thesis_freshness.sql`, and `scripts/generate-canola-market-read.ts`.

Live Supabase deploy proof: Data Layer Foundation migrations `20260502213837` through `20260502213840` and freshness optimization `20260504021340` are applied on project `ibgsloyjxdopkvwqcqwh`. `npx tsx scripts/validate-data-layer-foundation.ts --grain Canola --market Canola` passes. `npm run canola-market-read -- markdown` renders the deterministic read from the live Canola packet. `source_runs` exists; the CGC Codex importer now has source-run hooks, but the latest hardening pass was verified with dry-run only so no live source-run row was written by that pass. PR #12 is open: https://github.com/Bushels/Bushel-Board/pull/12

GitHub CLI is authenticated for account `Bushels` with HTTPS protocol. `gh repo view` resolves this checkout as `Bushels/Bushel-Board` with default branch `master`.

## Known blockers
- `/api/pipeline/run` is permanently tombstoned as `grok_workflow_deprecated`; do not use it for CGC imports or analysis recovery.
- Grok-backed farm summary generation is tombstoned; personalized summary refresh needs a Claude/Codex replacement writer before it is current again.
- `supabase migration list --linked` may still fail intermittently with a `SUPABASE_DB_PASSWORD` auth error in this shell. The live migration ledger was confirmed with `supabase_migrations.schema_migrations` via `supabase db query --linked`.

## Next action
1. Review/merge PR #12 after confirming the branch diff matches the live Supabase state.
2. Populate `source_runs` by rerunning or naturally waiting for the hardened CGC importer and other patched collectors; then rerun the validator.
3. Add deterministic CGC relationship checks from `docs/reference/cgc-market-mechanics-v1.md`: country producer deliveries, export movement, terminal grade summing, current-week vs crop-year separation, and missing-row flags.
4. Review the deterministic Canola read warnings before any public post: empty `posted_prices` / `weather_cache`, stale-risk `grain_prices` / CFTC, lagged Grain Monitor, proxy CFTC rows, and AAFC supply-year mismatch.
5. Work through source admission in operating order: CGC weekly stats, Grain Monitor weekly logistics, producer cars / railcar staging, COT and price context, AAFC/StatsCan crop-size baseline, then weather/satellite/GEE layers.
6. Keep the Codex CGC Thursday routine active; Friday CAD swarm can now read Week 38 source data.
7. Define the replacement Claude/Codex farm-summary writer before promising fresh `farm_summaries`.

## Recent milestones (rolling 30 days)
- 2026-05-04: Added `docs/reference/cgc-market-mechanics-v1.md` as the first source-specific relationship and interpretation contract. It defines CGC row identity, country producer-delivery math, export math, terminal grade-summing rules, source/interpretation/speculation boundaries, outside-source requirements, training example format, and a live Canola Week 38 grounding snapshot.
- 2026-05-04: Hardened `scripts/import-cgc-weekly-codex.mjs` for the Thursday CGC routine. The importer now derives crop year from the live CGC CSV instead of a fixed year, attributes post-import verification to a same-run `cgc_imports` row, writes failure summaries to `source_runs` when failures occur outside dry-run, and includes dynamic crop-year evidence in collector heartbeats. Verified with `npm run import-cgc:dry`; no live import was triggered during this hardening pass.
- 2026-05-04: Added `/source-spine` source-watch dashboard and source registry operating precedence. The board now leads with CGC weekly stats, Grain Monitor, producer cars / railcar staging, COT, and AAFC/StatsCan crop-size baseline before the AAFC drought, Agroclimate, VegDRI, SMOS satellite soil moisture, NASA/SERVIR ESI, and future GEE derived drought watchlist. Weather/satellite layers remain watch/proxy/research lanes and are not admitted Canola V1 thesis inputs.
- 2026-05-04: Deterministic Canola Market Read V1 generator built on the live Canola packet RPC. Added `lib/canola-market-read.ts`, `scripts/generate-canola-market-read.ts`, focused Vitest coverage, and `npm run canola-market-read`. The read separates facts, interpretation, speculation, watch items, freshness, quality warnings, and source links without using `market_analysis` prose or an LLM.
- 2026-05-03: Sprint-1 grain-intelligence pivot started locally and Data Layer Foundation migrations applied live. Added source-registry, canonical fact model, canola market-read V1 contract, recovered the missing remote predictive-market migration into local migrations, added freshness optimization, and verified `npx tsx scripts/validate-data-layer-foundation.ts --grain Canola --market Canola` passes.
- 2026-05-03: Data Layer Foundation V1 handoff docs committed and pushed as `cd7bbda` (`Document data layer foundation handoff`).
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
