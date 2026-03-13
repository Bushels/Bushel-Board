# Bushel Board - Lessons Learned

## 2026-03-12 — v_grain_overview Statement Timeout From Full-Table Scan on 1M+ Rows

**Symptom:** The Overview page displayed "No grain data available yet" even though `v_grain_overview` contained 16 valid rows. No error was surfaced to the user.

**Root Cause:** The view's `latest_week` CTE used `GROUP BY crop_year` + `MAX(grain_week)` to find the current week, which forced Postgres to scan all 1M+ rows in `cgc_observations`. The query took 5.2 seconds, exceeding PostgREST's statement timeout for the `authenticated` role. The timeout caused the query to return no rows silently, triggering the empty-state fallback.

**Solution (migration `20260312180000_optimize_v_grain_overview.sql`):**
1. Added composite index `idx_cgc_obs_crop_year_grain_week (crop_year DESC, grain_week DESC)` on `cgc_observations`
2. Rewrote the `latest_week` CTE from `GROUP BY crop_year ORDER BY crop_year DESC LIMIT 1` to `ORDER BY crop_year DESC, grain_week DESC LIMIT 1` — this reads exactly 1 index entry via Index Only Scan (0 heap fetches) instead of scanning the full table

**Result:** Query time dropped from 5,200ms to 5.5ms (945x speedup).

**Prevention:**
- Any CTE or subquery against `cgc_observations` that uses `GROUP BY` + aggregate to find a single "latest" value should use `ORDER BY ... LIMIT 1` with a supporting index instead
- PostgREST statement timeouts fail silently from the client's perspective — always check whether an empty result could be a timeout rather than genuinely empty data
- Views that underpin primary dashboard pages should be tested with `EXPLAIN ANALYZE` after the table exceeds ~100K rows

**Files modified:**
- `supabase/migrations/20260312180000_optimize_v_grain_overview.sql`

**Tags:** #performance #postgresql #index #postgrest #timeout #overview

## 2026-03-12 — Hidden Scrollbar Styling Must Be Backed By A Real Local Utility

**Symptom:** The overview Community Pulse rail still showed a dated native horizontal scrollbar even though the component used a `scrollbar-hide` class.

**Root Cause:** The component assumed a `scrollbar-hide` utility existed, but this repo did not define one in `app/globals.css`. The browser therefore rendered its default scrollbar chrome, especially visibly on Windows.

**Solution:** Added an explicit `.scrollbar-none` utility in `app/globals.css` and rewired the overview signal rail to use that utility plus a custom scrubber/arrow treatment in `components/dashboard/compact-signal-strip.tsx`.

**Prevention:**
- Do not rely on utility-class names copied from prior projects unless they exist locally
- Any custom scroll treatment should be visually verified on Windows, where native scrollbar chrome is harder to ignore
- If a scrollbar is intentionally hidden, provide an explicit replacement affordance instead of relying on swipe discovery alone

**Files modified:**
- `app/globals.css`
- `components/dashboard/compact-signal-strip.tsx`

**Tags:** #ui #overview #scrollbar #windows #x-feed

## 2026-03-12 — Daylight Auth Variants Need Their Own Contrast Tokens

**Symptom:** The top third of the signup page became difficult to read in the daytime auth scene. The headline, description, and top-left chrome were too washed out against the pale gold background.

**Root Cause:** The auth shell reused a mostly white text/chip treatment that worked for the evening variant but did not hold enough contrast on the daylight gradient. The hero block also sat too close to the absolute-positioned brand chip at narrower widths.

**Solution:** Gave the daylight auth shell its own darker wheat text treatment, stronger badge/logo/proof-card styling, a subtle glass panel behind the hero copy, and extra top spacing in `components/auth/auth-shell.tsx`.

**Prevention:**
- Visual themes that change by time-of-day need separate contrast checks, not just palette swaps
- Absolute-positioned nav/brand chrome must be checked against hero spacing on narrower desktop widths
- Day and evening auth scenes should be visually QA'd in-browser as separate surfaces

**Files modified:**
- `components/auth/auth-shell.tsx`

**Tags:** #auth #signup #contrast #ui #daylight

## 2026-03-12 — Systemic Crop Year Format Mismatch (6 Competing Implementations)

