# Farmer Engagement & Input System — Design Document

**Date:** 2026-03-11
**Status:** Implemented
**Feature Track:** #14

## Overview

Elevates the farmer input loop — the core value engine of Bushel Board. Farmers entering data (crop plans, deliveries, sentiment votes, signal ratings) powers personalized insights, community benchmarks, and AI summaries. This feature adds observer accounts, contracted/uncontracted grain tracking, cross-dashboard sentiment aggregates, comparative delivery analytics, and engagement polish.

## Architecture Decisions

### Observer Role Model
- **Approach:** UI-level gating (soft nudge), not route-level blocking
- **Why:** Observers see all data and charts but can't vote or input data. This showcases platform value and encourages conversion to farmer accounts.
- **Storage:** `profiles.role` column with CHECK constraint (`'farmer'|'observer'`), DEFAULT `'farmer'`
- **Auth flow:** Same signup page with Farmer/Observer toggle. Role passed via `raw_user_meta_data` and read by `handle_new_user()` trigger.
- **Enforcement:** `getUserRole()` server function queries profile, returns role. Client components receive as prop. No middleware changes.

### Contracted/Uncontracted Grain Tracking
- **Columns:** `crop_plans.contracted_kt` (numeric, default 0), `crop_plans.uncontracted_kt` (numeric, default 0)
- **Relationship:** `volume_left_to_sell_kt = contracted_kt + uncontracted_kt` (user enters total + contracted, uncontracted auto-calculated)
- **Backfill:** Existing rows get `uncontracted_kt = volume_left_to_sell_kt`, `contracted_kt = 0`
- **UI:** Stacked progress bar (delivered/contracted/uncontracted) on My Farm crop cards

### Sentiment Aggregation
- **RPC:** `get_sentiment_overview(p_crop_year, p_grain_week)` returns per-grain aggregates
- **Privacy:** Only surfaces when total voters >= 5 across all grains
- **Display:** SentimentBanner on overview page with weighted headline and per-grain mini gauge bars
- **Integration:** Piped into `generate-intelligence` prompt for AI to consider farmer-vs-market divergence

### Delivery Analytics
- **RPC:** `get_delivery_analytics(p_crop_year, p_grain)` with privacy threshold (>= 5 farmers)
- **Excludes observers:** `JOIN profiles ON role = 'farmer'`
- **Returns:** farmer_count, mean/median, p25/p50/p75 pace percentiles
- **UI:** DeliveryPaceCard with horizontal gauge, position dot, pace badges

### Engagement UX Philosophy
- **Micro-celebrations:** One-time golden glow pulse (canola box-shadow) on first vote, first delivery, first crop, first signal vote. Tracked via localStorage.
- **Your Impact indicators:** Inline banners after each input action showing community contribution.
- **Spring physics:** Framer Motion `whileTap/whileHover` on all vote buttons, spring entrance animations on gauge bars, `AnimatePresence` on impact summaries.
- **Respects `prefers-reduced-motion`:** All animations opt-out safely.

## Data Flow

```
Signup → profiles.role (farmer|observer)
My Farm → crop_plans (contracted_kt, uncontracted_kt)
Grain Page → grain_sentiment_votes → v_grain_sentiment → get_sentiment_overview RPC
Grain Page → signal_feedback → v_signal_relevance_scores
Overview → SentimentBanner (cross-grain) + DeliveryPaceCard (My Farm)
Edge Functions → generate-intelligence (+ farmer sentiment) → generate-farm-summary (+ contracted position)
```

## Privacy Thresholds
- Delivery analytics: `HAVING COUNT(DISTINCT user_id) >= 5`
- Sentiment overview: `totalVoters >= 5` (client-side guard)
- Observer exclusion from analytics aggregates

## New Files
| File | Purpose |
|------|---------|
| `supabase/migrations/20260311100000_profile_role.sql` | Role column + trigger update |
| `supabase/migrations/20260311100100_crop_plans_contracted.sql` | Contracted/uncontracted columns |
| `supabase/migrations/20260311100200_sentiment_overview_rpc.sql` | Sentiment aggregation RPC |
| `supabase/migrations/20260311100300_delivery_analytics_rpc.sql` | Delivery analytics RPC |
| `lib/auth/role-guard.ts` | Server-side role guard utility |
| `lib/queries/delivery-analytics.ts` | Delivery analytics query layer |
| `components/dashboard/sentiment-banner.tsx` | Cross-grain sentiment overview |
| `components/dashboard/delivery-pace-card.tsx` | Percentile comparison card |
| `components/dashboard/your-impact.tsx` | Inline impact indicator |
| `components/motion/micro-celebration.tsx` | First-time action celebration |

## Modified Files
| File | Changes |
|------|---------|
| `app/(auth)/signup/page.tsx` | Farmer/Observer role toggle |
| `app/(dashboard)/my-farm/page.tsx` | DeliveryPaceCard, YourImpact, role prop |
| `app/(dashboard)/my-farm/client.tsx` | Stacked bar, contracted form, observer state |
| `app/(dashboard)/my-farm/actions.ts` | Contracted field in Zod schema |
| `app/(dashboard)/overview/page.tsx` | SentimentBanner, role data fetch |
| `app/(dashboard)/grain/[slug]/page.tsx` | Role prop to interactive components |
| `lib/queries/sentiment.ts` | getSentimentOverview function |
| `lib/queries/crop-plans.ts` | contracted_kt/uncontracted_kt interface |
| `lib/utils/crop-year.ts` | getCurrentGrainWeek utility |
| `components/dashboard/sentiment-poll.tsx` | Framer Motion, observer guard, micro-celebration |
| `components/dashboard/x-signal-feed.tsx` | Framer Motion, observer guard, micro-celebration |
| `supabase/functions/generate-farm-summary/index.ts` | Contracted data in prompt |
| `supabase/functions/generate-intelligence/index.ts` | Farmer sentiment in prompt |
| `supabase/functions/generate-intelligence/prompt-template.ts` | Sentiment context section |
