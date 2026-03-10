# X Feed & Relevance Scoring — Feature Design

**Date:** 2026-03-10
**Status:** Draft
**Author:** Kyle + Claude
**Dependencies:** x_market_signals table, search-x-intelligence Edge Function, generate-intelligence Edge Function

---

## Problem Statement

Bushel Board already searches X/Twitter for grain market signals and scores them with Grok. But the scoring is one-size-fits-all — a Saskatchewan canola farmer and a Manitoba wheat farmer see the same relevance scores. Posts that matter deeply to one farmer are noise to another.

We need farmer feedback to make the signal more personal and the intelligence more useful. The farmer should feel like they're training their own market analyst.

---

## Design Philosophy: The Farmer's Feed

This isn't a social media timeline. It's a **market signal feed** — curated posts that affect your farm, your crops, your region. The farmer interaction should feel like sorting grain samples: quick, decisive, binary.

**Mental model:** "Here's what people are saying about your grain this week. Tell us what matters and we'll get smarter."

---

## Feature Overview

### What the Farmer Sees

A horizontal scrollable card strip (or vertical feed on mobile) of X post summaries on each grain detail page, replacing the current "View X sources" drawer-only pattern. Each card has:

- Post summary (1-2 sentences, already in `x_market_signals.post_summary`)
- Author handle + date
- Sentiment badge (bullish/bearish/neutral — already scored)
- Category pill (farmer report, analyst, export news, etc. — already scored)
- **Two action buttons:** ✓ Relevant / ✗ Not for me

After tapping, the card slides to a muted state showing their vote, and the next card gets subtle emphasis. After all cards are reviewed (or skipped), a summary appears: "You found 4 of 8 posts relevant this week. We'll tune your feed."

### What Happens Behind the Scenes

1. Votes stored in `signal_feedback` table with the farmer's user_id, province, and active crop list
2. Aggregated into `v_signal_relevance_scores` view
3. Fed back into `generate-intelligence` prompt as "farmer relevance weights"
4. Over time, per-grain relevance scores adjust based on farmer consensus

---

## Data Model

### New Table: `signal_feedback`

```sql
CREATE TABLE signal_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_id uuid NOT NULL REFERENCES x_market_signals(id) ON DELETE CASCADE,
  relevant boolean NOT NULL, -- true = relevant, false = not relevant
  -- Denormalized context for analytics (avoids joins in aggregation)
  user_province text, -- 'AB', 'SK', 'MB' — from user profile at vote time
  user_crops text[], -- ['Canola', 'Wheat'] — from crop_plans at vote time
  grain text NOT NULL, -- from x_market_signals.grain (denormalized for fast queries)
  crop_year text NOT NULL,
  grain_week integer NOT NULL,
  voted_at timestamptz DEFAULT now(),

  UNIQUE(user_id, signal_id) -- one vote per user per post
);

-- Indexes for aggregation queries
CREATE INDEX idx_signal_feedback_signal ON signal_feedback(signal_id);
CREATE INDEX idx_signal_feedback_grain_week ON signal_feedback(grain, crop_year, grain_week);
CREATE INDEX idx_signal_feedback_user ON signal_feedback(user_id);

-- RLS: users can vote and read their own votes, aggregates are public
ALTER TABLE signal_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own feedback"
  ON signal_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own feedback"
  ON signal_feedback FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can read own feedback"
  ON signal_feedback FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can read all for aggregation
CREATE POLICY "Service role reads all feedback"
  ON signal_feedback FOR SELECT
  USING (auth.role() = 'service_role');
```

### New View: `v_signal_relevance_scores`

Aggregates farmer votes to create a community-weighted relevance score per signal.

