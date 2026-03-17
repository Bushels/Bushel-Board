# Stance Spectrum Meter & Recommendation Confidence Gauge — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the "Analysis Confidence" bar with a bullish-neutral-bearish stance spectrum meter, and replace the recommendation text badge with a semicircle confidence gauge.

**Architecture:** Add `stance_score` (integer -100 to +100) to the `market_analysis` table and Grok's structured output schema. The score drives both the stance spectrum meter in `BullBearCards` and a numeric confidence score in `RecommendationCard`'s new semicircle gauge. All changes are backward-compatible (nullable column, graceful fallback when NULL).

**Tech Stack:** Supabase migration, Edge Function (Deno/xAI Responses API), Next.js Server Components, SVG gauge rendering, TypeScript.

**Design doc:** `docs/plans/2026-03-16-stance-confidence-gauge-design.md`

---

### Task 1: Database Migration — Add `stance_score` Column

**Files:**
- Create: `supabase/migrations/<timestamp>_add_stance_score.sql`

**Step 1: Create migration file**

```sql
-- Add stance_score to market_analysis
-- Range: -100 (strongly bearish) to +100 (strongly bullish)
ALTER TABLE market_analysis ADD COLUMN stance_score smallint;
ALTER TABLE market_analysis ADD CONSTRAINT market_analysis_stance_score_range
  CHECK (stance_score >= -100 AND stance_score <= 100);

COMMENT ON COLUMN market_analysis.stance_score IS 'AI-generated directional stance: -100 strongly bearish, 0 neutral, +100 strongly bullish';
```

**Step 2: Apply migration**

Run: `npx supabase db push`
Expected: Migration applied successfully.

**Step 3: Verify column exists**

