# Grok X Scout, Prices, And Daily Thesis Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Finish the Bullish/Bearish market analysis board so it uses official source data, daily prices, supervised Grok/X signal intake, bounded weekday thesis updates, Friday desk-swarm rewrites, and distilled Viking knowledge without reviving the retired Grok thesis pipeline.

**Architecture:** Grok is a quarantined X scout only. Codex/Claude imports and validates official data and prices, parses Grok's daily X evidence into structured signal records, applies deterministic guardrails, writes only bounded daily trajectory updates, and reserves thesis-of-record writes for the Friday Canada and US desk swarms.

**Tech Stack:** Next.js 16, TypeScript, Supabase PostgreSQL/RPC/Edge Functions, Claude Desktop Routines, Codex local automation, Grok Build CLI or xAI Responses API `x_search`, existing `grain_prices`, `x_market_signals`, `thesis_packet_cache`, `score_trajectory`, and `us_score_trajectory`.

---

## Direct Verdict

Use Grok, but do not let Grok publish.

The best v1 is:

```text
Daily official/source collectors
  -> source tables
  -> thesis_packet_cache

Daily prices
  -> grain_prices / grain_price_intraday
  -> thesis_packet_cache

Daily Grok X Scout
  -> local raw artifact
  -> deterministic parser and validation
  -> x_market_signals with rich metadata

Codex or Claude daily reviewer
  -> official data + prices + vetted X signals
  -> bounded trajectory soft update only

Friday after final source pulls
  -> Canada desk swarm + US desk swarm
  -> Viking distilled knowledge + official data + price context + X signal bundle
  -> market_analysis / us_market_analysis
  -> thesis_packet_cache
  -> /thesis
```

The old Grok/xAI thesis-writing chain remains dead. This plan creates a new Grok scout lane with different permissions, different storage, and different acceptance gates.

## Current State Read

### What already exists

- `/thesis` is already a source-backed Bull/Bear board.
- `thesis_packet_cache` is the board's fast read layer.
- Collector wrappers refresh thesis cache after successful imports.
- Friday Canada and US desk-swarm prompts exist and are designed to use Viking knowledge.
- `grain_prices` exists and is read by the thesis board, overview, advisor, seeding drill, and evaluation scripts.
- `scripts/import-grain-prices.ts` already imports daily settlement rows from Yahoo Finance and Barchart fallback paths.
- `grain_price_intraday` exists for timestamped quotes, currently most relevant to Canola if Barchart credentials are present.
- `x_market_signals` exists, but its current metadata is too thin for production-quality thesis impact.
- `docs/plans/2026-05-27-x-signal-valuation-guardrail-framework.md` is the right concept: source tiers, staleness, seasonal phase, affected grains, catalysts, and impact scoring. It is not implemented.

### What is not done

- No production daily Grok/X pull is wired.
- The old Grok `search-x-intelligence` path is tombstoned and must not be reused.
- `/api/cron/scan-signals` is paused.
- There is no daily X signal artifact parser with a strict JSON contract.
- There is no `source_cred_tier` or `signal_metadata` on `x_market_signals`.
- There is no daily scheduled `collect:prices` wrapper that forces thesis-cache refresh.
- There is no single daily reviewer that combines official data, price moves, and vetted X signal deltas.
- There is no UI lane that cleanly separates "Friday thesis" from "daily X Pulse watch".

## External Grok/xAI Docs Checked

Official xAI docs checked on 2026-06-01:

- Grok Build can be used interactively, headlessly, or through Agent Client Protocol. Install command on Windows PowerShell is documented as `irm https://x.ai/cli/install.ps1 | iex`.
- First Grok launch opens browser auth; non-browser environments can use `XAI_API_KEY`.
- Headless mode supports `grok -p "..."`, `--cwd`, `--output-format json`, and `--no-auto-update`.
- ACP supports `grok agent stdio` and can authenticate with cached token or `XAI_API_KEY`.
- xAI `x_search` can perform keyword search, semantic search, user search, and thread fetch on X.
- `x_search` supports date ranges and `allowed_x_handles` with a max of 20 handles per request.
- xAI docs say linked X subscription status can grant relevant benefits after connecting the X account to the xAI account.

Implementation note: the first live implementation used the current npm path (`npm install -g @xai-official/grok`) and verified `grok 0.2.14` in PowerShell with cached auth and headless JSON output. The old PowerShell install line remains historical context from the docs check, not the current repo proof.

## Architecture Decision

### Recommended v1: Supervised Grok CLI scout

Use Grok Build headless mode from Codex-controlled scripts. Grok gets a prompt, searches X, and returns strict JSON. Codex parses the JSON, validates it, stores raw artifacts locally, and only writes vetted rows to Supabase.

Why this is the top pick:

- It uses the user's existing Grok Premium/X access.
- It keeps Grok in the lane where it is strongest: high-recall X discovery.
- It avoids API credential and billing uncertainty while we prove signal quality.
- It prevents Grok from directly writing board thesis rows.

### Backup v1: xAI API `x_search`

Use xAI Responses API with `x_search` if CLI automation is brittle or if the CLI cannot access the same X capability in headless mode.

Why this is second:

- It is cleaner for structured outputs and repeatable automation.
- It likely requires API key/billing separate from the consumer subscription path.
- It should become the durable production path if daily CLI auth/session state proves flaky.

### Not recommended for this next slice: direct X API v2 first

Direct X API v2 is still a good long-term deterministic ingestion lane, but it is no longer the best immediate answer to the user's stated asset: Grok Premium access with broader X search. Keep the existing X API client as fallback and as a future lower-cost collector, not the first thing to build.

## Non-Negotiable Boundaries

- Grok does not write `market_analysis`.
- Grok does not write `us_market_analysis`.
- Grok does not write `score_trajectory` or `us_score_trajectory`.
- Grok does not refresh `thesis_packet_cache`.
- Grok does not decide final bullish/bearish stance.
- Grok output is untrusted data until Codex/Claude validates it.
- Daily updates do not overwrite Friday thesis rows.
- Friday swarm is the thesis-of-record writer.
- Prices are required for daily analysis whenever the market traded.
- If prices are stale, daily analysis must say "price unavailable/stale", not infer price action from X chatter.

## Data Model Plan

### Add X scout run audit table

Create migration:

`supabase/migrations/<timestamp>_create_x_scout_runs.sql`

Table:

