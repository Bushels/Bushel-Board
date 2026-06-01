# Transparent Thesis Rating Model V1 Implementation Plan

> **Status 2026-05-31:** Complete through Task 9 in this checkout. Keep this file as the implementation record and task contract; do not restart from Task 1 unless deliberately auditing or migrating the scorecard.

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build a transparent, deterministic scorecard layer that turns admitted Bushel Board source facts into auditable bull/bear domain scores before LLM thesis prose is written.

**Architecture:** Add a contract-first scorecard model in TypeScript, implement small deterministic domain scoring helpers, connect them to existing thesis packet builders, and expose the scorecard in audit/UI surfaces. Do not add new data sources. Do not let the LLM invent or mutate the numeric rating.

**Tech Stack:** Next.js 16, TypeScript, Vitest, Supabase RPC packets, existing `/thesis` board query helpers.

---

## Fixed Scope

V1 source-backed board lanes only:

- Corn
- Soybeans
- Wheat
- Durum
- Canola
- Barley
- Oats

Parked:

- Spring Wheat
- Winter Wheat, until class-safe source mapping exists.

Explicit exclusions:

- no new weather/satellite/local-cash/social/Kalshi source admission,
- no black-box model weights,
- no auto-publishing from LLM output,
- no replacement of existing thesis packets in the first implementation pass.

## Reference Contract

Read first:

- `docs/reference/thesis-rating-model-v1.md`
- `docs/reference/canonical-grain-fact-model.md`
- `docs/reference/source-registry.md`
- `docs/reference/cgc-market-mechanics-v1.md`
- `lib/queries/thesis-board.ts`
- `lib/__tests__/thesis-board.test.ts`

## Implementation Tasks

### Task 1: Add scorecard TypeScript contract

**Objective:** Create the typed shape for a transparent thesis scorecard with no scoring logic yet.

**Files:**
- Create: `lib/thesis/rating-model.ts`
- Test: `lib/__tests__/thesis-rating-model.test.ts`

**Step 1: Write failing tests**

Create `lib/__tests__/thesis-rating-model.test.ts` with tests for:

- label bands map scores to labels,
- score clamp keeps `overall_score` inside `-100..100`,
- confidence clamp keeps `confidence_score` inside `0..100`,
- parked Spring/Winter Wheat returns unsupported lane metadata.

**Step 2: Run test to verify failure**

Run:

```bash
npx vitest run lib/__tests__/thesis-rating-model.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because `lib/thesis/rating-model.ts` does not exist.

**Step 3: Implement minimal contract**

Create `lib/thesis/rating-model.ts` with:

- `RatingLane = "canada" | "us" | "cross_border"`
- `RatingDomainId = "supply" | "demand" | "movement" | "logistics" | "price" | "positioning" | "weather" | "farmer_local"`
- `RatingLabel = "strong_bear" | "bear" | "lean_bear" | "balanced" | "lean_bull" | "bull" | "strong_bull"`
- `SourceFreshnessStatus = "strong" | "watch" | "stale" | "empty" | "partial" | "expected_lag"`
- `RatingDomainScore`
- `ThesisRatingScorecard`
- `scoreToRatingLabel(score: number): RatingLabel`
- `clampRatingScore(score: number): number`
- `clampConfidenceScore(score: number): number`
- `isRatingSupportedGrain(grain: string): boolean`

Supported grains must match `THESIS_BOARD_V1_GRAIN_LANES` after Spring/Winter removal.

**Step 4: Run test to verify pass**

Run the same Vitest command. Expected: PASS.

**Step 5: Commit**

```bash
git add lib/thesis/rating-model.ts lib/__tests__/thesis-rating-model.test.ts
git commit -m "feat: add thesis rating scorecard contract"
```

### Task 2: Add source quality adjustment helpers

**Objective:** Implement deterministic freshness/proxy/partial-source confidence adjustments.

**Files:**
- Modify: `lib/thesis/rating-model.ts`
- Test: `lib/__tests__/thesis-rating-model.test.ts`

**Step 1: Write failing tests**

Add tests for these cases from `docs/reference/thesis-rating-model-v1.md`:

- `strong` source => confidence adjustment `0`, direction multiplier `1.0`
- `expected_lag` => confidence adjustment `-5`, direction multiplier `1.0`
- `stale` => confidence adjustment `-15`, direction multiplier `0.75`
- `empty` required source => confidence adjustment `-25`, direction multiplier `0`
- `partial` => confidence adjustment `-10`, direction multiplier `0.70`
- proxy mapping => additional confidence adjustment `-10`, signal multiplier `0.80`
- missing freshness proof => confidence adjustment `-15`, multiplier `0.80`

**Step 2: Run test to verify failure**

Run:

```bash
npx vitest run lib/__tests__/thesis-rating-model.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because helper does not exist.

**Step 3: Implement helper**

Add:

```ts
export interface QualityAdjustmentInput {
  freshnessStatus: SourceFreshnessStatus;
  isRequired?: boolean;
  isProxy?: boolean;
  missingFreshnessProof?: boolean;
}

export interface QualityAdjustmentResult {
  confidenceAdjustment: number;
  scoreMultiplier: number;
  reasons: string[];
}

export function qualityAdjustmentForSource(input: QualityAdjustmentInput): QualityAdjustmentResult
```