Run via Supabase MCP `execute_sql`:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'market_analysis' AND column_name = 'stance_score';
```
Expected: One row with `smallint`.

**Step 4: Commit**

```bash
git add supabase/migrations/*_add_stance_score.sql
git commit -m "db: add stance_score column to market_analysis"
```

---

### Task 2: Update `MarketAnalysis` TypeScript Type

**Files:**
- Modify: `lib/queries/intelligence.ts` (line 95-119, `MarketAnalysis` interface)

**Step 1: Add `stance_score` to the interface**

In `lib/queries/intelligence.ts`, add to the `MarketAnalysis` interface after `confidence_score`:

```typescript
stance_score: number | null;
```

The full interface becomes:

```typescript
export interface MarketAnalysis {
  grain: string;
  crop_year: string;
  grain_week: number;
  initial_thesis: string;
  bull_case: string;
  bear_case: string;
  historical_context: {
    deliveries_vs_5yr_avg_pct?: number | null;
    exports_vs_5yr_avg_pct?: number | null;
    seasonal_observation?: string;
    notable_patterns?: string[];
  };
  data_confidence: "high" | "medium" | "low";
  key_signals: Array<{
    signal: "bullish" | "bearish" | "watch";
    title: string;
    body: string;
    confidence: "high" | "medium" | "low";
  }>;
  model_used: string;
  confidence_score: number | null;
  stance_score: number | null;
  final_assessment: string | null;
  generated_at: string;
}
```

**Step 2: Run build to verify**

Run: `npm run build`
Expected: No errors (stance_score is nullable, no consumers reference it yet).

**Step 3: Commit**

```bash
git add lib/queries/intelligence.ts
git commit -m "feat: add stance_score to MarketAnalysis type"
```

---

### Task 3: Update Edge Function — Add `stance_score` to Grok Schema & Prompt

**Files:**
- Modify: `supabase/functions/analyze-market-data/index.ts`

**Step 1: Add `stance_score` to the JSON schema**

In the `schema.properties` object (around line 242), add after `confidence_score`:

```typescript
stance_score: { type: "integer" },
```

Update the `required` array (around line 275) to include `"stance_score"`:

```typescript
required: ["initial_thesis", "bull_case", "bear_case", "historical_context", "data_confidence", "confidence_score", "stance_score", "final_assessment", "key_signals"],
```

**Step 2: Add validation after JSON parse**

After the `analysis.confidence_score` validation block (around line 333), add:

```typescript
analysis.stance_score = typeof analysis.stance_score === "number"
  ? Math.max(-100, Math.min(100, Math.round(analysis.stance_score)))
  : null;
```

**Step 3: Add `stance_score` to the upsert**

In the upsert object (around line 344), add after `confidence_score`:

```typescript
stance_score: analysis.stance_score ?? null,
```

**Step 4: Update the prompt**

In the `buildSystemPrompt()` function (around line 460), add this line after the `confidence_score` description:

```
- "stance_score": integer -100 to +100 — directional market stance. Strongly bullish = +70 to +100, bullish = +20 to +69, neutral = -19 to +19, bearish = -69 to -20, strongly bearish = -100 to -70. Base on the weight of evidence between bull and bear cases. Consider: delivery pace vs historical, export momentum, spec positioning, basis trends, and farmer sentiment.
```

**Step 5: Deploy**

Run: `npx supabase functions deploy analyze-market-data`
Expected: Deployed successfully.

**Step 6: Commit**

```bash
git add supabase/functions/analyze-market-data/index.ts
git commit -m "feat: add stance_score to Grok structured output schema"
```

---

### Task 4: Build the Stance Spectrum Meter Component

**Files:**
- Modify: `components/dashboard/bull-bear-cards.tsx`

**Step 1: Update BullBearCardsProps**

Add `stanceScore?: number | null` to the interface. Keep existing `confidence`/`confidenceScore` props for backward compat.

```typescript
interface BullBearCardsProps {
  bullCase: string;
  bearCase: string;
  confidence: "high" | "medium" | "low";
  modelUsed?: string;
  confidenceScore?: number;
  stanceScore?: number | null;
  finalAssessment?: string;
}
```

**Step 2: Add stance label helper**

```typescript
function getStanceLabel(score: number): string {
  if (score >= 70) return "Strongly Bullish";
  if (score >= 20) return "Bullish";
  if (score > -20) return "Neutral";
  if (score > -70) return "Bearish";
  return "Strongly Bearish";
}

function getStanceColor(score: number): string {
  if (score >= 20) return "#437a22";   // prairie green
  if (score > -20) return "#8b7355";   // wheat neutral
  return "#d97706";                     // amber/bearish
}
```

**Step 3: Replace the confidence bar with stance spectrum**

Replace the entire `{/* Confidence bar */}` section (lines 69-91) with a stance spectrum meter when `stanceScore` is available, falling back to the old confidence bar when it's not.

The stance meter renders:
- A gradient bar (green → gray → amber) with rounded ends
- A positioned marker/triangle at the score's position
- Labels: "BULLISH" left, "NEUTRAL" center, "BEARISH" right
- Score display: e.g., "+32 — Bullish"

Position formula: `markerPct = 50 - (stanceScore / 2)` — so +100 = 0% (far left/bullish), -100 = 100% (far right/bearish).

```tsx
{stanceScore != null ? (
  /* Stance Spectrum Meter */
  <div className="px-1 space-y-1.5">
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-wider text-prairie">
        Bullish
      </span>
      <span className="text-xs text-muted-foreground">Neutral</span>
      <span className="text-xs font-semibold uppercase tracking-wider text-amber-600">
        Bearish
      </span>
    </div>
    <div className="relative h-3 w-full rounded-full overflow-hidden"
         style={{
           background: "linear-gradient(to right, #437a22, #8b7355 50%, #d97706)",
         }}>
      {/* Marker */}
      <div
        className="absolute top-0 h-full w-1 rounded-full bg-foreground shadow-md transition-all duration-700"
        style={{ left: `${Math.max(1, Math.min(99, 50 - stanceScore / 2))}%`, transform: "translateX(-50%)" }}
      />
    </div>
    <div className="flex justify-center">
      <span
        className="text-xs font-semibold"
        style={{ color: getStanceColor(stanceScore) }}
      >
        {stanceScore > 0 ? "+" : ""}{stanceScore} — {getStanceLabel(stanceScore)}
      </span>
    </div>
  </div>
) : (
  /* Fallback: old confidence bar */
  <div className="px-1 space-y-1.5">
    {/* ... existing confidence bar code ... */}
  </div>
)}
```

**Step 4: Run build**

Run: `npm run build`
Expected: Clean build, no errors.

**Step 5: Commit**

```bash
git add components/dashboard/bull-bear-cards.tsx
git commit -m "feat: add stance spectrum meter to BullBearCards"
```

---

### Task 5: Wire Stance Score into Grain Detail Page

**Files:**
- Modify: `app/(dashboard)/grain/[slug]/page.tsx` (lines 656-661)

**Step 1: Pass `stanceScore` to `BullBearCards`**

Update the `BullBearCards` usage (around line 656):

```tsx
<BullBearCards
  bullCase={marketAnalysis.bull_case}
  bearCase={marketAnalysis.bear_case}
  confidence={marketAnalysis.data_confidence}
  confidenceScore={marketAnalysis.confidence_score ?? undefined}
  stanceScore={marketAnalysis.stance_score}
  finalAssessment={marketAnalysis.final_assessment ?? undefined}