```sql
create table if not exists public.x_scout_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  run_started_at timestamptz not null default now(),
  run_finished_at timestamptz,
  mode text not null check (mode in ('daily_pulse', 'friday_deep', 'manual_test')),
  runner text not null check (runner in ('grok_cli', 'xai_api', 'x_api_direct', 'manual')),
  status text not null check (status in ('started', 'success', 'partial', 'failed', 'rejected')),
  prompt_version text not null,
  artifact_path text,
  artifact_sha256 text,
  raw_signal_count integer not null default 0,
  accepted_signal_count integer not null default 0,
  rejected_signal_count integer not null default 0,
  price_snapshot_required boolean not null default true,
  price_snapshot_status text not null default 'not_checked'
    check (price_snapshot_status in ('not_checked', 'fresh', 'stale', 'missing', 'partial')),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.x_scout_runs enable row level security;

create policy x_scout_runs_public_read
  on public.x_scout_runs
  for select
  to anon, authenticated
  using (true);

create policy x_scout_runs_service_role_write
  on public.x_scout_runs
  for all
  to service_role
  using (true)
  with check (true);
```

Reason: `source_runs` is good for mechanical source collectors; `x_scout_runs` needs prompt version, artifact hash, and rejection counts.

### Extend `x_market_signals`

Create migration:

`supabase/migrations/<timestamp>_extend_x_market_signal_metadata.sql`

Columns:

```sql
alter table public.x_market_signals
  add column if not exists scout_run_id uuid references public.x_scout_runs(id),
  add column if not exists source_cred_tier text,
  add column if not exists primary_impact_grain text,
  add column if not exists affected_grains text[] not null default '{}',
  add column if not exists affected_regions text[] not null default '{}',
  add column if not exists affected_decisions text[] not null default '{}',
  add column if not exists seasonal_phase text,
  add column if not exists signal_metadata jsonb not null default '{}'::jsonb,
  add column if not exists signal_hash text;

create unique index if not exists idx_x_market_signals_signal_hash
  on public.x_market_signals(signal_hash)
  where signal_hash is not null;

create index if not exists idx_x_market_signals_scout_run
  on public.x_market_signals(scout_run_id);

create index if not exists idx_x_market_signals_signal_metadata_gin
  on public.x_market_signals using gin(signal_metadata);
```

`signal_metadata` must contain:

```json
{
  "schema_version": "x_signal_metadata_v1",
  "grok_claim_type": "observation|quote|interpretation|unsupported",
  "staleness_class": "same_day|fresh_72h|week_context|stale",
  "source_tier": "tier1|tier2|tier3|tier4|unlisted",
  "corroboration": {
    "same_claim_count": 0,
    "independent_sources": [],
    "official_source_match": false
  },
  "seasonal_phase": "planting|emergence|heading|grain_fill|harvest|marketing|offseason|unknown",
  "impact_breakdown": {
    "supply": 0,
    "demand": 0,
    "price": 0,
    "logistics": 0,
    "policy": 0,
    "confidence": 0
  },
  "grok_summary": "",
  "codex_validation_notes": [],
  "blocked_claims": [],
  "allowed_claims": []
}
```

### Add query helpers

Create:

- `lib/x-api/trusted-accounts.ts`
- `lib/x-api/x-scout-contract.ts`
- `lib/x-api/x-signal-valuation.ts`
- `lib/x-api/x-signal-validation.ts`
- `lib/queries/x-scout-runs.ts`

Responsibilities:

- `trusted-accounts.ts`: typed handle tiers and query grouping.
- `x-scout-contract.ts`: Zod schema for Grok output.
- `x-signal-valuation.ts`: pure scoring functions, no model calls.
- `x-signal-validation.ts`: dedup, staleness, post URL, handle tier, affected-grain validation.
- `x-scout-runs.ts`: server-side reads for latest scout run and accepted signals.

## Grok Scout Contract

Grok daily prompt must return JSON only:

```json
{
  "schema_version": "grok_x_scout_v1",
  "run_date": "2026-06-01",
  "mode": "daily_pulse",
  "search_windows": [
    {
      "label": "last_24h",
      "from_date": "2026-05-31",
      "to_date": "2026-06-01"
    }
  ],
  "signals": [
    {
      "source_url": "https://x.com/handle/status/123",
      "post_id": "123",
      "handle": "LeftFieldCR",
      "posted_at": "2026-06-01T15:00:00Z",
      "raw_quote": "short excerpt only",
      "summary": "one sentence summary",
      "primary_grain": "Wheat",
      "affected_grains": ["Wheat", "Durum"],
      "affected_regions": ["Saskatchewan", "Alberta"],
      "category": "weather",
      "direction": "bullish",
      "time_sensitivity": "same_day",
      "seasonal_phase": "planting",
      "why_it_matters": "one sentence",
      "confidence": 0.71,
      "needs_official_verification": true,
      "claimed_numbers": [
        {
          "label": "planting progress",
          "value": "14%",
          "source_text": "short excerpt only"
        }
      ]
    }
  ],
  "no_signal_notes": []
}
```

Hard parser rules:

- Reject non-JSON output.
- Reject output with no `schema_version`.
- Reject unknown `schema_version`.
- Reject missing `source_url` unless the signal is stored as `unsupported` and not written to `x_market_signals`.
- Reject posts older than the allowed search window unless `mode = 'friday_deep'` and the signal is explicitly marked context-only.
- Reject any signal that directly says "buy", "sell", "trade", or "financial advice".
- Reject any unquoted claim that cannot be traced to a post URL, official source, or clearly labeled interpretation.
- Cap raw quote length to a short excerpt to avoid copyright and platform-policy issues.

## Price Requirement

Yes, pull prices for every daily analysis.

Daily analysis must include:

- Latest futures settlement from `grain_prices`.
- Latest CAD-normalized price when available.
- Latest intraday Canola quote if `BARCHART_ONDEMAND_API_KEY` exists and the market is open or recently closed.
- Price freshness state.
- Price source state.

### Current price path

Existing script:

`scripts/import-grain-prices.ts`

Existing command:

`npm run import-prices`

Existing behavior:

- Yahoo Finance for CBOT contracts.
- Barchart HTML fallback for Canola and Spring Wheat latest close.
- Upserts `grain_prices`.
- Runs `recalculate_grain_prices_cad`.
- Writes a `source_runs` row for `grain_prices`.

### Add collector wrapper

Add script to `package.json`:

```json
"collect:prices": "tsx -- scripts/run-collector-with-thesis-cache-refresh.ts --name collect-prices tsx scripts/import-grain-prices.ts --days 10"
```

Reason: daily price imports should refresh `thesis_packet_cache`, because the board already gates price drivers through packet freshness.

### Add schedule

Add scheduled task:

```text
collect-prices
Mon-Fri 3:45 PM MT
Command: npm run collect:prices
```

Reason: this lands after regular North American futures settlement windows often enough for daily board context. If settlement timing proves late, move to 4:30 PM MT after one week of logs.

### Add watchdog rule

Update:

`scripts/check-bushel-source-freshness.ts`

Rule:

