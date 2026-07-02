# Desk Swarm — Headless Service-Role Runner (Implementation Plan)

**Date:** 2026-06-16
**Branch:** `feat/desk-swarm-headless-runner` (off `master`)
**Scoping doc:** `docs/plans/2026-06-16-desk-swarm-headless-runner-plan.md`
**Status:** In progress.

## Step 1 finding — `-32600` root cause (CONFIRMED: environmental, not policy)
- Supabase MCP `execute_sql` works **interactively** this session (`SELECT 1` → `[{probe:1}]`). The project does **not** deny MCP SQL.
- The service-role path works **headlessly** (`check:desk-freshness` ran clean via `tsx`+dotenv) and bypasses RLS, so it is immune to whatever restricts the scheduled-task runner's MCP gateway.
- `-32600` (JSON-RPC "Invalid Request") is a gateway-level rejection inside the routine runner, **not** a Postgres RLS/permission denial. → The service-role path is the durable fix.
- `.env.local` has `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`. No `ANTHROPIC_API_KEY` → keep the Claude-orchestrated swarm; do not rewrite to a Node→Anthropic-API runner.

## Architecture (approved)
Keep the **Claude-orchestrated multi-agent swarm** (the scheduled-task session is the runner — it has the Agent tool; a Node script cannot dispatch subagents). Move only the **data plane** off the Supabase MCP onto a **service-role CLI** that agents call via Bash:

```
scripts/desk/desk-cli.ts  --side <cad|us>  <command>
```

| Command | Role | Writes? |
|---|---|---|
| `preflight` | Resolve week/crop-year (CAD) or market-year + week-ending (US); run freshness SLA; on breach write a `pipeline_runs` failure row and exit 1; else emit resolved context JSON. | failure row only |
| `resolve` | Lightweight week/crop-year/market-year/week-ending JSON (no freshness, no writes). | no |
| `read <source>` | Scout data via a typed registry of RPCs / views / SELECTs (no arbitrary SQL). Emits labeled JSON. | no |
| `knowledge` | `get_knowledge_context(p_query,p_grain,p_topics,p_limit)` via service-role `.rpc()`. | no |
| `write` | Validate the chief's rows (zod); **dry-run by default**; with `--write` + approval, upsert analysis + delete/insert trajectory + write `pipeline_runs` completed row. | yes (gated) |
| `fail` | Write a `pipeline_runs` failure/partial row (meta-review fail, wrong-model, etc.). | yes |
| `postcheck` | Shell `check:desk-freshness` + `refresh-thesis-packet-cache --force` (mirror collector wrapper). | cache only |

- Service-role client: reuse `createAdminClient()` from `lib/supabase/admin.ts`.
- Env load: `dotenv` `config({ path: ".env.local" })` (matches `check-desk-freshness.ts`).
- Conventions (per AGENTS.md): `--help`, JSON to stdout, diagnostics to stderr, idempotent.
- `package.json`: `desk:cad` = `... --side cad`, `desk:us` = `... --side us` (+ `:dry` and passthrough).
- **Write gate:** `write` is dry-run unless `--write` AND (`--approve "<phrase>"` or `DESK_WRITE_APPROVAL` env) match the desk approval phrase. Respects Track 54 human-approval discipline without coupling to the Grok-specific `assertTrack54WriteGate()`.

## Authoritative write contracts (verified against live schema 2026-06-16)

### CAD `market_analysis` — UPSERT onConflict `(grain, crop_year, grain_week)`
NOT NULL: `grain, crop_year, grain_week, initial_thesis, bull_case, bear_case, historical_context(jsonb, dflt {}), data_confidence(text, dflt 'medium'), key_signals(jsonb, dflt []), model_used`.
Nullable: `confidence_score(smallint), final_assessment(text), stance_score(smallint), bull_reasoning(jsonb), bear_reasoning(jsonb), llm_metadata(jsonb)`.
`model_used = 'claude-agent-desk-v1-opus'`. Track-46 fields nest in `llm_metadata.track_46`.