/>
```

**Step 2: Update `MarketStanceBadge` to use `stance_score`**

Replace the `deriveStanceFromThesis` usage for the hero badge (around line 276-278). When `marketAnalysis?.stance_score` is available, derive stance from it instead of keyword matching:

```tsx
{(intelligence || marketAnalysis) && (
  <MarketStanceBadge
    stance={
      marketAnalysis?.stance_score != null
        ? marketAnalysis.stance_score >= 20
          ? "bullish"
          : marketAnalysis.stance_score <= -20
            ? "bearish"
            : "neutral"
        : deriveStanceFromThesis(intelligence?.thesis_title ?? "")
    }
    size="lg"
  />
)}
```

**Step 3: Run build**

Run: `npm run build`
Expected: Clean build.

**Step 4: Commit**

```bash
git add "app/(dashboard)/grain/[slug]/page.tsx"
git commit -m "feat: wire stance_score into grain detail page"
```

---

### Task 6: Add Numeric Confidence to Recommendation Logic

**Files:**
- Modify: `lib/utils/recommendations.ts`

**Step 1: Add `stanceScore` to `DeriveParams` and `confidenceScore` to `RecommendationResult`**

```typescript
export interface RecommendationResult {
  action: Recommendation
  reason: string
  confidence: "high" | "medium" | "low"
  confidenceScore: number               // NEW: 0-100 numeric confidence
  marketStance: "bullish" | "bearish" | "neutral"
  deliveryPacePct: number
  contractedPct: number
}

interface DeriveParams {
  marketStance: "bullish" | "bearish" | "neutral"
  stanceScore?: number | null           // NEW: -100 to +100
  deliveryPacePct: number
  contractedPct: number
  uncontractedKt: number
  totalPlannedKt: number
}
```

**Step 2: Compute numeric confidence inside `deriveRecommendation`**

Add a helper function and compute `confidenceScore` for each action:

```typescript
function computeConfidenceScore(
  action: Recommendation,
  stanceScore: number | null | undefined,
  deliveryPacePct: number,
  contractedPct: number
): number {
  // Stance magnitude: how decisively bullish/bearish the AI is (0-1)
  const stanceMagnitude = stanceScore != null ? Math.abs(stanceScore) / 100 : 0.5;

  // Pace alignment: how well the farmer's position matches the recommendation (0-1)
  let paceAlignment = 0.5;

  switch (action) {
    case "hold":
      // Stronger confidence when farmer has room to wait (low delivery pace)
      paceAlignment = deliveryPacePct <= 40 ? 1.0 : deliveryPacePct <= 60 ? 0.7 : 0.4;
      break;
    case "haul":
      // Stronger confidence when lots of uncontracted grain
      paceAlignment = contractedPct < 20 ? 1.0 : contractedPct < 40 ? 0.7 : 0.4;
      break;
    case "price":
      // Stronger when clearly undercontracted
      paceAlignment = contractedPct < 25 ? 1.0 : contractedPct < 40 ? 0.6 : 0.3;
      break;
    case "watch":
      // Watch is inherently low confidence
      paceAlignment = 0.2;
      break;
  }

  return Math.round(stanceMagnitude * 60 + paceAlignment * 40);
}
```

**Step 3: Update each return path in `deriveRecommendation`**

In each action return block, add `confidenceScore`:

```typescript
const score = computeConfidenceScore(action, params.stanceScore, deliveryPacePct, contractedPct);
return {
  ...base,
  action,
  reason,
  confidence: score >= 70 ? "high" : score >= 40 ? "medium" : "low",
  confidenceScore: score,
}
```

The categorical `confidence` is now derived from the numeric score rather than hardcoded.

**Step 4: Run build**

Run: `npm run build`
Expected: Build errors in consumers of `RecommendationResult` that don't pass `confidenceScore` — will fix in next task.

**Step 5: Commit**

```bash
git add lib/utils/recommendations.ts
git commit -m "feat: add numeric confidenceScore to recommendation logic"
```

---

### Task 7: Build Recommendation Confidence Gauge in RecommendationCard

**Files:**
- Modify: `components/dashboard/recommendation-card.tsx`

**Step 1: Add the semicircle gauge SVG**

Replace the `{/* Action badge */}` section and `{/* Pace + Confidence */}` section with a semicircle gauge. Reuse the `getArcPath` pattern from `crush-utilization-gauge.tsx`.

The gauge replaces lines 58-61 (ActionBadge) and lines 96-108 (confidence badge). The action icon sits inside the gauge arc, with the confidence percentage displayed prominently.

```tsx
// Import the action icon mapping
import { Lock, Truck, DollarSign, Eye } from "lucide-react"