Keep reason strings stable and testable.

**Step 4: Run tests**

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/thesis/rating-model.ts lib/__tests__/thesis-rating-model.test.ts
git commit -m "feat: add thesis source quality adjustments"
```

### Task 3: Add domain weight table and normalization

**Objective:** Lock V1 Canada/US domain weights and safe normalization behavior.

**Files:**
- Modify: `lib/thesis/rating-model.ts`
- Test: `lib/__tests__/thesis-rating-model.test.ts`

**Step 1: Write failing tests**

Test:

- Canada weights equal the reference table.
- US weights equal the reference table.
- structurally absent domains can be excluded and remaining weights renormalize to `1.0`.
- stale/empty domains do not disappear; their score is penalized instead.

**Step 2: Implement**

Add:

- `CANADA_RATING_DOMAIN_WEIGHTS`
- `US_RATING_DOMAIN_WEIGHTS`
- `getDomainWeights(lane, options)`
- `normalizeDomainWeights(weights, structurallyAbsentDomains)`

**Step 3: Run tests**

```bash
npx vitest run lib/__tests__/thesis-rating-model.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism
```

Expected: PASS.

**Step 4: Commit**

```bash
git add lib/thesis/rating-model.ts lib/__tests__/thesis-rating-model.test.ts
git commit -m "feat: add thesis rating domain weights"
```

### Task 4: Add score aggregation helper

**Objective:** Aggregate domain scores into overall score, confidence, contradictions, and missing-source flags.

**Files:**
- Modify: `lib/thesis/rating-model.ts`
- Test: `lib/__tests__/thesis-rating-model.test.ts`

**Step 1: Write failing tests**

Test:

- weighted bullish domains produce bullish overall label,
- balanced conflicting domains produce lower confidence and contradiction notes,
- empty required demand source zeros demand domain and reduces confidence,
- no primary direct source returns `insufficient_data`,
- score remains clamped.

**Step 2: Implement**

Add:

```ts
export function buildRatingScorecard(input: BuildRatingScorecardInput): ThesisRatingScorecard
```

This helper must:

- reject unsupported grains,
- aggregate weighted scores,
- apply quality adjustments,
- record contradictions when high-confidence domains disagree by more than 40 points,
- return `insufficient_data` when required source rules fail.

**Step 3: Run tests**

Expected: PASS.

**Step 4: Commit**

```bash
git add lib/thesis/rating-model.ts lib/__tests__/thesis-rating-model.test.ts
git commit -m "feat: aggregate thesis domain scorecards"
```

### Task 5: Add deterministic domain signal mappers for current packet fields

**Objective:** Convert existing Canada/US thesis packet payload sections into initial domain scores without adding new data.

**Files:**
- Create: `lib/thesis/rating-domain-mappers.ts`
- Test: `lib/__tests__/thesis-rating-domain-mappers.test.ts`
- Read: `lib/queries/thesis-board.ts`

**Step 1: Write failing tests**

Add fixtures using existing packet-like payloads for:

- Canada Canola demand: strong current-week exports/process deliveries => positive demand score.
- Canada Canola movement: high deliveries + weak exports/process => negative movement score.
- US Wheat demand: admitted export-sales projection pace over 100% => positive demand score.
- US Barley/Oats null projection pace => no projection demand score and blocked claim.
- US crop progress poor condition => positive weather risk score for old-crop/new-crop relevant window.

**Step 2: Implement mappers**

Add pure functions:

- `mapCanadaPacketToDomainInputs(packet)`
- `mapUsPacketToDomainInputs(packet)`
- small domain-specific helpers where needed.

Keep all thresholds conservative and documented in comments. Use existing fields only. No DB calls.

**Step 3: Run tests**

```bash
npx vitest run lib/__tests__/thesis-rating-domain-mappers.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism
```

Expected: PASS.

**Step 4: Commit**

```bash
git add lib/thesis/rating-domain-mappers.ts lib/__tests__/thesis-rating-domain-mappers.test.ts
git commit -m "feat: map thesis packets to rating domains"
```

### Task 6: Type-link rating scorecard into thesis board items

**Objective:** Add rating scorecards to `ThesisBoardItem` without changing visible UI behavior yet.

**Files:**
- Modify: `lib/queries/thesis-board.ts`
- Modify: `lib/__tests__/thesis-board.test.ts`

**Step 1: Write failing tests**

Add tests that:

- `buildCanadaThesisBoardItem()` includes `ratingScorecard`,
- `buildUsThesisBoardItem()` includes `ratingScorecard`,
- Spring/Winter Wheat still do not appear as rows,
- rating scorecard labels align with existing `stanceScore` direction or explicitly record divergence.

**Step 2: Implement**

Import the rating helpers and attach `ratingScorecard` to `ThesisBoardItem`.

Do not remove existing `stanceScore`/`confidenceScore` yet. Treat the rating scorecard as parallel audit data.

**Step 3: Run tests**

```bash
npx vitest run lib/__tests__/thesis-board.test.ts lib/__tests__/thesis-rating-model.test.ts lib/__tests__/thesis-rating-domain-mappers.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism
```

Expected: PASS.

**Step 4: Commit**

```bash
git add lib/queries/thesis-board.ts lib/__tests__/thesis-board.test.ts
git commit -m "feat: attach rating scorecards to thesis board items"
```

### Task 7: Add audit UI for scorecard details

**Objective:** Expose rating domains and quality adjustments on `/thesis?audit=1` only.

**Files:**
- Find relevant component/page with `search_files("audit", path="app components", file_glob="*.tsx")`
- Modify: likely `app/(dashboard)/thesis/page.tsx` or related thesis components.
- Test: existing component/page tests if available; otherwise use build + browser audit.

**Step 1: Locate UI surface**

Run:

```bash
search_files("audit", path="/mnt/c/Users/kyle/Agriculture/bushel-board-app/app", file_glob="*.tsx")
```

**Step 2: Add audit-only display**

Show per row:

- overall score/label,
- confidence score/label,
- domain chips with score and weight,
- quality adjustment count,
- missing/blocked claims.

Do not clutter normal farmer view.

**Step 3: Verify**

Run:

```bash
npm run build
```

Then browser-check `/thesis?audit=1` for console cleanliness and visible scorecard audit section.

**Step 4: Commit**

```bash
git add app components lib
git commit -m "feat: show thesis rating scorecards in audit mode"
```

### Task 8: Add LLM consumption guardrails

**Objective:** Ensure future prompt/desk workflows consume the scorecard as evidence, not as mutable hidden reasoning.

**Files:**
- Modify: `docs/reference/grain-desk-swarm-prompt.md`
- Modify: `docs/reference/us-desk-swarm-prompt.md`
- Modify/create contract doc if needed: `docs/reference/contracts/thesis-rating-scorecard-v1.md`

**Step 1: Update prompt references**

Add rules:

- use scorecard as structured evidence,
- cite domain contradictions,
- do not override numeric scores unless emitting explicit override reason,
- do not publish claims listed in `llm_blocked_claims`,
- return insufficient-data language when scorecard says insufficient.

**Step 2: Add contract doc**

If implementation added runtime scorecard types, mirror the shape in `docs/reference/contracts/thesis-rating-scorecard-v1.md`.

**Step 3: Verify docs**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

**Step 4: Commit**

```bash
git add docs/reference/grain-desk-swarm-prompt.md docs/reference/us-desk-swarm-prompt.md docs/reference/contracts/thesis-rating-scorecard-v1.md
git commit -m "docs: add thesis rating prompt guardrails"
```

### Task 9: Full verification pass

**Objective:** Verify implementation, docs, and UI are coherent.

**Files:**
- All touched files.

**Step 1: Run focused tests**

```bash
npx vitest run lib/__tests__/thesis-rating-model.test.ts lib/__tests__/thesis-rating-domain-mappers.test.ts lib/__tests__/thesis-board.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism
```

Expected: PASS.

**Step 2: Run build**

```bash
npm run build
```

Expected: PASS.

**Step 3: Search for stale Spring/Winter board assumptions**

```bash
rg "Spring Wheat|Winter Wheat|Mapping needed|Generic Wheat is not used" PROJECT_STATE.md docs app components lib
```

Expected:

- Spring/Winter may appear in docs as parked or as source/price data references.
- They must not appear as active `/thesis` board lanes.
- `Mapping needed` placeholder copy should not appear for board rows.

**Step 4: Browser audit**

Open `/thesis?audit=1` and verify:

- rows are exactly Corn, Soybeans, Wheat, Durum, Canola, Barley, Oats,
- rating scorecards appear only in audit mode,
- normal `/thesis` remains farmer-readable,
- no console errors.

**Step 5: Final commit**

```bash
git status --short
git diff --stat
```

Commit any remaining docs/test updates.

## Acceptance Criteria

- `/thesis` board remains scoped to seven source-backed lanes.
- Spring/Winter Wheat do not render as placeholder rows.
- Rating scorecard exists as deterministic, test-covered structured data.
- Existing stance/confidence fields remain backward-compatible during the first pass.
- Audit view shows domain scores, weights, confidence, quality adjustments, and blocked claims.
- LLM prompt docs forbid hidden score mutation and unsupported claims.
- Focused Vitest suite passes.
- `npm run build` passes.

## Risks / Guardrails

- Risk: false precision. Mitigation: keep domain thresholds conservative and expose confidence/blocked claims.
- Risk: stale data scored as current. Mitigation: freshness adjustments and hard blockers.
- Risk: UI clutter. Mitigation: scorecard details audit-only first.
- Risk: LLM overrides deterministic math. Mitigation: prompt contract and explicit override reason only.
- Risk: Spring/Winter Wheat creep back in. Mitigation: tests lock board rows and parked-lane docs.

## Completion Note

Tasks 1-9 are implemented and verified in this checkout. The next product move is production-preview/promotion verification or a new source-quality package, not another pass through this plan.
