# Bushel Board - Current State

**Last verified baseline commit:** `0f7bcdc` on branch `codex/data-layer-foundation-v1` (= pre-release baseline before the May 8 thesis/seeding/data-spine package)
**As of:** 2026-05-08

## Active task
Bull/Bear Thesis Board V1 is ready to commit on `codex/data-layer-foundation-v1`. `/thesis` now renders Canada and US thesis packets from the facts-only packet spine instead of legacy Grok/grain-intelligence prose, with stance, confidence, freshness warnings, update timestamps, packet metrics, source provenance, and per-grain bull/bear evidence. Desktop and mobile nav both expose the Thesis tab.

The thesis packet cache is live in Supabase. Migration `20260509033204_add_thesis_packet_cache.sql` creates `thesis_packet_cache` and `get_thesis_board_cached()`. `scripts/refresh-thesis-packet-cache.ts` warmed 21 cache items: 16 Canada grains and 5 US markets. Relevant collectors now have `npm run collect:*` wrapper commands that run the source importer first, then refresh the thesis cache only after success.

Data Layer Foundation V1 remains the source-truth track. Live Supabase now has the prior Data Layer Foundation migrations plus Oats CFTC mapping migration `20260508171450_add_oats_cftc_portfolio_mapping.sql` and thesis cache migration `20260509033204_add_thesis_packet_cache.sql` applied on project `ibgsloyjxdopkvwqcqwh`.

Seeding V1 and overview source-spine updates are in the same release candidate. `/seeding` has public USDA/Canada progress views, grain drilldown, Spring Wheat pulse, Canadian provincial progress, planted-acre badges, and prior-year comparison support. `/overview` now carries source-backed delivery bins and price/source freshness improvements.

GitHub CLI is authenticated for account `Bushels` with HTTPS protocol. `gh repo view` resolves this checkout as `Bushels/Bushel-Board`, default branch `master`.

## Known blockers
- `/api/pipeline/run` is permanently tombstoned as `grok_workflow_deprecated`; do not use it for CGC imports or analysis recovery.
- Grok-backed farm summary generation is tombstoned; personalized summary refresh needs a Claude/Codex replacement writer before it is current again.
- `supabase migration list --linked` may still fail intermittently with a `SUPABASE_DB_PASSWORD` auth error in this shell. The live migration ledger was confirmed with `supabase_migrations.schema_migrations` via `supabase db query --linked`.
- `npm run collect:* -- --dry-run` did not reliably forward child dry-run flags in the Windows runner. Use importer-specific dry-run commands or call `scripts/run-collector-with-thesis-cache-refresh.ts` directly with the child `--dry-run` flag.
- Gemini 3.1 Pro Preview is useful for strict single-file audits, but it hit capacity/timeouts during package-level review. Do not treat a missing Gemini response as release proof.
- Barchart OnDemand intraday Canola remains paused until `BARCHART_ONDEMAND_API_KEY` is available.

## Next action
1. Commit, push, and deploy this release candidate.
2. Point scheduled collector routines at the new `npm run collect:*` commands so `/thesis` cache refresh follows successful source imports.
3. Verify the deployed `/thesis`, `/overview`, and `/seeding` pages after Vercel deploy.
4. When the Barchart key arrives, add `BARCHART_ONDEMAND_API_KEY` to `.env.local`, run `npx tsx scripts/import-barchart-canola-intraday.ts --dry-run`, then unpause `barchart-canola-intraday-quote-import`.
5. Define the replacement Claude/Codex farm-summary writer before promising fresh `farm_summaries`.

## Recent milestones (rolling 30 days)
- 2026-05-08: Built Bull/Bear Thesis Board V1 on the cached Canada/US thesis packet spine. `/thesis` renders cached facts-only packets, nav links expose the tab, `thesis_packet_cache` is live and warmed, collector wrappers refresh cache after successful source imports, and Gemini 3.1 Pro Preview audited the wrapper failure modes.
- 2026-05-08: Expanded Seeding V1 with public USDA/Canada seeding progress, spring-wheat pulse drilldown, planted-acre badges, and prior-year progress context. Overview now includes source-backed delivery bins and price/source freshness improvements.
- 2026-05-06: Hardened the FX CAD recalculation RPC grant boundary. Migration `20260506180718` is applied live and restricts `public.recalculate_grain_prices_cad(date, date)` execution to `service_role`; live grant verification shows only `postgres` and `service_role` have `EXECUTE`.
- 2026-05-06: Fixed the Canada thesis packet supply-row selector. Migration `20260506181223` is applied live and makes `get_canada_thesis_packet('Canola','2025-2026', ...)` prefer the requested packet crop year before falling back to older balance-sheet context. The deterministic Canola read now shows 2025-2026 production, seeded acres, harvested acres, yield, and 2026 intended seeded acres from the live packet.
- 2026-05-05: Implemented and live-verified the Canola source-admission automation pass. New live paths cover Producer Cars rail staging, CFTC COT positioning, StatsCan final/intended-acre baseline, price/FX freshness, and Canola Council Markets & Stats inventory. Codex automations now refresh those sources plus Grain Monitor weekly logistics on expected cadences, and `source_runs` has successful rows for the live-verified lanes.
- 2026-05-04: Documented the next Canola source-admission pass. The source registry now adds Canola Council Markets & Stats as a Canola-specific aggregator, records first public baseline facts to seed (2025 final production/yield/seeded/harvested acres and 2026 intended seeded acres), and adds a paste-ready next-session handoff at `docs/plans/2026-05-04-canola-source-admission-handoff.md`.
- 2026-05-04: Normalized the scanned Ferris and Norwood/Lusk grain-knowledge path. `scripts/gemini-ocr-distill.py` now resolves the `raw/Grain Knowledge` folder, runs Gemini CLI without the broken Bash shim path, supports `--force`, and emits `.distilled.json` metadata. Local weak Step-era outputs were archived, live Supabase was re-ingested, and stale legacy knowledge rows/chunks were removed so retrieval sees only current source paths plus normalized redistillations.
- 2026-05-04: Refreshed the Viking knowledge architecture away from retired Grok/xAI assumptions. Advisor prompts now state the current-data boundary explicitly instead of claiming `x_search` access, and the knowledge docs record the quick quality audit of the local Grain Knowledge distillations.
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