const actionIcons: Record<Recommendation, React.ElementType> = {
  hold: Lock,
  haul: Truck,
  price: DollarSign,
  watch: Eye,
}

const actionColors: Record<Recommendation, string> = {
  hold: "#437a22",    // prairie
  haul: "#d97706",    // amber
  price: "#c17f24",   // canola
  watch: "#8b7355",   // wheat neutral
}
```

SVG gauge rendering (inside the card, replaces ActionBadge):

```tsx
function ConfidenceGauge({
  action,
  confidenceScore,
}: {
  action: Recommendation
  confidenceScore: number
}) {
  const color = actionColors[action]
  const Icon = actionIcons[action]
  const cx = 60, cy = 54, r = 42

  const bgPath = getArcPath(cx, cy, r, Math.PI, 0)
  const fillEnd = Math.PI - (confidenceScore / 100) * Math.PI
  const fillPath = confidenceScore > 0 ? getArcPath(cx, cy, r, Math.PI, fillEnd) : ""

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 65" className="w-full max-w-[140px]">
        <path d={bgPath} fill="none" stroke="var(--muted)" strokeOpacity={0.4} strokeWidth="8" strokeLinecap="round" />
        {confidenceScore > 0 && (
          <path d={fillPath} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" />
        )}
        {/* Icon */}
        <foreignObject x={cx - 10} y={cy - 28} width="20" height="20">
          <Icon className="h-5 w-5" style={{ color }} />
        </foreignObject>
        {/* Score */}
        <text x={cx} y={cy - 2} textAnchor="middle" className="fill-foreground"
              style={{ fontSize: "16px", fontWeight: 700, fontFamily: "var(--font-display, inherit)" }}>
          {confidenceScore}%
        </text>
      </svg>
      <span className="text-xs font-bold uppercase tracking-widest mt-0.5" style={{ color }}>
        {action}
      </span>
    </div>
  )
}
```

Also add the `getArcPath` helper (copy from crush-utilization-gauge.tsx):

```typescript
function getArcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const x1 = cx + r * Math.cos(startAngle)
  const y1 = cy - r * Math.sin(startAngle)
  const x2 = cx + r * Math.cos(endAngle)
  const y2 = cy - r * Math.sin(endAngle)
  const largeArc = Math.abs(startAngle - endAngle) > Math.PI ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 0 ${x2} ${y2}`
}
```

**Step 2: Update the card layout**

Replace:
- Lines 58-61 (`ActionBadge`) → `<ConfidenceGauge action={action} confidenceScore={recommendation.confidenceScore} />`
- Lines 96-108 (Pace + confidence badge row) → just Pace (remove the badge since the gauge now shows confidence)

