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
- UX Layout & Hierarchy: `docs/plans/2026-03-11-ux-layout-hierarchy-design.md` (7 tasks, complete)
- CFTC COT: `docs/plans/2026-03-13-cftc-cot-integration-design.md` (12 tasks, complete)
- Dashboard Overhaul: `docs/plans/2026-03-13-dashboard-overhaul-design.md` (8 workstreams, complete)
- Terminal Net Flow: `docs/plans/2026-03-16-terminal-net-flow-design.md` (9 tasks, complete)

## Tech Stack
- **Frontend:** Next.js 16 (App Router) + TypeScript, deployed on Vercel
- **Backend:** Supabase (PostgreSQL, Auth, Edge Functions) + Vercel Cron ingress
- **UI:** shadcn/ui + Tailwind CSS (custom wheat palette)
- **Charts:** Recharts — dual Y-axis gotcha: every `<Line>`/`<Area>` must specify `yAxisId` when multiple `<YAxis>` exist. CSS vars like `hsl(var(--background))` don't resolve in SVG `fill` attrs (renders black); use hex colors.
- **CSS opacity on hex vars:** Never use `hsl(var(--color) / opacity)` — our CSS custom properties are hex values. Use `color-mix(in srgb, var(--color-name) 65%, transparent)` for opacity.
- **Fonts:** DM Sans (body) + Fraunces (display)
- **Supabase Project:** ibgsloyjxdopkvwqcqwh

## Key Directories
- `docs/plans/` — Design docs, implementation plans, and `STATUS.md` feature tracker
- `docs/reference/` — CGC Excel map, data sources, intelligence framework
- `docs/lessons-learned/` — Bug writeups and data issues log
- `.claude/agents/` — Agent definitions (11 agents)
- `data/CGC Weekly/` — Reference CGC CSV + Excel data (gsw-shg-en.csv, gsw-shg-{week}-en.xlsx)
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
| qc-crawler | Post-deploy/import site verification, data freshness checks | Lime | Inherit |

## Mandatory Agent Workflow (DAG)
Every implementation must follow this gate sequence. **Never skip gates 3-6.**
```
1. Plan → 2. Implement → 3. Verify → 4. Document → 5. Ship → 6. QC
```
1. **Plan:** Identify which agents are needed. Assign ownership.
2. **Implement:** Domain agents (db-architect, frontend-dev, etc.) do the work.
3. **Verify (MANDATORY):**
   - **data-audit** agent — after ANY database/RPC/Edge Function/pipeline changes
   - **security-auditor** agent — after ANY auth boundary/RLS/grant/config changes
   - `npm run build` + `npm run test` must pass
4. **Document (MANDATORY):**
   - **documentation-agent** — update issues.md, STATUS.md, CLAUDE.md, agent docs
5. **Ship:** Deploy Edge Functions, apply migrations, verify in production.
6. **QC (MANDATORY post-deploy):**
   - **qc-crawler** agent — after deployments, imports, migrations, or backfills
   - Verifies data freshness, crop year conventions, RPC health, page rendering

**Lesson learned:** Track #17 shipped with 9 bugs because gates 3-5 were skipped. External audit caught what our agents should have found.
**Lesson learned:** Track #27 — when user provides source code/prototype, inventory every structural element (axes, datasets, visual layers) BEFORE writing a design doc. Default to faithful reproduction; simplifications must be documented as explicit deviations.