**Symptom:** Historical RPCs (`get_historical_average`, `get_seasonal_pattern`, `get_week_percentile`) returned zero data. Intelligence tables (`grain_intelligence`, `x_market_signals`) couldn't join against `cgc_observations`. All cross-table queries silently returned empty results.

**Root Cause:** `cgc_observations` stores crop year in long format `"2025-2026"` (from CGC CSV), but `lib/utils/crop-year.ts` returned short format `"2025-26"`. There were 6 independent `getCurrentCropYear()` implementations: 1 in `lib/utils/crop-year.ts`, 5 in Edge Functions. Three Edge Functions used short format, creating a format split across all intelligence tables. 188 rows across 8 tables were written in short format that couldn't join to the 1.1M rows in `cgc_observations`.

**Solution:**
1. Standardized `lib/utils/crop-year.ts` to return long format `"2025-2026"`
2. Added `toShortFormat()` for display-only contexts
3. Fixed all 5 Edge Function `getCurrentCropYear()` implementations
4. Created migration `20260312130000` to convert 188 short-format rows to long format across 8 tables
5. Updated all tests to expect long format

**Prevention:**
- Crop year convention is now documented in CLAUDE.md and all agent docs
- `data-audit` agent is now a mandatory verification gate that checks format consistency
- Any shared utility that exists in multiple files must be grepped across the entire codebase when changed

**Tags:** #data-integrity #crop-year #cross-table-join #convention-mismatch

## 2026-03-12 — Primary-Only Historical Comparison Understates Deliveries by ~31%

**Symptom:** `get_historical_average()` for Canola Deliveries showed values ~31% lower than the YoY comparison view (`v_grain_yoy_comparison`), which combined Primary + Process worksheets.

**Root Cause:** `get_historical_average()` queried only `worksheet='Primary'` for deliveries. But crush-heavy grains like Canola send ~31% of deliveries directly to processors (tracked in the Process worksheet as "Producer Deliveries"). The YoY view correctly uses `FULL OUTER JOIN` of Primary + Process, but the historical RPC didn't.

**Solution:** Added a `CASE` expression: when `p_metric='Deliveries' AND p_worksheet='Primary'`, expand to `worksheet IN ('Primary', 'Process') AND metric IN ('Deliveries', 'Producer Deliveries')`. Applied same fix to `get_week_percentile()`.

**Prevention:** Any new RPC that aggregates deliveries must check whether Primary+Process combination is needed. See `v_grain_yoy_comparison` as the reference pattern.

**Tags:** #data-integrity #deliveries #primary-process #rpc

## 2026-03-12 — get_seasonal_pattern() GROUP BY Produces Multiple Rows in Scalar Function

**Symptom:** Would have caused runtime error on any call — function declared `RETURNS jsonb` (scalar) but `GROUP BY grain_week` produced multiple rows.

**Root Cause:** The function body had `GROUP BY grain_week` without wrapping the per-week results in an outer `jsonb_agg()`. PostgreSQL would error with "more than one row returned by a subquery used as an expression."

**Solution:** Wrapped per-week aggregation in a CTE (`weekly_agg`), then applied `jsonb_agg(... ORDER BY grain_week)` over the CTE to produce a single JSON array.

**Prevention:** Any `RETURNS jsonb` function must be verified to return exactly one row. A `GROUP BY` inside such a function is a red flag — it needs wrapping in `jsonb_agg()` or `jsonb_object_agg()`.

**Tags:** #postgresql #rpc #scalar-function #group-by

## 2026-03-12 — Agent Orchestration Failure: Zero Verification Gates Run

**Symptom:** 9 bugs shipped to production that should have been caught by existing agents.

**Root Cause:** Track #17 (12-task dual-LLM pipeline) was implemented in a single monolithic session without invoking any verification agents. The data-audit agent (designed to catch data integrity issues), security-auditor (designed to catch auth gaps), and documentation-agent (designed to maintain docs) were never run. The ultra-agent coordinator was never used to enforce workflow gates.

**Solution:**
1. Added mandatory DAG workflow to CLAUDE.md: Plan → Implement → Verify → Document → Ship
2. Upgraded data-audit agent to a mandatory verification gate
3. Upgraded security-auditor to a mandatory verification gate
4. Upgraded documentation-agent to a mandatory post-implementation gate
5. Added ultra-agent workflow enforcement with a critical lesson callout
6. Fixed stale conventions in agent docs (db-architect and data-audit had wrong crop year format)