- `grain_prices` latest source period should be within 2 trading days.
- On weekdays after 4:45 PM MT, missing same-day price source run should warn.
- `grain_prices` stale should block daily price-based thesis deltas, but not block official-data-only source facts.

## Daily Automation Flow

### Daily order

```text
1. Run official source collectors due that day.
2. Run collect:prices.
3. Run Grok X Scout daily pulse.
4. Parse, validate, and store accepted X signals.
5. Build daily review packet.
6. Codex/Claude daily reviewer writes bounded soft trajectory ticks.
7. Refresh /thesis cache and source freshness.
8. Site smoke checks.
```

### Daily review writer

Create:

`scripts/run-daily-thesis-review.ts`

Inputs:

- latest `thesis_packet_cache`
- latest `grain_prices`
- latest accepted `x_market_signals`
- latest `score_trajectory` and `us_score_trajectory`
- latest `market_analysis` and `us_market_analysis`

Output:

- JSON review artifact to stdout.
- No direct writes in dry run.
- In write mode, calls `scripts/write-collector-soft-update.py` per market/grain.

Bounds:

- `stance_delta`: -3 to +3 on normal daily review.
- `confidence_delta`: -5 to +5 on normal daily review.
- Friday-only override: no bounds increase during daily run. Larger signals become "Friday regime-change review" notes.

Reason: `collector-soft-update-prompt.md` already uses -5/+5 per collector. This daily combined review should be even more conservative because X can be noisy.

## Friday Deep Analysis Flow

Friday after Alberta crop progress, CFTC COT, prices, and X deep scan:

```text
collect-canada-crop-progress:all or missing-ab fallback
collect-cftc-cot
collect:prices
grok-x-scout --mode friday_deep
validate x_market_signals
build friday x signal bundle
grain-desk-weekly
us-desk-weekly
refresh-thesis-cache
browser smoke /thesis and /overview
```

Friday desk prompts must be updated to read:

- official source packets
- price snapshot
- accepted X signal bundle
- Viking L0/L1/L2 knowledge
- weekday trajectory drift

They must still write:

- Canada: `market_analysis` and `score_trajectory` with `scan_type = 'weekly_debate'`
- US: `us_market_analysis` and `us_score_trajectory` with `scan_type = 'weekly_debate'`

They must not use Grok as an analyst. They can cite Grok-scouted posts only after the signal parser accepted them.

## UI Plan

### Do not change core thesis copy first

The visible Bull/Bear board should keep the current source-backed farmer read. The first UI addition should be a separate X Pulse lane.

### Add X Pulse panel

Modify:

- `app/(dashboard)/thesis/page.tsx`
- `lib/queries/thesis-board.ts`
- `lib/queries/x-scout-runs.ts`

Panel:

```text
X Pulse Watch
Last scan: 2026-06-01 16:10 MT
Accepted: 14
Rejected: 39
Top signals:
  Wheat - bullish - Tier 1 - planting delay - needs official verification
  Canola - neutral/bearish - basis pressure - unverified
  Corn - bullish - export chatter - verified by price move
```

Rules:

- Label it "Watch", not "Thesis".
- Show source tier and timestamp.
- Show "needs official verification" when true.
- No "price advice", "financial advice", "trade signal", "pricing plan", "buy signal", "sell signal", or bare "buy/sell" wording.
- Keep all X content visually subordinate to source-health and Top Takeaway.

### Add audit mode

`/thesis?audit=1` should show:

- latest `x_scout_runs`
- accepted/rejected counts
- rejection reasons
- raw Grok artifact hash
- price freshness state
- signal scoring breakdown

## Implementation Tasks

### Task 1: Promote the plan and preserve stale Grok history

Files:

- Modify: `docs/plans/STATUS.md`
- Modify: `PROJECT_STATE.md`
- Keep historical: `docs/plans/2026-03-07-grok-x-integration-design.md`
- Keep historical: `docs/plans/2026-03-07-grok-x-integration-implementation.md`
- Keep proposed, then supersede: `docs/plans/2026-05-27-x-signal-valuation-guardrail-framework.md`

Steps:

- [x] Add this plan as the active X/price/daily-thesis completion lane.
- [x] Add a note that March Grok pipeline docs are retired history.
- [x] Add a note that May 27 valuation doc is conceptually accepted but superseded by this implementation plan.
- [x] Run `git diff --check`.

### Task 2: Install and authenticate Grok Build outside the repo change

Files:

- No repo file changes.

Steps:

- [x] Install the official npm-distributed Grok Build CLI from current xAI docs. The PowerShell installer from the original plan was not surfaced in the current docs check, so Windows used:

```powershell
npm install -g @xai-official/grok
```

- [x] Verify:

```powershell
grok --version
```

- [x] Confirm cached/browser authentication through headless execution:

```powershell
grok --no-auto-update -p "Return only JSON: {\"ok\":true}" --output-format json --cwd C:\Users\kyle\Agriculture\bushel-board-app
```

- [x] Confirm headless JSON mode:

```powershell
grok --no-auto-update -p "Return only JSON: {\"ok\":true}" --output-format json --cwd C:\Users\kyle\Agriculture\bushel-board-app
```

Expected:

- `grok` command exists.
- Authentication succeeds through browser or cached token.
- JSON output is machine-readable enough for a wrapper to capture.

If this fails:

- Use `XAI_API_KEY` and xAI Responses API `x_search` instead of CLI for v1.

### Task 3: Add price collector wrapper

Files:

- Modify: `package.json`
- Modify: `scripts/check-bushel-source-freshness.ts`
- Test: existing price tests plus new focused freshness tests if needed.

Steps:

- [x] Add `collect:prices` package script.
- [x] Add `grain_prices` due-window warning to source freshness watchdog.
- [x] Run:

```powershell
npm run import-prices -- --dry-run --days 5
npm run collect:prices -- --dry-run
npm run check:source-freshness -- --summary
npm run build
```

Expected:

- Dry run fetches at least CBOT Wheat/Corn/Soybeans/Oats unless Yahoo is temporarily unavailable.
- `collect:prices` skips DB writes in dry run and does not refresh cache if the child is dry run.
- Build passes.

### Task 4: Create X scout run storage

Files:

- Create: `supabase/migrations/<timestamp>_create_x_scout_runs.sql`
- Create: `lib/queries/x-scout-runs.ts`
- Test: `lib/__tests__/x-scout-runs.test.ts`

Steps:

- [x] Write migration for `x_scout_runs`.
- [x] Add public read/service-role write RLS.
- [x] Add query helper for latest run summary.
- [x] Add tests for shape normalization.
- [x] Apply migration in the implementation session only after review.

Verification:

```powershell
npx vitest run lib/__tests__/x-scout-runs.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node
npm run build
```

