# Bushel Board handover — 2026-05-29

## Resume instruction for new session

Open the repo and continue Bushel Board transparent thesis rating work from Task 7.

```bash
cd /mnt/c/Users/kyle/Agriculture/bushel-board-app
git checkout codex/data-layer-foundation-v1
git status --short
git log --oneline -8
```

Important: there are unrelated local modifications in this working tree. Do not overwrite or stage them unless the user explicitly asks.

## Branch / repo

- Repo: `/mnt/c/Users/kyle/Agriculture/bushel-board-app`
- Branch: `codex/data-layer-foundation-v1`
- Remote pushed through latest Task 6 commit.
- Push command that works from WSL:

```bash
git -c credential.helper='/mnt/c/Program\ Files/Git/mingw64/bin/git-credential-manager.exe' push
```

## Current git state after Task 5

Latest pushed commits:

```text
7070bef feat: attach thesis rating scorecards to board items
8bb5463 feat: map thesis packets to rating domains
d7cafdf feat: aggregate thesis domain scorecards
08783e6 feat: add thesis rating domain weights
bdd6a4f feat: add thesis source quality adjustments
465d747 feat: add thesis rating scorecard contract
```

Unrelated existing local changes still present and intentionally preserved:

```text
M PROJECT_STATE.md
M docs/reference/data-lineage-map.md
M docs/reference/source-registry.md
M lib/__tests__/thesis-board.test.ts
M lib/queries/thesis-board.ts
?? docs/plans/2026-05-27-x-signal-valuation-guardrail-framework.md
?? docs/plans/2026-05-28-transparent-thesis-rating-model-v1.md
?? docs/reference/thesis-rating-model-v1.md
```

This handover note itself is new:

```text
?? docs/plans/2026-05-29-bushel-board-handover.md
```

## Work completed in this run

### Task 4 — score aggregation helper

Committed and pushed:

```text
d7cafdf feat: aggregate thesis domain scorecards
```

Files changed:

- `lib/thesis/rating-model.ts`
- `lib/__tests__/thesis-rating-model.test.ts`

Implemented:

- `buildRatingScorecard(input)`
- `isRequiredSourceMissing(domain)`
- `findContradictions(domains)`
- `findDuplicateActiveDomains(domains)`

Key behavior:

- Aggregates domain scores using Canada/US/cross-border V1 weights.
- Applies source-quality score multipliers and confidence adjustments.
- Detects missing required source domains.
- Zeroes required source domains with no rows/sources/freshness.
- Emits insufficient-data flags such as:
  - `insufficient_data:required_source_missing:demand`
- Detects contradiction pairs across high-confidence opposing domains.
- Rejects unsupported grains like Spring Wheat and Winter Wheat at scorecard input validation.
- Keeps farmer-facing score deterministic; LLM can explain/audit but cannot invent rating.

Focused verification after Task 4:

```bash
npx vitest run lib/__tests__/thesis-rating-model.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node
```

Result at the time:

```text
32 tests passed
```

### Task 5 — deterministic domain packet mappers

Committed and pushed:

```text
8bb5463 feat: map thesis packets to rating domains
```

Files created:

- `lib/thesis/rating-domain-mappers.ts`
- `lib/__tests__/thesis-rating-domain-mappers.test.ts`

Exports:

```ts
mapCanadaPacketToDomainInputs(packet)
mapUsPacketToDomainInputs(packet)
```

Implemented behavior:

- Canada packet mapper:
  - strong current-week exports + process deliveries -> positive demand domain.
  - high producer deliveries + weak exports/process -> negative movement domain.
- US packet mapper:
  - admitted `export_pace_pct > 100` -> positive demand domain.
  - does not recompute export pace from commitments/projection fields.
  - null `export_pace_pct` -> score `0` plus blocked claim:
    - `export_projection_pace_unavailable`
  - poor crop condition during April-November active crop-progress relevance window -> positive weather-risk domain.
  - January/off-season crop condition does not create a live weather-risk score.

Review notes:

- First spec review caught gaps:
  - export pace threshold was initially `>=102` instead of `>100`.
  - crop-progress relevance window was missing.
  - some numeric thresholds needed comments.
- All gaps fixed.
- Re-review results:
  - Spec: PASS
  - Code quality: APPROVED

Focused verification after Task 5:

```bash
npx vitest run lib/__tests__/thesis-rating-domain-mappers.test.ts lib/__tests__/thesis-rating-model.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node
```

Result:

```text
39 tests passed
```

Targeted lint also passed:

```bash
npx eslint lib/thesis/rating-domain-mappers.ts lib/__tests__/thesis-rating-domain-mappers.test.ts
```

### Task 6 — type-link rating scorecard into thesis board items

Committed and pushed:

```text
7070bef feat: attach thesis rating scorecards to board items
```

Files changed:

- `lib/queries/thesis-board.ts`
- `lib/__tests__/thesis-board.test.ts`
- `lib/__tests__/kalshi-commodity-markets.test.ts`

Implemented:

- `ThesisBoardItem` now carries `ratingScorecard: ThesisRatingScorecard` as parallel audit data.
- Canada board items build scorecards from `buildRatingScorecard()` + `mapCanadaPacketToDomainInputs()`.
- US board items build scorecards from `buildRatingScorecard()` + `mapUsPacketToDomainInputs()`.
- Existing `stanceScore`, `stanceLabel`, `confidence`, and `confidenceScore` remain in place; visible UI behavior is unchanged.
- US scorecard `period_anchor` uses the same fallback `marketYear` value as the board item.
- Kalshi thesis-board test fixtures now include a minimal scorecard so the stricter `ThesisBoardItem` type stays compatible.

Focused verification after Task 6:

```bash
npx vitest run lib/__tests__/thesis-board.test.ts lib/__tests__/thesis-rating-model.test.ts lib/__tests__/thesis-rating-domain-mappers.test.ts lib/__tests__/kalshi-commodity-markets.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node

npx eslint lib/queries/thesis-board.ts lib/__tests__/thesis-board.test.ts lib/__tests__/kalshi-commodity-markets.test.ts

npx tsc --noEmit --pretty false 2>&1 | grep -E "ratingScorecard|kalshi-commodity-markets|ThesisBoardItem"
```

Result:

```text
75 tests passed
eslint passed
no Task 6 typecheck matches for ratingScorecard / kalshi-commodity-markets / ThesisBoardItem
```

Spec review: PASS. Code quality re-review: APPROVED.

## Critical product/data context

Current CGC state:

- Official CGC CSV URL:
  - `https://www.grainscanada.gc.ca/en/grain-research/statistics/grain-statistics-weekly/2025-26/gsw-shg-en.csv`
- Latest official CGC source week available: `41`
- Source week ending: `2026-05-17`
- Expected but not yet available week: `42`
- Product should say something like:
  - `latest official CGC week available: 41, expected week 42 pending`
- Treat this as `expected_lag`, not a broken collector, until official source publishes week 42.

V1 supported thesis grains:

```text
Corn
Soybeans
Wheat
Durum
Canola
Barley
Oats
```

Parked / reject at rating input validation:

```text
Spring Wheat
Winter Wheat
```

Excluded until explicitly reopened:

```text
pulses, flax, rye, mustard, canaryseed, chickpeas, sunflower, beans, US rice/cotton, Kalshi/prediction-market thesis scoring, unadmitted social/weather/local-cash sources
```

## Important implementation constraints

- Use TDD. Write failing tests first, observe RED, then implement GREEN.
- Use subagent-driven development with two reviews:
  1. Spec compliance review.
  2. Code quality review.
- Preserve unrelated uncommitted changes.
- For pure thesis rating tests, use Node environment to avoid jsdom pool timeouts:

```bash
npx vitest run <test-files> --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node
```

- Floating point weight tests should use:

```ts
toBeCloseTo(1, 6)
```

not exact `toBe(1)`.

- Required source domains with no source rows, no sources, or empty freshness must be zeroed before scoring.
- Insufficient-data verdict should appear when any required source for the grain/lane combo is missing.
- Contradictions reduce confidence by 20 per contradiction.
- Do not add new data sources in Task 6; just attach scorecard audit data using current packet fields and mapper output.

## Next best move — Task 7

Task 7 from plan:

```text
Add audit UI for scorecard details on `/thesis?audit=1` only.
```

Objective:

- Expose scorecard audit detail without cluttering normal farmer view.
- Keep normal `/thesis` unchanged unless `audit=1` is present.
- Show enough scorecard detail for model/source audit, not farmer-facing polish yet.

Likely files:

- Modify: thesis page/component files that render comparison rows and detail cards.
- Modify/add: tests covering audit query behavior.

Task 7 should expose scorecard audit detail only in audit mode:

- overall score/label,
- confidence score/label,
- domain chips with score/weight,
- quality adjustment count,
- missing/blocked claims.

## Task 7 caution

There are still unrelated local modifications in:

- `lib/queries/thesis-board.ts`
- `lib/__tests__/thesis-board.test.ts`

Before editing Task 7, inspect these diffs carefully so you do not overwrite unrelated user/worktree changes:

```bash
git diff -- lib/queries/thesis-board.ts lib/__tests__/thesis-board.test.ts
```

If you edit those files, stage only the intended hunks for Task 7.

## After Task 6

Next tasks from plan:

- Task 7: Add audit UI for scorecard details on `/thesis?audit=1` only.
- Task 8: Add LLM consumption guardrails.

Task 7 should expose scorecard audit detail without cluttering normal farmer view:

- overall score/label,
- confidence score/label,
- domain chips with score/weight,
- quality adjustment count,
- missing/blocked claims.

## Final known-good commands

```bash
cd /mnt/c/Users/kyle/Agriculture/bushel-board-app

npx vitest run lib/__tests__/thesis-board.test.ts lib/__tests__/thesis-rating-model.test.ts lib/__tests__/thesis-rating-domain-mappers.test.ts lib/__tests__/kalshi-commodity-markets.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node

npx eslint lib/queries/thesis-board.ts lib/__tests__/thesis-board.test.ts lib/__tests__/kalshi-commodity-markets.test.ts
```

Known result from latest run:

```text
75 tests passed
eslint passed
```