**Prevention:** The mandatory workflow gates are now documented in CLAUDE.md and enforced through agent descriptions that explicitly state they MUST be invoked. The ultra-agent now includes a "CRITICAL LESSON" callout about Track #17.

**Tags:** #process #agent-orchestration #quality-gates #verification

## 2026-03-12 - CGC CSV Parser Used Positional Indexing Instead of Header Names

**Symptom:** Historical CGC CSV backfill (2020-2023) inserted 758K rows with `crop_year` values like `"1"`, `"2"`, `"3"` instead of `"2020-2021"`, `"2021-2022"`, etc. Historical RPC functions returned only 2 years of data instead of 5.

**Root Cause:** The CSV parser (`lib/cgc/parser.ts`) used hardcoded positional indexing (`parts[0]` = crop_year, `parts[1]` = grain_week). However, old CGC CSVs (2020-2023) have columns ordered `grain_week, crop_year, ...` while current CSVs (2024+) use `Crop Year, Grain Week, ...`. The swap put grain_week values (integers) into the crop_year field.

**Solution:** Changed the parser to build a column index map from the header row using case-insensitive, underscore-normalized header matching. Now detects column positions dynamically regardless of order: `const headerParts = lines[0].split(",").map(h => strip(h).toLowerCase().replace(/\s+/g, "_"))`. Deleted all bad rows (`WHERE crop_year NOT LIKE '____-____'`) and re-backfilled.

**Lesson:** CSV parsers should ALWAYS use header-name-based column mapping, never positional indexing. External data sources can change column order between years.

## 2026-03-11 - Hybrid Farm Units Need One Canonical Storage Unit

**Symptom:** Farmers plan and talk in a mix of `bu/ac`, pounds, and tonnes, but CGC and community comparisons are metric-tonne based. Without a canonical storage rule, the same crop could be entered in different units and become hard to compare honestly across dashboards, AI summaries, and analytics RPCs.

**Root Cause:** The crop-plan workflow originally assumed a single remaining-tonnes input. Once starting grain and yield calculations were added, the product needed to preserve the farmer's preferred unit while still normalizing data for government comparisons and percent-based analytics.

**Solution:** Added `inventory_unit_preference` and `bushel_weight_lbs` to `crop_plans`, converted all farmer-entered crop amounts to canonical metric tonnes before saving, and derived `bu/ac` plus `t/ac` from acres plus starting grain. Delivery logging now supports bushel entry too, but still stores canonical metric-tonne ledger rows.

**Prevention:**
- Choose one canonical storage unit for every workflow before adding multiple user-facing units
- Preserve the farmer's input preference separately from canonical numeric fields
- Treat bushel-weight assumptions as explicit data, not hidden app constants, whenever those assumptions affect yield or MT comparisons

**Files modified:**
- `app/(dashboard)/my-farm/actions.ts`
- `app/(dashboard)/my-farm/client.tsx`
- `components/dashboard/log-delivery-modal.tsx`
- `lib/utils/grain-units.ts`
- `supabase/migrations/20260312113000_crop_inventory_unit_preferences.sql`

**Tags:** #data-model #units #yield #crop-plans

## 2026-03-11 - Dashboard Brand Links Must Not Bounce Through Public Landing Routes

**Symptom:** The top-left dashboard brand chip looked empty, and clicking it briefly flashed the prairie landing page before returning to the dashboard. Users experienced it as a broken nav control rather than a purposeful transition.

**Root Cause:** The shared dashboard nav linked its brand control to `/`, which is the public landing page. The landing page then checked auth client-side and redirected back into the product after render. At the same time, the header used the full lockup SVG at a very small nav size, so the brand was not legible enough to read as a logo.

**Solution:** Changed the dashboard brand control to use the compact mark and route directly to the signed-in user's role-aware home. Moved authenticated `/` handling into a server redirect in `app/page.tsx`, so signed-in users no longer render the public landing page first. Added a shared day/evening auth shell so prairie visual treatment on auth routes is intentional rather than a side effect of bouncing through `/`.

**Prevention:**
- Treat dashboard brand controls as in-app home links, not generic site-home links
- Server-redirect authenticated users away from public marketing routes before render
- Use mark-sized brand assets in compact nav surfaces; reserve full lockups for larger hero placements

