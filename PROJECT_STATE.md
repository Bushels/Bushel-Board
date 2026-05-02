# Bushel Board — Current State

**Last verified commit:** `60413e6` on branch `codex/grain-monitor-weekly-import` (= last cleanup-pass commit, journal entry)
**As of:** 2026-05-02

## Active task
Grain Monitor weekly importer — Week 37 parser regressions resolved on the codex branch (vessel-timing line wrap, "M ay" split-month artifact, singular "vessel" wording). All four parsers now have a Vitest seatbelt. Pending merge into `main`. The MPS portfolio cleanup pass also landed on this branch (6 cleanup commits, see `docs/journal/2026-05.md`).

CGC Week 38 source data is now imported via the new Codex routine path (`npm run import-cgc`).

Grok/xAI analysis workflow is retired. Claude/Codex owns analysis; future X API work is a data-input lane only.

Data Layer Foundation V1 planning is open. The product direction is now a Canada/US live grain thesis engine with limited international context, not a broad global-data collector.

## Known blockers
- `/api/pipeline/run` is permanently tombstoned as `grok_workflow_deprecated`; do not use it for CGC imports or analysis recovery.
- Grok-backed farm summary generation is tombstoned; personalized summary refresh needs a Claude/Codex replacement writer before it is current again.

## Next action
1. Push `codex/grain-monitor-weekly-import` and merge into `main` once CI is green.
2. Apply the seven new SQL migrations to the Supabase project (`supabase db push`) — they are tracked in `ea6b7f3` but not yet applied to the live DB.
3. Keep the Codex CGC Thursday routine active; Friday CAD swarm can now read Week 38 source data.
4. Resume Friday Claude Agent Desk swarm cadence at the next 6:47 PM ET window (CAD swarm) and 7:30 PM ET (US swarm).
5. Define the replacement Claude/Codex farm-summary writer before promising fresh `farm_summaries`.
6. Build Data Layer Foundation P0 contracts before rebuilding the thesis layer: `source_runs`, grain/market mapping registry, source freshness view, and Canada/US thesis packet RPCs.

## Recent milestones (rolling 30 days)
- 2026-05-02: CGC Week 38 imported via new Codex deterministic importer. Added `scripts/import-cgc-weekly-codex.mjs`, `npm run import-cgc`, Codex automation `cgc-weekly-grain-stats-import`, data-lineage map updates, collector docs, and journal note. Supabase verification: 4,313 Week 38 rows, validation pass, 16 `collector_cgc` heartbeats.
- 2026-05-02: Grok/xAI analysis workflow retired. Tombstoned `/api/pipeline/run` and legacy Grok Edge Functions, removed Grok scripts/adapters, and moved live dashboard reads away from `grain_intelligence` toward `market_analysis`.
- 2026-05-02: Data Layer Foundation V1 plan opened. Supabase check confirmed source data is ahead of thesis data: CGC Week 38 and USDA crop progress through 2026-04-26 are present, while Canada thesis rows are Week 36 and US thesis rows are Grok-written legacy.
- 2026-05-01: MPS portfolio cleanup pass complete — 6 commits (`757e2c5` → `60413e6`). Anchored gitignore, AGENTS.md rules-only rewrite, PROJECT_STATE.md introduced, baoyu skills promoted to `~/.claude/skills/`, 135K-line `.bak` and Excel-lock junk removed from index, journal scaffolded. See `docs/journal/2026-05.md`.
- 2026-04-30: Grain Monitor parser seatbelt + tiered autonomy charter (`docs/hermes/skills/import-grain-monitor.md`).
- 2026-04-28: Sentiment voting paused; My Farm storage tracker promoted to headline. `LandingPage` retired.
- 2026-04-27: Bushel Board cohesion audit (`docs/plans/2026-04-27-bushel-board-cohesion-audit.md`).
- 2026-04-24: US Desk swarm GA — 8 scouts + 4–5 analysts + meta-reviewer.
- 2026-04-19: Section 3 + Section 4 audits — runtime bugs in swarm orchestration prompts fixed.
- 2026-04-17: Track 45-A (`get_intraweek_trajectory` RPC) + canonical 16-grain DB-name fix-up.

## What's where (truth files)
- `AGENTS.md`, `CLAUDE.md` — rules only.
- `PROJECT_STATE.md` (this file) — current truth, updated when state changes meaningfully.
- `docs/journal/YYYY-MM.md` — append-only history of structural / cleanup events.
- `docs/plans/STATUS.md` — feature track ledger.
- `docs/lessons-learned/issues.md` — bug post-mortems.
