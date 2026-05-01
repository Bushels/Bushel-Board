# Bushel Board — Current State

**Last verified commit:** `60413e6` on branch `codex/grain-monitor-weekly-import` (= last cleanup-pass commit, journal entry)
**As of:** 2026-05-01

## Active task
Grain Monitor weekly importer — Week 37 parser regressions resolved on the codex branch (vessel-timing line wrap, "M ay" split-month artifact, singular "vessel" wording). All four parsers now have a Vitest seatbelt. Pending merge into `main`. The MPS portfolio cleanup pass also landed on this branch (6 cleanup commits, see `docs/journal/2026-05.md`).

## Known blockers
- None pipeline-side.
- Auto-import remains paused (since 2026-03-17) while AI model quality is refined per CLAUDE.md. This is intentional, not a blocker.

## Next action
1. Push `codex/grain-monitor-weekly-import` and merge into `main` once CI is green.
2. Apply the seven new SQL migrations to the Supabase project (`supabase db push`) — they are tracked in `ea6b7f3` but not yet applied to the live DB.
3. Resume Friday Claude Agent Desk swarm cadence at the next 6:47 PM ET window (CAD swarm) and 7:30 PM ET (US swarm).

## Recent milestones (rolling 30 days)
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
