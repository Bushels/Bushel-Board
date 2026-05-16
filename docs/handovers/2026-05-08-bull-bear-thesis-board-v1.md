# Bull/Bear Thesis Board V1 Handover

**Date:** 2026-05-08
**Branch:** `codex/data-layer-foundation-v1`
**Goal:** Build a working Bull/Bear Thesis tab that reads current Canada and US source facts, updates as collectors land data, and avoids legacy Grok/grain-intelligence rows as current thesis text.

## Completed

- Added `/thesis` as a dashboard route.
- Added desktop and mobile nav links for Thesis.
- Built `lib/queries/thesis-board.ts` to read cached Canada and US thesis packets.
- Added `lib/__tests__/thesis-board.test.ts` with 8 tests for packet normalization, freshness warnings, stance labels, and empty-state behavior.
- Added Supabase migration `20260509033204_add_thesis_packet_cache.sql`.
- Added `scripts/refresh-thesis-packet-cache.ts` and `npm run refresh-thesis-cache`.
- Warmed the live cache with 21 packets: 16 Canada grains and 5 US markets.
- Added `scripts/run-collector-with-thesis-cache-refresh.ts`.
- Added `npm run collect:*` wrappers for CGC, crop progress, Grain Monitor, export sales, Producer Cars, CFTC COT, and WASDE.
- Updated collector docs so successful mechanical imports refresh `thesis_packet_cache`.
- Updated the repo-local Gemini collaboration skill with the code-audit workflow learned during this pass.

## Current Data Path

```text
source collector
  -> source table / source_runs
  -> Canada or US thesis packet RPC
  -> refresh-thesis-cache
  -> thesis_packet_cache
  -> get_thesis_board_cached()
  -> /thesis
```

The `/thesis` page renders facts, not generated prose. It uses packet metrics and source provenance to produce bull/bear evidence blocks and freshness warnings.

## Supabase State

- Applied live: `20260508171450_add_oats_cftc_portfolio_mapping.sql`.
- Applied live: `20260509033204_add_thesis_packet_cache.sql`.
- `get_thesis_board_cached()` returned 21 cached packets after warmup.
- Cache warmup status after the latest run was `skipped` because the cache watermark was already current.

## Gemini Review

Gemini 3.1 Pro Preview audited `scripts/run-collector-with-thesis-cache-refresh.ts`.

Applied feedback:
- Narrow Windows shell handling for `tsx`, `npx`, `npm`, other JS shims, `.cmd`, and `.bat`.
- Avoid broad `shell: true` because it breaks quoted ordinary child commands.
- Detect `--dry-run=true` as a dry-run.
- Label failed child-process starts.
- Document wrapper option ordering.
- Document that refresh failure exits non-zero and external schedulers may retry the full collector.

Gemini package-level audit timed out with no usable output. Treat the completed single-file audits as useful second opinion, not as a full release gate.

## Problems Seen

- `npm run collect:cgc -- --dry-run` did not reliably forward `--dry-run` in the Windows runner.
- Direct wrapper dry-runs worked, and importer-specific dry-run commands remain the reliable dry-run path.
- A broad Windows shell fix caused quoted `node -e` arguments to break; fixed by applying shell handling only to known shim commands.
- If the collector succeeds but cache refresh fails, the wrapper exits non-zero. That is intentional so stale thesis cache is visible, but external schedulers may retry the whole collector. Keep collectors idempotent.
- Barchart OnDemand remains paused until `BARCHART_ONDEMAND_API_KEY` exists.
- Gemini 3.1 Pro Preview can hit capacity/timeouts; do not block release on missing Gemini output if normal tests and direct audits pass.

## Verification Completed

- `npm run test -- thesis-board`: 8 passed.
- `npm run build`: passed.
- Wrapper help path: passed.
- Direct `tsx` child command: passed.
- Direct dry-run skip: passed.
- Explicit `.cmd` child command: passed.
- Missing-command diagnostics: passed.
- Success-path wrapper run triggered `refresh-thesis-cache`: passed.
- `npm run refresh-thesis-cache`: returned current cache with 16 Canada + 5 US packets.

## Where This Leaves Off

2026-05-16 update: the old release-mechanics note below is superseded for the next session. The active continuation point is now `docs/plans/2026-05-16-bullish-bearish-major-grains-next-session.md`: first major-lane scope only (Corn, Soybeans, Wheat, Spring Wheat, Winter Wheat, Durum, Canola, Barley, Oats), Kalshi parked, pulses/flax/minor grains excluded, USDA export sales current through `2026-05-07`, and thesis cache force-refreshed to 21 rows.

- Commit, push, and Vercel deploy are the remaining release mechanics for this wrap-up.
- After deploy, verify `/thesis`, `/overview`, and `/seeding` from the deployed URL.
- Point scheduled collector routines to the new `npm run collect:*` wrappers.
- Keep legacy Grok routes tombstoned; do not reattach `/api/pipeline/run`.
- Build the Claude/Codex farm-summary replacement before promising fresh personalized summaries.

## Key Files

- `app/(dashboard)/thesis/page.tsx`
- `lib/queries/thesis-board.ts`
- `lib/__tests__/thesis-board.test.ts`
- `supabase/migrations/20260509033204_add_thesis_packet_cache.sql`
- `scripts/refresh-thesis-packet-cache.ts`
- `scripts/run-collector-with-thesis-cache-refresh.ts`
- `docs/reference/collector-task-configs.md`
- `.agents/skills/gemini-collab/SKILL.md`
