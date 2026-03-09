# Auth Overhaul + Farmer Onboarding + Crop-Gated Unlocks Design

**Date:** 2026-03-05
**Status:** Approved
**Scope:** Replace magic link with password auth, add signup with farm info, crop-gated grain unlocks

## Summary

Replace magic link authentication with email/password. Add a signup page that collects farm name, farmer name, and postal code. Implement a crop-gated unlock system where farmers can only access grain detail pages for crops they've added to their crop plan.

## Auth Flow

### Signup (`/signup`)
Single form — no multi-step wizard:
- Email (required)
- Password (required, min 8 chars)
- Farm Name (required)
- Farmer Name (required)
- Postal Code / FSA (required, text field — accepts Canadian postal codes now, US zip codes later)

On submit:
1. `supabase.auth.signUp({ email, password })`
2. On success, update `profiles` row with farm_name, farmer_name, postal_code
3. Redirect to dashboard

Email confirmation: **disabled** for now. Farmers sign up, they're in.

### Login (`/login`)
Replace magic link form with:
- Email + Password
- "Forgot password?" link → `/reset-password`
- "Don't have an account? Sign up" link → `/signup`

### Password Reset (`/reset-password`)
- Email input → Supabase sends reset email
- Callback handles token, lets user set new password

### Middleware
Add `/signup` and `/reset-password` to public routes list.

## Database Schema Changes

### Migration: Expand profiles table
```sql
ALTER TABLE profiles ADD COLUMN farm_name text;
ALTER TABLE profiles ADD COLUMN farmer_name text;
ALTER TABLE profiles ADD COLUMN postal_code text;
ALTER TABLE profiles ADD COLUMN total_acres int;
ALTER TABLE profiles ADD COLUMN profile_completed_at timestamptz;
```

Province is derived from postal_code in application code (T=AB, S=SK, R=MB), not stored as a column. The existing `province` column remains for backward compat but is deprecated.

### Migration: Create crop_plans table
```sql
CREATE TABLE crop_plans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  crop_year text NOT NULL,
  grain text NOT NULL,
  acres_seeded int NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, crop_year, grain)
);

ALTER TABLE crop_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own crop plans"
  ON crop_plans FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own crop plans"
  ON crop_plans FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own crop plans"
  ON crop_plans FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own crop plans"
  ON crop_plans FOR DELETE USING (auth.uid() = user_id);
```

## Crop-Gated Unlock System

### The Rule
You see data for grains you grow. No crop plan = overview only.

### Unlock States
- **No crops added:** Dashboard shows aggregate overview only. Grain cards appear locked (blurred) with "Add [Grain] to your crop plan to unlock."
- **Crop added:** That grain's detail page unlocks. Celebration animation on first unlock. Grain appears in "Your Crops" section at top of dashboard.

### What's Tracked
- `crop_plans` table: `user_id, crop_year, grain, acres_seeded`
- User's unlocked grains = `SELECT DISTINCT grain FROM crop_plans WHERE user_id = ? AND crop_year = ?`
- No points, no levels, no badges — just crop-based unlocks

### Dashboard Layout (revised)
1. **Your Crops** (top) — unlocked grain cards with key stats, links to detail pages
2. **Overview** (middle) — aggregate pipeline cards (deliveries, shipments, stocks for all grains combined). Everyone sees this.
3. **Other Grains** (bottom) — locked grain cards with blur + "Unlock" CTA

### Unlock Flow
1. Farmer sees locked grain card on dashboard
2. Clicks it → modal: "Add [Grain] to your 2026 crop plan"
3. Enters acres seeded → Save
4. Celebration animation → "You've unlocked [Grain] data!"
5. Redirects to now-unlocked grain detail page
6. Dashboard updates: grain moves from "Other Grains" to "Your Crops"

### Grain Detail Page Access Control
- Middleware or page-level check: does user have a crop_plan entry for this grain?
- If no → redirect to dashboard or show unlock prompt
- If yes → full access to charts, provincial breakdown, weekly trends

### No Validation on Acres
No soft validation ("seems high"). Accept whatever the farmer inputs.

### Lying Disincentive
- No benefit to lying — unlock only shows public CGC data organized by grain
- Real value (elevator prices, benchmarking) comes later where accurate acreage matters

## Utility Functions

### `getProvinceFromPostalCode(postalCode: string): string | null`
Derives province from first character of postal code:
- T → AB, S → SK, R → MB
- Returns null for unrecognized (future: handle US zip codes)

### `getUserUnlockedGrains(userId: string, cropYear: string): string[]`
Returns list of grain names the user has unlocked via crop plans.

### `isGrainUnlocked(unlockedGrains: string[], grainName: string): boolean`
Simple array check.

## Files Affected

### New files:
- `app/(auth)/signup/page.tsx` — Signup form
- `app/(auth)/reset-password/page.tsx` — Password reset request
- `components/dashboard/unlock-modal.tsx` — Grain unlock modal
- `components/dashboard/locked-grain-card.tsx` — Blurred locked grain card
- `components/dashboard/unlock-celebration.tsx` — Celebration animation
- `components/dashboard/crop-plan-form.tsx` — Crop plan input form
- `lib/utils/province.ts` — Postal code → province derivation
- `lib/queries/crop-plans.ts` — Crop plan CRUD queries
- `supabase/migrations/004_profile_expansion.sql`
- `supabase/migrations/005_crop_plans.sql`

### Modified files:
- `app/(auth)/login/page.tsx` — Replace magic link with password
- `app/(dashboard)/page.tsx` or `app/(dashboard)/overview/page.tsx` — Add unlock sections
- `app/(dashboard)/grain/[slug]/page.tsx` — Add access control
- `components/dashboard/grain-card.tsx` — Support locked/unlocked states
- `lib/supabase/middleware.ts` — Add /signup, /reset-password to public routes