```sql
CREATE OR REPLACE VIEW v_signal_relevance_scores AS
SELECT
  sf.signal_id,
  xs.grain,
  xs.crop_year,
  xs.grain_week,
  xs.post_summary,
  xs.sentiment,
  xs.category,
  xs.relevance_score AS grok_relevance, -- original AI score
  COUNT(*) AS total_votes,
  COUNT(*) FILTER (WHERE sf.relevant = true) AS relevant_votes,
  COUNT(*) FILTER (WHERE sf.relevant = false) AS not_relevant_votes,
  ROUND(
    COUNT(*) FILTER (WHERE sf.relevant = true)::numeric / NULLIF(COUNT(*), 0) * 100
  ) AS farmer_relevance_pct, -- 0-100, farmer consensus score
  -- Province breakdown
  COUNT(*) FILTER (WHERE sf.relevant = true AND sf.user_province = 'SK') AS sk_relevant,
  COUNT(*) FILTER (WHERE sf.relevant = true AND sf.user_province = 'AB') AS ab_relevant,
  COUNT(*) FILTER (WHERE sf.relevant = true AND sf.user_province = 'MB') AS mb_relevant,
  -- Blended score: 60% Grok original + 40% farmer consensus (when votes >= 3)
  CASE
    WHEN COUNT(*) >= 3 THEN
      ROUND(xs.relevance_score * 0.6 +
        (COUNT(*) FILTER (WHERE sf.relevant = true)::numeric / NULLIF(COUNT(*), 0) * 100) * 0.4)
    ELSE xs.relevance_score -- Not enough votes, use Grok score only
  END AS blended_relevance
FROM signal_feedback sf
JOIN x_market_signals xs ON xs.id = sf.signal_id
GROUP BY sf.signal_id, xs.grain, xs.crop_year, xs.grain_week,
         xs.post_summary, xs.sentiment, xs.category, xs.relevance_score;
```

### Why Denormalize user_province and user_crops?

Aggregation queries that join signal_feedback → profiles → crop_plans would be slow and complex. By snapshotting the farmer's context at vote time:

1. Queries are fast (no joins needed for provincial breakdowns)
2. Historical accuracy — if a farmer changes provinces, their old votes still reflect where they were
3. Crop context enables future "farmers who grow canola found this relevant" filtering

---

## Feedback Loop Into Intelligence Pipeline

### How It Flows Back to Grok

The `generate-intelligence` Edge Function already fetches top 10 x_market_signals per grain. We modify it to:

1. **Join `v_signal_relevance_scores`** when fetching signals
2. **Sort by `blended_relevance`** instead of raw `relevance_score`
3. **Include farmer relevance data in the Grok prompt:**

```
### X/Twitter Signals (scored by AI + verified by farmers)
| Post Summary | Grok Score | Farmer Relevance | Votes | Sentiment |
|---|---|---|---|---|
| China canola orders accelerating... | 85 | 92% (12 votes) | ✓ farmer-validated | bullish |
| US corn basis widening in... | 72 | 33% (9 votes) | ✗ farmers say noise | neutral |
```

4. **Add prompt instruction:**
> "Posts marked as 'farmer-validated' (farmer_relevance_pct >= 70%, votes >= 3) should be weighted heavily in your analysis — real farmers on the prairies confirmed these signals matter. Posts marked as 'farmers say noise' (farmer_relevance_pct < 40%, votes >= 3) should be deprioritized or excluded unless the underlying data contradicts farmer sentiment."

### Why This Works

- **V1 is prompt engineering, not model training.** No fine-tuning needed. Farmer votes simply reweight which signals Grok pays attention to.
- **Grok can still override farmer consensus** if the underlying data is strong — e.g., a policy announcement that farmers dismiss as noise but actually moves markets.
- **The blended score ensures cold-start isn't broken** — new posts with no votes still use Grok's original relevance score.
- **As vote volume grows**, you can lower the Grok weight (e.g., 40% Grok / 60% farmer) or add per-crop/per-region weighting.

---

## UI Component Design

### Component: `XSignalFeed`

**Location:** `components/dashboard/x-signal-feed.tsx`
**Placement:** Grain detail page, below Intelligence KPIs, above Insight Cards