```tsx
{/* Pace */}
<div className="flex items-center justify-center">
  <span className="text-xs text-muted-foreground">
    Pace: {formatPace(deliveryPacePct)}
  </span>
</div>
```

**Step 3: Remove unused imports**

Remove `ActionBadge` import since it's replaced by the inline gauge.

**Step 4: Run build**

Run: `npm run build`
Expected: Clean build.

**Step 5: Commit**

```bash
git add components/dashboard/recommendation-card.tsx
git commit -m "feat: add semicircle confidence gauge to RecommendationCard"
```

---

### Task 8: Wire Stance Score into My Farm Recommendations

**Files:**
- Modify: `app/(dashboard)/my-farm/page.tsx`

**Step 1: Pass `stanceScore` to `deriveRecommendation`**

Find the `deriveRecommendation` call (around line 159) and update it. The `marketAnalysis` data needs to be fetched alongside `intelligence`. Look for the intelligence query section and add `getMarketAnalysis` to the parallel fetch, then pass `stance_score` through.

Where `intelligenceMap` is built, also build a `marketAnalysisMap`. Then at the `deriveRecommendation` call:

```typescript
const ma = marketAnalysisMap[plan.grain];
const marketStance = ma?.stance_score != null
  ? (ma.stance_score >= 20 ? "bullish" : ma.stance_score <= -20 ? "bearish" : "neutral")
  : deriveStanceFromThesis(intel?.thesis_body);

const rec = deriveRecommendation({
  marketStance,
  stanceScore: ma?.stance_score ?? null,
  deliveryPacePct,
  contractedPct,
  uncontractedKt: uncontracted,
  totalPlannedKt: totalPlanned,
});
```

**Step 2: Run build**

Run: `npm run build`
Expected: Clean build.

**Step 3: Commit**

```bash
git add "app/(dashboard)/my-farm/page.tsx"
git commit -m "feat: wire stance_score into My Farm recommendations"
```

---

### Task 9: Trigger Pipeline Re-run and Visual Verification

**Step 1: Trigger `analyze-market-data` to populate `stance_score`**

Via Supabase MCP `execute_sql`:
```sql
SELECT enqueue_internal_function('analyze-market-data', '{"crop_year": "2025-2026"}'::jsonb);
```

**Step 2: Wait for pipeline completion, verify data**

```sql
SELECT grain, stance_score, data_confidence, generated_at
FROM market_analysis
WHERE crop_year = '2025-2026'
ORDER BY generated_at DESC LIMIT 16;
```

Expected: All 16 grains have `stance_score` values between -100 and +100.

**Step 3: Visual verification**

Start dev server, navigate to a grain detail page (e.g., `/grain/canola`). Verify:
- Stance spectrum meter renders below bull/bear cards
- Marker is positioned correctly on the gradient bar
- Labels show "BULLISH" left, "NEUTRAL" center, "BEARISH" right
- Score and label are displayed (e.g., "+32 — Bullish")

Navigate to `/my-farm`. Verify:
- Recommendation cards show semicircle gauge with confidence percentage
- Action icon and label render inside/below the gauge
- Arc color matches action (green for HOLD, amber for HAUL, etc.)

**Step 4: Run full test suite**

Run: `npm run test`
Expected: All tests pass. If any fail due to missing `confidenceScore` in test mocks, fix them.

**Step 5: Run build**

Run: `npm run build`
Expected: Clean build.

**Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: test and build fixes for stance/confidence gauge"
```

---

### Task 10: Update CLAUDE.md and STATUS.md

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/plans/STATUS.md`

**Step 1: Update CLAUDE.md**

Add to the UI component list:
- `StanceSpectrumMeter` — bullish/neutral/bearish gradient bar with positioned marker in `components/dashboard/bull-bear-cards.tsx`
- `ConfidenceGauge` — semicircle confidence arc in `components/dashboard/recommendation-card.tsx`

Add `stance_score` to the `market_analysis` table description.

**Step 2: Update STATUS.md**

Add a new track or update an existing one to mark the stance/confidence gauge as complete.

**Step 3: Commit**

```bash
git add CLAUDE.md docs/plans/STATUS.md
git commit -m "docs: update CLAUDE.md and STATUS.md for stance/confidence gauge"
```
