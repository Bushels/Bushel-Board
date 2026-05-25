# Bushel Board Handoff — 2026-05-21

## Repo / Branch

- Repo: `/mnt/c/Users/kyle/Agriculture/bushel-board-app`
- Branch: `codex/data-layer-foundation-v1`
- Remote: `origin/codex/data-layer-foundation-v1`
- Latest pushed commit at handoff: `ad2121f docs: add US thesis data spine research notes`

## What was completed in this session

### 1. Thesis board freshness fix

Committed earlier as:

- `18720b8 Fix thesis board source freshness snapshot`

Important behavior now in place:

- `/thesis` separates packet source watermark from latest live source run.
- Cache freshness now becomes stale if newer successful/partial live source runs exist after the packet watermark.
- Watch-source summary counts unique watch sources instead of duplicated source appearances across packet lanes.
- Optional farmer-local empty sources (`posted_prices`, `crop_plans`, `weather_cache`) are treated as info, not public-thesis blockers.
- Focused tests/build passed before commit:
  - `npx vitest run lib/__tests__/thesis-board.test.ts lib/__tests__/kalshi-commodity-markets.test.ts --pool=threads --reporter=dot`
  - scoped ESLint on changed thesis files
  - `npm run build`

Cache state verified after refresh:

- Cached packet count: 21
- Cache generated at: `2026-05-21T17:56:44Z`
- Packet source watermark: `2026-05-21T12:46:08Z`
- Latest live source run: `2026-05-21T12:46:08Z`
- Status at verification: fresh

### 2. Grok 4.3 agent role clarified

Recommendation captured in skill/memory:

- Use Codex for repo edits, tests, PR-quality implementation.
- Use Claude Automation / Claude Code for scheduled structured first-pass analysis and source collection orchestration.
- Use Hermes with Grok 4.3 + Grok search as the final large-context market synthesis / contradiction-hunting / authorization layer.
- Treat Grok 4.3 as the final committee chair, not the default code-editing worker, unless its tool path is proven for the repo task.

Suggested Bushel Board thesis workflow:

1. Claude Automation creates first thesis packet.
2. Codex app creates a second independent analysis / implementation pass.
3. Hermes runs Grok 4.3 with Grok search over both outputs, source freshness/watermarks, and Viking knowledge snippets.
4. Grok produces final authorized stance, confidence, and “what would change my mind” triggers.

### 3. Documentation committed

Committed and pushed:

- `ad2121f docs: add US thesis data spine research notes`

Files included:

- `docs/plans/2026-05-18-late-planting-video-research-pack.md`
- `docs/reference/us-thesis-data-spine.md`

Reasoning:

- Safe docs/research-only commit.
- Useful for US data-spine and video/research continuity.
- No runtime risk.

## Current uncommitted files

At handoff, these files remain untracked and intentionally uncommitted:

```text
?? lib/queries/us-data-freshness.ts
?? lib/queries/us-quarterly-stocks.ts
?? scripts/generate-usda-crop-progress-infographic.ts
?? scripts/import-usda-quarterly-stocks.ts
?? supabase/migrations/20260518115309_create_usda_quarterly_stocks.sql
```

Do not blindly commit these as-is.

### Why they were left uncommitted

They are a partial Tier 1 US data-spine / quarterly-stocks scaffold, not a complete production slice.

Specific issues:

- `scripts/import-usda-quarterly-stocks.ts` has a stub parser:
  - `parseUSDAQuarterlyStocksCSV() is a stub. Implement real parsing.`
- `lib/queries/us-quarterly-stocks.ts` depends on `public.usda_quarterly_stocks`.
- `supabase/migrations/20260518115309_create_usda_quarterly_stocks.sql` has not been applied remotely.
- Supabase live schema currently does not list `public.usda_quarterly_stocks`.
- Supabase applied migrations do not include `20260518115309_create_usda_quarterly_stocks`.
- ESLint passed with warnings only, but warnings show WIP smell:
  - unused `fs`, `path`, `filePath` in quarterly-stocks importer
  - unused format helpers in `scripts/generate-usda-crop-progress-infographic.ts`

## Recommended next task

Start the next session by completing the US quarterly-stocks data-layer slice, or explicitly park/delete the scaffold.

