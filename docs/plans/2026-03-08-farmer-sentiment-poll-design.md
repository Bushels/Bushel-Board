# Farmer Sentiment Poll — Design Doc

**Date:** 2026-03-08
**Status:** Approved
**Author:** Claude (brainstorming session with Kyle)

## Overview

Add a weekly farmer sentiment poll to each grain detail page (`/grain/[slug]`) that captures whether farmers are "holding" or "hauling" their grain. This crowdsourced signal can be used to predict next-week producer deliveries and enrich AI-generated market intelligence narratives.

## Requirements

- Poll appears on each grain detail page, per-grain
- 5-point scale: Strongly Holding → Holding → Neutral → Hauling → Strongly Hauling
- One vote per user per grain per week (can change vote within the week)
- Weekly reset is natural — votes are keyed by `(user_id, grain, crop_year, grain_week)`
- After voting, user sees live community sentiment results
- Only authenticated users with the grain unlocked can vote

## Database

### Table: `grain_sentiment_votes`

```sql
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

-- RLS: users can manage own votes
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

### Sentiment Scale

| Value | Label | Icon |
|-------|-------|------|
| 1 | Strongly Holding | 🔒 |
| 2 | Holding | — |
| 3 | Neutral | ⚖️ |
| 4 | Hauling | — |
| 5 | Strongly Hauling | 🚛 |

### View: `v_grain_sentiment`

Aggregate view — readable by all authenticated users (not individual votes, just aggregates).

```sql
CREATE VIEW v_grain_sentiment AS
SELECT
  grain,
  crop_year,
  grain_week,
  COUNT(*) AS vote_count,
  ROUND(AVG(sentiment)::numeric, 2) AS avg_sentiment,
  ROUND(100.0 * COUNT(*) FILTER (WHERE sentiment >= 4) / NULLIF(COUNT(*), 0), 1) AS pct_hauling,
  ROUND(100.0 * COUNT(*) FILTER (WHERE sentiment <= 2) / NULLIF(COUNT(*), 0), 1) AS pct_holding,
  ROUND(100.0 * COUNT(*) FILTER (WHERE sentiment = 3) / NULLIF(COUNT(*), 0), 1) AS pct_neutral
FROM grain_sentiment_votes
GROUP BY grain, crop_year, grain_week;
```

Grant SELECT on `v_grain_sentiment` to authenticated role so all logged-in users can see aggregate results (but not individual votes).

## UI Component: `SentimentPoll`

### Placement

On the grain detail page (`/grain/[slug]`), between the Intelligence section and the Primary KPI Grid.

### States

**Pre-vote (user hasn't voted this week):**
- Header: "Week {N} Farmer Sentiment"
- Subtext: "Are you holding or hauling {grain}?"
- 5 buttons in a horizontal row, wheat-themed styling
- Single click submits — no separate submit button

**Post-vote (user has voted):**
- User's selected option highlighted
- Horizontal sentiment gauge bar:
  - Left label: "Holding {pct_holding}%"
  - Right label: "Hauling {pct_hauling}%"
  - Gradient bar from holding (left) to hauling (right)
- Vote count badge: "{vote_count} farmers voted"
- User can change vote by clicking a different option (upsert)

**Not authenticated / grain not unlocked:**
- Component not rendered (handled by existing page-level checks)

### Design Tokens

- Use existing wheat palette for the card
- Holding side: `text-amber-600` / `bg-amber-100` (grain stored)
- Hauling side: `text-prairie` / `bg-prairie/10` (grain moving)
- Neutral: `text-muted-foreground`
- Gauge bar: CSS gradient from amber to prairie
- Animation: 40ms stagger on button appearance, smooth gauge fill transition

## Query Layer

`lib/queries/sentiment.ts`:

```typescript
// Get aggregate sentiment for a grain/week
async function getGrainSentiment(
  supabase: SupabaseClient,
  grain: string,
  cropYear: string,
  grainWeek: number
): Promise<GrainSentiment | null>

// Get the current user's vote for a grain/week
async function getUserSentimentVote(
  supabase: SupabaseClient,
  grain: string,
  cropYear: string,
  grainWeek: number
): Promise<number | null>

// Submit or update a vote (upsert)
async function submitSentimentVote(
  supabase: SupabaseClient,
  grain: string,
  cropYear: string,
  grainWeek: number,
  sentiment: number
): Promise<void>
```

## Server Action

`app/(dashboard)/grain/[slug]/actions.ts` — add a `voteSentiment` server action:

```typescript
async function voteSentiment(grain: string, sentiment: number): Promise<ActionResult>
```

- Derives `cropYear` and `grainWeek` from current data
- Validates sentiment is 1-5
- Upserts via `submitSentimentVote`
- Returns updated aggregate for immediate UI refresh

## Integration with Intelligence Pipeline (Future)

The `v_grain_sentiment` data can be passed as context to `generate-intelligence` Edge Function, allowing AI narratives to reference farmer sentiment (e.g., "62% of farmers report hauling canola this week, suggesting strong deliveries ahead"). This is a future enhancement — not part of this build.

## Out of Scope

- Realtime subscriptions (votes update on page refresh or after own vote)
- Sentiment trend charts (historical view of sentiment over weeks)
- Anonymous voting (all votes are authenticated)
- Notifications when sentiment shifts dramatically
