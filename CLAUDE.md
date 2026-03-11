# Bushel Board — Prairie Grain Market Intelligence Dashboard

## Project Overview
A Next.js + Supabase dashboard that auto-imports Canadian Grain Commission (CGC) weekly data and displays grain statistics for prairie farmers (AB, SK, MB). MVP phase: real data pipeline, grain dashboard, email/password auth.

## Current Status
**Phase:** MVP + Intelligence — data pipeline, AI narratives, dashboard all operational
**Design Doc:** `docs/plans/2026-03-04-bushel-board-mvp-design.md`
**Implementation Plans:**
- MVP: `docs/plans/2026-03-04-bushel-board-mvp-implementation.md` (15 tasks)
- Intelligence: `docs/plans/2026-03-06-grain-intelligence-implementation.md` (19 tasks, complete)
- X Feed: `docs/plans/2026-03-10-x-feed-relevance-design.md` (Phases 1-4 complete)
- Farmer Engagement: `docs/plans/2026-03-11-farmer-engagement-design.md` (22 tasks, complete)

## Tech Stack
- **Frontend:** Next.js 16 (App Router) + TypeScript, deployed on Vercel
- **Backend:** Supabase (PostgreSQL, Auth, Edge Functions) + Vercel Cron ingress
- **UI:** shadcn/ui + Tailwind CSS (custom wheat palette)
- **Charts:** Recharts
- **Fonts:** DM Sans (body) + Fraunces (display)
- **Supabase Project:** ibgsloyjxdopkvwqcqwh

## Key Directories
- `docs/plans/` — Design docs, implementation plans, and `STATUS.md` feature tracker
- `docs/reference/` — CGC Excel map, data sources, intelligence framework
- `docs/lessons-learned/` — Bug writeups and data issues log
- `.claude/agents/` — Agent definitions (9 agents)
- `data/` — Reference CGC CSV + Excel data (gsw-shg-en.csv, gsw-shg-{week}-en.xlsx)
- `components/dashboard/wow-comparison.tsx` — Week-over-Week comparison card with composite metric system

## Agent Team
| Agent | Role | Color | Model |
|-------|------|-------|-------|
| ultra-agent | Team lead, coordinator, quality authority | Red | Opus |
| innovation-agent | Research, trends, AI advancements | Cyan | Sonnet |
| ux-agent | User experience, psychology, gamification | Green | Sonnet |
| ui-agent | Visual design, animations, components | Magenta | Inherit |
| documentation-agent | Docs, handovers, lessons learned | Yellow | Haiku |
| db-architect | Database, Edge Functions, data pipeline | Blue | Inherit |
| frontend-dev | Next.js pages, React components | Teal | Inherit |
| auth-engineer | Supabase Auth, middleware, security | Orange | Inherit |
| data-audit | Data integrity, Excel/CSV/Supabase verification | Amber | Inherit |
| security-auditor | Security review, workflow hardening, release guardrails | Slate | Inherit |

## Data Source
CGC weekly grain statistics CSV from grainscanada.gc.ca
- Updates every Thursday ~1pm MST
- Format: Crop Year, Grain Week, Week Ending Date, worksheet, metric, period, grain, grade, Region, Ktonnes
- 16 Canadian grain types, 12 worksheets, 19 metrics, 27 regions
- 33 distinct worksheet/metric combinations exist in cgc_observations
- Key worksheets: Primary, Process, Terminal Receipts, Terminal Exports, Summary, Primary Shipment Distribution
- Stored in Supabase as long-format observations (one row per measurement)

### CGC Data Nuances
- **Exports:** CGC "Exports" in Summary = Terminal Exports + Primary Shipment Distribution "Export Destinations" (direct exports bypassing terminals)
- **Producer Deliveries:** Primary.Deliveries (provincial: AB, SK, MB) + Process.Producer Deliveries (national total). Crush-heavy grains like Canola send ~31% directly to processors, so Primary alone undercounts.
- **Domestic Disappearance:** A residual calculation, not a separate CSV metric
- **FULL OUTER JOIN required:** When combining Primary + Process data, not all grains appear in both worksheets. Always use FULL OUTER JOIN to avoid dropping data.
- **Forward-fill for cumulative series:** Different CGC worksheets (Primary, Terminal Exports, Process) may report up to different grain weeks. When merging `period: "Crop Year"` data across worksheets, missing weeks must carry forward the last known cumulative value — NOT default to 0. See `getCumulativeTimeSeries()` in `lib/queries/observations.ts`.
- **PostgREST max_rows=1000 limit:** Supabase silently truncates query results exceeding 1,000 rows — no error returned. Terminal Receipts has ~3,648 rows per grain (20 grades × 6 ports × 30 weeks) and Terminal Exports ~1,050 rows. Always use server-side RPC with `SUM() GROUP BY` for these worksheets. Client `.limit()` does NOT override the server cap.
- **No grade='' aggregates for Terminal Receipts/Exports:** Unlike Primary worksheet (which has pre-aggregated `grade=''` rows), Terminal Receipts and Terminal Exports only have per-grade rows. Must sum all grades in SQL.