Recommended implementation order:

1. Re-check working tree:
   - `git status --short --branch`
2. Inspect untracked files before edits:
   - `lib/queries/us-data-freshness.ts`
   - `lib/queries/us-quarterly-stocks.ts`
   - `scripts/import-usda-quarterly-stocks.ts`
   - `supabase/migrations/20260518115309_create_usda_quarterly_stocks.sql`
3. Decide whether quarterly stocks is in V1 scope now.
   - If yes: finish the slice properly.
   - If no: remove or park the scaffold so it does not linger as misleading production code.
4. If finishing the slice:
   - Apply/fix the migration intentionally.
   - Add read policy intentionally, likely public/anon read if it feeds public thesis board, but verify project convention first.
   - Implement a real importer or clearly rename it as a scaffold/dev-only script.
   - Add tests for freshness and quarterly-stocks helper behavior.
   - Wire into thesis packet only after the table exists and data is loaded.
5. Validate with scoped tests, scoped ESLint, and build if runtime files are touched.
6. Commit as a coherent data-layer slice only after the table/importer/query helper are not misleading.

## Validation notes from this handoff

Commands already run while classifying uncommitted files:

```bash
npx eslint docs/plans/2026-05-18-late-planting-video-research-pack.md docs/reference/us-thesis-data-spine.md lib/queries/us-data-freshness.ts lib/queries/us-quarterly-stocks.ts scripts/generate-usda-crop-progress-infographic.ts scripts/import-usda-quarterly-stocks.ts
```

Result:

- Exit code 0.
- Markdown ignored by ESLint config.
- TypeScript warnings only, no errors.

Full TypeScript check was also run:

```bash
npx tsc --noEmit --pretty false
```

Result:

- Failed due to existing unrelated repo test/type debt, not clearly caused by the untracked files.
- Examples of unrelated failures:
  - seeding test fixtures missing new `SeismographRow` fields
  - `forecast-experiments-cgc-historical-replay-artifact.test.ts` unknown typing
  - overview test fixture missing `seed_kt`
  - weather cache/noaa test tuple/undefined typing

Do not treat full `tsc` failure as proof the untracked files are bad; but do not use it as proof they are ready either.

## Supabase state / warning

Supabase project ref from memory:

- `ibgsloyjxdopkvwqcqwh`

Live Supabase table list at handoff did not include:

- `public.usda_quarterly_stocks`

Applied migrations at handoff did not include:

- `20260518115309_create_usda_quarterly_stocks`

Security advisory surfaced by Supabase MCP:

- `public.prediction_scorecard` has RLS disabled.
- This is a real security issue because anon/authenticated roles may have broad access depending grants/policies.
- Do not blindly run the remediation without policies, because enabling RLS without matching policies can break app reads/writes.

Starting remediation SQL only:

```sql
ALTER TABLE public.prediction_scorecard ENABLE ROW LEVEL SECURITY;
```

Next session should decide correct read/write policies before applying.

## Current product discipline reminders

- V1 grain scope: Corn, Soybeans, Wheat, Spring Wheat, Winter Wheat, Durum, Canola, Barley, Oats.
- Exclude smaller grains/pulses/flax unless Kyle redirects.
- Quick scan first, reasoning second on `/thesis`.
- Do not delete weak/watch sources just to reduce warnings; classify and fix source health instead.
- Treat public thesis as scouting-quality until source freshness, core public source health, and compound signals are stronger.
- Viking L2 is local-only; never commit distilled local knowledge files.

## Skills / references to load next session

Load these before continuing:

- `grain-market-thesis-dashboard`
- `github-pr-workflow` if committing/pushing
- `systematic-debugging` if tracing data quality or source freshness
- `test-driven-development` if finishing quarterly-stocks data layer

Useful in-repo docs now committed:

- `docs/reference/us-thesis-data-spine.md`
- `docs/plans/2026-05-18-late-planting-video-research-pack.md`

## Suggested next-session opening prompt

```text
Continue Bushel Board from docs/handoffs/2026-05-21-bushel-board-session-handoff.md. First classify the uncommitted quarterly-stocks/data-freshness scaffold, then either finish it as a tested data-layer slice or park it. Do not commit the scaffold until it is production-safe.
```