### CAD `score_trajectory` — DELETE+INSERT by `(grain, crop_year, grain_week, scan_type='weekly_debate')`
Built via **`buildWeeklyTrajectoryRow()`** (`lib/trajectory-mapping.ts`). Columns: `grain, crop_year, grain_week, scan_type='weekly_debate', stance_score, conviction_pct, near_term(enum), medium_term(enum), recommendation(enum6), reversal_triggers=null, risk_triggers=null, score_delta=null, trigger, evidence(**text**), data_freshness(jsonb NN), model_source='claude-agent-desk-v1-opus'`.
CHECK: `recommendation ∈ {PATIENCE,WATCH,SCALE_IN,ACCELERATE,HOLD_FIRM,PRICE}`, `near/medium_term ∈ {bearish,neutral,bullish}` — the helper guarantees these from `stance_score`.

### US `us_market_analysis` — UPSERT onConflict `(market_name, crop_year, market_year)`
NOT NULL: `market_name, crop_year, market_year, initial_thesis, bull_case, bear_case, stance_score(smallint), recommendation(text), key_signals(jsonb, dflt []), model_used`.
Nullable: `final_assessment, confidence_score, data_confidence(dflt 'medium'), data_freshness(jsonb), llm_metadata(jsonb)`.
No top-level `bull_reasoning`/`bear_reasoning` — they live in `llm_metadata`. `model_used = 'claude-agent-us-desk-v1-opus'`. `week_ending` lives in `data_freshness`.

### US `us_score_trajectory` — DELETE+INSERT by `(market_name, crop_year, market_year, scan_type='weekly_debate')`
Columns: `market_name, crop_year, market_year, scan_type='weekly_debate', stance_score, conviction_pct, recommendation(text NN, **free text** — no CHECK), trigger, evidence(**jsonb**), data_freshness(jsonb), model_source='claude-agent-us-desk-v1-opus'`. No `near/medium_term`. `recorded_at` auto-fills.

