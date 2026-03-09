# Farmer Sentiment Poll — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a weekly "Holding vs Hauling" sentiment poll to each grain detail page, allowing farmers to vote on their grain selling intent and see live community results.

**Architecture:** New `grain_sentiment_votes` table with RLS in Supabase, aggregated by a `v_grain_sentiment` view. A `SentimentPoll` client component on the grain detail page calls a server action to upsert votes. Votes are keyed by `(user_id, grain, crop_year, grain_week)` so each week starts fresh automatically.

**Tech Stack:** Supabase (PostgreSQL, RLS), Next.js 16 server actions, React client component, Tailwind CSS, shadcn/ui primitives.

**Design Doc:** `docs/plans/2026-03-08-farmer-sentiment-poll-design.md`

---

## Task 1: Database Migration — Table & RLS

**Agent:** db-architect
**Files:**
- Create: `../bushel-board-app/supabase/migrations/20260308100000_grain_sentiment.sql`

**Step 1: Write the migration file**

```sql
-- Farmer sentiment votes: one vote per user per grain per week
CREATE TABLE grain_sentiment_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grain text NOT NULL,
  crop_year text NOT NULL,
  grain_week integer NOT NULL CHECK (grain_week BETWEEN 1 AND 52),
  sentiment smallint NOT NULL CHECK (sentiment BETWEEN 1 AND 5),
  voted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, grain, crop_year, grain_week)
);

-- Index for fast aggregate queries per grain/week
CREATE INDEX idx_sentiment_grain_week
  ON grain_sentiment_votes (grain, crop_year, grain_week);

-- RLS
ALTER TABLE grain_sentiment_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own votes"
  ON grain_sentiment_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own votes"
  ON grain_sentiment_votes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own votes"
  ON grain_sentiment_votes FOR SELECT
  USING (auth.uid() = user_id);
```

**Step 2: Apply migration**

Run: `npx supabase db push` from `../bushel-board-app/`
Expected: Migration applies successfully.

**Step 3: Commit**

```bash
git add supabase/migrations/20260308100000_grain_sentiment.sql
git commit -m "feat: add grain_sentiment_votes table with RLS"
```

---

## Task 2: Database Migration — Aggregate View

**Agent:** db-architect
**Files:**
- Create: `../bushel-board-app/supabase/migrations/20260308100100_grain_sentiment_view.sql`

**Step 1: Write the view migration**

```sql
-- Aggregate sentiment view (readable by all authenticated users)
CREATE VIEW v_grain_sentiment AS
SELECT
  grain,
  crop_year,
  grain_week,
  COUNT(*)::int AS vote_count,
  ROUND(AVG(sentiment)::numeric, 2) AS avg_sentiment,
  ROUND(100.0 * COUNT(*) FILTER (WHERE sentiment >= 4) / NULLIF(COUNT(*), 0), 1) AS pct_hauling,
  ROUND(100.0 * COUNT(*) FILTER (WHERE sentiment <= 2) / NULLIF(COUNT(*), 0), 1) AS pct_holding,
  ROUND(100.0 * COUNT(*) FILTER (WHERE sentiment = 3) / NULLIF(COUNT(*), 0), 1) AS pct_neutral
FROM grain_sentiment_votes
GROUP BY grain, crop_year, grain_week;

-- Grant authenticated users SELECT on the aggregate view
GRANT SELECT ON v_grain_sentiment TO authenticated;
```

**Step 2: Apply migration**

Run: `npx supabase db push` from `../bushel-board-app/`
Expected: View created, grants applied.

**Step 3: Commit**

```bash
git add supabase/migrations/20260308100100_grain_sentiment_view.sql
git commit -m "feat: add v_grain_sentiment aggregate view"
```

---

## Task 3: Query Layer

**Agent:** db-architect
**Files:**
- Create: `../bushel-board-app/lib/queries/sentiment.ts`

**Step 1: Write the query functions**

Create `lib/queries/sentiment.ts` with three functions following the existing pattern in `lib/queries/observations.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

export interface GrainSentiment {
  grain: string;
  crop_year: string;
  grain_week: number;
  vote_count: number;
  avg_sentiment: number;
  pct_hauling: number;
  pct_holding: number;
  pct_neutral: number;
}

/**
 * Get aggregate sentiment for a grain in a given week.
 */
export async function getGrainSentiment(
  supabase: SupabaseClient,
  grain: string,
  cropYear: string,
  grainWeek: number
): Promise<GrainSentiment | null> {
  const { data, error } = await supabase
    .from("v_grain_sentiment")
    .select("*")
    .eq("grain", grain)
    .eq("crop_year", cropYear)
    .eq("grain_week", grainWeek)
    .single();

  if (error || !data) return null;
  return data as GrainSentiment;
}

/**
 * Get the current user's sentiment vote for a grain/week.
 */
export async function getUserSentimentVote(
  supabase: SupabaseClient,
  grain: string,
  cropYear: string,
  grainWeek: number
): Promise<number | null> {
  const { data, error } = await supabase
    .from("grain_sentiment_votes")
    .select("sentiment")
    .eq("grain", grain)
    .eq("crop_year", cropYear)
    .eq("grain_week", grainWeek)
    .single();

  if (error || !data) return null;
  return data.sentiment;
}

/**
 * Upsert a sentiment vote for the current user.
 */
export async function submitSentimentVote(
  supabase: SupabaseClient,
  userId: string,
  grain: string,
  cropYear: string,
  grainWeek: number,
  sentiment: number
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("grain_sentiment_votes")
    .upsert(
      {
        user_id: userId,
        grain,
        crop_year: cropYear,
        grain_week: grainWeek,
        sentiment,
        voted_at: new Date().toISOString(),
      },
      { onConflict: "user_id,grain,crop_year,grain_week" }
    );

  if (error) return { error: error.message };
  return {};
}
```