**Files modified:**
- `app/page.tsx`
- `components/landing/landing-page.tsx`
- `components/layout/nav.tsx`
- `components/layout/logo.tsx`
- `components/auth/`
- `lib/auth/auth-scene.ts`

**Tags:** #ux #navigation #branding #auth

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

## 2026-03-11 - Supporting Social Context Should Stay Visually Subordinate To Core Market Data

**Symptom:** The grain-page X feed became readable and source-verifiable, but the first card treatment consumed too much vertical and visual space. The section started competing with the CGC and farm metrics instead of supporting them.

**Root Cause:** The redesign corrected the "ticker" problem by making the cards look more like posts, but overshot on card size, padding, and follow-on helper banners.

**Solution:** Compacted the feed into slimmer horizontally scrollable post cards, reduced summary depth to two lines, turned feedback states into small pills, and removed the extra full-width helper chrome so the section reads as secondary context.

**Prevention:**
- On analytics-heavy pages, supporting content should be glanceable first and explorable second
- When converting a ribbon into cards, revisit size hierarchy so the new treatment does not become the new primary module
- Keep trust cues, but compress them into lightweight inline affordances when the page already contains large data blocks

**Files modified:**
- `components/dashboard/x-signal-feed.tsx`

**Tags:** #ux #ui #x-feed #hierarchy

## 2026-03-11 - A Grain Page Should Have One Social Surface, Not Two

**Symptom:** The grain page showed X-derived content twice: once as a top preview strip near the thesis and again as the full interactive signal feed later on. Even after compacting the cards, the repeated presence still made the page feel cluttered and logically messy.

**Root Cause:** The app reused both the overview-style preview treatment and the dedicated grain-page feed on the same screen. That duplicated the source layer instead of clarifying it.

**Solution:** Removed the top `SignalTape` from the grain detail page and kept one dedicated X evidence/feed section lower in the page. The overview still uses the lighter cross-grain social preview, while grain detail now has a single source-of-truth social module.

**Prevention:**
- Distinguish clearly between overview preview components and detail-page evidence components
- Do not render two views of the same source data on the same page unless they answer different user questions
- On detail pages, supporting context should appear once in the hierarchy with a clear purpose

**Files modified:**
- `app/(dashboard)/grain/[slug]/page.tsx`

**Tags:** #ux #hierarchy #x-feed #grain-page

## 2026-03-11 - Delivery Ledgers Need Sale Classification, Not Just Volume

**Symptom:** The product could show deliveries and a remaining balance, but it could not honestly tell the farmer how much of the crop was contracted versus still open once deliveries started posting. Every new load made contract metrics drift.

**Root Cause:** `crop_plan_deliveries` stored amount and destination, but not whether the load was delivered against a contract or sold into the open market. That meant the system had no defensible way to decrement `contracted_kt` versus `uncontracted_kt`.

**Solution:** Added `marketing_type` to the delivery ledger, required new deliveries to be classified as `contracted` or `open`, and moved the crop-plan state update into a database trigger so `volume_left_to_sell_kt`, `contracted_kt`, and `uncontracted_kt` stay synchronized automatically.

**Prevention:**
- If a downstream metric depends on the type of transaction, capture that classification at write time
- Do not try to infer contract posture from delivery volume alone once real farmer decisions diverge
- Keep the append-only ledger canonical and derive cached UI projections from it

**Files modified:**
- `supabase/migrations/20260312110000_crop_inventory_marketing_tracking.sql`
- `app/(dashboard)/my-farm/actions.ts`
- `components/dashboard/log-delivery-modal.tsx`

**Tags:** #data-model #delivery-ledger #contracts #marketing

## 2026-03-11 - CGC Region Names Are Not Unique Keys

**Symptom:** React duplicate key warnings in the SupplyPipeline domestic breakdown after folding in domestic disappearance data. The console showed "two children with the same key: Pacific."

**Root Cause:** `getShipmentDistribution()` returns multiple rows with the same `region` value (e.g., "Pacific" appears for both terminal receipts and exports). The component used `key={d.region}` assuming region names were unique.

**Solution:** Changed to `key={`${d.region}-${i}`}` with array index suffix to guarantee uniqueness.