### Task 5: Extend X signal metadata

Files:

- Create: `supabase/migrations/<timestamp>_extend_x_market_signal_metadata.sql`
- Modify: `lib/queries/x-signals.ts`
- Test: `lib/__tests__/x-signals.test.ts`

Steps:

- [x] Add metadata columns and indexes.
- [x] Fix `lib/queries/x-signals.ts` so `post_url` reads from the real column instead of always returning null.
- [x] Add signal metadata type.
- [x] Add tests for signal rows with and without metadata.
- [x] Apply migration in the implementation session only after review.
- [x] Add follow-up live migration `20260601052000_make_x_signal_hash_upsertable.sql` so PostgREST can upsert accepted signals on `signal_hash`.

Verification:

```powershell
npx vitest run lib/__tests__/x-signals.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node
npm run build
```

### Task 6: Build trusted account and valuation modules

Files:

- Create: `lib/x-api/trusted-accounts.ts`
- Create: `lib/x-api/x-scout-contract.ts`
- Create: `lib/x-api/x-signal-valuation.ts`
- Create: `lib/x-api/x-signal-validation.ts`
- Test: `lib/__tests__/x-signal-valuation.test.ts`
- Test: `lib/__tests__/x-signal-validation.test.ts`

Steps:

- [x] Encode trusted handles in 20-handle groups because xAI `allowed_x_handles` maxes at 20.
- [x] Add deterministic tier lookup.
- [x] Add staleness scoring by category.
- [x] Add seasonal phase classifier.
- [x] Add affected-grain validation against V1 admitted lanes.
- [x] Add price-context validation: price signals require fresh `grain_prices`.
- [x] Add blocked-claim rules for advice, unverified numbers, stale posts, unsupported grains.

Verification:

```powershell
npx vitest run lib/__tests__/x-signal-valuation.test.ts lib/__tests__/x-signal-validation.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node
npm run build
```

### Task 7: Build Grok scout runner

Files:

- Create: `scripts/run-grok-x-scout.ts`
- Create: `docs/reference/grok-x-scout-prompt-v1.md`
- Modify: `.gitignore`
- Test: `lib/__tests__/grok-x-scout-contract.test.ts`

Steps:

- [x] Add ignored local artifact directory:

```gitignore
/data/X Scout Runs/
```

- [x] Runner builds prompt from `docs/reference/grok-x-scout-prompt-v1.md`.
- [x] Runner supports:

```text
--mode daily_pulse|friday_deep|manual_test
--date YYYY-MM-DD
--dry-run
--write
--approval-phrase <phrase> required with --write after promotion brief and human approval
--approval-review-from YYYY-MM-DD optional reviewed artifact window start for approval gate
--approval-review-to YYYY-MM-DD optional reviewed artifact window end for approval gate
--runner grok_cli|xai_api
--grain-week <number> optional write-mode override; defaults to latest CGC grain week
```

- [x] In `grok_cli` mode, runner uses an isolated temp working directory and prompt file:

```powershell
grok --no-auto-update --prompt-file "<prompt-file>" --verbatim --output-format json --cwd "<artifact sandbox dir>"
```

- [x] Runner stores raw output under ignored `data/X Scout Runs/YYYY-MM-DD/`.
- [x] Runner hashes artifact with SHA-256.
- [x] Runner parses and validates JSON.
- [x] Runner writes `x_scout_runs` only in `--write`.
- [x] Runner writes accepted `x_market_signals` only in `--write`.
- [x] `--write` requires the Track 54 approval phrase after the promotion brief is reviewed.
- [x] Write mode resolves the latest CGC grain week automatically when `--grain-week` is omitted, so approved automation commands remain stable across weeks.

Verification:

```powershell
npx vitest run lib/__tests__/grok-x-scout-contract.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node
npm run build
```

Manual smoke:

```powershell
npm run grok:x-scout -- --mode manual_test --dry-run
```

Expected:

- No Supabase writes.
- Raw artifact saved locally.
- JSON summary says accepted/rejected counts.

### Task 8: Build daily review packet and bounded writer

Files:

- Create: `scripts/build-daily-thesis-review-packet.ts`
- Create: `scripts/run-daily-thesis-review.ts`
- Create: `docs/reference/daily-thesis-review-prompt.md`
- Test: `lib/__tests__/daily-thesis-review-packet.test.ts`

Steps:

- [x] Packet includes official source freshness.
- [x] Packet includes latest price rows and freshness.
- [x] Packet includes accepted X signals only.
- [x] Packet includes current Friday anchor and weekday trajectory drift.
- [x] Reviewer supports `--dry-run` and `--write`.
- [x] `--write` calls existing trajectory writer with bounded deltas.
- [x] `--write` requires the Track 54 approval phrase after the promotion brief is reviewed.
- [x] `--write` skips already-applied daily pulse decisions so external retries cannot duplicate a trajectory nudge.
- [x] Daily writer cannot mutate `market_analysis` or `us_market_analysis`.

Verification:

```powershell
npx vitest run lib/__tests__/daily-thesis-review-packet.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node
npm run build
```

### Task 9: Wire Friday swarms to accepted X bundle

Files:

- Modify: `docs/reference/grain-desk-swarm-prompt.md`
- Modify: `docs/reference/us-desk-swarm-prompt.md`
- Create: `scripts/build-friday-x-signal-bundle.ts`
- Test: `lib/__tests__/friday-x-signal-bundle.test.ts`

Steps:

- [x] Build X bundle from accepted `x_market_signals` linked to current week.
- [x] Include source tier, timestamp, affected grains, allowed claims, blocked claims, and price context.
- [x] Update CAD desk prompt to read the bundle as untrusted evidence, not final analysis.
- [x] Update US desk prompt same way.
- [x] Preserve "no Grok LLM in the desk loop" wording, but clarify Grok-scouted X posts are allowed after Codex validation.

Verification:

```powershell
npx vitest run lib/__tests__/friday-x-signal-bundle.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node
npm run build
```

### Task 10: Add X Pulse UI on `/thesis`

Files:

- Modify: `app/(dashboard)/thesis/page.tsx`
- Modify: `app/(dashboard)/thesis/page.test.tsx`
- Modify: `lib/queries/thesis-board.ts`
- Modify: `lib/__tests__/thesis-board.test.ts`

Steps:

- [x] Query latest scout summary and accepted top signals.
- [x] Add compact X Pulse Watch panel below source health and top takeaway.
- [x] Keep panel separate from final thesis.
- [x] Add audit-only details under `/thesis?audit=1`.
- [x] Add forbidden-copy tests for "trade signal", "pricing plan", "price advice", "financial advice", "buy signal", "sell signal", "buy", and "sell".

Verification:

```powershell
npx vitest run 'app/(dashboard)/thesis/page.test.tsx' lib/__tests__/thesis-board.test.ts --pool=forks --maxWorkers=1 --no-file-parallelism --environment=node
npm run lint
npm run build
```

Browser smoke:

```text
/thesis
/thesis?audit=1
/overview
```

Expected:

- Clean console.
- No forbidden crop rows.
- No forbidden rendered advice/trading copy.
- X Pulse does not visually outrank source health or Top Takeaway.
- Audit mode shows scout run metadata.

### Task 11: Add scheduled routines

Files:

- Modify: `docs/reference/collector-task-configs.md`
- Modify: `PROJECT_STATE.md`
- Modify: `docs/plans/STATUS.md`
- Create: `scripts/review-grok-x-scout-artifact-week.ts`
- Test: `lib/__tests__/grok-x-scout-artifact-week.test.ts`

New daily routine proposal:

```text
collect-prices
Mon-Fri 3:45 PM MT
npm run collect:prices

grok-x-scout-daily
Mon-Fri 4:05 PM MT
npm run grok:x-scout -- daily_pulse --runner auto --write --approval-phrase "I approve enabling Track 54 write-mode Grok routines after reviewing the promotion brief." --approval-review-from <YYYY-MM-DD> --approval-review-to <YYYY-MM-DD>

daily-thesis-review
Mon-Fri 4:25 PM MT
npm run daily-thesis-review -- --write --approval-phrase "I approve enabling Track 54 write-mode Grok routines after reviewing the promotion brief." --approval-review-from <YYYY-MM-DD> --approval-review-to <YYYY-MM-DD>

source-freshness-watchdog
Existing 4:45 PM MT
```

Friday extra:

```text
grok-x-scout-friday-deep
Friday 4:50 PM MT
npm run grok:x-scout -- friday_deep --runner auto --write --approval-phrase "I approve enabling Track 54 write-mode Grok routines after reviewing the promotion brief." --approval-review-from <YYYY-MM-DD> --approval-review-to <YYYY-MM-DD>

grain-desk-weekly
Friday evening after Alberta/CFTC/price/X deep scan

us-desk-weekly
Friday evening after CAD desk
```

Steps:

- [x] Register routines only after local dry-run, write-run, and browser smoke pass. *(Price/cache refresh, dry-run artifact-week review, Friday-deep dry-run review, and no-write artifact health checks are active; readiness checks proposed write-mode Codex manifests remain missing/inactive, so write-mode Grok routines remain disabled.)*
- [x] Register official price/cache refresh automation after Task 12 proof.
- [x] Register a dry-run-only Grok artifact-week Codex automation to collect review evidence without writing Supabase rows.
- [x] Register no-write artifact health-check automations through `npm run track54:artifact-health` / `scripts/run-track54-artifact-health-check.ts` to retry missing or structurally invalid dry-run artifacts without writing Supabase rows.
- [x] Keep Grok daily disabled until one manual week of artifacts proves signal quality.
- [x] Add rollback instructions for pausing Grok without pausing official collectors.

### Task 12: Production promotion gate

Required before calling done:

- [x] `npm run build` passes.
- [x] Focused tests pass:

```powershell
npx vitest run 'app/(dashboard)/thesis/page.test.tsx' lib/__tests__/thesis-board.test.ts lib/__tests__/x-signal-valuation.test.ts lib/__tests__/x-signal-validation.test.ts lib/__tests__/daily-thesis-review-packet.test.ts --pool=forks --maxWorkers=1 --no-file-parallelism --environment=node
```

- [x] `npm run lint` has 0 errors.
- [x] `npm run import-prices -- --dry-run --days 5` works.
- [x] `npm run grok:x-scout -- --mode manual_test --dry-run` works.
- [x] `npm run daily-thesis-review -- --dry-run` works.
- [x] Fresh `/thesis` browser smoke is clean and captured in completion evidence.
- [x] Fresh `/thesis?audit=1` browser smoke is clean and captured in completion evidence.
- [x] Fresh `/overview` browser smoke is clean and captured in completion evidence.
- [x] Source-freshness watchdog is green or explains official-source lag.
- [x] Production proof is separated from local proof.

Live proof added 2026-06-01:

- Track 54 migrations are applied in Supabase migration history: `20260601041000`, `20260601041100`, `20260601041200`, and follow-up `20260601052000`.
- Grok Build CLI is installed as `grok 0.2.14`; headless JSON proof returned machine-readable output.
- Grok daily pulse write-run `f74c7b7c-fb69-4db1-aaa6-5b36ebe2bde8` wrote 2 accepted source-linked X signals with `price_snapshot_status = fresh`; both post IDs were verified through the configured X API bearer token.
- Daily review write-run created CAD Wheat trajectory row `id=482` with `scan_type = opus_review_daily_pulse`, `stance_delta = -1`, and `confidence_delta = +2`; it did not mutate `market_analysis` or `us_market_analysis`.
- Daily review retry dry-run after row `482` returned `writes_attempted = 0` and `writes_skipped_existing = 1`, proving the daily pulse retry guard catches the already-applied decision.
- Thesis packet cache was force-refreshed after the daily review write: 12 refreshed packets, 0 failures, generated at `2026-06-01T05:21:57.568637+00:00`.
- Same-day scout reruns now preserve older raw artifacts by writing timestamped raw/prompt/summary files. The artifact-week reviewer selects the best valid no-write same-day artifact instead of blindly following the latest pointer, so a quiet retry cannot silently downgrade useful evidence or invalidate a stored `x_scout_runs.artifact_sha256`.

Final local verification added 2026-06-01:

- Focused Vitest passed: 9 files, 69 tests.
- Readiness acceptance proof now runs the broader Track 54 slice: 18 files, 115 tests, covering the readiness report, Grok CLI preflight hold, artifact-week gate, promotion brief, scout contract, output merge, run summary, write approval, write gate, migration/RLS contract, stale browser-proof rejection, and tombstone boundaries.
- `npm run lint` passed with 0 errors and 71 existing warnings.
- `npm run build` passed.
- Source-freshness watchdog passed with `cache_items = 12`, cache finished at `2026-06-01T05:21:58.873+00:00`, and `prairie_week_status = complete_mb_sk_ab`.
- Price dry-run fetched 9 tracked contracts and skipped 0.
- Grok CLI `manual_test` dry-run succeeded with `price_snapshot_status = fresh` and no Supabase writes.
- Fresh browser smoke for `/thesis`, `/thesis?audit=1`, and `/overview` passed through `npm run track54:browser-smoke` with `app_server=started`; readiness consumed proof generated at `2026-06-01T11:48:06.334Z` with `--browser-smoke-proof` and marks `browser_smoke_clean` proven. Browser smoke now rejects forbidden rendered public terms, including parked grains plus trading/advice wording.
- `git diff --check` found no whitespace errors; only Windows CRLF normalization warnings were reported.