```
┌─────────────────────────────────────────────────────┐
│  📡 Market Signals from X        Week 30 · 8 posts  │
│                                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ 🟢 bullish   │ │ 🔴 bearish   │ │ 🟡 watch     │ │
│  │              │ │              │ │              │ │
│  │ "China canola│ │ "US tariff   │ │ "Port of Van │ │
│  │  orders are  │ │  threat on   │ │  reporting   │ │
│  │  accelerat..."│ │  Canadian..."│ │  record..."  │ │
│  │              │ │              │ │              │ │
│  │ @grainsanalys│ │ @agpolicy    │ │ @portvanc    │ │
│  │ Mar 5        │ │ Mar 7        │ │ Mar 6        │ │
│  │              │ │              │ │              │ │
│  │ [✓ Relevant] │ │ [✗ Not mine] │ │ [✓] [✗]     │ │
│  │  "4 farmers  │ │  (voted)     │ │              │ │
│  │   agree"     │ │              │ │              │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ │
│                                         ← scroll →  │
│                                                      │
│  ┌─ Your impact ─────────────────────────────────┐  │
│  │ You rated 5/8 posts · 67% matched other SK    │  │
│  │ canola farmers · Your feed is getting smarter  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Interaction Flow

1. **Initial state:** Cards show post summary, author, date, sentiment badge, category pill
2. **Unvoted cards:** Two buttons at bottom — "✓ Relevant" (prairie green) and "✗ Not for me" (muted)
3. **On vote:**
   - Card animates to muted state (opacity 0.7, voted badge appears)
   - If other farmers voted, show consensus: "4 farmers agree" or "Most farmers skipped this"
   - Subtle confetti on first vote of the session (gamification, matches sentiment-poll pattern)
4. **Already-voted cards:** Show the user's vote with option to change
5. **Scroll indicator:** Subtle arrow or dots showing more cards to the right
6. **Summary bar:** After viewing all cards, show "Your impact" bar with stats

### Mobile Consideration

On mobile (<640px), switch from horizontal scroll to vertical stack with swipe gestures:
- Swipe right = relevant (green flash)
- Swipe left = not relevant (muted flash)
- Tap to expand full post summary

This mirrors the Tinder UX pattern, which is intuitive and fast for binary decisions.

---

## Query Layer Addition

### `lib/queries/x-signals.ts` — Enhanced

```typescript
// New: Get signals with user's feedback status
interface XSignalWithFeedback extends XMarketSignal {
  user_voted: boolean;
  user_relevant: boolean | null;
  total_votes: number;
  farmer_relevance_pct: number | null;
  blended_relevance: number;
}

async function getXSignalsWithFeedback(
  supabase: SupabaseClient,
  grainName: string,
  userId: string,
  grainWeek?: number
): Promise<XSignalWithFeedback[]>

// New: Submit or update feedback
async function submitSignalFeedback(
  supabase: SupabaseClient,
  userId: string,
  signalId: string,
  relevant: boolean,
  context: { province: string; crops: string[]; grain: string; cropYear: string; grainWeek: number }
): Promise<{ error?: string }>

// New: Get user's feed stats
interface FeedStats {
  total_signals: number;
  voted_count: number;
  relevant_count: number;
  agreement_pct: number; // how often user agrees with farmer consensus
}

async function getUserFeedStats(
  supabase: SupabaseClient,
  userId: string,
  cropYear: string,
  grainWeek: number
): Promise<FeedStats>
```

---

## Server Actions

### `app/actions/signal-feedback.ts`

```typescript
"use server"

import { createServerClient } from "@/lib/supabase/server";

