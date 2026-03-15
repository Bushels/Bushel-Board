# Wave 3: Engagement & My Farm — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add farmer engagement features — per-card metric voting, X signal voting, percentile distribution graph, delivery logging improvements, bull/bear content quality, and custom grain icons.

**Architecture:** Extend existing vote patterns (sentiment-poll, signal-actions) to key metric cards and signal strips. New `metric_sentiment_votes` table with RLS. Percentile graph is a pure client SVG component driven by existing `getDeliveryAnalytics()` data. Grain icons are inline SVGs in a shared component. Bull/bear content improvements require updating the Grok Edge Function prompt to produce `confidence_score` and `final_assessment` fields.

**Tech Stack:** Next.js 16 (App Router), Supabase (PostgreSQL + Edge Functions), Tailwind CSS, Framer Motion, Recharts, Zod, shadcn/ui

---

## Dependency Graph

```
Task 1 (migration) ──► Task 5 (metric voting component)
                   ──► Task 6 (grain page wiring)
Task 2 (grain icons) ──► Task 6 (grain page wiring)
Task 3 (signal voting) ──► Task 6
Task 4 (percentile graph) ──► Task 6
Task 5 (metric voting) ──► Task 6
Task 7 (delivery UX) — independent
Task 8 (bull/bear prompt) — independent
Task 9 (docs + STATUS) — last
```

Tasks 2, 3, 4, 7, and 8 are independent and can run in parallel.

---

### Task 1: Metric Sentiment Votes — Database Migration

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_create_metric_sentiment_votes.sql`

**Step 1: Write the migration**

```sql
-- Per-card metric sentiment voting (bullish/bearish on Deliveries, Processing, Exports, Stocks)
CREATE TABLE metric_sentiment_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  grain TEXT NOT NULL,
  crop_year TEXT NOT NULL,
  grain_week SMALLINT NOT NULL CHECK (grain_week BETWEEN 1 AND 52),
  metric TEXT NOT NULL CHECK (metric IN ('deliveries', 'processing', 'exports', 'stocks')),
  sentiment TEXT NOT NULL CHECK (sentiment IN ('bullish', 'bearish')),
  voted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, grain, crop_year, grain_week, metric)
);

-- RLS: users can read all aggregates, write only their own votes
ALTER TABLE metric_sentiment_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read all metric votes"
  ON metric_sentiment_votes FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own metric votes"
  ON metric_sentiment_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own metric votes"
  ON metric_sentiment_votes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for aggregation queries
CREATE INDEX idx_metric_sentiment_grain_week
  ON metric_sentiment_votes (grain, crop_year, grain_week, metric);

