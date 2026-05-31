# Bushel Board fresh-session handoff — 2026-05-31

Created: 2026-05-31
Repo: `/mnt/c/Users/kyle/Agriculture/bushel-board-app`
Branch: `codex/data-layer-foundation-v1`
HEAD observed at handoff start: `7e431ec`

## Read first

1. `PROJECT_STATE.md`
2. `docs/plans/STATUS.md`
3. This handoff
4. `docs/plans/2026-05-28-transparent-thesis-rating-model-v1.md` if continuing rating-model implementation
5. `docs/reference/thesis-rating-model-v1.md` for scorecard/rating-model rules

Older handoffs are historical. `docs/plans/2026-05-28-bushel-board-live-run-handoff.md` is superseded for current task selection and should only be used for collector/live-run history.

## Current verified product scope

Public V1 board scope is source-backed rows only:

- Corn
- Soybeans
- Wheat
- Durum / Amber Durum
- Canola
- Barley
- Oats

Explicit exclusions unless Kyle redirects:

- Spring Wheat and Winter Wheat are parked off public board surfaces until class-safe source mapping is admitted.
- Peas, Lentils, Flaxseed, Rye, Mustard Seed, Canaryseed, Chick Peas, Sunflower, Beans, smaller CGC labels, US rice/cotton, global commodity boards, and Kalshi are out of this V1 pass.
- Do not add UI-side Export Sales/WASDE projection inference for Barley/Oats. Projection pace must remain importer-admitted and guardrailed.

## What was fixed in the 2026-05-31 blocker pass

### 1. Proxy/weather source-claim guardrail

Files:

- `lib/queries/thesis-board.ts`
- `lib/__tests__/thesis-board.test.ts`

Result:

- Crop-progress evidence no longer presents as direct weather evidence when `weather_cache` is absent/stale.
- Proxy/independent crop-progress wording and confidence behavior are explicit.
- Focused thesis tests pass.

### 2. Price quality admission gate

Files:

- `lib/queries/thesis-board.ts`
- `lib/__tests__/thesis-board.test.ts`

Result:

- Stale `grain_prices` no longer create price drivers.
- Barchart latest-only rows are labeled provisional, low-confidence, and explicit about missing volume/open interest.

### 3. Thesis cache V1 hard gate

Files:

- `scripts/refresh-thesis-packet-cache.ts`
- `supabase/migrations/20260531150802_hard_gate_thesis_packet_cache_v1.sql`

Live Supabase migration applied:

- `hard_gate_thesis_packet_cache_v1`

Result:

- Cache refresh defaults/prunes to source-backed V1 rows.
- Cached board read path is hard-gated too.
- Live `thesis_packet_cache` was refreshed/pruned to 12 source-backed packets:
  - Canada: Amber Durum, Barley, Canola, Corn, Oats, Soybeans, Wheat
  - US: Barley, Corn, Oats, Soybeans, Wheat

### 4. `prediction_scorecard` RLS

Files:

- `supabase/migrations/20260531151200_enable_prediction_scorecard_rls.sql`

Live Supabase migration applied:

- `enable_prediction_scorecard_rls`

Result:

- RLS is enabled on `public.prediction_scorecard`.
- `anon` and `authenticated` have read-only access via policy `prediction_scorecard_public_read`.
- Public write privileges were removed.
- `service_role` write path was retained.

### 5. Lint/build regressions and V1 overview leakage

Files touched during cleanup include:

- `app/api/cron/import-cgc/route.ts`
- `components/bushy/bushy-chat.tsx`
- `components/dashboard/grain-storage-card.tsx`
- `components/dashboard/seeding-drill-panel.tsx`
- `components/dashboard/seeding-scrubber.tsx`
- `components/dashboard/spring-wheat-pulse-map.tsx`
- `components/dashboard/unified-market-stance-chart.tsx`
- `components/layout/cgc-freshness.tsx`
- `eslint.config.mjs`
- `lib/queries/overview-data.ts`
- `lib/us-market-context.ts`

Result:

- `npm run lint` has 0 errors. Existing warnings remain.
- `npm run build` passes.
- `/overview` no longer leaks smaller Canada crops through raw `ALL_GRAINS`; it uses an explicit V1 allowlist.

## Verification recorded from the blocker pass

- Focused thesis tests passed.
- `npm run lint` passed with 0 errors / 68 warnings.
- `npm run build` passed.
- Local browser smoke with served production app on port 3010:
  - `/overview?verify=1`: loaded, clean console, forbidden crop DOM probe returned `[]`.
  - `/thesis?verify=1`: loaded, clean console, forbidden crop DOM probe returned `[]`; source packet count showed 12.

Full-suite caveat:

- `npm test -- --run` and `npm test -- --run --pool=threads --testTimeout=60000` still hang/not-exit as an all-files Vitest process.
- Individual/focused tests pass, including the slow forecast manual-runner when isolated.
- Treat this as open-handle/test-runner debt, not as evidence of a thesis/cache/RLS regression.

## Working-tree caution

This checkout has unrelated modified/untracked files from earlier work. Stage intentionally.

Known current-lane docs that should be kept with the checkpoint if still untracked:

- `docs/plans/2026-05-28-transparent-thesis-rating-model-v1.md`
- `docs/reference/thesis-rating-model-v1.md`

Known unrelated/scratch files to keep out unless explicitly needed:

- `docs/plans/2026-05-27-x-signal-valuation-guardrail-framework.md`
- `scratch/`

## Next best move

1. Re-run focused thesis tests, lint, and build if the checkpoint is being committed from a fresh shell.
2. Commit/push a focused blocker-fix checkpoint, preserving unrelated scratch.
3. Continue the transparent thesis rating model from `docs/plans/2026-05-28-transparent-thesis-rating-model-v1.md`, starting at the next incomplete task shown by code inspection. Do not broaden source scope first.
4. If time is spent on test infrastructure, isolate the full Vitest hang as its own task.

## Pasteable continuation prompt

Continue Bushel Board from `/mnt/c/Users/kyle/Agriculture/bushel-board-app` on branch `codex/data-layer-foundation-v1`. Read `PROJECT_STATE.md`, `docs/plans/STATUS.md`, and `docs/plans/2026-05-31-bushel-board-fresh-session-handoff.md` first. Preserve unrelated dirty files and inspect `git diff --stat` before staging. Current verified V1 public board scope is source-backed rows only: Corn, Soybeans, Wheat, Durum/Amber Durum, Canola, Barley, Oats. Spring/Winter Wheat and smaller Canada crops are parked/excluded unless Kyle redirects. Live Supabase has thesis cache hard-gated/pruned to 12 packets and `prediction_scorecard` RLS fixed as public read-only/service-role write. Verification passed: focused thesis tests, lint 0 errors, production build, and local browser DOM probes for `/thesis` and `/overview`; full Vitest all-files still hangs as separate test-runner debt. Next best implementation lane is the transparent thesis rating model plan, not scope expansion.