Automation gate added 2026-06-01:

- Active Codex automation `canola-price-and-fx-freshness-import` now runs the official Track 54 price/cache lane Mon-Fri at 3:45 PM MT.
- Active Codex automation `grok-x-scout-artifact-week-review` runs the Grok scout in dry-run mode Mon-Fri at 4:10 PM MT, then runs `scripts/review-grok-x-scout-artifact-week.ts` and refreshes readiness with `npm run track54:readiness -- --out scratch/track54-readiness/latest-readiness-report.json --browser-smoke-proof-out scratch/track54-browser-smoke/browser-smoke-proof.json`.
- Active Codex automation `track-54-daily-artifact-health-check` runs Mon-Thu at 4:45 PM MT after the scheduled daily-pulse dry run. It starts with `npx tsx scripts/run-track54-artifact-health-check.ts --mode daily_pulse --retry-missing --refresh-readiness=after-retry`, retries only the matching no-write scout if the same-day artifact is missing or structurally invalid, and if a retry runs it refreshes browser smoke plus the persisted readiness report through `npm run track54:readiness` without writing Supabase rows.
- Active Codex automation `grok-x-scout-friday-deep-artifact-review` runs the Friday-deep Grok scout in dry-run mode Fridays at 4:50 PM MT, then runs `scripts/review-grok-x-scout-artifact-week.ts --mode friday_deep --required-days 1` and refreshes readiness with `npm run track54:readiness -- --out scratch/track54-readiness/latest-readiness-report.json --browser-smoke-proof-out scratch/track54-browser-smoke/browser-smoke-proof.json`.
- Active Codex automation `track-54-friday-artifact-health-check` runs Fridays at 5:15 PM MT before the Friday promotion review. It starts with `npx tsx scripts/run-track54-artifact-health-check.ts --mode both --retry-missing --refresh-readiness=always`, reviews both final-day `daily_pulse` and `friday_deep` artifacts, retries only the matching no-write scout command if either artifact is missing or structurally invalid, then reruns browser smoke and readiness through `npm run track54:readiness` into `scratch/track54-readiness/latest-readiness-report.json`.
- Active Codex heartbeat `track-54-promotion-review` runs Mon-Fri at 5:30 PM MT on this thread. Mon-Thu it reviews daily_pulse no-write evidence and write-mode safety after the daily health check using the persisted readiness report; Friday it also runs the mode-scoped promotion review. Its heartbeat summary includes `local_review_date`, `local_review_weekday`, `local_review_kind`, `review_modes_to_inspect`, `selected_artifacts`, `write_mode_proposal_ids`, `post_approval_transition`, `next_eligible_run_statuses`, `report_freshness_status`, `browser_smoke_proof_age_hours`, `browser_smoke_proof_freshness_status`, and `browser_smoke_proof_fresh_enough` with selected artifact hash/path, the gated dry-run-to-write handoff, same-day artifact due/not-yet-due status, and UI smoke-proof freshness when present. It cannot enable production Grok writes unless the matching artifact gate is candidate-ready and Kyle explicitly approves promotion.
- The artifact-week reviewer returns `insufficient_artifacts`, `hold_manual_review`, or `candidate_for_enablement`; even the clean candidate verdict still requires human approval before write-mode Grok routines are registered.
- `scripts/build-grok-x-scout-promotion-brief.ts` converts the reviewer output into a no-write, mode-scoped approval packet. `daily_pulse` reviews list only the daily scout and daily thesis-review commands; `friday_deep` reviews list only the Friday-deep scout command; `manual_test` reviews cannot authorize automation. Promotion briefs now include `post_approval_automation_transition`, so the operator must disable the matching dry-run artifact collector before registering write-mode routines while keeping the price/cache refresh active.
- `scripts/run-grok-x-scout.ts` and `scripts/run-daily-thesis-review.ts` now reject `--write` unless the Track 54 approval phrase is supplied by `--approval-phrase` or `TRACK54_WRITE_APPROVAL` and the artifact-week reviewer returns `candidate_for_enablement` for the intended mode. Missing approval, an insufficient review, or a mode-mismatched review fails before Supabase or trajectory writes.
- The runtime write gate does not accept environment overrides that lower the five-day artifact requirement or switch the reviewed artifact root/mode. Tests can still pass internal overrides, but real write commands must satisfy the fixed Track 54 gate.
- Promotion brief commands include the reviewed artifact window via `--approval-review-from` and `--approval-review-to`, so post-approval routines re-check the same mode and window before writing.
- New Track 54 scripts now handle `--help`, and write-mode help examples include the reviewed artifact window instead of showing a phrase-only command.
- The reviewer scans same-day timestamped summaries and selects the best valid no-write artifact for evidence quality, while any same-day write-mode evidence still holds the gate.
- Promotion briefs, readiness mode gates, heartbeat summaries, and the plan acceptance audit now include `selected_artifacts` with the selected raw artifact path and SHA-256 hash; heartbeat summaries also include `local_review_date`, `local_review_weekday`, `local_review_kind`, `review_modes_to_inspect`, `write_mode_proposal_ids`, `post_approval_transition`, `next_eligible_run_statuses`, `report_freshness_status`, and `browser_smoke_proof_freshness_status`, so the operator can see the local review lane, exactly which Grok run supports the day count, whether projected same-day artifacts are due yet, which proof freshness state is valid, and which dry-run-to-write handoff remains gated.
- The reviewer verifies dry-run/no-write proof from each artifact summary (`dry_run = true`, `write = false`, and `scout_run_id = null`) before claiming the no-Supabase-write guardrail; write-mode evidence or missing no-write evidence holds the gate.
- The reviewer treats parsed artifact validation as authoritative for raw, accepted, and rejected signal counts. Summary-count mismatches are reported and hold a full artifact week out of `candidate_for_enablement`.
- The reviewer verifies raw artifact identity: parsed `run_date` and `mode` must match the reviewed day and mode. Reused/stale artifacts hold the gate even if the summary file points to them.
- The reviewer separates decision-grade accepted evidence (`tier1`, `tier2`, or `tier3`) from low-grade or unlisted evidence. A full artifact week with only `tier4` or unlisted accepted signals remains `hold_manual_review`.
- The reviewer requires at least 5 clean daily-pulse artifact days or 1 clean Friday-deep Friday artifact, plus at least 1 decision-grade accepted signal by default. A week with clean plumbing but zero decision-grade X evidence remains `hold_manual_review`, not an enablement candidate. Friday-deep artifacts from non-Friday runs are held out of approval.
- The active Codex automation prompts for `grok-x-scout-artifact-week-review` and `grok-x-scout-friday-deep-artifact-review` now report decision-grade accepted counts, artifact identity mismatch days, write-mode evidence days, missing no-write-evidence days, summary-count mismatch days, browser-smoke proof, and whether human approval is still required.
- Current daily-pulse dry-run artifact after the stricter gate: 1 clean artifact day, 3 accepted signals, 2 decision-grade accepted signals, 0 rejected, 0 parse failures, fresh price context, 0 accepted unlisted handles after admitting observed prairie commodity-org handle `SaskWheat` as tier3, 0 write-mode artifact days, 0 missing no-write-evidence days, 0 summary-count mismatch days, 0 artifact identity mismatch days, and 0 schedule mismatch days. A later same-day quiet dry-run returned 0 signals and remains retained for audit, but the reviewer keeps the better 3-signal no-write artifact for gate evidence. Verdict remains `insufficient_artifacts` until 5 clean daily-pulse artifact days exist. Current Friday-deep gate is `insufficient_artifacts` with 0/1 clean Friday artifacts.
- Production `grok-x-scout-daily --write`, `grok-x-scout-friday-deep --write`, and `daily-thesis-review --write` remain unregistered/disabled and code-gated by both the approval phrase and a candidate artifact-week review for the matching mode until the manual artifact week passes. Daily-pulse evidence cannot approve the Friday-deep writer.
- If a write-mode Codex automation is pre-staged as paused, readiness now verifies the expected schedule, Bushel Board workspace, approval phrase, dry-run-disable prerequisite, and no-retired-pipeline prompt guardrails before treating it as safe. Active write-mode manifests remain a manual hold before matching-mode human approval.
- `npm run track54:readiness` is the consolidated no-write operator gate. It now runs browser smoke, feeds `scratch/track54-browser-smoke/browser-smoke-proof.json` to the readiness builder, writes `scratch/track54-readiness/latest-readiness-report.json`, and combines daily-pulse and Friday-deep artifact reviews, mode-scoped promotion briefs, local Codex automation manifest checks, artifact automation coverage, Grok CLI preflight proof, weekday/Friday artifact health-check proof, Mon-Fri evidence/promotion heartbeat proof, write-mode automation negative proof, post-approval dry-run/write-mode handoff proof, live source-freshness proof, focused Track 54 acceptance tests, browser-smoke completion proof, database/RLS migration contract proof, artifact-gate date projection, and the plan acceptance criteria into one JSON report. `npm run track54:readiness:build` rebuilds from the default existing proof; custom proof paths should call `npx tsx scripts/build-track54-readiness-report.ts --browser-smoke-proof <path> --out <path>` directly. The heartbeat summary carries local review date/type, review modes to inspect, selected artifact hash/path, write-mode proposal IDs, post-approval transition, next eligible run due statuses, readiness/browser proof freshness status, and browser-smoke proof age/freshness per mode when reviewed artifacts exist; use `npm --silent run track54:heartbeat-summary` when a machine-readable JSON stream is needed. The smoke proof rejects rendered forbidden terms with whole-word matching for parked grains and trading/advice wording, readiness rejects browser proof missing `generated_at` or older than six hours when the report is generated, and heartbeat summary also reports if that proof ages out after the report was written. Both active Grok dry-run Codex automations now refresh readiness through `npm run track54:readiness -- --out scratch/track54-readiness/latest-readiness-report.json --browser-smoke-proof-out scratch/track54-browser-smoke/browser-smoke-proof.json` after their mode-specific artifact review, so daily and Friday automation reports include and persist `persisted_report_path`, `overall_status`, `acceptance_audit.overall_status`, `acceptance_audit.grok_runner_proof`, focused acceptance-test proof, `acceptance_audit.browser_smoke_proof`, `browser_smoke_clean`, `selected_artifacts`, projected next eligible artifact dates and due statuses, artifact automation coverage, write-automation safety, post-approval handoff proof, database/RLS migration proof, and completion blockers without enabling writes. Promotion briefs and readiness mode gates now include proposed Codex write-mode automation specs for `grok-x-scout-daily`, `daily-thesis-review`, and `grok-x-scout-friday-deep`; those specs are registration inputs only after Kyle approval and after the matching dry-run artifact collector is disabled. Current live verdict is `overall_status = hold_manual_review` with `acceptance_audit.overall_status = hold_manual_review`: Grok CLI preflight is proven but credentials are missing, focused acceptance tests pass, fresh browser smoke is proven, daily-pulse has 2/5 clean artifact days with 4 accepted and 3 decision-grade accepted signals, Friday-deep has 0/1, all expected no-write/price Codex automation manifests and the thread evidence/promotion heartbeat are active with exact schedules and required prompt boundaries, workspace jobs point at the Bushel Board repo in `cwds`, the heartbeat is thread-targeted, projected artifact dates are covered by the active dry-run Codex automations, dry-run/health-check/heartbeat prompts are checked for forbidden explicit write-mode command fragments, promotion handoff requires disabling matching dry-run collectors before registering write-mode routines, the three proposed write-mode Codex manifests are required to be missing or inactive, and `production_writes_enabled` remains `false`. The manifest audit now fails old dry-run-only Grok prompts that omit `npm run track54:readiness`, `--browser-smoke-proof-out`, `--out`, `acceptance_audit.overall_status`, `acceptance_audit.browser_smoke_proof`, `browser_smoke_clean`, `persisted_report_path`, or `completion_blockers`; it fails health-check prompts that omit the exact no-write retry commands and persisted readiness handoff; it fails heartbeat prompts that omit `npm --silent run track54:heartbeat-summary`, `selected_artifacts`, selected artifact hash/path reporting, post-approval transition, write-mode proposal IDs, `next_eligible_run_statuses`, `report_freshness_status`, `browser_smoke_proof_freshness_status`, browser-smoke proof freshness fields, thread target, or the no-write/human-approval boundaries; it fails dry-run, health-check, or heartbeat prompts containing explicit `--write` command fragments; it fails schedule drift away from the expected 3:45 PM price, 4:10 PM daily-pulse, Mon-Thu 4:45 PM health-check, Friday 4:50 PM deep-scan, Friday 5:15 PM final health-check, and Mon-Fri evidence/promotion review timing; it fails manifests pointed at the wrong working directory; it fails projected artifact dates not covered by active dry-run automation; and it fails any active write-mode Codex manifest before matching-mode human approval.
- `npm run track54:artifact-health` is the deterministic health-check entrypoint for the live health-check automations. It reports same-day artifact validity, selected artifact hash/path, accepted and decision-grade counts, price freshness, retry reasons, retry command results, and readiness refresh status; it retries only missing or structurally invalid no-write artifacts, not a clean artifact that merely lacks enough days to satisfy the promotion gate.
- Track 54 scout and artifact-review defaults use the `America/Edmonton` automation calendar, not UTC. Late-evening Mountain-time operator checks therefore keep the current local run date in the review window and project the next local weekday dry-run instead of skipping it after UTC midnight.
- `/thesis?audit=1` now shows accepted-signal allowed/blocked claims and run-level rejected-signal reason summaries from `x_scout_runs.metadata.rejection_reasons`, so audit mode can explain both accepted and rejected X evidence instead of showing only rejected counts.
- Accepted X signal writes now persist controlled `affected_decisions` derived from category, classified seasonal phase, and direction. The writer also includes the primary grain in `affected_grains`, dedupes `affected_regions`, and validation rejects otherwise valid signals that omit affected-region evidence.
- X signal validation now enforces the intended search windows: daily pulse accepts only same-day/previous-day posts, Friday deep accepts only posts within seven days, and future-dated posts are rejected.
- X signal metadata now includes the required `corroboration` object. Numeric claims are accepted only when they are explicitly flagged for official verification; Grok cannot mark a numeric X claim as self-verified.
- Friday bundles, daily review trajectory evidence, `/thesis?audit=1`, and CAD/US desk prompts now preserve corroboration plus allowed/blocked/official-verification metadata, keeping unverified X claims as review leads instead of thesis facts.
- CAD/US Friday desk prompts now have executable contract tests requiring the accepted X bundle command, required signal metadata, X-as-untrusted-evidence language, official-source/price precedence, `llm_metadata.x_signal_bundle_audit`, Viking knowledge, and explicit "Grok never writes/ranks/authors" boundaries.
- Friday X bundles now drop current-week rows that lack the desk evidence seal: post URL, post date, source tier, affected-region context, allowed/blocked claim arrays, explicit verification flag, and valid corroboration when present. Legacy rows missing only the newer corroboration block are normalized to `0` matching claims / no official match so the Friday desk can see them only as uncorroborated review leads. Bundle counts now separate desk-ready accepted signals from `excluded_missing_evidence` rows and `legacy_missing_corroboration` rows.
- Friday X bundles now attach scout-run provenance only when the latest matching run has the requested bundle mode, so a `friday_deep` desk packet cannot inherit rejected-count context from a newer `daily_pulse` run.
- Friday bundle signals now carry their own `scout_run_id` and `search_mode`, preserving per-signal chain of custody even when the bundle-level run context is null or from a different mode.
- Daily thesis review now creates soft trajectory decisions only from accepted `search_mode = pulse` signals that carry a `scout_run_id`; Friday-deep or legacy/provenance-missing X rows cannot become weekday trajectory ticks.
- Friday X bundle week resolution now picks the newest CGC crop year before the highest grain week. This prevents prior-year week 52 rows from hiding current-year accepted X signals, and older accepted rows with empty `affected_decisions` receive deterministic derived decision tags at read time.
- The xAI API fallback now loads `.env.local`, searches every trusted-handle batch instead of only the first 20-handle group, and merges/dedupes strict scout outputs before validation. This keeps the fallback production-shaped if Grok CLI auth becomes brittle.
- The retired Grok/xAI thesis-writing boundary now has executable regression proof: `/api/pipeline/run` GET/POST must return HTTP 410, and the shared Supabase Edge Function `requireV1Enabled()` gate must ignore the removed `ALLOW_V1_GROK` escape hatch.

