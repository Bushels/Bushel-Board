# Bushel Board Webapp Audit

Date: March 10, 2026
Auditor: Codex
Scope: public landing flow, auth flow, dashboard architecture, Supabase query layer, Edge Function workflow, live data integrity, security posture, scalability, and farmer-focused UX.

## Executive Summary

Bushel Board already has a strong product idea, a distinct visual identity, and real momentum. The app feels more productized than prototype-grade. The problems are not aesthetic first. They are workflow safety, data correctness, and first-run experience.

The biggest issue is that the Supabase intelligence pipeline is externally triggerable with the public anon key. That creates direct abuse and cost exposure. The second issue is data inconsistency: mixed crop year formats, duplicated supply rows, and several CGC queries that do not enforce the documented aggregate-grade rules. The third issue is product clarity: the landing and login flow look clean, but they still undersell the core promise to a farmer who wants one fast answer: what should I pay attention to this week, and why?

## What Was Checked

- `npm run test`: passed
- `npm run build`: passed
- `npm run lint`: only two unused-symbol warnings in `scripts/audit-data.ts`
- `npm run audit-data`: passed `52/52` checks
- Public pages reviewed in a production build via Playwright: `/`, `/login`, `/signup`
- Live Supabase validation performed against public REST/RPC endpoints and current data

## Findings

### P0: Intelligence pipeline can be triggered by untrusted callers

Every Edge Function in the CGC to intelligence chain creates a service-role client and then trusts the request body. None of them verify caller identity, role, or a shared secret. The chain is intentionally re-triggered with the public anon key.

Affected files:

- [supabase/functions/import-cgc-weekly/index.ts](C:/Users/kyle/Agriculture/bushel-board-app/supabase/functions/import-cgc-weekly/index.ts#L119)
- [supabase/functions/validate-import/index.ts](C:/Users/kyle/Agriculture/bushel-board-app/supabase/functions/validate-import/index.ts#L35)
- [supabase/functions/search-x-intelligence/index.ts](C:/Users/kyle/Agriculture/bushel-board-app/supabase/functions/search-x-intelligence/index.ts#L36)
- [supabase/functions/generate-intelligence/index.ts](C:/Users/kyle/Agriculture/bushel-board-app/supabase/functions/generate-intelligence/index.ts#L22)
- [supabase/functions/generate-farm-summary/index.ts](C:/Users/kyle/Agriculture/bushel-board-app/supabase/functions/generate-farm-summary/index.ts#L43)

Specific problems:

- [import-cgc-weekly](C:/Users/kyle/Agriculture/bushel-board-app/supabase/functions/import-cgc-weekly/index.ts#L126) accepts arbitrary `csv_data`
- [import-cgc-weekly](C:/Users/kyle/Agriculture/bushel-board-app/supabase/functions/import-cgc-weekly/index.ts#L213) chain-triggers downstream functions with `SUPABASE_ANON_KEY`
- [search-x-intelligence](C:/Users/kyle/Agriculture/bushel-board-app/supabase/functions/search-x-intelligence/index.ts#L31) exposes permissive CORS and also trusts public bearer auth
- [generate-intelligence](C:/Users/kyle/Agriculture/bushel-board-app/supabase/functions/generate-intelligence/index.ts#L260) and [generate-farm-summary](C:/Users/kyle/Agriculture/bushel-board-app/supabase/functions/generate-farm-summary/index.ts#L251) repeat the same pattern

Impact:

- paid xAI workloads can be forced on demand
- imports can be poisoned or spammed
- farm summaries and intelligence generation can be repeatedly triggered
- this is the main safety issue in the app today

Recommendation:

- require an internal shared secret or signed job token on every function
- reject requests without that secret before creating the service-role client
- remove permissive browser CORS from internal-only functions
- treat the whole chain as private infrastructure, not public API

### P1: Supply pipeline data model is already returning duplicate rows per grain

`v_supply_pipeline` does not select a single active source/version, so one grain and crop year can return multiple rows. The app code expects one row.

Affected files:

- [supabase/migrations/20260309100000_fix_supply_pipeline_view.sql](C:/Users/kyle/Agriculture/bushel-board-app/supabase/migrations/20260309100000_fix_supply_pipeline_view.sql#L6)
- [lib/queries/intelligence.ts](C:/Users/kyle/Agriculture/bushel-board-app/lib/queries/intelligence.ts#L44)
- [lib/queries/supply-disposition.ts](C:/Users/kyle/Agriculture/bushel-board-app/lib/queries/supply-disposition.ts#L20)
- [supabase/functions/generate-intelligence/index.ts](C:/Users/kyle/Agriculture/bushel-board-app/supabase/functions/generate-intelligence/index.ts#L63)

Observed live on March 10, 2026:

- `v_supply_pipeline` returned 32 rows for crop year `2025-26`, not 16
- there are at least two active sources in `supply_disposition` for `2025-26`
- `getSupplyPipeline()` uses `.single()`
- `generate-intelligence()` collapses duplicates with `new Map()`, which silently keeps the last row

Impact:

- grain detail supply cards can fail or null out
- AI summaries and dashboard cards can disagree
- this will get worse as more vintages or sources are loaded

Recommendation:

- add a canonical source-selection layer
- either mark one source as active in-table, or create a versioned snapshot table/view
- never rely on `.single()` against a view that does not enforce uniqueness

### P1: Community stats are publicly exposed and currently wrong

The privacy threshold is enforced in app code, not in the RPC. The RPC itself is public and returns the raw values even when farmer count is below threshold. The query is also stale and mismatched to current CGC field conventions.

Affected files:

- [supabase/migrations/20260309500000_community_stats.sql](C:/Users/kyle/Agriculture/bushel-board-app/supabase/migrations/20260309500000_community_stats.sql#L3)
- [lib/queries/community.ts](C:/Users/kyle/Agriculture/bushel-board-app/lib/queries/community.ts#L10)

Observed live on March 10, 2026:

- `get_community_stats()` returned `farmer_count = 1`
- it also returned `total_tonnes = 0`
- the SQL hardcodes crop year `2025-26`
- the CGC filters use legacy values like `Primary Elevator Receipts`, `Cumulative to Date`, and `All grades combined`

Impact:

- privacy rule can be bypassed directly
- landing-page social proof is not trustworthy

Recommendation:

- enforce the privacy threshold inside the SQL function
- compute against current canonical crop year and current CGC field names
- refresh this materialized view inside the import flow only after successful validation

### P1: `get_signals_with_feedback()` trusts caller-supplied user IDs

The RPC is `SECURITY DEFINER` and joins feedback rows using `p_user_id`. There is no `auth.uid()` enforcement.

Affected files:

- [supabase/migrations/20260310100200_signals_feedback_rpc.sql](C:/Users/kyle/Agriculture/bushel-board-app/supabase/migrations/20260310100200_signals_feedback_rpc.sql#L6)
- [lib/queries/x-signals.ts](C:/Users/kyle/Agriculture/bushel-board-app/lib/queries/x-signals.ts#L56)

Impact:

- anyone with a valid session and a known UUID can probe whether another user voted on a signal and how they voted
- intended per-user isolation is bypassed at the RPC layer

Recommendation:

- remove `p_user_id` from the function signature
- use `auth.uid()` inside the function body
- revoke public execute access from internal-only RPCs

### P2: Several CGC queries ignore the documented aggregate-grade rule

The project notes are explicit: Primary worksheet aggregate rows use `grade = ''`. Several app queries do not filter that grade, which risks mixing aggregate rows with grade-level rows.

Affected files:

- [lib/queries/observations.ts](C:/Users/kyle/Agriculture/bushel-board-app/lib/queries/observations.ts#L31)
- [lib/queries/observations.ts](C:/Users/kyle/Agriculture/bushel-board-app/lib/queries/observations.ts#L64)
- [lib/queries/observations.ts](C:/Users/kyle/Agriculture/bushel-board-app/lib/queries/observations.ts#L97)
- [lib/queries/observations.ts](C:/Users/kyle/Agriculture/bushel-board-app/lib/queries/observations.ts#L240)
- [components/dashboard/province-map.tsx](C:/Users/kyle/Agriculture/bushel-board-app/components/dashboard/province-map.tsx#L46)

Impact:

- provincial totals can be inflated or incomplete
- the province map only displays the first matching province row, not a true sum
- week-over-week comparisons can overcount if grade rows are included

Recommendation:

- add explicit `grade = ''` where Primary aggregate rows are intended
- aggregate by province server-side before the map layer receives data
- codify these rules in one query helper or RPC rather than repeating them in page-level queries

### P2: Crop year format is still inconsistent across the stack

The app uses both `2025-26` and `2025-2026` depending on layer.

Affected files:

- [lib/utils/crop-year.ts](C:/Users/kyle/Agriculture/bushel-board-app/lib/utils/crop-year.ts#L5)
- [lib/cgc/parser.ts](C:/Users/kyle/Agriculture/bushel-board-app/lib/cgc/parser.ts#L84)
- [supabase/functions/import-cgc-weekly/index.ts](C:/Users/kyle/Agriculture/bushel-board-app/supabase/functions/import-cgc-weekly/index.ts#L94)

Observed live on March 10, 2026:

- `validation_reports` used `2025-2026`
- `grain_intelligence` used `2025-26`
- `cgc_imports` contains both formats

Impact:

- joins, filters, and derived views are fragile
- it increases the odds of missing or duplicated data when more tables are added

Recommendation:

- choose one storage format for all persisted tables
- add a single normalization helper and migrate historical rows
- reject mixed formats at the ingestion boundary

## UX and Product Audit

### Landing Page

Score: `6.5/10`

What works:

- visually distinct and polished
- prairie scene and typography fit the category
- clear single CTA and clean hierarchy

What misses:

- the hero promise is generic: "Deliver with Data" is elegant, but not specific enough
- it does not quickly tell a farmer what data is included, how often it updates, or why it matters this week
- it sells confidence, but not decision support

What to change:

- replace the hero subhead with a blunt farmer-value statement
- mention weekly CGC data, prairie delivery pace, and market sentiment directly
- show one concrete example outcome, not only abstract benefit language

Suggested framing:

- "Weekly prairie grain intelligence built from CGC data, your delivery pace, and real-time market signals."
- "See what moved this week, where your grain sits in the pipeline, and what deserves attention before you call the elevator."

### Login

Score: `5/10`

Affected file:

- [app/(auth)/login/page.tsx](C:/Users/kyle/Agriculture/bushel-board-app/app/(auth)/login/page.tsx#L46)

What works:

- simple and low-friction
- standard auth affordances are present

What misses:

- it feels like a generic SaaS login, not the front door to a farmer decision tool
- there is no reminder of what the user gets immediately after login
- there is no trust signal around privacy or what farm data is used for

Recommendation:

- add a right-side value panel on desktop and a compact value stack on mobile
- show "What you’ll see today" with 3 bullets: delivery pace, crop-specific market pulse, and your farm comparison
- add a short privacy line: private farm data, aggregated peer benchmarking, no public exposure

### Signup and Onboarding

Score: `5.5/10`

Affected file:

- [app/(auth)/signup/page.tsx](C:/Users/kyle/Agriculture/bushel-board-app/app/(auth)/signup/page.tsx#L84)

What works:

- role split between farmer and observer is good
- the form is still compact

What misses:

- farmers are asked for identity and farm info before they see value
- "Create your farm dashboard in 30 seconds" is good copy, but the sequence still front-loads work
- the app sends a new user straight to `/overview`, even though the real personalization engine is `/my-farm`

Recommendation:

- stage onboarding in two steps
- step 1: email/password only
- step 2 after first login: add 1 to 3 crops and approximate acres
- route new farmers to a guided first-run dashboard or `my-farm` setup, not the generic overview

### Overview and First Logged-In Impression

Score: `6/10`

Affected files:

- [app/(dashboard)/overview/page.tsx](C:/Users/kyle/Agriculture/bushel-board-app/app/(dashboard)/overview/page.tsx#L24)
- [app/(dashboard)/overview/client.tsx](C:/Users/kyle/Agriculture/bushel-board-app/app/(dashboard)/overview/client.tsx#L31)
- [components/layout/nav.tsx](C:/Users/kyle/Agriculture/bushel-board-app/components/layout/nav.tsx#L31)

What works:

- cards, sentiment banner, and intelligence create a credible market dashboard
- the visual system is consistent
- the product already feels narrower and more useful than a generic analytics admin

What misses:

- there is no single dominant "decision now" module
- the first fold is still card-heavy rather than outcome-heavy
- if a farmer wants the answer in 15 seconds, the page makes them scan too much
- the nav is competent but plain; it does not reinforce what is most important right now

Recommendation:

- add a top-of-page farmer brief: "What changed this week", "What needs action", "What can wait"
- make one crop or one watchlist the obvious focal point after login
- let the overview default to the user’s actual crops and sort by urgency, not by a fixed grain order

### Grain Detail Experience

Score: `7/10`

Affected file:

- [app/(dashboard)/grain/[slug]/page.tsx](C:/Users/kyle/Agriculture/bushel-board-app/app/(dashboard)/grain/[slug]/page.tsx#L113)

What works:

- the page is rich
- thesis, KPIs, X feed, supply, and deeper charts form a believable intelligence workflow
- the lock state is clear and understandable

What misses:

- "Market Signals" is used for both the insights area and the X feed context, which muddies hierarchy
- the page still leans toward feature completeness over quick decision sequencing
- for many farmers, the order should be thesis -> what changed -> what to do -> deeper proof

Recommendation:

- tighten the section names and reduce cognitive overlap
- move the most actionable recommendation directly under the thesis
- reserve deep-dive visuals for lower on the page

### My Farm

Score: `7/10`

Affected files:

- [app/(dashboard)/my-farm/page.tsx](C:/Users/kyle/Agriculture/bushel-board-app/app/(dashboard)/my-farm/page.tsx#L31)
- [app/(dashboard)/my-farm/client.tsx](C:/Users/kyle/Agriculture/bushel-board-app/app/(dashboard)/my-farm/client.tsx#L75)

What works:

- this is the most farmer-specific part of the app
- percentiles and delivery logging push the product toward actual workflow ownership
- "Local Intel" per crop is a good bridge from personal data to market context

What misses:

- the app’s strongest differentiator is not used as the main first-run moment
- a new farmer should probably land here before landing in the general overview

Recommendation:

- use My Farm as the onboarding home for farmers
- after crop setup, generate a personalized "your week" summary before showing the broader market view

## Scalability and Future Feature Risk

### Current risk areas

Score: `5/10`

- overview load scales roughly with the number of active grains because it fans out per-grain queries
- more alternative data feeds will make the current source/version model brittle
- intelligence generation depends on multiple public-callable functions and mixed conventions
- query logic is spread across page code, RPCs, views, and Edge Functions without one canonical grain snapshot

### Better direction

- create a canonical weekly grain snapshot table per grain and crop year
- materialize the exact values the UI needs: deliveries, exports, stocks, supply, intelligence summary, signal counts, freshness
- keep raw CGC long-form data for auditability, but stop making page loads rebuild the world
- define one source-of-truth strategy for non-CGC datasets like AAFC and StatsCan
- add an explicit "active dataset version" concept before more sources are introduced

## Section Scores

- Security and abuse resistance: `2/10`
- Supabase query correctness: `4/10`
- Data pipeline workflow robustness: `4.5/10`
- Landing and login UX: `5.5/10`
- Signup and onboarding flow: `5.5/10`
- Logged-in dashboard clarity: `6/10`
- Grain-detail decision support: `7/10`
- My Farm personalization: `7/10`
- Scalability for more data and features: `5/10`

## Overall Rating

Overall: `5.2/10`

Interpretation:

- strong concept
- credible product direction
- decent visual execution
- not yet safe enough or disciplined enough in data modeling to scale confidently
- not yet sharp enough in first-run UX to produce the "this is how I make decisions now" reaction consistently

## Priority Fix Order

1. Lock down all Edge Functions and sensitive RPCs.
2. Normalize crop year format across ingestion, storage, views, and queries.
3. Fix supply source duplication and define one canonical active-source model.
4. Fix Primary worksheet grade filtering and province aggregation.
5. Redesign first-run farmer onboarding so value appears before data entry fatigue.
6. Add a top-level weekly decision brief to the overview.
7. Move more dashboard reads to pre-aggregated weekly snapshot tables or RPCs.

## Agent Note

No agent changes were required to complete this audit. The existing security, data, and UX coverage in the repo was sufficient for a full review. If you want to operationalize this process, the next useful addition would be a reusable `audit-agent` that runs build, tests, lint, live Supabase checks, and Playwright capture in one pass.