**Prevention:**
- CGC region names are descriptive labels, not unique identifiers — never use them as React keys
- When rendering lists from aggregated CGC data, always include an index or composite key
- Test collapsible sections with grains that have duplicate region rows (Canola is a good candidate)

**Files modified:**
- `components/dashboard/supply-pipeline.tsx`

**Tags:** #react #cgc-data #keys #supply-pipeline

## 2026-03-11 - HMR Does Not Clear Stale React Trees After Client Directive Changes

**Symptom:** After fixing the duplicate key bug, console errors persisted even though the source code was correct. The errors only cleared after a full dev server restart.

**Root Cause:** When a component gains or changes its `"use client"` directive, Hot Module Replacement may not fully unmount and remount the React tree. Stale component instances continue to render with old key logic.

**Solution:** Stopped and restarted the dev server to force a clean React tree rebuild.

**Prevention:**
- After adding/modifying `"use client"` directives or changing component key strategies, restart the dev server
- Don't debug console errors from stale HMR state — restart first, then investigate
- Preview verification should include a server restart step when `"use client"` changes are involved

**Files modified:** (none — operational fix)

**Tags:** #hmr #next.js #debugging #dev-server

## 2026-03-12 — CGC Freshness Badge Shows Historical Backfill Instead of Current Data

**Symptom:** App header displayed "CGC Wk 52 · 2023-2024" instead of "CGC Wk 30 · 2025-2026".

**Root cause:** `cgc-freshness.tsx` queried `cgc_imports` with `ORDER BY imported_at DESC`. Historical backfill imports (2020-2024) ran on March 12 and received newer `imported_at` timestamps than the actual current 2025-2026 Week 30 import from March 9. The query returned the most recently *imported* row, not the most *current* data.

**The lesson:** `imported_at` (wall-clock time of the job) ≠ logical data time (`crop_year`, `grain_week`). Any query that wants "the latest data" must order by the data's own temporal columns, not the import timestamp. Backfills, re-imports, and reconciliation jobs will always break timestamp-based ordering.

**Fix:** Changed ordering from `.order("imported_at", { ascending: false })` to `.order("crop_year", { ascending: false }).order("grain_week", { ascending: false })`. The `imported_at` field is still used for the freshness dot (green pulse vs amber) since that correctly reflects data staleness.

**Files modified:** `components/layout/cgc-freshness.tsx`

**Tags:** #freshness #ordering #backfill #cgc-imports

## 2026-03-13 — Supplementary Data Pipeline Added (Grain Monitor & Producer Cars)

**Scope:** Added a secondary logistics-focused data pipeline to supplement the core CGC weekly grain data.

**What was added:**
1. **New Supabase tables:**
   - `grain_monitor_snapshots` — system-wide logistics per grain week from Government Grain Monitor PDFs (port throughput, grain-in-storage, etc.)
   - `producer_car_allocations` — per-grain forward-looking rail car data from CGC Producer Car reports (advance allocations for future weeks)

2. **New RPC function:**
   - `get_logistics_snapshot(crop_year, grain_week)` — returns both tables' data as structured JSON for Edge Function integration

3. **Enhanced commodity knowledge:**
   - Updated `commodity-knowledge.ts` with two new sections: "Marketing Strategy & Contract Guidance" and "Logistics & Transport Awareness" (~1.5K tokens, total now ~5.5K)
   - Applied to both `analyze-market-data` and `generate-intelligence` prompts for context-aware logistics discussion

4. **Pipeline integration:**
   - Updated `market-intelligence-config.ts` version bumps: v4 for analyzeMarketData and generateIntelligence, v3 for knowledgeBase
   - `analyze-market-data` fetches logistics snapshot and injects into Step 3.5 Flash prompts
   - `generate-intelligence` receives logistics data in Grok prompts via updated `GrainContext` interface

5. **Data insertion:**
   - Week 30 Grain Monitor data (2025-2026 crop year, 1-week lagged: used for Week 31 analysis)
   - Week 33 Producer Car allocations (2025-2026 crop year, 2-week forward: for Week 31 analysis)
   - Manually inserted for now — automated scraping not yet implemented

6. **Migration file:**
   - `supabase/migrations/20260313120000_create_grain_monitor_and_producer_cars.sql` creates tables, RPC, and indexes