export async function voteSignalRelevance(
  signalId: string,
  relevant: boolean,
  grain: string,
  cropYear: string,
  grainWeek: number
) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Get user context (province + crops) from profile/crop_plans
  const { data: profile } = await supabase
    .from("profiles")
    .select("province")
    .eq("id", user.id)
    .single();

  const { data: crops } = await supabase
    .from("crop_plans")
    .select("grain")
    .eq("user_id", user.id)
    .eq("crop_year", cropYear);

  // Upsert feedback
  const { error } = await supabase
    .from("signal_feedback")
    .upsert({
      user_id: user.id,
      signal_id: signalId,
      relevant,
      user_province: profile?.province || null,
      user_crops: crops?.map(c => c.grain) || [],
      grain,
      crop_year: cropYear,
      grain_week: grainWeek,
    }, {
      onConflict: "user_id,signal_id",
    });

  return { error: error?.message };
}
```

---

## Implementation Plan

### Phase 1: Data Layer (1-2 tasks)
1. Create `signal_feedback` migration + `v_signal_relevance_scores` view
2. Add RLS policies and indexes

### Phase 2: Query + Actions (1-2 tasks)
3. Extend `lib/queries/x-signals.ts` with feedback-aware queries
4. Create `app/actions/signal-feedback.ts` server action

### Phase 3: UI Component (2-3 tasks)
5. Build `XSignalFeed` component with horizontal scroll
6. Wire up vote actions + optimistic UI updates
7. Add "Your impact" summary bar with feed stats

### Phase 4: Pipeline Integration (1-2 tasks)
8. Modify `generate-intelligence` to fetch blended relevance scores
9. Update Grok prompt template to include farmer validation signals

### Phase 5: Refinement (future)
10. Per-region relevance weighting (SK canola farmers vs. MB wheat farmers)
11. "Farmers like you found this useful" collaborative filtering
12. Category-level preferences (some farmers care about policy, others about weather)

---

## Complexity Assessment

**Overall: Medium difficulty**

| Component | Difficulty | Notes |
|-----------|-----------|-------|
| Data model | Easy | Standard table + view, follows existing patterns |
| RLS policies | Easy | Same pattern as `grain_sentiment_votes` |
| Query layer | Easy | Extends existing `x-signals.ts` |
| Server action | Easy | Same pattern as `voteSentiment()` |
| UI component | Medium | Horizontal scroll + vote animations + responsive |
| Pipeline integration | Medium | Prompt engineering + blended scoring logic |
| Mobile swipe UX | Medium | Touch gestures, but can defer to V2 |

**What makes it manageable:** You've already built the exact same pattern with sentiment voting. This is that pattern applied to X signal cards instead of a 1-5 scale.

**What could get complex later:** Collaborative filtering (Phase 5) — "farmers who grow the same crops as you found these relevant." That's a recommendation engine, which is a real project. But V1 with simple aggregation gets you 80% of the value.

---

## Design Token Usage

Following existing Bushel Board tokens:

| Element | Token |
|---------|-------|
| Feed background | wheat-50 / wheat-900 dark |
| "Relevant" button | prairie (#437a22) |
| "Not for me" button | wheat-300 / wheat-600 dark |
| Sentiment badges | Existing: bullish=prairie, bearish=red-600, neutral=wheat-500 |
| Category pills | Existing: outlined, text-xs |
| Card border | wheat-200 / wheat-700 dark |
| Voted state | opacity-70, border-canola |
| Impact bar | canola (#c17f24) gradient |
| Animation | cubic-bezier(0.16, 1, 0.3, 1), 40ms stagger |

---

## Design Decisions (Resolved)

1. **Farmers do NOT see each other's votes.** No social proof, no anchoring bias. Each farmer votes independently based on their own judgment. The "Your impact" bar shows personal stats only (e.g., "You rated 5/8 posts") — no consensus numbers exposed to the user.

2. **Minimum vote threshold for blended score: 3 votes.** Below 3 votes, Grok's original score is used alone. This prevents a single farmer's vote from swinging the blended score.

3. **Do NOT expose the X post URL.** Summaries only — keeps farmers in-app and avoids X/Twitter rabbit holes. If a farmer wants to find the original post, they can search by the author handle shown on the card.

4. **Rate limiting deferred.** Not needed for V1 — only 10-20 signals per grain per week. Revisit if "report this signal" or other abuse vectors are added later.
