# Bushel Board - Lessons Learned

## 2026-03-10 - Pipeline Velocity Chart: Silent Data Truncation

**Symptom:** Pipeline Velocity chart showed flat lines for Terminal Receipts and Terminal Exports. Terminal Receipts displayed ~4,226 kt at week 20 instead of the correct 11,087 kt. Lines appeared to stop increasing around week 8, and "lower totals plotted above higher totals."

**Root Cause:** Supabase's PostgREST enforces a server-side `max_rows=1000` limit on all queries. The Terminal Receipts and Terminal Exports worksheets in `cgc_observations` store data per-grade per-region (no pre-aggregated `grade=''` rows like Primary does), producing far more rows than the limit:

| Metric | Row count | Over limit? |
|--------|----------|-------------|
| Terminal Receipts (Wheat) | 3,648 | 3.6x over (20 grades x 6 ports x 30 weeks) |
| Terminal Exports (Wheat) | 1,050 | Slightly over (6 grades x 6 ports x 30 weeks) |
| Primary Deliveries | 90 | OK (3 provinces x 30 weeks, grade='' aggregates) |
| Processing | 30 | OK (national total, grade='' aggregates) |

PostgREST silently truncated the response - no error, no warning. The client code received 1,000 out of 3,648 rows (~first 8 weeks), summed them correctly, then the forward-fill logic carried the last known value flat for remaining weeks.

**Why `.limit(10000)` didn't work:** PostgREST's `max_rows` config acts as an upper ceiling. The client `.limit()` sets a `Range` header, but the server caps it at `max_rows=1000` regardless.

**Solution:** Created `get_pipeline_velocity(p_grain, p_crop_year)` RPC function (migration `20260310200000_pipeline_velocity_rpc.sql`) that aggregates all 5 metrics in PostgreSQL using `SUM() GROUP BY grain_week`. Returns exactly 30 rows per grain instead of 3,648+. Updated `getCumulativeTimeSeries()` in `lib/queries/observations.ts` to call this RPC.

**Additional fix:** Added `Number()` coercion for `ktonnes` values (Postgres `numeric` type may return as strings from PostgREST). Fixed tooltip formatter in `gamified-grain-chart.tsx` to show series names instead of blank labels.

**Prevention:**
- Always check row counts when querying denormalized/long-format tables with `.select()`
- If a query could exceed ~500 rows, prefer a server-side RPC with `GROUP BY`
- CGC Terminal Receipts and Terminal Exports have NO `grade=''` aggregate rows - must always sum across grades
- Test Pipeline Velocity with Wheat first (highest row count: ~3,648 for Terminal Receipts)

**Files modified:**
- `lib/queries/observations.ts` - replaced 5 client queries with single RPC call
- `components/dashboard/gamified-grain-chart.tsx` - fixed tooltip to show series names
- `supabase/migrations/20260310200000_pipeline_velocity_rpc.sql` - new RPC function

**Tags:** #supabase #postgrest #data-truncation #chart #pipeline-velocity #rpc

## 2026-03-10 - Internal Pipeline Auth Was Public-by-Default

**Symptom:** The weekly intelligence chain could be triggered by anyone who knew the function URLs because function-to-function calls used the public anon JWT.

**Root Cause:** Edge Functions were chained over HTTP with `Authorization: Bearer $SUPABASE_ANON_KEY` semantics, and the functions trusted that relay path as if it were private. In practice, the anon JWT is public and `verify_jwt = true` only proved the caller was anonymous, not internal.

**Solution:** Made the Vercel cron route the only public ingress, unscheduled the legacy `pg_cron` job, set the internal pipeline functions to `verify_jwt = false`, and required a shared `x-bushel-internal-secret` backed by `BUSHEL_INTERNAL_FUNCTION_SECRET`.

**Prevention:**
- Never use anon JWTs for internal workflow auth
- Any `verify_jwt = false` function must require an internal secret
- Keep the same internal secret in Vercel and Supabase

**Files modified:**
- `app/api/cron/import-cgc/route.ts`
- `supabase/functions/_shared/internal-auth.ts`
- `supabase/functions/import-cgc-weekly/index.ts`
- `supabase/functions/validate-import/index.ts`
- `supabase/functions/search-x-intelligence/index.ts`
- `supabase/functions/generate-intelligence/index.ts`
- `supabase/functions/generate-farm-summary/index.ts`
- `supabase/config.toml`
- `supabase/migrations/20260311110000_security_and_workflow_hardening.sql`

**Tags:** #security #edge-functions #vercel-cron #supabase