### `pipeline_runs` (shared ledger) — correct columns
`crop_year(text NN), grain_week(smallint NN), status(running|completed|partial|failed), grains_requested(text[] NN), grains_completed(text[] dflt {}), grains_failed(text[] dflt {}), failure_details(jsonb NN dflt {}), triggered_by(manual|cron|retry; use 'cron'), started_at, completed_at, duration_ms`.
**No `source`, no `metadata` columns.** US has no `grain_week` concept → use ISO week-of-year from `week_ending` (NOT NULL forbids the prompt's NULL).

## Pre-existing bugs fixed by this work (verified vs live schema)
1. Meta-reviewer defs SELECT `metadata` from `(us_)market_analysis` → col is `llm_metadata`.
2. CAD prompt Step 5.4 inserts `pipeline_runs(source, metadata)` — neither column exists; also omits NN `grains_requested`.
3. US prompt `pipeline_runs` inserts use `NULL` for NN `crop_year`/`grain_week` and omit NN `grains_requested` → abort/complete logging silently fails.
4. US meta-reviewer reads `source`/`metadata` off `pipeline_runs` (neither exists).
5. CAD/US `score_trajectory` example SQL uses free-text `recommendation`/`near_term`/`medium_term` that violate CHECK constraints.
6. `score_trajectory.evidence` is `text` but prompt casts `::jsonb`; `us_score_trajectory.evidence` is `jsonb`.
7. US Phase 0.1 reads deprecated `usda_wasde_estimates` for market-year → use `get_usda_wasde_context` RPC.
8. US abort SQL has an orphaned 6th positional arg.

All write SQL in the prompts is replaced by `desk-cli` calls, so these vanish at the source.

## File-by-file plan
- NEW `scripts/desk/contracts.ts` — grain/market lists, model strings, scan_type, approval phrase, conflict keys.
- NEW `scripts/desk/schemas.ts` — zod input schemas for the chief's per-row payloads + write envelope.
- NEW `scripts/desk/row-builders.ts` — pure mappers to DB rows (reuse `buildWeeklyTrajectoryRow`); + US trajectory builder; + pipeline_runs row builder.
- NEW `scripts/desk/freshness.ts` — pure SLA evaluator (ages → pass/breach + breached list), CAD (3 sources) + US (5 sources, seasonal crop-progress gate).
- NEW `scripts/desk/reads.ts` — typed read registry (RPC/view/SELECT per scout source).
- NEW `scripts/desk/desk-cli.ts` — arg parsing, `createAdminClient()`, command dispatch.
- NEW `lib/__tests__/desk-*.test.ts` — row builders, schemas, freshness, contracts (TDD).
- EDIT `.claude/agents/` CAD (6 scouts + 4 specialists + desk-meta-reviewer) & US (8 scouts + 5 specialists + us-desk-meta-reviewer): MCP read → `desk:cad|us` CLI.
- EDIT `docs/reference/grain-desk-swarm-prompt.md` + `us-desk-swarm-prompt.md`: Phase 0/3/5 → CLI; fix bugs.
- EDIT `package.json`, `CLAUDE.md`, `docs/lessons-learned/issues.md`, `docs/plans/STATUS.md`.

## Security posture (2026-07-02 audit — findings fixed same-day)

security-auditor pass on the finished runner: no Critical findings; write path confirmed limited to `market_analysis` / `us_market_analysis` / `score_trajectory` / `us_score_trajectory` / `pipeline_runs` (plus postcheck's deterministic `thesis_packet_cache`/`source_runs` rebuild). Fixed from the findings: **H-1** US trajectory delete now bounded by `recorded_at >= week_ending` (it was scoped only by market-year — a re-run would have wiped every prior Friday anchor); **M-1** embedded selects (`(`) rejected in table reads (PostgREST embedding could reach non-allow-listed relations, e.g. `signal_feedback`); **M-2** write envelopes must match the current resolved week/market-year unless `--allow-historical`, plus long-format `crop_year` / ISO `week_ending` regexes and `market_year` bounds; **M-3** `fail --status` restricted to `failed|partial` (no ops-ledger `completed` forgery); **L-1** `fail --details -` stdin variant (never interpolate free text into inline JSON); **L-2** `grain_sentiment_votes` removed from the read allow-list (use the `get_sentiment_overview` aggregate). Regression tests: `lib/__tests__/desk-write-guards.test.ts`.

**Accepted residual risks (explicit):**
1. **H-2 environment-level escalation:** any Bash-capable agent in the runner can read `.env.local` and hit Supabase directly with the service key, bypassing the CLI entirely. The CLI is a mistake-prevention boundary, not an auth boundary. Accepted on this single-user dev box; optional hardening: restrict the scheduled runner's Bash permission allowlist to `npm run desk:*` / `npm run friday-x-signal-bundle`, or provision the key per-process instead of via file.
2. The `DESK_WRITE_APPROVAL` phrase is discoverable (printed by `--help`; present in `.env.local` once enabled). It prevents accidental writes, not malicious ones — the real write control is the zod schema + fixed row-builders.
3. Ungated `pipeline_runs` failure logging is floodable by design (fail-loud beats silent; the table is service-role-only and non-farmer-facing).
4. Live-only RPCs `get_supply_disposition_context` / `get_us_export_context` have no local migrations (known drift). Assumed read-only as project-authored `get_*` functions; verify `provolatile`/`prosecdef` at the next migration-history reconciliation.

## Verification (Gate 3/6 — before anything is enabled)
- `npm run typecheck`, `npm run test`, `npm run build` pass.
- Live **dry-run** (no production writes): `desk:cad preflight`, a few `desk:cad read …`, `desk:cad knowledge …`, and `desk:cad write --input fixture.json` (dry-run) + same for `--side us`.
- `data-audit` (write correctness) + `security-auditor` (service-role handling) agents.
- **Do NOT enable** `grain-desk-weekly` / `us-desk-weekly` — Track 54 human-approval gate stays in force.