## Acceptance Criteria

The feature is complete when:

- Daily official source collectors still work.
- Daily price collector runs before daily analysis.
- Active no-write Codex automations cover price refresh, daily-pulse dry-run evidence, Friday-deep dry-run evidence, artifact health checks, and the Mon-Fri thread evidence/promotion heartbeat.
- Grok CLI runner preflight succeeds before scheduled X scout dry-runs depend on it.
- Grok daily scout produces raw artifacts and accepted/rejected counts.
- Grok cannot directly publish thesis rows.
- Production Grok write-mode Codex automations remain missing or inactive until the matching artifact gate is candidate-ready and Kyle explicitly approves promotion.
- Promotion briefs require disabling the matching dry-run artifact collector before registering write-mode routines.
- Accepted X signals have timestamps, post URLs, source tiers, staleness classes, affected grains, affected regions, affected decisions, and blocked/allowed claims.
- Codex/Claude daily review can incorporate accepted X signals and prices into bounded soft updates.
- Friday swarms consume the accepted X bundle, price context, source packets, and Viking knowledge.
- `/thesis` clearly separates weekly thesis from daily X Pulse Watch.
- Audit mode proves why a signal was accepted or rejected.
- Browser smoke for `/thesis`, `/thesis?audit=1`, and `/overview` is fresh and clean.
- `npm run track54:readiness` reports `ready_for_completion_review`; `blocked_by_artifact_gates` is not complete.
- The old Grok pipeline remains tombstoned.