**Step 2: Commit**

```bash
git add lib/queries/sentiment.ts
git commit -m "feat: add sentiment query layer"
```

---

## Task 4: Server Action

**Agent:** frontend-dev
**Files:**
- Create: `../bushel-board-app/app/(dashboard)/grain/[slug]/actions.ts`

**Step 1: Write the server action**

Create the actions file following the pattern in `app/(dashboard)/my-farm/actions.ts`:

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import { submitSentimentVote } from "@/lib/queries/sentiment";
import { z } from "zod";

const voteSchema = z.object({
  grain: z.string().min(1),
  sentiment: z.coerce.number().int().min(1).max(5),
  grainWeek: z.coerce.number().int().min(1).max(52),
});

export async function voteSentiment(
  grain: string,
  sentiment: number,
  grainWeek: number
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const parsed = voteSchema.safeParse({ grain, sentiment, grainWeek });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const result = await submitSentimentVote(
    supabase,
    user.id,
    parsed.data.grain,
    CURRENT_CROP_YEAR,
    parsed.data.grainWeek,
    parsed.data.sentiment
  );

  if (result.error) return { error: result.error };

  revalidatePath(`/grain`);
  return { success: true };
}
```

**Step 2: Commit**

```bash
git add app/\(dashboard\)/grain/\[slug\]/actions.ts
git commit -m "feat: add voteSentiment server action"
```

---

## Task 5: SentimentPoll UI Component

**Agent:** frontend-dev (with ui-agent for design review)
**Files:**
- Create: `../bushel-board-app/components/dashboard/sentiment-poll.tsx`

**Step 1: Build the client component**

Create `components/dashboard/sentiment-poll.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { voteSentiment } from "@/app/(dashboard)/grain/[slug]/actions";

const SENTIMENT_OPTIONS = [
  { value: 1, label: "Strongly Holding", short: "Strong Hold", icon: "🔒" },
  { value: 2, label: "Holding", short: "Hold", icon: "📦" },
  { value: 3, label: "Neutral", short: "Neutral", icon: "⚖️" },
  { value: 4, label: "Hauling", short: "Haul", icon: "🚜" },
  { value: 5, label: "Strongly Hauling", short: "Strong Haul", icon: "🚛" },
] as const;

interface SentimentPollProps {
  grain: string;
  grainWeek: number;
  initialVote: number | null;
  initialAggregate: {
    vote_count: number;
    avg_sentiment: number;
    pct_hauling: number;
    pct_holding: number;
    pct_neutral: number;
  } | null;
}

