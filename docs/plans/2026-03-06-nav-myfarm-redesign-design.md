# Navigation Redesign & My Farm Enhancement — Design Doc

**Date:** 2026-03-06
**Status:** Implemented
**Implementation:** `docs/plans/2026-03-06-nav-myfarm-redesign-implementation.md` (15 tasks)
**Author:** Claude (brainstorming session with Kyle)

## Problem

The current navigation shows individual grain links in the top bar, cluttering it. When users return to the dashboard, all grains appear locked with no clear explanation of why. The My Farm page lacks AI-powered insights and social comparison features that would drive engagement.

## Goals

1. Replace hardcoded grain nav links with a grouped dropdown menu
2. Explain grain locking clearly — it personalizes the user's Overview
3. Add an AI-generated farm summary with percentile comparisons to My Farm
4. Remove the standalone All Grains page (dropdown replaces it)

## Non-Goals

- Sidebar navigation (considered, rejected — too large a layout change)
- Real-time delivery tracking from external sources (manual logs only for MVP)
- Paid subscription tiers (all grains free to unlock)

---

## Design

### 1. Navigation Redesign

**New top bar layout:**
```
[Bushel Board]  Overview  Grains ▾  My Farm          [● CGC Wk 29 · 2025-26]  [🌙]
```

**Grains dropdown** (shadcn Popover):

- **"Your Crops" section** (top):
  - Grains the user has unlocked via `crop_plans`
  - Each shows: grain name (clickable → `/grain/[slug]`) + checkmark icon
  - Sorted alphabetically
  - If empty: "No crops tracked yet" with link to My Farm

- **Divider**

- **"All Grains" section** (bottom):
  - All 16 CGC grain types not yet unlocked
  - Each shows: grain name + lock icon
  - Clicking opens the unlock modal (enter acres → unlock → redirect to grain page)

**Locking explanation** (in unlock modal subtitle):
> "Add [grain] to your crop plan to unlock its intelligence dashboard. We keep your Overview focused on the crops that matter to your farm."

**Mobile:** Full-screen sheet with the same two-section layout.

**Removed:** `/grains` page and "All Grains" nav link.

### 2. My Farm — AI Summary & Percentile Comparisons

#### AI Farm Summary Card (top of My Farm page)

A prominent card with a GPT-4o-generated narrative summarizing the user's farm activity. Generated weekly after the CGC data import pipeline runs.

**Content includes:**
- Personalized narrative: delivery activity, standout grains, comparisons
- Percentile callouts: "You hauled more Canola than 78% of users this week"
- Market context tie-in referencing CGC weekly data
- Gentle nudges for grains with zero deliveries

**Example output:**
> "This week you delivered 0.8 kt of Canola to Pioneer — that's more than 78% of Bushel Board users tracking Canola. Your Wheat deliveries are steady at 2.1 kt total this season. Canola receipts across the prairies were up 4.2% WoW — your timing aligns with the trend."

#### Per-Grain Percentile Badge

Each crop card in My Farm gets a badge showing the user's percentile rank among all users tracking that grain: **"Top 22%"** or **"78th percentile"**.

### 3. Data Model

#### New table: `farm_summaries`

```sql
CREATE TABLE farm_summaries (
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  crop_year     text NOT NULL,
  grain_week    integer NOT NULL,
  summary_text  text NOT NULL,
  percentiles   jsonb NOT NULL DEFAULT '{}',
  generated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, crop_year, grain_week)
);

-- RLS: users read own rows only, service_role writes
ALTER TABLE farm_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own summaries"
  ON farm_summaries FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Service role manages summaries"
  ON farm_summaries FOR ALL
  USING (auth.role() = 'service_role');
```

#### New database function: `calculate_delivery_percentiles()`

Uses `PERCENT_RANK()` over `crop_plans.deliveries` to compute:
- Weekly delivery percentile per user per grain
- Season-total delivery percentile per user per grain
- Returns JSON: `{ "canola": 78, "wheat": 45, ... }`

### 4. Backend Pipeline

#### New Edge Function: `generate-farm-summary`

- **Trigger:** Chained after `generate-intelligence` completes
- **Process per user with active crop_plans:**
  1. Fetch user's deliveries from `crop_plans`
  2. Call `calculate_delivery_percentiles()` for context
  3. Call GPT-4o with delivery data + percentiles + latest CGC summary
  4. Upsert result into `farm_summaries`
- **Batching:** Process up to 50 users per invocation; re-trigger if more remain
- **Cost:** ~$0.01-0.02 per user per week

#### Updated pipeline chain:
```
cgc-weekly-import → generate-intelligence → generate-farm-summary
                     (per grain)            (per user)
```

### 5. All 16 CGC Grain Types

The dropdown and My Farm will support all 16 grains:

| Grain | Slug |
|-------|------|
| Canola | canola |
| Wheat | wheat |
| Amber Durum | amber-durum |
| Barley | barley |
| Oats | oats |
| Peas | peas |
| Lentils | lentils |
| Flaxseed | flaxseed |
| Soybeans | soybeans |
| Corn | corn |
| Rye | rye |
| Mustard Seed | mustard-seed |
| Canaryseed | canaryseed |
| Chick Peas | chick-peas |
| Sunflower | sunflower |
| Beans | beans |

---

## Agent Assignments

| Task Area | Agent | Rationale |
|-----------|-------|-----------|
| Navigation dropdown component | **frontend-dev** | React component work |
| Unlock modal updates | **ux-agent** + **frontend-dev** | UX messaging + implementation |
| My Farm AI summary UI | **ui-agent** + **frontend-dev** | Visual design + React |
| farm_summaries migration + RLS | **db-architect** | Database schema |
| calculate_delivery_percentiles() | **db-architect** | SQL function |
| generate-farm-summary Edge Function | **db-architect** | Edge Function pipeline |
| Pipeline chain update | **db-architect** | Wiring import → intel → summary |
| Design doc & handover notes | **documentation-agent** | Documentation |
| Remove /grains page | **frontend-dev** | Cleanup |

## Risks

- **Low user count initially:** Percentiles meaningless with <10 users per grain. Mitigation: hide percentile badges when sample size < 10, show "Not enough data yet."
- **GPT-4o cost scaling:** At 1000 users, ~$10-20/week. Mitigation: switch to edge-computed templates if costs grow; keep GPT-4o summaries as premium.
- **CGC connectivity:** Known issue with Supabase us-west-1 → grainscanada.gc.ca. Monitor first few Thursday runs.