**Known Data Issues:**
- **Grain name mapping:** `producer_car_allocations` uses CGC commodity naming (e.g., "Durum") while `grains` table uses full names (e.g., "Amber Durum"). Grain disambiguation will be needed when joining these tables in future analysis queries.
- **Producer car cumulative semantics:** Data is cumulative forward-looking, not weekly-only. The RPC returns the latest available week ≤ `grain_week + 3` to ensure allocations don't "age out" mid-analysis.

**Prevention:**
- Grain name mismatches between external data sources and the canonical `grains` table should be documented at ingest time
- Forward-looking data (allocations, forecasts) and historical data (observations) need explicit time-semantic clarity in both schema and query documentation

**What remains:**
- Automated scraping from Government Grain Monitor PDFs and CGC Producer Car reports
- Historical backfill of older grain monitor and producer car data
- UI display components for logistics data (charts, summary tiles, context cards)

**Files modified:**
- `supabase/migrations/20260313120000_create_grain_monitor_and_producer_cars.sql` (new)
- `supabase/functions/_shared/commodity-knowledge.ts`
- `supabase/functions/_shared/market-intelligence-config.ts`
- `supabase/functions/analyze-market-data/index.ts`
- `supabase/functions/generate-intelligence/index.ts`
- `supabase/functions/generate-intelligence/prompt-template.ts`
- `lib/queries/observations.ts` (added `logisticsSnapshot` field to GrainContext)

**Tags:** #data-pipeline #logistics #government-data #supplementary-sources #commerce-context

## 2026-03-13 — Producer Car Grain Names Don't Match Canonical Grains Table

**Symptom:** QC check found that `producer_car_allocations` grain names ("Durum", "Chickpeas") didn't match the canonical `grains` table names ("Amber Durum", "Chick Peas"), causing silent JOIN failures in the `get_logistics_snapshot()` RPC.

**Root Cause:** CGC Producer Car reports use abbreviated commodity names that differ from the CGC weekly grain statistics CSV naming convention used in `grains`. No validation or mapping layer existed at ingest time.

**Solution:** Applied SQL UPDATEs to normalize names:
```sql
UPDATE producer_car_allocations SET grain = 'Amber Durum' WHERE grain = 'Durum';
UPDATE producer_car_allocations SET grain = 'Chick Peas' WHERE grain = 'Chickpeas';
```
Buckwheat left unmatched (minor grain, not in the tracked 16 Canadian grains).

**Prevention:**
- Every new external data source must have a grain-name mapping validation at ingest time
- Document known name discrepancies between CGC report types (weekly CSV vs producer car reports vs grain monitor)
- Future automated ingestion scripts should include a `CASE WHEN` or lookup table to normalize grain names before INSERT

**Tags:** #data-integrity #grain-naming #producer-cars #external-data

## 2026-03-13 — AI Thesis Contradiction: Step 3.5 Flash Bearish vs Grok Bullish on Canola

**Symptom:** The dual-LLM pipeline produced contradictory Canola Week 31 theses — Step 3.5 Flash called bearish (YTD exports -28% YoY), Grok called bullish (stock drawdown shows demand). A farmer reading both would receive conflicting advice.

**Root Cause:** Step 3.5 Flash anchored on cumulative YTD export position without checking whether current-week flow contradicted the conclusion. Three specific errors: (1) conflating YTD position with current flow, (2) ignoring stock draw as a bullish signal, (3) missing the logistics constraint explanation for weak exports.

**Resolution:** Claude moderated the debate using evidence: Week 31 stocks drew -175.6 Kt while 455.6 Kt of deliveries came in, implying 631 Kt absorbed in one week. Vancouver port at 107% capacity (26 vessels vs avg 20, 19.2% out-of-car time) explains the export lag. Corrected thesis: bullish with timing risk, not bearish.

**New references created:**
- `docs/lessons-learned/canola-week31-debate-moderation.md` — full moderation ruling with evidence
- `docs/reference/agent-debate-rules.md` — 8 codified rules for continuous agent improvement

**Prevention:**
- Added flow coherence rules to the pipeline: if thesis says bearish but stocks are drawing, flag the contradiction before publishing
- Added logistics data integration so both models can see port congestion, vessel queues, and out-of-car time
- Codified the "2 of 3 weeks confirmation" rule — don't wait for 2-3 more weeks when the data already shows a pattern

**Tags:** #ai-pipeline #thesis-quality #dual-llm #debate-moderation #canola