## Crop Year Convention
- **Standard format:** Long format `"2025-2026"` everywhere — database, code, Edge Functions, RPCs
- **Display-only:** Short format `"2025-26"` via `toShortFormat()` in `lib/utils/crop-year.ts`
- **Single source of truth:** `getCurrentCropYear()` in `lib/utils/crop-year.ts` — Edge Functions have their own copies (Deno can't import from Next.js) but MUST use the same logic
- **If you find short format in any database table, it's a bug.**

## Data Source
CGC weekly grain statistics CSV from grainscanada.gc.ca
- Updates every Thursday ~1pm MST
- Format: Crop Year, Grain Week, Week Ending Date, worksheet, metric, period, grain, grade, Region, Ktonnes
- 16 Canadian grain types, 12 worksheets, 19 metrics, 27 regions
- 33 distinct worksheet/metric combinations exist in cgc_observations
- Key worksheets: Primary, Process, Terminal Receipts, Terminal Exports, Summary, Primary Shipment Distribution
- Stored in Supabase as long-format observations (one row per measurement)

### CGC Data Nuances
- **Exports:** CGC "Exports" in Summary = Terminal Exports + Primary Shipment Distribution "Export Destinations" (direct elevator-to-border) + Producer Cars Shipment Distribution "Export" (farmer railcars direct to US). All three components required.
- **Producer Deliveries:** Use the country-level CGC formula: `Primary.Deliveries` (AB, SK, MB, BC, `grade=''`) + `Process.Producer Deliveries` (national, `grade=''`) + `Producer Cars.Shipments` (AB, SK, MB, `grade=''`). Anything less is incomplete.
- **Domestic Disappearance:** A residual calculation, not a separate CSV metric
- **FULL OUTER JOIN required:** When combining Primary + Process data, not all grains appear in both worksheets. Always use FULL OUTER JOIN to avoid dropping data.
- **Forward-fill for cumulative series:** Different CGC worksheets (Primary, Terminal Exports, Process) may report up to different grain weeks. When merging `period: "Crop Year"` data across worksheets, missing weeks must carry forward the last known cumulative value — NOT default to 0. See `getCumulativeTimeSeries()` in `lib/queries/observations.ts`.
- **PostgREST max_rows=1000 limit:** Supabase silently truncates query results exceeding 1,000 rows — no error returned. Terminal Receipts has ~3,648 rows per grain (20 grades × 6 ports × 30 weeks) and Terminal Exports ~1,050 rows. Always use server-side RPC with `SUM() GROUP BY` for these worksheets. Client `.limit()` does NOT override the server cap.
- **No grade='' aggregates for Terminal Receipts/Exports:** Unlike Primary worksheet (which has pre-aggregated `grade=''` rows), Terminal Receipts and Terminal Exports only have per-grade rows. Must sum all grades in SQL.
- **Aggregate row guardrail:** For Primary, Process producer deliveries, and Producer Cars shipments, filter `grade=''` whenever you want the pre-aggregated total. Omitting that filter can double-count grade rows.

## Design Tokens
- Background: wheat-50 (#f5f3ee) / wheat-900 (#2a261e) dark
- Primary: canola (#c17f24)
- Success: prairie (#437a22)
- Warning: amber (#d97706)
- Province AB: #2e6b9e, BC: #2f8f83, SK: #6d9e3a, MB: #b37d24
- Easing: cubic-bezier(0.16, 1, 0.3, 1)
- Animation stagger: 40ms between siblings
- Glass shadow-sm: `0 2px 8px rgba(0,0,0,0.04)`
- Glass shadow-md: `0 4px 16px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)`
- Glass shadow-lg: `0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)`

## Definition of Done
Every piece of work must satisfy before being marked complete:
1. `npm run build` passes with no errors
2. No console errors on affected pages (verify with preview tools or browser)
3. Types check — no `any` escape hatches without justification
4. New UI changes verified visually on at least one page (preview_screenshot or manual)
5. Lessons learned documented in `docs/lessons-learned/issues.md` if a non-obvious bug was encountered
6. STATUS.md updated if a new feature track was completed
7. Destructive changes (deleted files, removed exports) verified with grep to confirm nothing still imports them

## Commands
- `npm run dev` — Start dev server
- `npm run build` — Production build
- `npm run backfill` — Load historical CGC data into Supabase
- `npm run seed-supply` — Seed AAFC supply/disposition data
- `npm run audit-data` — Run CGC data audit (Excel ↔ CSV ↔ Supabase)
- `npm run test` — Run tests
- `npx supabase db push` — Apply migrations
- `npm run seed-capacity` — Seed processor capacity reference data
- `npm run seed-prices` — Seed sample grain price data
- `npx supabase functions deploy <name>` — Deploy Edge Functions

## Intelligence Pipeline
- **Canonical production chain (7 stages):** Vercel cron `GET /api/cron/import-cgc` → `validate-import` → `search-x-intelligence` → `analyze-market-data` (+ CFTC COT data) → `generate-intelligence` (+ CFTC COT data) → `generate-farm-summary` → `validate-site-health`
- **CFTC COT cron:** `GET /api/cron/import-cftc-cot` → `import-cftc-cot` Edge Function. Schedule: Friday 20:30 UTC (1:30pm MST). Independent of CGC pipeline.
- **Legacy fallback:** `import-cgc-weekly` remains internal-only for recovery/testing, not public ingress
- **Unified model:** All pipeline stages use `grok-4-1-fast-reasoning` via xAI Responses API (`XAI_API_KEY` secret). Round 1 (`analyze-market-data`) produces data-driven thesis + bull/bear cases. Round 2 (`generate-intelligence`) synthesizes with X signals and farmer sentiment. Cost: ~$3-5/month.
- **Batch processing:** `search-x-intelligence` and `generate-intelligence` process grains in batches then self-trigger for the next batch. `generate-farm-summary` processes 50 users per batch.
- **Intraday scanning:** `search-x-intelligence` runs in two modes: **pulse** (3x/day, 2 queries/grain, X-only, 2-day lookback, batch size 8) and **deep** (weekly Thursday, 6-8 queries/grain, X + web search, 7-day lookback, batch size 4, chains to generate-intelligence). Pulse scans via `app/api/cron/scan-signals/route.ts` at 6AM/1PM/6PM MST. Grain tiering: major grains (Wheat, Canola, Durum, Barley, Oats, Peas) scanned every pulse; minor grains scanned morning pulse only. Cost: ~$5/month xAI API.
- **Model:** `grok-4-1-fast-reasoning` via xAI Responses API. Signal scanning uses `x_search` + `web_search` (deep mode) for real-time agriculture sentiment. Advisor chat uses xAI Chat Completions endpoint for streaming.
- **Tables:** `grain_intelligence` (per-grain market analysis), `market_analysis` (Round 1: thesis, bull/bear, historical context, key signals), `farm_summaries` (per-user weekly narratives + percentiles), `x_market_signals` (X/Twitter post scores per grain/week, includes `searched_at`, `search_mode`, `source` columns), `validation_reports` (post-import anomaly checks), `signal_feedback` (farmer relevance votes per X signal), `signal_scan_log` (scan observability: mode, grains, signals found, duration), `grain_sentiment_votes` (per-grain Holding/Hauling farmer sentiment), `grain_monitor_snapshots` (Government Grain Monitor: port throughput, vessel queues, OCT, storage capacity per grain week), `producer_car_allocations` (CGC Producer Cars: forward-looking rail allocations by grain/province/destination), `sentiment_history` (archived weekly per-grain sentiment aggregates), `sentiment_daily_rollup` (intra-week daily sentiment trajectory with delta tracking), `health_checks` (post-pipeline site health validation results), `cftc_cot_positions` (CFTC Disaggregated COT: trader positioning per commodity per week, mapped to CGC grains), `processor_capacity` (annual crush/processing capacity per grain, seeded from AAFC), `grain_prices` (daily futures settlement prices, source: manual/API)
- **Function:** `calculate_delivery_percentiles()` — PERCENT_RANK over user deliveries by grain
- **Historical RPC functions:** `get_historical_average(p_grain, p_metric, p_worksheet, p_grain_week, p_years_back)`, `get_seasonal_pattern(...)`, `get_week_percentile(...)` — 5-year historical analysis for Step 3.5 Flash
- **Views:** `v_country_producer_deliveries` (canonical country-level producer-delivery formula), `v_grain_yoy_comparison` (YoY metrics built from that delivery view + terminal receipts/exports/stocks), `v_supply_pipeline` (AAFC balance sheet), `v_signal_relevance_scores` (enhanced blended relevance: 50% recency-adjusted Grok + 40% farmer consensus + 10% bonuses for velocity/deep mode; recency decay -5pts/day; category diversity max 3 per category)
- **RPC functions:** `get_pipeline_velocity(p_grain, p_crop_year)` (aggregates 5 pipeline metrics server-side, bypasses PostgREST 1000-row limit), `get_signals_with_feedback()` (frontend, user-scoped LEFT JOIN), `get_signals_for_intelligence()` (Edge Function, service role), `get_sentiment_overview(p_crop_year, p_grain_week)` (per-grain sentiment aggregates for overview banner), `get_delivery_analytics(p_crop_year, p_grain)` (anonymized delivery stats with privacy threshold ≥5 farmers, excludes observers), `get_cot_positioning(p_grain, p_crop_year, p_weeks_back)` (managed money and commercial net positions with spec/commercial divergence flag), `get_processor_self_sufficiency(p_grain, p_crop_year)` (producer vs non-producer delivery ratio from Process worksheet), `get_pipeline_velocity_avg(p_grain, p_crop_year, p_years_back)` (N-year average cumulative pipeline metrics per grain week), `get_weekly_terminal_flow(p_grain, p_crop_year)` (per-grain weekly terminal receipts vs exports with net flow, FULL OUTER JOIN, sums all grades), `get_aggregate_terminal_flow(p_crop_year)` (system-wide weekly terminal receipts vs exports for overview sparkline)
- **UI:** ThesisBanner (with collapsible Historical Context from market_analysis), **BullBearCards** (side-by-side bull/bear cases from Step 3.5 Flash), IntelligenceKpis, SupplyPipeline (with collapsible domestic breakdown, "Still in Bins" hero metric), XSignalFeed horizontal card strip with vote buttons (Relevant/Not for me), optimistic UI, "Your impact" summary bar; **SentimentPoll** (Holding/Hauling 5-point scale per grain); FarmSummaryCard + percentile badges on My Farm; SentimentBanner cross-grain overview; DeliveryPaceCard percentile comparison; MicroCelebration first-time action glow; YourImpact inline banners; **SectionHeader** (shared canola left-accent section divider); **CompactSignalStrip** (Overview-only horizontal scroll signal pills); **GlassCard** + **GlassTooltip** (glassmorphism containers in `components/ui/`); **MarketStanceBadge** + **ActionBadge** (BULLISH/BEARISH and HAUL/HOLD/PRICE/WATCH badges in `components/ui/`); **FlowDonutChart** ("Where Grain Went" breakdown in `components/dashboard/`); **CotPositioningCard** (CFTC managed money/commercial positioning in `components/dashboard/`); **LogisticsCard** (port/rail snapshot in `components/dashboard/`); **RecommendationCard** (actionable decision cards in `components/dashboard/`); **MultiGrainSentiment** (cross-grain voting on My Farm in `components/dashboard/`); **CrushUtilizationGauge** (semicircle gauge: annualized processing vs capacity in `components/dashboard/`); **PriceSparkline** (compact SVG price trend in grain detail hero in `components/dashboard/`); **DeliveryGapChart** (dual Y-axis YoY cumulative delivery gap: left axis for deliveries, right axis for gap line + fill in `components/dashboard/`); **TerminalFlowChart** (diverging green/red bars for net terminal flow + receipts/exports overlay lines in `components/dashboard/`); **LogisticsBanner** (overview page narrative headline + 3 stat pills + 80px sparkline in `components/dashboard/`); **LogisticsStatPill** (sentiment-aware pill with positive/negative/neutral coloring in `components/dashboard/`)
- **Query layer:** `lib/queries/intelligence.ts` (getGrainIntelligence, getMarketAnalysis, getSupplyPipeline, getFarmSummary), `lib/queries/grains.ts` (`getGrainOverviewBySlug` — corrected KPI data), `lib/queries/observations.ts` (composite metric type system for WoW comparisons + `getCumulativeTimeSeries` via `get_pipeline_velocity` RPC), `lib/queries/x-signals.ts` (getXSignalsWithFeedback, getUserFeedStats), `lib/queries/delivery-analytics.ts` (getDeliveryAnalytics), `lib/queries/sentiment.ts` (getSentimentOverview), `lib/queries/cot.ts` (getCotPositioning), `lib/queries/logistics.ts` (getLogisticsSnapshot, getWeeklyTerminalFlow, getAggregateTerminalFlow), `lib/queries/logistics-utils.ts` (client-safe types + pure functions: generateLogisticsHeadline, vesselSentiment, octSentiment, shipmentYoySentiment), `lib/queries/flow-breakdown.ts` (getWeeklyFlowBreakdown), `lib/queries/processor-capacity.ts` (getProcessorCapacity), `lib/queries/grain-prices.ts` (getRecentPrices), `lib/utils/delivery-gap.ts` (computeDeliveryGap pure utility for YoY gap calculation)
- **Auth:** `lib/auth/role-guard.ts` — `getUserRole()` server-side, `isObserver()` helper. Observer role: UI-level gating (soft nudge), not route-level. Observers see data but can't vote/input. `profiles.role` column ('farmer'|'observer'), DEFAULT 'farmer'. Authenticated users default to "farmer" in TypeScript (matching DB default). `handle_new_user()` trigger auto-creates profile rows on signup.
- **Sentiment voting:** `components/dashboard/sentiment-poll.tsx` — 5-option Holding/Hauling poll per grain per week. Options: Strongly Holding (Lock), Holding (Warehouse), Neutral (Scale), Hauling (Truck), Strongly Hauling (Rocket) — all Lucide icons with amber (holding) / prairie green (hauling) color-coding. Server action: `app/(dashboard)/grain/[slug]/actions.ts` → `voteSentiment()`. Table: `grain_sentiment_votes`. Query: `lib/queries/sentiment.ts` (getGrainSentiment, getUserSentimentVote, getSentimentOverview). Aggregate shown as bar chart with Holding %/Neutral %/Hauling % breakdown. Feeds into `generate-intelligence` prompt for AI-aware farmer sentiment.
- **Engagement:** `crop_plans.contracted_kt` + `uncontracted_kt` columns for contracted grain tracking. Stacked progress bar (delivered/contracted/uncontracted) on My Farm. `generate-intelligence` prompt now includes farmer sentiment data. `generate-farm-summary` prompt includes contracted position.
- **Server action:** `app/(dashboard)/grain/[slug]/signal-actions.ts` — `voteSignalRelevance()`
- **Commodity knowledge:** `supabase/functions/_shared/commodity-knowledge.ts` — distilled trading frameworks from 3 PDF books (~7K tokens, expanded with Marketing Strategy, Logistics, and COT Positioning Analysis sections). Injected into Grok system prompt for domain expertise.
- **Logistics RPC:** `get_logistics_snapshot(p_crop_year, p_grain_week)` — returns Grain Monitor + Producer Car data as structured JSON. Used by both `analyze-market-data` and `generate-intelligence` Edge Functions.
- **Agent debate rules:** `docs/reference/agent-debate-rules.md` — 11 codified rules for continuous improvement of Grok pipeline outputs (flow coherence, thesis quality, grain-specific rules, COT positioning rules 9-11, validation checklist)
- **Auth for chain triggers:** Vercel cron is the only public ingress. Internal-only Edge Functions use `verify_jwt = false` plus `x-bushel-internal-secret` backed by `BUSHEL_INTERNAL_FUNCTION_SECRET`. Never use anon JWTs for internal chaining.

## Pipeline Monitoring
- Legacy cron drift check: `SELECT * FROM cron.job WHERE jobname = 'cgc-weekly-import';` (expected: zero rows)
- Import audit: `SELECT * FROM cgc_imports ORDER BY imported_at DESC LIMIT 5;`
- Data freshness: `SELECT * FROM v_latest_import;`
- Validation: `SELECT * FROM validation_reports ORDER BY created_at DESC LIMIT 5;`
- X signals: `SELECT grain, grain_week, COUNT(*) FROM x_market_signals GROUP BY grain, grain_week ORDER BY grain_week DESC LIMIT 20;`
- Market analysis (Round 1): `SELECT grain, grain_week, data_confidence, model_used, generated_at FROM market_analysis ORDER BY generated_at DESC LIMIT 5;`
- Intelligence: `SELECT grain, grain_week, generated_at FROM grain_intelligence ORDER BY generated_at DESC LIMIT 5;`
- Farm summaries: `SELECT user_id, grain_week, generated_at FROM farm_summaries ORDER BY generated_at DESC LIMIT 5;`
- pg_net responses: `SELECT * FROM net._http_response ORDER BY created DESC LIMIT 5;`
- Delivery audit (country producer deliveries): `SELECT grain, total_kt FROM v_country_producer_deliveries WHERE crop_year='2025-2026' AND grain_week=30 AND period='Current Week' ORDER BY grain;`
- Terminal Receipts check: `SELECT grain, ktonnes FROM cgc_observations WHERE worksheet='Terminal Receipts' AND metric='Receipts' AND period='Current Week' AND grain_week=30 AND crop_year='2025-2026';`
- Signal feedback: `SELECT grain, grain_week, COUNT(*) FROM signal_feedback GROUP BY grain, grain_week ORDER BY grain_week DESC LIMIT 10;`
- Blended scores: `SELECT signal_id, grain, blended_relevance, total_votes, farmer_relevance_pct FROM v_signal_relevance_scores ORDER BY blended_relevance DESC LIMIT 10;`
- Pipeline velocity (per-grain): `SELECT * FROM get_pipeline_velocity('Wheat', '2025-2026') WHERE grain_week IN (10, 20, 30);`
- Historical data coverage: `SELECT crop_year, COUNT(*) FROM cgc_observations GROUP BY crop_year ORDER BY crop_year;`
- Historical average test: `SELECT * FROM get_historical_average('Wheat', 'Deliveries', 'Primary', 30, 5);`
- Row count audit (check for PostgREST truncation): `SELECT worksheet, metric, COUNT(*) FROM cgc_observations WHERE grain='Wheat' AND crop_year='2025-2026' AND period='Crop Year' GROUP BY worksheet, metric HAVING COUNT(*) > 900;`
- Sentiment overview: `SELECT * FROM get_sentiment_overview('2025-2026', 32);`
- Delivery analytics: `SELECT * FROM get_delivery_analytics('2025-2026');`
- Observer accounts: `SELECT role, COUNT(*) FROM profiles GROUP BY role;`
- Contracted grain: `SELECT grain, contracted_kt, uncontracted_kt FROM crop_plans WHERE crop_year='2025-2026' AND (contracted_kt > 0 OR uncontracted_kt > 0) LIMIT 10;`
- Signal scan log: `SELECT scan_mode, grains_scanned, signals_found, duration_ms, completed_at FROM signal_scan_log ORDER BY completed_at DESC LIMIT 10;`
- Pulse vs deep signals: `SELECT search_mode, source, COUNT(*) FROM x_market_signals WHERE crop_year='2025-2026' GROUP BY search_mode, source;`
- Sentiment votes: `SELECT grain, grain_week, COUNT(*), ROUND(AVG(sentiment_value)::numeric, 1) FROM grain_sentiment_votes WHERE crop_year='2025-2026' GROUP BY grain, grain_week ORDER BY grain_week DESC LIMIT 10;`
- Health checks: `SELECT status, checks, source, created_at FROM health_checks ORDER BY created_at DESC LIMIT 5;`
- Health check failures: `SELECT created_at, status, checks FROM health_checks WHERE status = 'fail' ORDER BY created_at DESC LIMIT 3;`
- Grain monitor: `SELECT crop_year, grain_week, report_date, vessels_vancouver, out_of_car_time_pct FROM grain_monitor_snapshots ORDER BY grain_week DESC LIMIT 5;`
- Producer cars: `SELECT grain, grain_week, cy_cars_total, week_cars, dest_united_states FROM producer_car_allocations WHERE crop_year='2025-2026' ORDER BY grain_week DESC, grain LIMIT 20;`
- Logistics RPC test: `SELECT get_logistics_snapshot('2025-2026', 31::smallint);`
- COT data freshness: `SELECT commodity, report_date, imported_at FROM cftc_cot_positions ORDER BY imported_at DESC LIMIT 5;`
- COT positioning: `SELECT * FROM get_cot_positioning('Wheat', '2025-2026', 4);`
- Processor capacity: `SELECT grain, annual_capacity_kt, source FROM processor_capacity WHERE crop_year='2025-2026';`
- Grain prices: `SELECT * FROM v_latest_grain_prices;`
- Self-sufficiency: `SELECT * FROM get_processor_self_sufficiency('Canola', '2025-2026') WHERE grain_week = 31;`
- Terminal flow (per-grain): `SELECT * FROM get_weekly_terminal_flow('Wheat', '2025-2026') ORDER BY grain_week DESC LIMIT 5;`
- Terminal flow (aggregate): `SELECT * FROM get_aggregate_terminal_flow('2025-2026') ORDER BY grain_week DESC LIMIT 5;`

## Critical Framework Patterns

**Prefer retrieval-led reasoning over pre-training-led reasoning for all Next.js, Supabase, and Tailwind tasks.**

### Next.js 16 Patterns (upgraded from 15)
- `params` is now a Promise: `const { slug } = await params;`
- `cookies()` is async: `const cookieStore = await cookies();`
- Server Components are default — add `"use client"` only when needed
- Use `@supabase/ssr` (not `@supabase/auth-helpers-nextjs` which is deprecated)

### Client/Server Module Boundary
- `"use client"` components **cannot** transitively import server-only modules (e.g., `@/lib/supabase/server`)
- Pattern: split into `foo-utils.ts` (client-safe: types + pure functions) and `foo.ts` (server-only: Supabase queries that re-export from utils)
- Example: `lib/queries/logistics-utils.ts` (client) + `lib/queries/logistics.ts` (server)
- Client components import from `-utils`; server code imports from either

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
- `docs/plans/STATUS.md` — Feature completion tracker (22 tracks)
- `docs/plans/2026-03-04-bushel-board-mvp-design.md` — Approved MVP design
- `docs/plans/2026-03-04-bushel-board-mvp-implementation.md` — 15-task MVP implementation plan
- `docs/plans/2026-03-06-grain-intelligence-design.md` — Intelligence feature design doc
- `docs/plans/2026-03-06-grain-intelligence-implementation.md` — 19-task intelligence plan (complete)
- `docs/plans/2026-03-10-x-feed-relevance-design.md` — X Feed & Relevance Scoring design doc
- `docs/plans/2026-03-11-farmer-engagement-design.md` — Farmer Engagement & Input System design doc
- `docs/plans/2026-03-16-terminal-net-flow-design.md` — Terminal Net Flow visualization design doc (complete)
- `docs/reference/cgc-excel-map.md` — CGC Excel spreadsheet structure map (14 sheets)
- `docs/reference/agent-debate-rules.md` — Codified rules for AI thesis debate moderation (11 rules + grain-specific + checklist)
- `docs/plans/2026-03-13-cftc-cot-integration-design.md` — CFTC COT integration design doc (implemented)
- `docs/lessons-learned/issues.md` — Data bugs and root cause analyses
- `docs/lessons-learned/canola-week31-debate-moderation.md` — Full evidence-based moderation of Canola Week 31 Grok vs Step 3.5 disagreement