export function SentimentPoll({
  grain,
  grainWeek,
  initialVote,
  initialAggregate,
}: SentimentPollProps) {
  const [userVote, setUserVote] = useState<number | null>(initialVote);
  const [aggregate, setAggregate] = useState(initialAggregate);
  const [isPending, startTransition] = useTransition();
  const [hasVoted, setHasVoted] = useState(initialVote !== null);

  function handleVote(sentiment: number) {
    setUserVote(sentiment);

    startTransition(async () => {
      const result = await voteSentiment(grain, sentiment, grainWeek);
      if (result.success) {
        setHasVoted(true);
        // Optimistically update aggregate (will be corrected on next page load)
        if (aggregate) {
          setAggregate({ ...aggregate });
        }
      }
    });
  }

  return (
    <Card className="border-canola/20 bg-gradient-to-br from-background to-canola/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-display flex items-center justify-between">
          <span>Week {grainWeek} Farmer Sentiment</span>
          {hasVoted && aggregate && (
            <span className="text-xs font-sans font-normal text-muted-foreground">
              {aggregate.vote_count} farmer{aggregate.vote_count !== 1 ? "s" : ""} voted
            </span>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Are you holding or hauling {grain.toLowerCase()} this week?
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Vote buttons */}
        <div className="flex gap-2">
          {SENTIMENT_OPTIONS.map((option, i) => (
            <button
              key={option.value}
              onClick={() => handleVote(option.value)}
              disabled={isPending}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition-all",
                "hover:border-canola/50 hover:bg-canola/5",
                "animate-in fade-in slide-in-from-bottom-2",
                userVote === option.value
                  ? "border-canola bg-canola/10 ring-1 ring-canola/30 font-semibold"
                  : "border-border/50 bg-background",
                isPending && "opacity-60 cursor-wait"
              )}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span className="text-lg">{option.icon}</span>
              <span className="hidden sm:inline">{option.short}</span>
            </button>
          ))}
        </div>

        {/* Results gauge (shown after voting) */}
        {hasVoted && aggregate && (
          <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Labels */}
            <div className="flex justify-between text-xs font-medium">
              <span className="text-amber-600">
                Holding {aggregate.pct_holding}%
              </span>
              <span className="text-muted-foreground">
                {aggregate.pct_neutral}% neutral
              </span>
              <span className="text-prairie">
                Hauling {aggregate.pct_hauling}%
              </span>
            </div>
            {/* Gauge bar */}
            <div className="h-3 rounded-full overflow-hidden bg-muted flex">
              <div
                className="bg-amber-500 transition-all duration-500"
                style={{ width: `${aggregate.pct_holding}%` }}
              />
              <div
                className="bg-muted-foreground/30 transition-all duration-500"
                style={{ width: `${aggregate.pct_neutral}%` }}
              />
              <div
                className="bg-prairie transition-all duration-500"
                style={{ width: `${aggregate.pct_hauling}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 2: Commit**

```bash
git add components/dashboard/sentiment-poll.tsx
git commit -m "feat: add SentimentPoll UI component"
```

---

## Task 6: Integrate into Grain Detail Page

**Agent:** frontend-dev
**Files:**
- Modify: `../bushel-board-app/app/(dashboard)/grain/[slug]/page.tsx`

**Step 1: Add imports and data fetching**

At the top of `page.tsx`, add these imports after the existing ones:

```typescript
import { getGrainSentiment, getUserSentimentVote } from "@/lib/queries/sentiment";
import { SentimentPoll } from "@/components/dashboard/sentiment-poll";
```

Inside `GrainDetailPage`, after line 77 (the `Promise.all` block), add sentiment data fetching. Modify the `Promise.all` to include sentiment queries. Since we need `user.id`, fetch sentiment after the parallel data load:

```typescript
// After the existing Promise.all (line 69-77), add:
// Fetch latest grain week from the delivery data
const latestGrainWeek = deliveries.length > 0
  ? Math.max(...deliveries.map(d => d.grain_week))
  : 1;

// Fetch sentiment data (user vote + aggregate)
const [userVote, sentimentAggregate] = await Promise.all([
  getUserSentimentVote(supabase, grain.name, CURRENT_CROP_YEAR, latestGrainWeek),
  getGrainSentiment(supabase, grain.name, CURRENT_CROP_YEAR, latestGrainWeek),
]);
```

**Step 2: Add the SentimentPoll component to the JSX**

Insert the `SentimentPoll` component after the InsightCards section (after line 143) and before the Primary KPI Grid (line 145):

```tsx
      {/* Farmer Sentiment Poll */}
      <SentimentPoll
        grain={grain.name}
        grainWeek={latestGrainWeek}
        initialVote={userVote}
        initialAggregate={sentimentAggregate}
      />
```

**Step 3: Verify the page builds**

Run: `npm run build` from `../bushel-board-app/`
Expected: Build succeeds with no errors.

**Step 4: Commit**

```bash
git add app/\(dashboard\)/grain/\[slug\]/page.tsx
git commit -m "feat: integrate SentimentPoll into grain detail page"
```

---

## Task 7: Manual Verification & Polish

**Agent:** frontend-dev
**Files:**
- May modify: `../bushel-board-app/components/dashboard/sentiment-poll.tsx`

**Step 1: Start dev server and test**

Run: `npm run dev` from `../bushel-board-app/`

Test checklist:
1. Navigate to `/grain/canola` (or any unlocked grain)
2. Verify the sentiment poll card appears between Market Signals and Primary KPI Grid
3. Click a sentiment option — verify it highlights and submits
4. Refresh the page — verify your vote persists and results show
5. Click a different option — verify vote changes (upsert works)
6. Check responsive layout — buttons should stack labels on mobile

**Step 2: Fix any visual issues found during testing**

Adjust spacing, colors, or responsive breakpoints as needed.

**Step 3: Final commit**

```bash
git add -A
git commit -m "polish: sentiment poll visual refinements"
```

---

## Task Summary

| Task | Agent | Description |
|------|-------|-------------|
| 1 | db-architect | Create `grain_sentiment_votes` table + RLS |
| 2 | db-architect | Create `v_grain_sentiment` aggregate view |
| 3 | db-architect | Query layer (`lib/queries/sentiment.ts`) |
| 4 | frontend-dev | Server action (`voteSentiment`) |
| 5 | frontend-dev + ui-agent | `SentimentPoll` client component |
| 6 | frontend-dev | Integrate into grain detail page |
| 7 | frontend-dev | Manual testing & polish |

**Parallelizable:** Tasks 1-2 (DB) can run in parallel with task prep. Tasks 3-4 depend on 1-2. Task 5 can start in parallel with 3-4. Task 6 depends on 3-5. Task 7 depends on 6.