## 2026-03-10 - UI-Only Role Gating Is Not Authorization

**Symptom:** Observer accounts were hidden from farmer actions in the UI but could still mutate crop plans, deliveries, sentiment votes, and signal feedback by invoking server actions directly.

**Root Cause:** The role split was implemented primarily in the interface. Server actions only checked authentication, and RLS policies only checked row ownership.

**Solution:** Added deny-by-default role resolution in `lib/auth/role-guard.ts`, enforced farmer-only writes in server actions, and updated RLS to require both `auth.uid() = user_id` and `profiles.role = 'farmer'`.

**Prevention:**
- Never trust UI gating as the final write guard
- Every farmer-only workflow needs matching server-action and RLS enforcement
- Missing profiles must default to observer/deny

**Files modified:**
- `lib/auth/role-guard.ts`
- `app/(dashboard)/my-farm/actions.ts`
- `app/(dashboard)/grain/[slug]/actions.ts`
- `app/(dashboard)/grain/[slug]/signal-actions.ts`
- `supabase/migrations/20260311110000_security_and_workflow_hardening.sql`

**Tags:** #security #rls #authorization #server-actions

## 2026-03-10 - Remaining Inventory Was Treated As Total Plan Volume

**Symptom:** Delivery pace bars, analytics, and percentiles overstated or understated progress because the app divided deliveries by `volume_left_to_sell_kt`, even though that field stores current remaining inventory.

**Root Cause:** The UI wording and the stored column were changed to "remaining to sell," but the downstream math still assumed the field represented the original total target.

**Solution:** Standardized pace calculations on `delivered + remaining_to_sell`, updated UI copy to match, and moved the same denominator into `calculate_delivery_percentiles()` and `get_delivery_analytics()`.

**Prevention:**
- Treat `volume_left_to_sell_kt` as a live state field, not a static plan field
- Keep one shared utility for UI pace math
- Mirror the same formula in SQL analytics and percentile logic

**Files modified:**
- `lib/utils/crop-plan.ts`
- `tests/lib/crop-plan.test.ts`
- `app/(dashboard)/my-farm/client.tsx`
- `components/dashboard/delivery-pace-card.tsx`
- `supabase/functions/generate-farm-summary/index.ts`
- `supabase/migrations/20260311110000_security_and_workflow_hardening.sql`

**Tags:** #ux #analytics #data-integrity #crop-plans

## 2026-03-11 - Hardcoded Supply Source Names Rot Fast

**Symptom:** Supply disposition queries depended on a hardcoded source string (`AAFC_2025-11-24`), which would go stale as soon as the next AAFC refresh used a different source name.

**Root Cause:** The app queried `supply_disposition` directly with a fixed source literal instead of selecting the current canonical source per grain and crop year.

**Solution:** Added `v_supply_disposition_current` to rank sources by AAFC preference and latest `created_at`, then moved the query layer to read from that view instead of hardcoding a source string.

**Prevention:**
- Do not hardcode date-stamped source identifiers in app queries
- Select a canonical source in SQL whenever multiple snapshots can exist
- Keep `.single()` calls paired with a view that guarantees one row

**Files modified:**
- `supabase/migrations/20260311113000_delivery_ledger_and_canonical_supply.sql`
- `lib/queries/supply-disposition.ts`

**Tags:** #data-integrity #supply-disposition #query-layer

## 2026-03-11 - JSONB Delivery Logs Were Not Idempotent Or Auditable

**Symptom:** Delivery logging appended directly to `crop_plans.deliveries`, so double-submit races created duplicate entries and there was no append-only audit record behind the farmer-facing ledger.

**Root Cause:** Deliveries were stored as a mutable JSONB array inside `crop_plans`, which is convenient for reads but weak for idempotency, history, and operational debugging.

**Solution:** Added `crop_plan_deliveries` as an append-only delivery ledger with `submission_id` idempotency keys, then synchronized `crop_plans.deliveries` from that table as a compatibility projection.

**Prevention:**
- User-submitted event logs should use append-only rows, not only embedded JSON blobs
- Idempotency should use per-submission keys, not best-effort value matching
- Keep cached JSON projections as derived state, not the source of truth

**Files modified:**
- `supabase/migrations/20260311113000_delivery_ledger_and_canonical_supply.sql`
- `app/(dashboard)/my-farm/actions.ts`
- `components/dashboard/log-delivery-modal.tsx`

**Tags:** #data-integrity #idempotency #audit-trail #crop-plans

## 2026-03-11 - Fallback Grains Must Not Masquerade As Unlocked Personalization

