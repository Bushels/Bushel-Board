# Desk Swarm — Headless Service-Role Runner (Plan / Scope)

**Date:** 2026-06-16
**Status:** Scoping (not built). Created because `grain-desk-weekly` + `us-desk-weekly` were registered as **DISABLED** scheduled-task drafts that cannot run in the current routine runner.

## Problem
The Friday desk swarms (CAD `grain-desk-weekly`, US `us-desk-weekly`) are the only writers of the published Bull/Bear thesis (`market_analysis`, `us_market_analysis`) plus `score_trajectory` / `us_score_trajectory`. Their orchestration prompts (`docs/reference/grain-desk-swarm-prompt.md`, `docs/reference/us-desk-swarm-prompt.md`) and every scout/specialist agent def read **and** write Supabase **exclusively via the Supabase MCP**. In the scheduled-task / CLI runner, Supabase MCP `execute_sql` (and `enqueue_internal_function`) return `-32600` "permission denied" — the same wall the daily collectors hit. Per the swarm's own error handling ("Supabase MCP unavailable → Abort swarm"), an unattended run aborts in Phase 0 and fails **silently** — the exact failure mode behind the April–June 2026 silent desk outage. There is no headless runner today (confirmed: no desk script in `package.json`; graphify shows only the unrelated Grok X-scout runner).

## Goal
Make the swarm runnable unattended in the routine runner by moving its Supabase reads + writes **off MCP onto the repo's service-role path** (`@supabase/supabase-js` with `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`), mirroring how the collectors were fixed (`npm run collect:*` wrappers). Keep the Opus reasoning + multi-agent structure intact.

## Approach (proposed)
1. **Reads → service-role helpers.** Replace MCP `execute_sql` reads (Phase 0 week/market-year + freshness, scout data pulls, `get_knowledge_context` L2) with repo-native query helpers / a small CLI on the service-role client. Scout defs (`.claude/agents/*-scout.md`) currently say "use Supabase MCP" — update to the service-role read path (or hand them pre-fetched briefs).
2. **Writes → service-role upsert.** Replace the Phase 5 `market_analysis` / `score_trajectory` MCP UPSERTs with a deterministic writer script (service-role `supabase-js`), idempotent on the existing conflict keys, preserving the exact column contracts (`llm_metadata` not `metadata`; `score_trajectory.model_source`; `triggered_by='cron'`; bull/bear reasoning JSONB). Reuse `buildWeeklyTrajectoryRow()` in `lib/trajectory-mapping.ts`.
3. **Headless orchestration entry.** `npm run desk:cad` / `npm run desk:us` (or one runner with `--side`) that verifies Opus, resolves week/market-year via service-role, dispatches scouts/specialists, runs chief resolution + Phase 4.5 + Phase 5.1.5 in-run meta-review, then calls the writer, then a `collect:*`-style thesis-cache refresh.
4. **Fail-loud.** Keep the data-freshness SLA aborts; run `npm run check:desk-freshness` after so a miss is never silent.
5. **Gate.** Respect the Track 54 human-approval discipline before enabling write-mode on a timer.

## Files in scope
- `docs/reference/grain-desk-swarm-prompt.md`, `docs/reference/us-desk-swarm-prompt.md` (convert MCP steps → service-role).
- `.claude/agents/{supply,demand,basis,sentiment,logistics,macro}-scout.md`, `{export,domestic,risk,price}-analyst.md`, `desk-meta-reviewer.md` + the `us-*` equivalents (read-path updates).
- NEW `scripts/desk/` runner + writer (service-role) + `package.json` scripts.
- The two **disabled** scheduled tasks `grain-desk-weekly` / `us-desk-weekly` — enable only after this lands.

## Alternative
If Kyle's Claude Desktop app has full (non-`-32600`) Supabase MCP write access, the swarm could run there as-written with no rewrite — but that ties the weekly thesis to one always-on desktop + interactive MCP auth (the same fragility that bit the collectors). The headless service-role runner is the durable path.

## Open questions
- Confirm `-32600` is environmental (read-only / scoped MCP token) vs. project policy. Even SELECTs via MCP `execute_sql` returned `-32600` this session, so assume full service-role for both reads and writes.
- Do scouts keep running as Agent-tool subagents inside the headless runner, or get pre-fetched service-role briefs? (Subagents-in-a-script requires the runner to expose the Agent tool.)
- Model pinning: the scheduled-task system has no model selector; the Phase 0.0 self-abort enforces Opus-class. Confirm the routine runner defaults to Opus before enabling.