## Design Tokens
- Background: wheat-50 (#f5f3ee) / wheat-900 (#2a261e) dark
- Primary: canola (#c17f24)
- Success: prairie (#437a22)
- Warning: amber (#d97706)
- Province AB: #2e6b9e, SK: #6d9e3a, MB: #b37d24
- Easing: cubic-bezier(0.16, 1, 0.3, 1)
- Animation stagger: 40ms between siblings

## Commands
- `npm run dev` — Start dev server
- `npm run build` — Production build
- `npm run backfill` — Load historical CGC data into Supabase
- `npm run seed-supply` — Seed AAFC supply/disposition data
- `npm run audit-data` — Run CGC data audit (Excel ↔ CSV ↔ Supabase)
- `npm run test` — Run tests
- `npx supabase db push` — Apply migrations
- `npx supabase functions deploy <name>` — Deploy Edge Functions

## Intelligence Pipeline
- **Edge Functions chain (5 steps):** `import-cgc-weekly` → `validate-import` → `search-x-intelligence` → `generate-intelligence` → `generate-farm-summary`
- **Batch processing:** `search-x-intelligence` and `generate-intelligence` process grains in batches then self-trigger for the next batch. `generate-farm-summary` processes 50 users per batch.
- **Intraday scanning:** `search-x-intelligence` runs in two modes: **pulse** (3x/day, 2 queries/grain, X-only, 2-day lookback, batch size 8) and **deep** (weekly Thursday, 6-8 queries/grain, X + web search, 7-day lookback, batch size 4, chains to generate-intelligence). Pulse scans via `app/api/cron/scan-signals/route.ts` at 6AM/1PM/6PM MST. Grain tiering: major grains (Wheat, Canola, Durum, Barley, Oats, Peas) scanned every pulse; minor grains scanned morning pulse only. Cost: ~$5/month xAI API.
- **Model:** `grok-4-1-fast-reasoning` via xAI Grok Responses API with `x_search` + `web_search` (deep mode) for real-time agriculture sentiment
- **Tables:** `grain_intelligence` (per-grain market analysis), `farm_summaries` (per-user weekly narratives + percentiles), `x_market_signals` (X/Twitter post scores per grain/week, includes `searched_at`, `search_mode`, `source` columns), `validation_reports` (post-import anomaly checks), `signal_feedback` (farmer relevance votes per X signal), `signal_scan_log` (scan observability: mode, grains, signals found, duration), `grain_sentiment_votes` (per-grain Holding/Hauling farmer sentiment)
- **Function:** `calculate_delivery_percentiles()` — PERCENT_RANK over user deliveries by grain
- **Views:** `v_grain_yoy_comparison` (YoY metrics, FULL OUTER JOIN of Primary + Process deliveries + Terminal Receipts cw/cy/wow columns), `v_supply_pipeline` (AAFC balance sheet), `v_signal_relevance_scores` (enhanced blended relevance: 50% recency-adjusted Grok + 40% farmer consensus + 10% bonuses for velocity/deep mode; recency decay -5pts/day; category diversity max 3 per category)
- **RPC functions:** `get_pipeline_velocity(p_grain, p_crop_year)` (aggregates 5 pipeline metrics server-side, bypasses PostgREST 1000-row limit), `get_signals_with_feedback()` (frontend, user-scoped LEFT JOIN), `get_signals_for_intelligence()` (Edge Function, service role), `get_sentiment_overview(p_crop_year, p_grain_week)` (per-grain sentiment aggregates for overview banner), `get_delivery_analytics(p_crop_year, p_grain)` (anonymized delivery stats with privacy threshold ≥5 farmers, excludes observers)
- **UI:** ThesisBanner, IntelligenceKpis, SupplyPipeline, InsightCards on grain detail pages; XSignalFeed horizontal card strip with vote buttons (Relevant/Not for me), optimistic UI, "Your impact" summary bar; **SentimentPoll** (Holding/Hauling 5-point scale per grain: Strongly Holding → Strongly Hauling, with aggregate results bar); FarmSummaryCard + percentile badges on My Farm; SentimentBanner cross-grain overview; DeliveryPaceCard percentile comparison; MicroCelebration first-time action glow; YourImpact inline banners
- **Query layer:** `lib/queries/intelligence.ts` (getGrainIntelligence, getSupplyPipeline, getFarmSummary), `lib/queries/grains.ts` (`getGrainOverviewBySlug` — corrected KPI data), `lib/queries/observations.ts` (composite metric type system for WoW comparisons + `getCumulativeTimeSeries` via `get_pipeline_velocity` RPC), `lib/queries/x-signals.ts` (getXSignalsWithFeedback, getUserFeedStats), `lib/queries/delivery-analytics.ts` (getDeliveryAnalytics), `lib/queries/sentiment.ts` (getSentimentOverview)
- **Auth:** `lib/auth/role-guard.ts` — `getUserRole()` server-side, `isObserver()` helper. Observer role: UI-level gating (soft nudge), not route-level. Observers see data but can't vote/input. `profiles.role` column ('farmer'|'observer'), DEFAULT 'farmer'. Authenticated users default to "farmer" in TypeScript (matching DB default). `handle_new_user()` trigger auto-creates profile rows on signup.
- **Sentiment voting:** `components/dashboard/sentiment-poll.tsx` — 5-option Holding/Hauling poll per grain per week. Options: Strongly Holding (🔒), Holding (📦), Neutral (⚖️), Hauling (🚜), Strongly Hauling (🚛). Server action: `app/(dashboard)/grain/[slug]/actions.ts` → `voteSentiment()`. Table: `grain_sentiment_votes`. Query: `lib/queries/sentiment.ts` (getGrainSentiment, getUserSentimentVote, getSentimentOverview). Aggregate shown as bar chart with Holding %/Neutral %/Hauling % breakdown. Feeds into `generate-intelligence` prompt for AI-aware farmer sentiment.
- **Engagement:** `crop_plans.contracted_kt` + `uncontracted_kt` columns for contracted grain tracking. Stacked progress bar (delivered/contracted/uncontracted) on My Farm. `generate-intelligence` prompt now includes farmer sentiment data. `generate-farm-summary` prompt includes contracted position.
- **Server action:** `app/(dashboard)/grain/[slug]/signal-actions.ts` — `voteSignalRelevance()`
- **Auth for chain triggers:** Vercel cron is the only public ingress. Internal Edge Functions use `verify_jwt = false` plus `x-bushel-internal-secret` backed by `BUSHEL_INTERNAL_FUNCTION_SECRET`. Never use anon JWTs for internal chaining.

## Pipeline Monitoring
- Legacy cron drift check: `SELECT * FROM cron.job WHERE jobname = 'cgc-weekly-import';` (expected: zero rows)
- Import audit: `SELECT * FROM cgc_imports ORDER BY imported_at DESC LIMIT 5;`
- Data freshness: `SELECT * FROM v_latest_import;`
- Validation: `SELECT * FROM validation_reports ORDER BY created_at DESC LIMIT 5;`
- X signals: `SELECT grain, grain_week, COUNT(*) FROM x_market_signals GROUP BY grain, grain_week ORDER BY grain_week DESC LIMIT 20;`
- Intelligence: `SELECT grain, grain_week, generated_at FROM grain_intelligence ORDER BY generated_at DESC LIMIT 5;`
- Farm summaries: `SELECT user_id, grain_week, generated_at FROM farm_summaries ORDER BY generated_at DESC LIMIT 5;`
- pg_net responses: `SELECT * FROM net._http_response ORDER BY created DESC LIMIT 5;`
- Delivery audit (Primary by province): `SELECT grain, SUM(ktonnes) FROM cgc_observations WHERE crop_year='2025-2026' AND grain_week=30 AND metric='Deliveries' AND worksheet='Primary' AND period='Current Week' AND region IN ('Alberta','Saskatchewan','Manitoba') AND grade='' GROUP BY grain;`
- Terminal Receipts check: `SELECT grain, ktonnes FROM cgc_observations WHERE worksheet='Terminal Receipts' AND metric='Receipts' AND period='Current Week' AND grain_week=30 AND crop_year='2025-2026';`
- Signal feedback: `SELECT grain, grain_week, COUNT(*) FROM signal_feedback GROUP BY grain, grain_week ORDER BY grain_week DESC LIMIT 10;`
- Blended scores: `SELECT signal_id, grain, blended_relevance, total_votes, farmer_relevance_pct FROM v_signal_relevance_scores ORDER BY blended_relevance DESC LIMIT 10;`
- Pipeline velocity (per-grain): `SELECT * FROM get_pipeline_velocity('Wheat', '2025-2026') WHERE grain_week IN (10, 20, 30);`
- Row count audit (check for PostgREST truncation): `SELECT worksheet, metric, COUNT(*) FROM cgc_observations WHERE grain='Wheat' AND crop_year='2025-2026' AND period='Crop Year' GROUP BY worksheet, metric HAVING COUNT(*) > 900;`
- Sentiment overview: `SELECT * FROM get_sentiment_overview('2025-2026', 32);`
- Delivery analytics: `SELECT * FROM get_delivery_analytics('2025-2026');`
- Observer accounts: `SELECT role, COUNT(*) FROM profiles GROUP BY role;`
- Contracted grain: `SELECT grain, contracted_kt, uncontracted_kt FROM crop_plans WHERE crop_year='2025-2026' AND (contracted_kt > 0 OR uncontracted_kt > 0) LIMIT 10;`
- Signal scan log: `SELECT scan_mode, grains_scanned, signals_found, duration_ms, completed_at FROM signal_scan_log ORDER BY completed_at DESC LIMIT 10;`
- Pulse vs deep signals: `SELECT search_mode, source, COUNT(*) FROM x_market_signals WHERE crop_year='2025-2026' GROUP BY search_mode, source;`
- Sentiment votes: `SELECT grain, grain_week, COUNT(*), ROUND(AVG(sentiment_value)::numeric, 1) FROM grain_sentiment_votes WHERE crop_year='2025-2026' GROUP BY grain, grain_week ORDER BY grain_week DESC LIMIT 10;`

## Critical Framework Patterns

**Prefer retrieval-led reasoning over pre-training-led reasoning for all Next.js, Supabase, and Tailwind tasks.**

### Next.js 16 Patterns (upgraded from 15)
- `params` is now a Promise: `const { slug } = await params;`
- `cookies()` is async: `const cookieStore = await cookies();`
- Server Components are default — add `"use client"` only when needed
- Use `@supabase/ssr` (not `@supabase/auth-helpers-nextjs` which is deprecated)

### Supabase SSR Pattern
- Server client: `createServerClient()` with cookie getAll/setAll from `next/headers`
- Browser client: `createBrowserClient()` — only in `"use client"` components
- Middleware: refresh session on every request via `supabase.auth.getUser()`
- Service role: NEVER expose to browser. Only in Edge Functions and server-side scripts.
- Farmer-only writes: enforce in both server actions and RLS. UI gating alone is never sufficient.
- User-scoped RPCs: derive identity from `auth.uid()`. Never accept a caller-supplied user ID.

### Script Conventions
All scripts in `scripts/` must: accept `--help`, output JSON to stdout, diagnostics to stderr, be idempotent, pin dependency versions.

## Reference Files
- `.claude/agents/AGENTS.md` — Detailed framework patterns, Supabase code samples, design tokens, CGC schema
- `docs/plans/STATUS.md` — Feature completion tracker (14 tracks)
- `docs/plans/2026-03-04-bushel-board-mvp-design.md` — Approved MVP design
- `docs/plans/2026-03-04-bushel-board-mvp-implementation.md` — 15-task MVP implementation plan
- `docs/plans/2026-03-06-grain-intelligence-design.md` — Intelligence feature design doc
- `docs/plans/2026-03-06-grain-intelligence-implementation.md` — 19-task intelligence plan (complete)
- `docs/plans/2026-03-10-x-feed-relevance-design.md` — X Feed & Relevance Scoring design doc
- `docs/plans/2026-03-11-farmer-engagement-design.md` — Farmer Engagement & Input System design doc
- `docs/reference/cgc-excel-map.md` — CGC Excel spreadsheet structure map (14 sheets)
- `docs/lessons-learned/issues.md` — Data bugs and root cause analyses