## Risk Register

| Risk | Severity | Mitigation |
|---|---:|---|
| Grok CLI auth expires or requires browser interaction | High | Readiness runs `grok --version` preflight; keep xAI API `x_search` as fallback runner. |
| Grok returns prose instead of JSON | High | Strict parser rejects run; no writes. |
| X chatter outranks official data | High | X Pulse is separate; daily deltas bounded; Friday decides. |
| False X rumor creates public embarrassment | High | Accepted signals require source URL, tier, timestamp, and blocked/allowed claims. |
| Price data stale but daily review still reacts | High | Price freshness gate blocks price-based deltas. |
| Canola/Spring Wheat price scrape is fragile | Medium | Keep provisional labels; move to Barchart OnDemand when key exists. |
| Too many daily signals create noise | Medium | Cap display and reviewer packet; store rejected counts for tuning. |
| User tries to add another integration mid-build | Medium | Stop and justify against this v1 plan before adding it. |

## Implementation Sequence For New Session

Start in this order:

1. Verify Grok install/auth.
2. Add `collect:prices` wrapper and watchdog check.
3. Add `x_scout_runs` table.
4. Extend `x_market_signals`.
5. Build deterministic signal contract/validation.
6. Build Grok scout dry-run runner.
7. Run one manual Grok scout dry run.
8. Add daily review packet dry run.
9. Add UI X Pulse panel.
10. Only then schedule daily automation.

Do not start with UI. The data boundary has to be boring before farmers see it.

## Sources Used

- xAI Grok Build Getting Started: `https://docs.x.ai/build/overview`
- xAI Grok Build Headless and Scripting: `https://docs.x.ai/build/cli/headless-scripting`
- xAI X Search tool docs: `https://docs.x.ai/developers/tools/x-search`
- xAI Grok Website / Apps FAQ: `https://docs.x.ai/grok/faq`
- Current Bushel Board handoffs and truth files listed in this session.