-- RPC: get metric sentiment aggregates (anonymized)
CREATE OR REPLACE FUNCTION get_metric_sentiment(
  p_grain TEXT,
  p_crop_year TEXT,
  p_grain_week SMALLINT
)
RETURNS TABLE (
  metric TEXT,
  bullish_count BIGINT,
  bearish_count BIGINT,
  total_votes BIGINT,
  bullish_pct NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    msv.metric,
    COUNT(*) FILTER (WHERE msv.sentiment = 'bullish') AS bullish_count,
    COUNT(*) FILTER (WHERE msv.sentiment = 'bearish') AS bearish_count,
    COUNT(*) AS total_votes,
    ROUND(
      (COUNT(*) FILTER (WHERE msv.sentiment = 'bullish'))::numeric
      / NULLIF(COUNT(*), 0) * 100, 1
    ) AS bullish_pct
  FROM metric_sentiment_votes msv
  WHERE msv.grain = p_grain
    AND msv.crop_year = p_crop_year
    AND msv.grain_week = p_grain_week
  GROUP BY msv.metric;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: Migration applied successfully.

**Step 3: Verify RPC works**

Run in Supabase SQL editor:
```sql
SELECT * FROM get_metric_sentiment('Canola', '2025-2026', 31::smallint);
```
Expected: Empty result set (no votes yet).

**Step 4: Commit**

```bash
git add supabase/migrations/*_create_metric_sentiment_votes.sql
git commit -m "feat: add metric_sentiment_votes table and RPC"
```

---

### Task 2: Custom Grain Icons Component

**Files:**
- Create: `components/ui/grain-icon.tsx`

**Step 1: Create the grain icon component**

Build inline SVG icons for the 6 major grain families. Each icon is 24x24, monochrome, using `currentColor` for theming. Keep them simple — recognizable silhouettes, not detailed illustrations.

```tsx
"use client"

import { cn } from "@/lib/utils"

interface GrainIconProps {
  grain: string
  className?: string
  size?: number
}

/**
 * Maps grain names to SVG icon families:
 * - Wheat/Durum → wheat stalk
 * - Canola → canola flower (4 petals)
 * - Barley → barley head (awned)
 * - Oats → oat panicle (drooping)
 * - Peas/Lentils/Chick Peas/Beans → pulse pod
 * - Everything else → generic kernel
 */
function getGrainFamily(grain: string): string {
  const lower = grain.toLowerCase()
  if (lower.includes("wheat") || lower.includes("durum") || lower.includes("rye")) return "wheat"
  if (lower.includes("canola") || lower.includes("flax") || lower.includes("mustard") || lower.includes("sunflower")) return "oilseed"
  if (lower.includes("barley")) return "barley"
  if (lower.includes("oat")) return "oats"
  if (lower.includes("pea") || lower.includes("lentil") || lower.includes("chick") || lower.includes("bean") || lower.includes("soy")) return "pulse"
  if (lower.includes("corn")) return "corn"
  return "kernel"
}

const ICONS: Record<string, (size: number) => React.ReactElement> = {
  wheat: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Wheat stalk with kernels */}
      <path d="M12 22V8" />
      <path d="M9 11c-1.5-1.5-2-3.5-1-5 2 0 3.5.5 5 2" />
      <path d="M15 11c1.5-1.5 2-3.5 1-5-2 0-3.5.5-5 2" />
      <path d="M9 7c-1.5-1.5-2-3.5-1-5 2 0 3.5.5 5 2" />
      <path d="M15 7c1.5-1.5 2-3.5 1-5-2 0-3.5.5-5 2" />
      <path d="M9 15c-1.5-1.5-2-3.5-1-5 2 0 3.5.5 5 2" />
      <path d="M15 15c1.5-1.5 2-3.5 1-5-2 0-3.5.5-5 2" />
    </svg>
  ),
  oilseed: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* 4-petal canola flower */}
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path d="M12 2c-1.5 2-1.5 4.5 0 6.5" />
      <path d="M12 2c1.5 2 1.5 4.5 0 6.5" />
      <path d="M22 12c-2-1.5-4.5-1.5-6.5 0" />
      <path d="M22 12c-2 1.5-4.5 1.5-6.5 0" />
      <path d="M12 22c-1.5-2-1.5-4.5 0-6.5" />
      <path d="M12 22c1.5-2 1.5-4.5 0-6.5" />
      <path d="M2 12c2-1.5 4.5-1.5 6.5 0" />
      <path d="M2 12c2 1.5 4.5 1.5 6.5 0" />
    </svg>
  ),
  barley: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Barley head with awns */}
      <path d="M12 22V6" />
      <path d="M8 14l4-2 4 2" />
      <path d="M8 10l4-2 4 2" />
      <path d="M9 6l3-2 3 2" />
      <path d="M10 3l2-1 2 1" />
      <path d="M7 14l-2 3" />
      <path d="M17 14l2 3" />
      <path d="M7 10l-3 2" />
      <path d="M17 10l3 2" />
    </svg>
  ),
  oats: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Oat panicle — drooping grain heads */}
      <path d="M12 22V4" />
      <path d="M12 6c-2 0-4 1.5-4 4" />
      <path d="M12 6c2 0 4 1.5 4 4" />
      <path d="M12 10c-3 0-5 2-5 4" />
      <path d="M12 10c3 0 5 2 5 4" />
      <path d="M12 14c-2.5 0-4 1.5-4 3" />
      <path d="M12 14c2.5 0 4 1.5 4 3" />
    </svg>
  ),
  pulse: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Pea pod */}
      <path d="M6 12c0-4 3-7 6-7s6 3 6 7-3 7-6 7-6-3-6-7Z" />
      <circle cx="10" cy="12" r="1.5" fill="currentColor" />
      <circle cx="14" cy="12" r="1.5" fill="currentColor" />
      <path d="M5 12h14" />
    </svg>
  ),
  corn: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Corn ear */}
      <path d="M10 22V18c0-4 1-8 2-10" />
      <ellipse cx="12" cy="10" rx="3.5" ry="7" />
      <path d="M9.5 7h5" />
      <path d="M9 10h6" />
      <path d="M9.5 13h5" />
      <path d="M15 5c1-1 2.5-1.5 4-1" />
      <path d="M15 8c2 0 4-.5 5-2" />
    </svg>
  ),
  kernel: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Generic grain kernel */}
      <ellipse cx="12" cy="13" rx="5" ry="7" />
      <path d="M12 6v14" />
      <path d="M8 10c2 2 4 2 4 2s2 0 4-2" />
    </svg>
  ),
}

export function GrainIcon({ grain, className, size = 24 }: GrainIconProps) {
  const family = getGrainFamily(grain)
  const renderIcon = ICONS[family] ?? ICONS.kernel
  return (
    <span className={cn("inline-flex items-center justify-center shrink-0", className)}>
      {renderIcon(size)}
    </span>
  )
}
```

**Step 2: Verify it renders**

Add temporarily to any page, check that each grain family renders a distinct icon. Remove after verification.

**Step 3: Commit**

```bash
git add components/ui/grain-icon.tsx
git commit -m "feat: add custom grain family SVG icons"
```

---

### Task 3: X Signal Voting on CompactSignalStrip

**Files:**
- Modify: `components/dashboard/compact-signal-strip.tsx`
- Modify: `app/(dashboard)/grain/[slug]/signal-actions.ts` (already exists — may need minor adjustments)

**Step 1: Extend CompactSignal interface**

Add `signal_id` and `user_vote` to the `CompactSignal` interface so the strip knows which signal to vote on and what the user already voted.

In `compact-signal-strip.tsx`, update the interface:

```typescript
export interface CompactSignal {
  signal_id?: string       // UUID for voting (undefined = voting disabled)
  sentiment: string
  category: string
  post_summary: string
  post_url?: string | null
  post_author?: string | null
  grain: string
  searched_at?: string | null
  user_vote?: boolean | null  // true=relevant, false=not relevant, null=no vote
}
```

**Step 2: Add vote buttons to each signal card**

After the existing card content (post summary + open link), add two small icon buttons:

```tsx
// Inside the signal card, after the "Open post" link
{signal.signal_id && role !== "observer" && (
  <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-border/30">
    <button
      onClick={() => handleSignalVote(signal.signal_id!, true)}
      className={cn(
        "flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition-colors",
        signal.user_vote === true
          ? "bg-prairie/15 text-prairie font-semibold"
          : "text-muted-foreground/60 hover:text-prairie hover:bg-prairie/10"
      )}
    >
      <ThumbsUp className="h-3 w-3" />
      Relevant
    </button>
    <button
      onClick={() => handleSignalVote(signal.signal_id!, false)}
      className={cn(
        "flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition-colors",
        signal.user_vote === false
          ? "bg-red-500/15 text-red-500 font-semibold"
          : "text-muted-foreground/60 hover:text-red-500 hover:bg-red-500/10"
      )}
    >
      <ThumbsDown className="h-3 w-3" />
      Not for me
    </button>
  </div>
)}
```

**Step 3: Add vote handler with optimistic UI**

```tsx
const [votes, setVotes] = useState<Record<string, boolean | null>>({})

async function handleSignalVote(signalId: string, relevant: boolean) {
  // Optimistic update
  setVotes(prev => ({ ...prev, [signalId]: relevant }))

  const result = await voteSignalRelevance(signalId, relevant, grain, cropYear, grainWeek)
  if (result.error) {
    // Revert on error
    setVotes(prev => ({ ...prev, [signalId]: null }))
  }
}
```

Initialize votes from `signal.user_vote` props on mount. Merge optimistic state with initial state when rendering.

**Step 4: Add explainer text below the strip**

```tsx
{role !== "observer" && (
  <p className="text-[11px] text-muted-foreground/50 mt-2 text-center">
    Vote to improve your feed — we learn what matters to your farm
  </p>
)}
```

**Step 5: Update props to include role, grain, cropYear, grainWeek**

```typescript
interface CompactSignalStripProps {
  signals: CompactSignal[]
  unlockedSlugs?: string[]
  role?: "farmer" | "observer"
  grain?: string
  cropYear?: string
  grainWeek?: number
}
```

**Step 6: Thread new props from overview page**

In `app/(dashboard)/overview/page.tsx`, pass `role`, `grain` (not applicable for overview — voting only on grain page strips), etc. For the overview page, voting is not shown (no `signal_id` passed), so no changes needed there.

For the grain page, Prairie Chatter was removed in the earlier fix. Signal voting is only on the overview page's CompactSignalStrip. If signal voting should also appear on the overview, thread the props there. Otherwise, this task is scoped to the component only — the overview page can add voting in a later wave.

**Step 7: Build and verify**

Run: `npm run build`
Expected: Clean build.

**Step 8: Commit**

```bash
git add components/dashboard/compact-signal-strip.tsx
git commit -m "feat: add thumbs up/down voting to signal strip cards"
```

---

### Task 4: Percentile Distribution Graph

**Files:**
- Create: `components/dashboard/percentile-graph.tsx`
- Modify: `app/(dashboard)/my-farm/page.tsx` (wire in the component)

**Step 1: Create the percentile graph component**

A bell-curve-style SVG with the farmer's position marker. Color-coded zones: amber (<25th), muted (25th-75th), prairie green (>75th).

```tsx
"use client"

import { cn } from "@/lib/utils"

interface PercentileGraphProps {
  /** Farmer's delivery pace percentile (0-100) */
  userPercentile: number
  /** 25th percentile value */
  p25: number
  /** 50th (median) percentile value */
  p50: number
  /** 75th percentile value */
  p75: number
  /** Total farmers in the cohort */
  farmerCount: number
  /** Grain name for label */
  grain: string
  className?: string
}

/**
 * Bell curve SVG showing farmer's delivery pace relative to peers.
 * Zones: <25th = amber (behind), 25-75th = muted (average), >75th = prairie (ahead)
 */
export function PercentileGraph({
  userPercentile,
  p25,
  p50,
  p75,
  farmerCount,
  grain,
  className,
}: PercentileGraphProps) {
  // Clamp percentile
  const pct = Math.max(0, Math.min(100, userPercentile))

  // Bell curve points (approximated as a smooth curve)
  // x: 0-300, y: 0 at top, 120 at bottom
  const curvePoints = "M0,120 C30,120 50,115 75,80 C90,55 100,25 120,10 C135,2 145,0 150,0 C155,0 165,2 180,10 C200,25 210,55 225,80 C250,115 270,120 300,120"

  // Position marker x coordinate (0-300)
  const markerX = (pct / 100) * 300

  // Zone boundaries
  const p25x = 75  // 25% of 300
  const p75x = 225 // 75% of 300

  const paceLabel =
    pct >= 75 ? "Ahead of pace" : pct >= 25 ? "On pace" : "Behind pace"
  const paceColor =
    pct >= 75 ? "text-prairie" : pct >= 25 ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Your Delivery Pace — {grain}
        </span>
        <span className={cn("text-xs font-semibold", paceColor)}>
          {paceLabel} (P{Math.round(pct)})
        </span>
      </div>

      <svg viewBox="0 0 300 140" className="w-full h-auto" aria-label={`Delivery percentile: ${Math.round(pct)}th percentile`}>
        {/* Zone fills */}
        <defs>
          <clipPath id="bellClip">
            <path d={curvePoints} />
          </clipPath>
        </defs>

        {/* Amber zone: 0-25th */}
        <rect x="0" y="0" width={p25x} height="120" fill="#d97706" opacity="0.12" clipPath="url(#bellClip)" />
        {/* Muted zone: 25th-75th */}
        <rect x={p25x} y="0" width={p75x - p25x} height="120" fill="currentColor" opacity="0.06" clipPath="url(#bellClip)" />
        {/* Prairie zone: 75th+ */}
        <rect x={p75x} y="0" width={300 - p75x} height="120" fill="#437a22" opacity="0.12" clipPath="url(#bellClip)" />

        {/* Bell curve outline */}
        <path d={curvePoints} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3" />

        {/* Median marker */}
        <line x1="150" y1="0" x2="150" y2="125" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.3" />
        <text x="150" y="135" textAnchor="middle" className="fill-muted-foreground text-[9px]">
          Median
        </text>

        {/* User position marker */}
        <line x1={markerX} y1="0" x2={markerX} y2="120" stroke="#c17f24" strokeWidth="2.5" />
        <circle cx={markerX} cy="0" r="5" fill="#c17f24" />
        <text
          x={markerX}
          y={-8}
          textAnchor="middle"
          className="fill-canola text-[10px] font-semibold"
        >
          You
        </text>
      </svg>

      <p className="text-[11px] text-muted-foreground/60 text-center">
        Based on {farmerCount} {grain} farmers this crop year
      </p>
    </div>
  )
}
```

**Step 2: Wire into My Farm page**

In `app/(dashboard)/my-farm/page.tsx`, after the `DeliveryPaceCard` section, add the `PercentileGraph` for each grain the farmer grows. Use data from `farmSummary` (which already has percentile data) or `analyticsData` (which has p25/p50/p75).

```tsx
{analyticsData && analyticsData.map((a) => (
  <PercentileGraph
    key={a.grain}
    userPercentile={/* farmer's percentile from farmSummary */}
    p25={a.p25_pace_pct}
    p50={a.p50_pace_pct}
    p75={a.p75_pace_pct}
    farmerCount={a.farmer_count}
    grain={a.grain}
  />
))}
```

The exact percentile for the current user comes from `farmSummary.delivery_percentile` (per grain). Thread this data from the existing queries.

**Step 3: Build and verify**

Run: `npm run build`
Expected: Clean build.

**Step 4: Commit**

```bash
git add components/dashboard/percentile-graph.tsx app/(dashboard)/my-farm/page.tsx
git commit -m "feat: add percentile distribution graph to My Farm"
```

---

### Task 5: Per-Card Metric Sentiment Voting

**Files:**
- Create: `components/dashboard/metric-vote-button.tsx`
- Create: `app/(dashboard)/grain/[slug]/metric-actions.ts`
- Create: `lib/queries/metric-sentiment.ts`
- Modify: `components/dashboard/key-metrics-cards.tsx`

**Step 1: Create the server action**

`app/(dashboard)/grain/[slug]/metric-actions.ts`:

```typescript
"use server"

import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year"
import { consumeRateLimit } from "@/lib/utils/rate-limit"
import { getUserRole } from "@/lib/auth/role-guard"
import { revalidatePath } from "next/cache"

const schema = z.object({
  grain: z.string().min(1),
  grainWeek: z.coerce.number().int().min(1).max(52),
  metric: z.enum(["deliveries", "processing", "exports", "stocks"]),
  sentiment: z.enum(["bullish", "bearish"]),
})

export async function voteMetricSentiment(
  grain: string,
  grainWeek: number,
  metric: string,
  sentiment: string
) {
  const parsed = schema.safeParse({ grain, grainWeek, metric, sentiment })
  if (!parsed.success) {
    return { error: "Invalid input" }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const role = await getUserRole()
  if (role === "observer") return { error: "Observers cannot vote" }

  const allowed = await consumeRateLimit(user.id, "metric-sentiment", 20, 300)
  if (!allowed) {
    return { error: "Rate limited", rateLimited: true, retryAfterSeconds: 300 }
  }

  const { error } = await supabase
    .from("metric_sentiment_votes")
    .upsert(
      {
        user_id: user.id,
        grain: parsed.data.grain,
        crop_year: CURRENT_CROP_YEAR,
        grain_week: parsed.data.grainWeek,
        metric: parsed.data.metric,
        sentiment: parsed.data.sentiment,
        voted_at: new Date().toISOString(),
      },
      { onConflict: "user_id,grain,crop_year,grain_week,metric" }
    )

  if (error) {
    console.error("voteMetricSentiment error:", error.message)
    return { error: "Failed to save vote" }
  }

  revalidatePath("/grain")
  return { success: true }
}
```

**Step 2: Create the query function**

`lib/queries/metric-sentiment.ts`:

```typescript
import { createClient } from "@/lib/supabase/server"
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year"

export interface MetricSentimentAggregate {
  metric: string
  bullish_count: number
  bearish_count: number
  total_votes: number
  bullish_pct: number
}

export interface UserMetricVote {
  metric: string
  sentiment: "bullish" | "bearish"
}

export async function getMetricSentiment(
  grain: string,
  grainWeek: number
): Promise<MetricSentimentAggregate[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_metric_sentiment", {
    p_grain: grain,
    p_crop_year: CURRENT_CROP_YEAR,
    p_grain_week: grainWeek,
  })

  if (error || !data) return []
  return (data as Record<string, unknown>[]).map((r) => ({
    metric: r.metric as string,
    bullish_count: Number(r.bullish_count) || 0,
    bearish_count: Number(r.bearish_count) || 0,
    total_votes: Number(r.total_votes) || 0,
    bullish_pct: Number(r.bullish_pct) || 0,
  }))
}

export async function getUserMetricVotes(
  grain: string,
  grainWeek: number
): Promise<UserMetricVote[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from("metric_sentiment_votes")
    .select("metric, sentiment")
    .eq("user_id", user.id)
    .eq("grain", grain)
    .eq("crop_year", CURRENT_CROP_YEAR)
    .eq("grain_week", grainWeek)

  if (error || !data) return []
  return data as UserMetricVote[]
}
```

**Step 3: Create the vote button client component**

`components/dashboard/metric-vote-button.tsx`:

```tsx
"use client"

import { useState } from "react"
import { TrendingUp, TrendingDown } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import { voteMetricSentiment } from "@/app/(dashboard)/grain/[slug]/metric-actions"
import { cn } from "@/lib/utils"

interface MetricVoteButtonProps {
  grain: string
  grainWeek: number
  metric: string // "deliveries" | "processing" | "exports" | "stocks"
  initialVote: "bullish" | "bearish" | null
  aggregate: { bullish_pct: number; total_votes: number } | null
  role?: "farmer" | "observer"
}

export function MetricVoteButton({
  grain,
  grainWeek,
  metric,
  initialVote,
  aggregate,
  role,
}: MetricVoteButtonProps) {
  const [vote, setVote] = useState(initialVote)
  const [loading, setLoading] = useState(false)
  const prefersReducedMotion = useReducedMotion()

  async function handleVote(sentiment: "bullish" | "bearish") {
    if (loading) return
    setLoading(true)
    setVote(sentiment) // optimistic

    const result = await voteMetricSentiment(grain, grainWeek, metric, sentiment)
    if (result.error) {
      setVote(initialVote) // revert
    }
    setLoading(false)
  }

  if (role === "observer") {
    // Show aggregate only
    if (!aggregate || aggregate.total_votes < 3) return null
    return (
      <span className="text-[10px] text-muted-foreground/50">
        {aggregate.bullish_pct}% bullish ({aggregate.total_votes} votes)
      </span>
    )
  }

  const Wrapper = prefersReducedMotion ? "button" : motion.button

  return (
    <div className="flex items-center gap-1">
      <Wrapper
        onClick={() => handleVote("bullish")}
        className={cn(
          "p-1 rounded transition-colors",
          vote === "bullish"
            ? "bg-prairie/15 text-prairie"
            : "text-muted-foreground/40 hover:text-prairie hover:bg-prairie/10"
        )}
        {...(!prefersReducedMotion && { whileTap: { scale: 0.9 } })}
        aria-label={`Vote ${metric} bullish`}
      >
        <TrendingUp className="h-3 w-3" />
      </Wrapper>
      <Wrapper
        onClick={() => handleVote("bearish")}
        className={cn(
          "p-1 rounded transition-colors",
          vote === "bearish"
            ? "bg-red-500/15 text-red-500"
            : "text-muted-foreground/40 hover:text-red-500 hover:bg-red-500/10"
        )}
        {...(!prefersReducedMotion && { whileTap: { scale: 0.9 } })}
        aria-label={`Vote ${metric} bearish`}
      >
        <TrendingDown className="h-3 w-3" />
      </Wrapper>
      {aggregate && aggregate.total_votes >= 3 && (
        <span className="text-[10px] text-muted-foreground/50 ml-0.5">
          {aggregate.bullish_pct}%↑
        </span>
      )}
    </div>
  )
}
```

**Step 4: Update KeyMetricsCards to accept vote props**

Add optional vote props to `KeyMetric` interface and render `MetricVoteButton` in each card:

```typescript
export interface KeyMetric {
  label: string
  currentWeekKt: number
  cropYearKt: number
  wowChangePct: number
  insight: string
  color: string
  metricKey?: string  // "deliveries" | "processing" | "exports" | "stocks"
  userVote?: "bullish" | "bearish" | null
  aggregate?: { bullish_pct: number; total_votes: number } | null
}

interface KeyMetricsCardsProps {
  metrics: KeyMetric[]
  grain?: string
  grainWeek?: number
  role?: "farmer" | "observer"
}
```

In each card, below the insight text, render the `MetricVoteButton` when `metricKey` is provided.

**Step 5: Build and verify**

Run: `npm run build`
Expected: Clean build.

**Step 6: Commit**

```bash
git add components/dashboard/metric-vote-button.tsx app/(dashboard)/grain/[slug]/metric-actions.ts lib/queries/metric-sentiment.ts components/dashboard/key-metrics-cards.tsx
git commit -m "feat: add per-card metric sentiment voting (bullish/bearish)"
```

---

### Task 6: Wire Everything Into Grain Page

**Files:**
- Modify: `app/(dashboard)/grain/[slug]/page.tsx`

**Step 1: Add imports and data fetches**

Add imports for `getMetricSentiment`, `getUserMetricVotes`, and `GrainIcon`. Add the data fetches to the parallel `Promise.all`:

```typescript
import { getMetricSentiment, getUserMetricVotes } from "@/lib/queries/metric-sentiment"
import { GrainIcon } from "@/components/ui/grain-icon"
```

Add to the `Promise.all` array:
```typescript
safeQuery("Metric sentiment", () => getMetricSentiment(grain.name, shippingWeek)),
safeQuery("User metric votes", () => getUserMetricVotes(grain.name, shippingWeek)),
```

**Step 2: Thread metric vote data into KeyMetricsCards**

In `buildKeyMetrics()`, add `metricKey` to each metric object:
```typescript
metrics.push({
  ...existing,
  metricKey: "deliveries",  // or "processing", "exports", "stocks"
  userVote: userMetricVotes.find(v => v.metric === "deliveries")?.sentiment ?? null,
  aggregate: metricAggregates.find(a => a.metric === "deliveries") ?? null,
})
```

Pass `grain`, `grainWeek`, and `role` to `<KeyMetricsCards>`:
```tsx
<KeyMetricsCards
  metrics={keyMetrics}
  grain={grain.name}
  grainWeek={shippingWeek}
  role={role}
/>
```

**Step 3: Add GrainIcon to hero section**

In the hero card, before the grain name `<h1>`:
```tsx
<GrainIcon grain={grain.name} size={28} className="text-canola" />
```

**Step 4: Build and verify**

Run: `npm run build`
Expected: Clean build.

**Step 5: Commit**

```bash
git add app/(dashboard)/grain/[slug]/page.tsx
git commit -m "feat: wire metric voting and grain icons into grain detail page"
```

---

### Task 7: Delivery Logging UX Improvements

**Files:**
- Modify: `app/(dashboard)/my-farm/page.tsx` or the delivery logging component
- Identify: Find the delivery form component

**Step 1: Find the delivery input component**

Search for the delivery logging form. It should be in `components/dashboard/` or in the my-farm client component.

Run: `grep -r "deliveries" components/dashboard/ --include="*.tsx" -l`

**Step 2: Default weight unit to kg**

Find where the weight input is and change the default unit from tonnes to kg. Add a unit toggle (kg/tonnes) if not already present.

**Step 3: Add destination helper text**

Below the destination input field, add:
```tsx
<p className="text-[11px] text-muted-foreground/50 mt-1">
  Adding your delivery point helps us bring you local elevator prices and features as they become available.
</p>
```

**Step 4: Add shipping week display**

On the My Farm page, near the top or in the hero section, show:
```tsx
<p className="text-xs text-muted-foreground">
  Grain Week {shippingWeek} · {weekStartDate} – {weekEndDate}
</p>
```

Use `grainWeekEndDate()` from `lib/utils/crop-year.ts` to compute the dates.

**Step 5: Build and verify**

Run: `npm run build`
Expected: Clean build.

**Step 6: Commit**

```bash
git add [modified files]
git commit -m "feat: improve delivery logging UX (kg default, destination explainer, week dates)"
```

---

### Task 8: Bull & Bear Content Quality — Edge Function Prompt Update

**Files:**
- Modify: `supabase/functions/generate-intelligence/prompt-template.ts`
- Modify: `supabase/functions/generate-intelligence/index.ts`

**Step 1: Update the Grok output schema**

In `index.ts`, find the JSON schema definition for Grok's response. Add two new fields:

```typescript
confidence_score: {
  type: "number",
  description: "Confidence in thesis, 0-100. Higher = more data supports thesis."
},
final_assessment: {
  type: "string",
  description: "1-2 sentence plain-English recommendation for a farmer deciding whether to sell or hold. No financial advice disclaimer needed — use 'data suggests' framing."
}
```

**Step 2: Update the prompt template**

In `prompt-template.ts`, add to the system prompt rules:

```
- bull_case and bear_case must use SHORT, plain-English bullet points. No jargon without inline context. Each bullet starts with a specific data point.
- Produce a confidence_score (0-100) based on how much data supports the thesis. <40 = low (few data points, contradictory signals), 40-70 = medium, >70 = high (multiple data sources agree).
- Produce a final_assessment: 1-2 sentences summarizing what a farmer should consider. Frame as "data suggests" not "you should". Example: "Data suggests holding — deliveries are running 15% below last year while crush demand stays strong, pointing to tighter supplies ahead."
```

**Step 3: Update the upsert to save new fields**

In `index.ts`, when upserting to `grain_intelligence`, save `confidence_score` and `final_assessment` if the table columns exist. If they don't, add a migration first:

```sql
ALTER TABLE grain_intelligence
  ADD COLUMN IF NOT EXISTS confidence_score SMALLINT,
  ADD COLUMN IF NOT EXISTS final_assessment TEXT;
```

**Step 4: Update BullBearCards to use new data**

The `BullBearCards` component already accepts `confidenceScore` and `finalAssessment` props (added in Wave 2 fix). Thread the new fields from `grain_intelligence` through the grain page:

In `page.tsx`, pass from intelligence data:
```tsx
<BullBearCards
  bullCase={marketAnalysis.bull_case}
  bearCase={marketAnalysis.bear_case}
  confidence={marketAnalysis.data_confidence}
  confidenceScore={intelligence?.confidence_score ?? undefined}
  finalAssessment={intelligence?.final_assessment ?? undefined}
/>
```

**Step 5: Deploy Edge Function**

Run: `npx supabase functions deploy generate-intelligence`
Expected: Deployed successfully.

**Step 6: Build and verify**

Run: `npm run build`
Expected: Clean build.

**Step 7: Commit**

```bash
git add supabase/functions/generate-intelligence/ supabase/migrations/*_add_intelligence_columns.sql
git commit -m "feat: enhance bull/bear content with confidence_score and final_assessment"
```

---

### Task 9: Documentation & STATUS.md

**Files:**
- Modify: `docs/plans/STATUS.md`
- Modify: `components/dashboard/CLAUDE.md` (update component list)

**Step 1: Update STATUS.md**

Add Track 25 entry:

```markdown
### Track 25: Wave 3 — Engagement & My Farm
**Status:** Complete
**What was delivered:**
- Per-card metric sentiment voting (bullish/bearish) on key metrics cards with `metric_sentiment_votes` table
- Custom grain family SVG icons (wheat, oilseed, barley, oats, pulse, corn, kernel)
- X signal voting (thumbs up/down) on CompactSignalStrip with optimistic UI
- Percentile distribution graph on My Farm (bell curve with farmer position marker)
- Delivery logging UX: kg default, destination explainer text, grain week dates
- Bull/Bear content quality: confidence_score (0-100) and final_assessment from Grok
```

**Step 2: Update dashboard CLAUDE.md**

Add new components to the component table:
- `grain-icon.tsx` — Custom SVG icons per grain family
- `metric-vote-button.tsx` — Per-card bullish/bearish toggle
- `percentile-graph.tsx` — Bell curve delivery pace visualization
- `farmer-cot-card.tsx` — Farmer-friendly COT visualization (replaces CotPositioningCard)

**Step 3: Commit**

```bash
git add docs/plans/STATUS.md components/dashboard/CLAUDE.md
git commit -m "docs: update STATUS.md and component guide for Wave 3"
```

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| `metric_sentiment_votes` migration fails | Test RPC in SQL editor before proceeding |
| Rate limiting not available for new action | Reuse existing `consumeRateLimit` from `lib/utils/rate-limit.ts` |
| SVG icons don't render at small sizes | Test at 16px, 24px, 32px; simplify paths if needed |
| Percentile data missing for small cohorts | Privacy threshold (≥5 farmers) already enforced by `get_delivery_analytics` RPC |
| Edge Function prompt changes break JSON parsing | Test with one grain first, verify structured output before batch |
| `motion.button` type errors | Use `as const` on ease arrays, conditional rendering for reduced-motion |