**Symptom:** The overview used fallback grains for empty-plan farmers, but the cards looked unlocked and linked into grain pages that then hard-locked. The app felt misleading at the exact moment a skeptical farmer was deciding whether to trust it.

**Root Cause:** The app treated "which grains should we display?" and "which grains has this farmer actually unlocked?" as the same decision. That blurred sample market content and personalized entitlement state.

**Solution:** Split the overview into an explicit `ActiveGrainContext` with separate `activeGrains`, `unlockedSlugs`, and `isPersonalized` fields. Locked overview cards now route to `My Farm`, the page copy explains why farm data sharpens the product, and post-auth flows for farmers land on `My Farm` first instead of `Overview`.

**Prevention:**
- Keep fallback content and unlock state as separate concepts in code
- If a downstream route is locked, upstream summary cards must route to setup, not to the locked destination
- Empty states must explain the next unlock and the value unlocked by completing it

**Files modified:**
- `lib/auth/post-auth-destination.ts`
- `app/(auth)/login/page.tsx`
- `app/(auth)/signup/page.tsx`
- `components/landing/landing-page.tsx`
- `app/(dashboard)/overview/page.tsx`
- `app/(dashboard)/my-farm/page.tsx`
- `app/(dashboard)/my-farm/client.tsx`
- `components/dashboard/farm-summary-card.tsx`

**Tags:** #ux #onboarding #trust #personalization

## 2026-03-11 - Summarized Social Signals Need Canonical Source Links

**Symptom:** X signal cards summarized posts and asked farmers to vote on relevance, but users could not click through to verify the original source. That created unnecessary trust friction in the most subjective part of the product.

**Root Cause:** The ingestion pipeline stored summary, author, and date, but not the canonical post URL. Frontend components therefore had to fall back to summaries alone and could not reliably deep-link to the source post.

**Solution:** Added `post_url` to `x_market_signals`, extended `search-x-intelligence` to request and store canonical X URLs, exposed the field through signal RPCs, and added outbound "Open post" links to both the ticker and the main X feed.

**Prevention:**
- Any summarized third-party content should store a canonical outbound URL at ingest time
- Trust-sensitive cards should always let the user verify the source directly
- If the exact URL is unavailable, fall back to a search URL that includes the author when possible

**Files modified:**
- `supabase/functions/search-x-intelligence/index.ts`
- `supabase/migrations/20260311121500_x_market_signal_post_urls.sql`
- `lib/queries/x-signals.ts`
- `components/dashboard/signal-tape.tsx`
- `components/dashboard/x-signal-feed.tsx`

**Tags:** #ux #x-feed #trust #data-model

## 2026-03-11 - Full Logo Lockups Should Not Be Paired With A Second Wordmark

**Symptom:** The dashboard header looked broken and "tacky" because the navigation rendered the full Bushel Board lockup SVG and also rendered a separate `Bushel Board` text label beside it. In narrower widths this made the wordmark wrap and visually collide with the nav pills.

**Root Cause:** `public/logo.svg` already contains the Bushel Board wordmark and subtitle, but the shared nav treated `Logo` like an icon-only mark and added another text span next to it.

**Solution:** Normalized the `Logo` component to preserve the lockup aspect ratio, removed the duplicate nav text, and let the header brand render as a single lockup chip.

**Prevention:**
- Know whether a brand asset is a mark-only asset or a full lockup before pairing it with text
- If a header uses the full lockup, never render a second adjacent wordmark
- Test header composition at medium widths, not only wide desktop

**Files modified:**
- `components/layout/logo.tsx`
- `components/layout/nav.tsx`
- `components/layout/desktop-nav-links.tsx`

**Tags:** #ui #branding #navigation

## 2026-03-11 - Social Feed Previews Need To Look Like Posts, Not Motion Widgets

**Symptom:** The overview X section looked like a decorative ribbon instead of a trustworthy source surface. Farmers were being asked to trust a moving tape rather than recognizable post previews.

**Root Cause:** The component optimized for movement and density instead of recognizability. The result looked more like a market ticker than a source feed.

**Solution:** Replaced the ticker treatment with compact post-style cards that show grain context, author handle when available, sentiment, summary, and an explicit outbound action.

**Prevention:**
- Trust-sensitive content should resemble the source it summarizes
- Prefer readable cards over animated ribbons when the user may want to verify the source
- Motion should support scanning, not replace information hierarchy

**Files modified:**
- `components/dashboard/signal-tape.tsx`

**Tags:** #ux #ui #x-feed #trust
