# Bushel Board — Prairie Grain Market Intelligence Dashboard

## TL;DR — Read This First

**What:** A dashboard that helps Canadian prairie farmers (AB, SK, MB) decide *"Should I haul or hold my grain this week?"*

**How it works (5 layers):**
1. **Data** — Weekly CGC grain statistics auto-imported for 16 grains (deliveries, exports, stocks, terminal flow)
2. **AI** — Claude/Codex workflows analyze each grain: bull/bear thesis, stance score (-100 to +100), and farmer-facing explanation. The retired Grok/xAI thesis-writing chain is not a fallback; Track 54 Grok/Hermes can only create local no-write X scout artifacts behind the artifact gate.
3. **Viz** — Supply pipeline, YoY delivery gaps, terminal flow, CFTC positioning, price sparklines
4. **My Farm** — Per-grain *Grain in your bin* storage tracker (total + remaining, peer comparison "X% of farmers have more in the bin than you"), AI summaries, delivery tracking, percentile comparisons, contract progress. **Sentiment voting is paused (2026-04-28); will be redeployed once peer-comparison metrics mature.**
5. **Signals** — X/Twitter market chatter scored by AI + farmer relevance votes

**Auth model (2026-04-28):** Public-by-default. The home route `/` redirects to `/thesis` (the flagship Bull/Bear board); `/overview` is hidden as of 2026-06-10 (redirects to `/thesis`; components retained). Market intelligence (Thesis, Grain detail, US Markets, Data Map, Seeding) is fully public. **Login is required only for `/my-farm`** (and the existing self-redirecting `/chat` and owner-only `/digest` surfaces). The previous `LandingPage` sign-up funnel is retired — `app/page.tsx` is now a one-line redirect.

**Right now:** Normal `/thesis` is Wheat-first: one farmer-facing Wheat Bull/Bear read, with Canada and U.S. rows treated as evidence geography. CGC import runs through the Codex weekly importer. Wheat price scoring now uses a Spring Wheat / HRW / SRW basket when multiple Wheat futures rows are present, Wheat weekly-packet headlines use the deterministic scorecard output instead of driver counting, and the page now shows a first reconciliation judge, a USDA Wheat source-sweep panel, a node-and-edge relationship spiderweb, and a three-contract price-basket proof strip. Active focus: deepen the USDA Wheat sweep with live-packet/historical context, improve source-specific reconciliation-judge explanations, and decide whether spiderweb distance should include source authority/freshness/replay accuracy beyond weighted score impact. **The legacy V1 Grok pipeline (`analyze-grain-market`, `search-x-intelligence`, `analyze-market-data`, `generate-intelligence`, `generate-farm-summary`, and `/api/pipeline/run`) is tombstoned and must not be used as recovery.**

**Key files to orient yourself:**
- `README.md` — Human-readable status with feature completion dates
- `docs/plans/STATUS.md` — Detailed feature tracker (32 tracks)
- `docs/plans/2026-03-04-bushel-board-mvp-design.md` — Original MVP design doc

---

## Project Overview
A Next.js + Supabase dashboard that auto-imports Canadian Grain Commission (CGC) weekly data and displays grain statistics for prairie farmers (AB, SK, MB). MVP phase: real data pipeline, grain dashboard, email/password auth.

## Current Status
**Phase:** MVP + Intelligence — data pipeline, AI narratives, dashboard all operational. Auto-import paused (2026-03-17) while AI model quality is refined.
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
- **Backend:** Supabase (PostgreSQL, Auth, Edge Functions) + manual trigger (crons disabled 2026-03-17)
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
- **Exports:** CGC "Exports" in Summary = Terminal Exports + Primary Shipment Distribution "Export Destinations" (direct elevator-to-border) + Producer Cars worksheet shipment distribution / destination rows for farmer railcars direct to US. There is no separate `Producer Cars Shipment Distribution` worksheet in the CSV; use `worksheet='Producer Cars'` with the shipment distribution/destination metrics.
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
- `npm run import-prices` — Fetch daily grain futures from Yahoo Finance into Supabase
- `python scripts/import-usda-wasde.py [--last-n-months N | --report-month YYYY-MM]` — USDA PSD API WASDE importer (latest snapshots only). Covers the 5 US desk markets plus the world veg-oil complex (Rapeseed 2226000, Rapeseed Oil 4239100, Palm Oil 4243000, Soybean Oil 4232000; PSD `/world/` endpoint, `country_code '00'`, `desk_heartbeat=False`) admitted 2026-06-09 as the bounded Canola demand-context lane.
- `python scripts/import-usda-wasde-archive.py [--last-n-months N | --release YYYY-MM]` — USDA ESMIS .xls archive importer (revision history). Run with `--last-n-months 12` for one-shot historical backfill; the monthly Claude Desktop Routine `collect-wasde-archive` runs it on the 13th of each month with `--last-n-months 2`. Does NOT cover the world veg-oil commodities (US-page XLS parser only; world per-oil history accrues forward from monthly live PSD runs).
- `node scripts/import-producer-cars.mjs` — CGC Producer Car CSV importer (idempotent upsert into `producer_car_allocations`). Run by Claude Desktop Routine `collect-producer-cars` Thu 4 PM MT.
- `npx supabase functions deploy <name>` — Deploy Edge Functions

- `npm run refresh-thesis-cache` - refresh cached Canada/US Bull/Bear thesis packets from the current packet RPC spine.
- `npm run collect:*` - thesis-relevant collector wrappers. They run the mechanical importer first, then refresh `thesis_packet_cache` only after success. Use importer-specific dry-run commands or direct wrapper dry-run calls on Windows.

## Intelligence Pipeline
- **⚠️ ALL VERCEL CRONS DISABLED (2026-03-17):** The legacy ingest/Grok chain is no longer scheduled and is now tombstoned. V2 is triggered manually and by **Claude Desktop Routines/Schedules** (Anthropic-native scheduled tasks) — not Vercel cron and not any third-party scheduler.
- **V2 (current) — Claude Agent Desk swarm:** The production weekly pipeline. Fully Claude-only, no Grok, no xAI in the analysis loop.
  - **CAD swarm (WHEAT-ONLY since 2026-07-11, operator decision):** 6 scouts (supply, demand, basis, sentiment, logistics, macro) → 4 Sonnet specialists (export-analyst, domestic-analyst, risk-analyst, price-analyst) → Opus desk chief → Opus meta-reviewer — all dispatched for Wheat alone. The 16-grain engine is PARKED for re-enable (parked list + tier budgets retained in the prompt); grain detail/My Farm for parked grains serve their last rows behind `assessDeskThesisStaleness()`. Agent defs: `.claude/agents/{supply,demand,basis,sentiment,logistics,macro}-scout.md` + `.claude/agents/{export,domestic,risk,price}-analyst.md` + `.claude/agents/desk-meta-reviewer.md`. Orchestration prompt: `docs/reference/grain-desk-swarm-prompt.md`. **Wheat is the FLAGSHIP effort tier** (above MAJOR): mandatory Phase 4.5 deep pass, US-desk cross-read (`us_desk_cross_read`, R-CA-WHT-01), wheat-class lens, `llm_metadata.wheat_cockpit` handoff. Triggered by Claude Desktop Routine `grain-desk-weekly` (**Fri 7:45 PM MT — runs AFTER the US desk since 2026-07-11 so the wheat cross-read is same-week**) + Saturday review.
  - **US swarm:** 8 Haiku scouts (supply, demand, export, price, cot, wasde, us-conditions, macro) → 4 Sonnet specialists (export-analyst, domestic-analyst, price-analyst, risk-analyst; planted-area specialist Mar 1–Sep 30) → Opus desk chief → Opus meta-reviewer. Agent defs: `.claude/agents/us-*-scout.md` + `.claude/agents/us-*-analyst.md` + `.claude/agents/us-desk-meta-reviewer.md`. Orchestration prompt: `docs/reference/us-desk-swarm-prompt.md`. Triggered by Claude Desktop Routine `us-desk-weekly` (**Fri 6:47 PM MT — runs FIRST since 2026-07-11**; the CAD FLAGSHIP Wheat read consumes this desk's Wheat stance) + Saturday review.
  - **Writes land in:** `market_analysis` (CAD) + `us_market_analysis` (US) + `score_trajectory` (CAD weekly anchor, `scan_type='weekly_debate'`, `model_source='claude-opus-desk-chief-v2'`) + `us_score_trajectory` (US equivalent).
  - **Search tools:** Anthropic-native `web_search_20250305` + internal X API v2 gateway Edge Function (`search-x-signals`). **No xAI / Grok anywhere in the V2 desk-writing loop.**
  - **Viking knowledge:** L0/L1/L2 tiered system injected per specialist intent (`lib/knowledge/viking-l0.ts`, `viking-l1.ts`, RPC `get_knowledge_context` for L2 chunks).
- **V1 Grok analysis chain (retired):** `analyze-grain-market`, `search-x-intelligence`, `analyze-market-data`, `generate-intelligence`, `generate-farm-summary`, and `/api/pipeline/run` now return HTTP 410 tombstones. Do not re-enable them, do not use them for recovery, and do not write new Grok rows to `market_analysis`, `grain_intelligence`, `farm_summaries`, or `x_market_signals`.
- **Track 54 X scout exception:** Grok CLI/API or Hermes terminal can be used only as a no-write evidence scout that emits local artifacts under the reviewed Track 54 contract. It cannot author thesis copy, refresh `thesis_packet_cache`, or write Supabase rows unless the mode-specific artifact gate passes and Kyle explicitly approves the exact review window.
- **Daily data collectors (feed V2 scouts + /thesis cache):** Claude Desktop Routines feed Supabase throughout the week: `collect-crop-progress` (Mon), `collect-grain-monitor` (Wed), `collect-export-sales` (Thu AM), `collect-cgc` (Thu PM), `collect-producer-cars` (Thu PM), `collect-cftc-cot` (Fri PM), `collect-wasde` (monthly), and `collect-wasde-archive` (monthly revision history). Configs: `docs/reference/collector-task-configs.md`. Thesis-relevant collectors should use `npm run collect:*` wrappers so successful imports refresh `thesis_packet_cache`. Collectors also write intra-week ticks to `score_trajectory` / `us_score_trajectory` with `scan_type='collector_*'` (Track 45-B).
- **CFTC COT import:** `GET /api/cron/import-cftc-cot` → `import-cftc-cot` Edge Function. Public cron ingress disabled; triggered by `collect-cftc-cot` Claude Desktop Routine.
- **Advisor chat (Bushy):** Anthropic Claude (Opus/Sonnet depending on task) with internal tool use. Legacy Grok-backed chat is retired.
- **Parallel debate scripts:** Retired with the Grok workflow. Use Claude/Codex review for thesis QA.
- **grain_week resolution:** V2 desk chiefs query `MAX(grain_week) FROM cgc_observations` to label analysis with the data week, not the calendar week. This prevents ghost rows from masking current analysis.
- **Intraday signal scanning:** Future production ingestion should use the direct X API v2 gateway. Track 54 Grok/Hermes `x_search` remains quarantined as local no-write evidence discovery only; do not revive the retired Grok writer chain.
- **Tables:** `grain_intelligence` (retired Grok narrative archive, read-only), `market_analysis` (published thesis, bull/bear, historical context, key signals, `stance_score` smallint -100 to +100 for directional stance, `bull_reasoning` and `bear_reasoning` structured thesis arguments), `farm_summaries` (per-user weekly narratives + percentiles), `x_market_signals` (X/Twitter post scores per grain/week, includes `searched_at`, `search_mode`, `source` columns), `validation_reports` (post-import anomaly checks), `signal_feedback` (farmer relevance votes per X signal), `signal_scan_log` (scan observability: mode, grains, signals found, duration), `grain_sentiment_votes` (per-grain Holding/Hauling farmer sentiment), `grain_monitor_snapshots` (Government Grain Monitor: port throughput, vessel queues, OCT, storage capacity per grain week), `producer_car_allocations` (CGC Producer Cars: forward-looking rail allocations by grain/province/destination), `sentiment_history` (archived weekly per-grain sentiment aggregates), `sentiment_daily_rollup` (intra-week daily sentiment trajectory with delta tracking), `health_checks` (post-pipeline site health validation results), `cftc_cot_positions` (CFTC Disaggregated COT: trader positioning per commodity per week, mapped to CGC grains), `processor_capacity` (annual crush/processing capacity per grain, seeded from AAFC), `grain_prices` (daily futures settlement prices from Yahoo Finance — Wheat/Corn/Oats/Soybeans/HRW Wheat via CBOT, normalized cents→dollars; Canola/Spring Wheat unavailable on Yahoo), `usda_export_sales` (USDA FAS weekly export sales: net sales, shipments, outstanding commitments per commodity per week, mapped to CGC grains via cgc_grain + mapping_type columns; includes commodity_code, cumulative_exports_mt, export_pace_pct, top_buyers JSONB), `usda_wasde_raw` (raw USDA FAS PSD/WASDE rows keyed by commodity/country/market_year/calendar month/attribute), `usda_wasde_mapped` (view that pivots raw PSD rows into ending stocks, S/U, production, exports, and related fields), `usda_wasde_estimates` (deprecated/orphaned first-shape WASDE table; do not use for active reads), `usda_crop_progress` (USDA NASS weekly crop progress: planted/emerged/harvested pct + condition ratings VP/P/F/G/E + computed good_excellent_pct + condition_index; Apr-Nov only; ge_pct_yoy_change for trend), `posted_prices` (unified daily pricing board: elevator/crusher/seed/fertilizer/chemical operators post prices with basis, capacity notes, delivery notes, facility status; 24h expiry; target up to 3 FSA codes), `operator_products` (operator product catalog: what grains they buy or products they sell, seeded at signup, add/remove via chat), `price_query_log` (demand analytics: logs each time a farmer views an operator's posted price, aggregated by grain for operator feedback), `feedback_log` (farmer and operator feedback, feature requests, bug reports; includes `user_role` for filtering by farmer vs operator), `chat_extractions` (Tier 1 ephemeral: raw farming data from conversations classified by category/data_type, promoted/discarded during daily compression), `knowledge_state` (Tier 2 working memory: what Hermes currently believes per FSA/grain/data_type with supersession tracking and confidence levels), `knowledge_patterns` (Tier 3 long-term: trends, anomalies, area shifts detected by compression engine), `compression_summaries` (daily + weekly compression audit logs with triage stats and decision records), `weekly_farmer_briefs` (personalized weekly intelligence merging macro thesis with local farmer data per user), `x_api_query_log` (X API v2 call tracking for dedup and budget optimization with value scoring), `statcan_wds_raw` (StatsCan WDS long-format rows: field-crop seeded area/production 32100359, tri-annual farm/total stocks 32100007, monthly canola crush 32100352 — added 2026-06-10, wired into supply-scout 2026-07-11), `sk_cash_prices` (SK Dashboard weekly provincial average cash prices, 10 crops — added 2026-06-10, wired into basis-scout 2026-07-11 as the CWRS cash tape)
- **Function:** `calculate_delivery_percentiles()` — PERCENT_RANK over user deliveries by grain
- **Historical RPC functions:** `get_historical_average(p_grain, p_metric, p_worksheet, p_grain_week, p_years_back)`, `get_seasonal_pattern(...)`, `get_week_percentile(...)` — 5-year historical analysis for Step 3.5 Flash
- **Views:** `v_country_producer_deliveries` (canonical country-level producer-delivery formula), `v_grain_yoy_comparison` (YoY metrics built from that delivery view + terminal receipts/exports/stocks), `v_supply_pipeline` (AAFC balance sheet), `v_signal_relevance_scores` (legacy V1 blended-relevance view: 50% recency-adjusted LLM score + 40% farmer consensus + 10% bonuses for velocity/deep mode; recency decay -5pts/day; category diversity max 3 per category — V2 sentiment-scout uses X API v2 directly and doesn't read from this view)
- **RPC functions:** `get_pipeline_velocity(p_grain, p_crop_year)` (aggregates 5 pipeline metrics server-side, bypasses PostgREST 1000-row limit), `get_signals_with_feedback()` (frontend, user-scoped LEFT JOIN), `get_signals_for_intelligence()` (Edge Function, service role), `get_sentiment_overview(p_crop_year, p_grain_week)` (per-grain sentiment aggregates — kept available but no longer rendered on /my-farm after sentiment voting was paused 2026-04-28), `get_grain_storage_comparison(p_grain)` (per-grain peer comparison for the /my-farm storage tracker; returns calling farmer's remaining tonnes + percent of farmers with more in the bin; ≥5-farmer privacy threshold; SECURITY INVOKER, derives caller from auth.uid()), `get_delivery_analytics(p_crop_year, p_grain)` (anonymized delivery stats with privacy threshold ≥5 farmers, excludes observers), `get_cot_positioning(p_grain, p_crop_year, p_weeks_back)` (managed money and commercial net positions with spec/commercial divergence flag), `get_processor_self_sufficiency(p_grain, p_crop_year)` (producer vs non-producer delivery ratio from Process worksheet), `get_pipeline_velocity_avg(p_grain, p_crop_year, p_years_back)` (N-year average cumulative pipeline metrics per grain week), `get_weekly_terminal_flow(p_grain, p_crop_year)` (per-grain weekly terminal receipts vs exports with net flow, FULL OUTER JOIN, sums all grades), `get_aggregate_terminal_flow(p_crop_year)` (system-wide weekly terminal receipts vs exports for overview sparkline), `get_usda_export_context(p_cgc_grain, p_weeks_back)` (latest USDA export sales for a CGC grain — net sales, shipments, outstanding, pace, top buyers), `get_usda_sales_pace(p_cgc_grain, p_market_year)` (4-week average USDA net sales and exports pace for trend comparison), `get_usda_wasde_context(p_cgc_grain, p_months_back)` (latest WASDE S&D estimates — ending stocks, S/U ratio, revision direction for US + World), `get_usda_crop_conditions(p_cgc_grain, p_weeks_back)` (latest crop progress — G/E%, condition index, YoY change, planting pace vs avg), `get_area_prices(p_fsa_code, p_grain, p_business_type)` (unexpired posted prices for a farmer's area, JOINs profiles for facility_name + facility_status, sorted by sponsored DESC then freshness), `get_operator_analytics(p_days_back)` (per-grain query counts for the calling operator via auth.uid(), with current/previous period for trend), `get_operator_reach(p_fsa_codes)` (count of registered farmers in target FSA codes), `get_area_knowledge(p_fsa_code, p_grain, p_category)` (active working memory entries for an area with optional grain/category filter), `get_area_patterns(p_fsa_code, p_grain)` (active detected patterns for an area including system-wide patterns), `get_latest_farmer_brief(p_user_id)` (most recent personalized weekly brief for a farmer), `get_latest_compression(p_period)` (latest daily or weekly compression summary)
- **UI:** ThesisBanner (with collapsible Historical Context from market_analysis), **BullBearCards** (side-by-side bull/bear cases with stance spectrum meter: bullish←→bearish gradient bar positioned by `stance_score` in `components/dashboard/`), IntelligenceKpis, SupplyPipeline (with collapsible domestic breakdown, "Still in Bins" hero metric), XSignalFeed horizontal card strip with vote buttons (Relevant/Not for me), optimistic UI, "Your impact" summary bar; **SentimentPoll** (Holding/Hauling 5-point scale per grain); FarmSummaryCard + percentile badges on My Farm; SentimentBanner cross-grain overview; DeliveryPaceCard percentile comparison; MicroCelebration first-time action glow; YourImpact inline banners; **SectionHeader** (shared canola left-accent section divider); **CompactSignalStrip** (Overview-only horizontal scroll signal pills); **GlassCard** + **GlassTooltip** (glassmorphism containers in `components/ui/`); **MarketStanceBadge** + **ActionBadge** (BULLISH/BEARISH and HAUL/HOLD/PRICE/WATCH badges in `components/ui/`); **FlowDonutChart** ("Where Grain Went" breakdown in `components/dashboard/`); **CotPositioningCard** (CFTC managed money/commercial positioning in `components/dashboard/`); **LogisticsCard** (port/rail snapshot in `components/dashboard/`); **RecommendationCard** (actionable decision cards with semicircle confidence gauge in `components/dashboard/`); **MultiGrainSentiment** (cross-grain voting on My Farm in `components/dashboard/`); **CrushUtilizationGauge** (semicircle gauge: annualized processing vs capacity in `components/dashboard/`); **PriceSparkline** (compact SVG price trend in grain detail hero in `components/dashboard/`); **DeliveryGapChart** (dual Y-axis YoY cumulative delivery gap: left axis for deliveries, right axis for gap line + fill in `components/dashboard/`); **TerminalFlowChart** (diverging green/red bars for net terminal flow + receipts/exports overlay lines in `components/dashboard/`); **LogisticsBanner** (overview page narrative headline + 3 stat pills + 80px sparkline in `components/dashboard/`); **LogisticsStatPill** (sentiment-aware pill with positive/negative/neutral coloring in `components/dashboard/`); **GrainBushyChat** (grain-scoped chat wrapper embedded on grain detail page in `components/dashboard/`); **GrainFarmProgress** (3-tile delivery/contract/open progress with recommendation rail and pace badge in `components/dashboard/`); **GrainStorageCard** (the simplified two-input storage tracker on /my-farm — total + remaining tonnes per grain, with the "X% of farmers have more in the bin than you" peer comparison underneath; in `components/dashboard/`)
- **Query layer:** `lib/queries/intelligence.ts` (`getMarketAnalysis`, `getSupplyPipeline`, `getFarmSummary`; `getGrainIntelligence` is legacy archive only), `lib/queries/grains.ts` (`getGrainOverviewBySlug` — corrected KPI data), `lib/queries/observations.ts` (composite metric type system for WoW comparisons + `getCumulativeTimeSeries` via `get_pipeline_velocity` RPC), `lib/queries/x-signals.ts` (getXSignalsWithFeedback, getUserFeedStats), `lib/queries/delivery-analytics.ts` (getDeliveryAnalytics), `lib/queries/sentiment.ts` (getSentimentOverview), `lib/queries/cot.ts` (getCotPositioning), `lib/queries/logistics.ts` (getLogisticsSnapshot, getWeeklyTerminalFlow, getAggregateTerminalFlow), `lib/queries/logistics-utils.ts` (client-safe types + pure functions: generateLogisticsHeadline, vesselSentiment, octSentiment, shipmentYoySentiment), `lib/queries/flow-breakdown.ts` (getWeeklyFlowBreakdown), `lib/queries/processor-capacity.ts` (getProcessorCapacity), `lib/queries/grain-prices.ts` (getRecentPrices), `lib/utils/delivery-gap.ts` (computeDeliveryGap pure utility for YoY gap calculation), `lib/us-market-context.ts` (US market context builder: fetches USDA export sales + WASDE + crop progress via RPCs, formats markdown prompt section for analyst injection; includes CGC↔USDA grain mapping table), `lib/queries/data-freshness.ts` (`getDisplayWeek` — resolves latest grain week for display labels)
- **Auth:** `lib/auth/role-guard.ts` — `getUserRole()` server-side, `isObserver()` helper. **Public-by-default routing (2026-04-28):** middleware (`lib/supabase/middleware.ts`) only redirects unauthenticated users to `/login` for paths in `PROTECTED_PATHS`, currently `["/my-farm"]`. `/chat` and `/digest` self-redirect at the page level. Root route (`app/page.tsx`) redirects everyone to `/thesis`; `/overview` redirects to `/thesis` as of 2026-06-10. The previous `LandingPage` sign-up funnel (`components/landing/`) and the `/api/trial-notify` POST endpoint were deleted on 2026-04-28; the `getPostAuthDestination()` helper in `lib/auth/post-auth-destination.ts` points users back to the thesis board after auth. Observer role: UI-level gating (soft nudge), not route-level. Observers see data but can't vote/input. `profiles.role` column: 'farmer' (default), 'observer', 'elevator', 'processor', 'crusher', 'mill', 'terminal', 'seed', 'fertilizer', 'chemical'. Operator roles (elevator/crusher/mill/terminal/seed/fertilizer/chemical) can post daily prices and manage product catalogs. `handle_new_user()` trigger auto-creates profile rows on signup and seeds `operator_products` from signup metadata when present.
- **My Farm storage tracker (Track 46, 2026-04-28):** Headline `/my-farm` surface. Per tracked grain, two inputs — total this year + how much is left in the bin — backed by existing `crop_plans.starting_grain_kt` and `crop_plans.volume_left_to_sell_kt` columns. Server action `updateGrainStorage(grain, total_tonnes, remaining_tonnes)` in `app/(dashboard)/my-farm/actions.ts` upserts both, defaults `acres_seeded=0` for fresh rows, and re-clamps `contracted_kt`/`uncontracted_kt` to satisfy the `crop_plans_marketing_state_check` CHECK. Peer comparison "X% of farmers have more <grain> in the bin than you" via RPC `get_grain_storage_comparison(p_grain)` (privacy-gated to ≥5 farmers, derives caller from `auth.uid()`, `SECURITY INVOKER`). Component: `components/dashboard/grain-storage-card.tsx`. Query helper: `lib/queries/grain-storage-comparison.ts`. Migration: `supabase/migrations/20260428100000_grain_storage_comparison.sql`.
- **Sentiment voting (paused 2026-04-28):** `components/dashboard/sentiment-poll.tsx`, `multi-grain-sentiment.tsx`, `sentiment-banner.tsx`, the `voteSentiment()` server action, the `grain_sentiment_votes` / `sentiment_history` / `sentiment_daily_rollup` tables, and `lib/queries/sentiment.ts` are all retained but no longer surfaced on `/my-farm` or `/grain/[slug]`. The `getSentimentOverview()` helper is still consumed by `lib/advisor/context-builder.ts` and the AI pipeline. Will be redeployed once peer-comparison metrics mature; restore by re-mounting the components and re-adding the dropped sentiment fetches in `app/(dashboard)/my-farm/page.tsx`.
- **Engagement:** `crop_plans.contracted_kt` + `uncontracted_kt` columns for contracted grain tracking. Stacked progress bar (delivered/contracted/uncontracted) on My Farm. Retired Grok prompt writers must not be used for engagement refreshes.
- **Server action:** `app/(dashboard)/grain/[slug]/signal-actions.ts` — `voteSignalRelevance()`
- **Commodity knowledge (Viking):** Replaced legacy 7K-token static blob with Viking tiered system: L0 (`lib/knowledge/viking-l0.ts`, ~420 tokens, 8 core principles from 8 books) + L1 (`lib/knowledge/viking-l1.ts`, ~800 tokens/topic, 7 cross-book topic summaries loaded by intent detection). Edge Function uses `supabase/functions/_shared/viking-knowledge.ts` (Deno-compatible copy). Legacy `commodity-knowledge.ts` retained for reference only.
- **Logistics RPC:** `get_logistics_snapshot(p_crop_year, p_grain_week)` — returns Grain Monitor + Producer Car data as structured JSON. Consumed by the V2 `logistics-scout` Haiku scout in the Friday CAD swarm (`.claude/agents/logistics-scout.md`). The V1 Grok functions that used to consume it are tombstoned.
- **Grain Monitor weekly importer:** `scripts/import-grain-monitor-weekly.ts` (IO/CLI/Supabase) + `scripts/grain-monitor/parsers.ts` (pure parsers) writes one full 38-column row per `(crop_year, grain_week)` into `grain_monitor_snapshots`. Triggered by the `collect-grain-monitor` Claude Desktop Routine on Wednesdays. Vitest seatbelt at `lib/__tests__/grain-monitor-weekly-{parser,full-parser}.test.ts` with PDF text fixtures at `lib/__tests__/fixtures/grain-monitor/`. Tiered autonomy charter (Tier 1 diagnose / Tier 2 auto-fix mechanical regex deltas / Tier 3 escalate) lives in `docs/hermes/skills/import-grain-monitor.md` — the agent operating procedure. See `docs/lessons-learned/issues.md` (2026-04-30) for the Week 37 incident that produced the charter.
- **Agent debate rules:** `docs/reference/agent-debate-rules.md` — 15 codified rules for continuous improvement of pipeline outputs (flow coherence, thesis quality, grain-specific rules, COT positioning rules 9-11, price action rules 12-15, validation checklist)
- **Claude Agent Desk lineage:** V2 above was originally shipped as "Track 41 — Claude Agent Desk". It has since been promoted from experiment to production weekly pipeline (CAD + US). All desk output on the overview + grain detail pages comes from this swarm.
- **X API v2 (data source for sentiment-scout + Bushy):** Direct X/Twitter API v2 gateway behind a Supabase Edge Function. Replaces Grok's `x_search` for both pipeline scanning and Bushy's real-time signal lookups. Credentials in Vercel env: `XAPI_CONSUMER_KEY`, `XAPI_SECRET_KEY`, `XAPI_BEARER_TOKEN`. Decouples tweet discovery from LLM reasoning entirely.
- **Auth for chain triggers:** Claude Desktop Routines hit internal Edge Functions using `verify_jwt = false` plus `x-bushel-internal-secret` backed by `BUSHEL_INTERNAL_FUNCTION_SECRET`. Never use anon JWTs for internal chaining. Vercel cron is no longer a public ingress (all Vercel crons disabled 2026-03-17).

## Data Layer Foundation Additions
- **Source-spine tables:** `source_runs` (normalized collector run ledger), `grain_market_mappings` (Canada/US market identity mapping), `thesis_packet_cache` (cached Canada/US facts-only Bull/Bear packets for `/thesis`; refreshed by `npm run refresh-thesis-cache` and successful `npm run collect:*` wrappers).
- **Thesis packet RPCs:** `get_canada_thesis_packet(...)` and `get_us_thesis_packet(...)` build facts-only packet JSON; `refresh_thesis_packet_cache(...)` writes `thesis_packet_cache`; `get_thesis_board_cached(p_crop_year, p_market_year)` serves `/thesis`.
- **Thesis board UI:** `/thesis` renders cached Canada/US thesis packet cards from `app/(dashboard)/thesis/page.tsx`, using stance, confidence, bull/bear drivers, freshness warnings, packet metrics, and source provenance from `lib/queries/thesis-board.ts`.
- **Thesis query layer:** `lib/queries/thesis-board.ts` normalizes cached packet JSON into `/thesis` cards; `lib/__tests__/thesis-board.test.ts` covers stale flags, packet counts, stance labels, and empty-state handling.
- **World veg-oil bounded Canola lane (2026-06-09):** `usda_wasde_raw` now carries world-level PSD rows (`country_code '00'`) for Rapeseed/Rapeseed Oil/Palm Oil/Soybean Oil. Canola packets get a `demand.global_veg_oil` block (current vs prior marketing-year stocks/use at the latest report month); `mapCanolaGlobalVegOilDemandContext()` in `lib/thesis/rating-domain-mappers.ts` applies at most a ±6 demand tilt inside an already-active CGC demand domain, only at strong `usda_wasde_raw` freshness, with ≥2 commodities and average YoY S/U shift ≥ ±0.5 pp. New `bounded_context` impact source class = admitted + deterministic + weight-neutral (no domain-weight boost). China policy/customs detail remains watch-only. Migration: `supabase/migrations/20260609170000_admit_world_veg_oil_canola_demand_context.sql`.

## Pipeline Monitoring
- **pipeline_runs schema traps (2026-07-11):** `grains_requested` is NOT NULL with no default, `crop_year`/`grain_week` NOT NULL, no `source`/`metadata` columns, `triggered_by` CHECK `manual|cron|retry` — every INSERT in a prompt/agent doc must satisfy all of these or the row silently dies (see issues.md 2026-07-11). Desk runs open a `status='running'` ledger row (Phase 0.5) and UPDATE it on close; identify desk rows via `failure_details->>'routine'`.
- **Friday desk OUTPUT freshness (added 2026-06-09 after the silent April-June desk outage):** `npm run check:desk-freshness` — checks `market_analysis` / `us_market_analysis` recency (exit 1 when older than 9 days). Deliberately separate from `check:source-freshness` so a desk outage cannot cascade into Track 54 readiness holds. A desk thesis 2+ weeks behind the display week is stale-guarded on grain detail + My Farm via `assessDeskThesisStaleness()` in `lib/utils/thesis-staleness.ts`.
- Source run freshness: `SELECT source_name, status, source_date, completed_at FROM source_runs ORDER BY completed_at DESC LIMIT 20;`
- Thesis cache freshness: `SELECT lane, item_slug, crop_year, market_year, source_run_watermark, refreshed_at FROM thesis_packet_cache ORDER BY refreshed_at DESC LIMIT 25;` (columns verified live 2026-06-09; `side`/`item_key`/`generated_at` do not exist)
- World veg-oil context rows: `SELECT market_name, market_year, report_month, ending_stocks_kt, stocks_to_use_pct FROM usda_wasde_mapped WHERE country_code='00' ORDER BY market_name, market_year;`
- Canola veg-oil packet block: `SELECT jsonb_array_length(get_canada_thesis_packet('Canola')->'demand'->'global_veg_oil') AS veg_oil_commodities;` (expected: 4)
- Thesis board RPC: `SELECT jsonb_array_length(get_thesis_board_cached('2025-2026', 2025)->'canada') AS canada, jsonb_array_length(get_thesis_board_cached('2025-2026', 2025)->'us') AS us;`
- Legacy cron drift check: `SELECT * FROM cron.job WHERE jobname = 'cgc-weekly-import';` (expected: zero rows)
- Import audit: `SELECT * FROM cgc_imports ORDER BY imported_at DESC LIMIT 5;`
- Data freshness: `SELECT * FROM v_latest_import;`
- Validation: `SELECT * FROM validation_reports ORDER BY created_at DESC LIMIT 5;`
- X signals: `SELECT grain, grain_week, COUNT(*) FROM x_market_signals GROUP BY grain, grain_week ORDER BY grain_week DESC LIMIT 20;`
- Market analysis (Round 1): `SELECT grain, grain_week, data_confidence, model_used, generated_at FROM market_analysis ORDER BY generated_at DESC LIMIT 5;`
- Legacy intelligence archive: `SELECT grain, grain_week, generated_at FROM grain_intelligence ORDER BY generated_at DESC LIMIT 5;`
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
- SK cash prices (wheat cash tape): `SELECT crop, price_date, value, unit FROM sk_cash_prices WHERE crop='wheat' ORDER BY price_date DESC LIMIT 5;`
- StatsCan farm stocks/seeded area: `SELECT product_id, ref_date, geo, item, value, status_code FROM statcan_wds_raw WHERE item ILIKE '%wheat%' ORDER BY ref_date DESC LIMIT 10;`
- Self-sufficiency: `SELECT * FROM get_processor_self_sufficiency('Canola', '2025-2026') WHERE grain_week = 31;`
- Terminal flow (per-grain): `SELECT * FROM get_weekly_terminal_flow('Wheat', '2025-2026') ORDER BY grain_week DESC LIMIT 5;`
- Terminal flow (aggregate): `SELECT * FROM get_aggregate_terminal_flow('2025-2026') ORDER BY grain_week DESC LIMIT 5;`
- USDA export sales freshness: `SELECT commodity, cgc_grain, week_ending, net_sales_mt, exports_mt, outstanding_mt FROM usda_export_sales ORDER BY week_ending DESC LIMIT 10;`
- USDA export context: `SELECT * FROM get_usda_export_context('Wheat', 4);`
- USDA sales pace: `SELECT * FROM get_usda_sales_pace('Wheat');`
- WASDE freshness: `SELECT market_name, country_code, report_month, ending_stocks_kt, stocks_to_use_pct, imported_at FROM usda_wasde_mapped ORDER BY report_month DESC LIMIT 10;`
- WASDE context: `SELECT * FROM get_usda_wasde_context('Wheat', 2);`
- Crop progress freshness: `SELECT commodity, cgc_grain, week_ending, good_excellent_pct, ge_pct_yoy_change FROM usda_crop_progress WHERE state='US TOTAL' ORDER BY week_ending DESC LIMIT 10;`
- Crop conditions: `SELECT * FROM get_usda_crop_conditions('Wheat', 4);`
- Posted prices (active): `SELECT business_type, facility_name, grain, price_per_tonne, basis, capacity_notes, delivery_notes, posted_at, expires_at FROM posted_prices WHERE expires_at > now() ORDER BY posted_at DESC LIMIT 10;`
- Posted prices by area: `SELECT * FROM get_area_prices('T0L');`
- Operator products: `SELECT op.product_name, op.product_category, op.is_active, p.company_name FROM operator_products op JOIN profiles p ON p.id = op.operator_id ORDER BY op.added_at DESC LIMIT 20;`
- Price query demand: `SELECT grain, COUNT(*), DATE(queried_at) FROM price_query_log GROUP BY grain, DATE(queried_at) ORDER BY DATE(queried_at) DESC, COUNT(*) DESC LIMIT 20;`
- Operator reach: `SELECT * FROM get_operator_reach(ARRAY['T0L','T0K','T0C']);`
- Feedback by role: `SELECT user_role, feedback_type, COUNT(*) FROM feedback_log GROUP BY user_role, feedback_type;`
- Facility status: `SELECT company_name, facility_status FROM profiles WHERE facility_status IS NOT NULL;`
- Knowledge state: `SELECT fsa_code, category, COUNT(*) FROM knowledge_state WHERE status='active' GROUP BY fsa_code, category ORDER BY fsa_code;`
- Chat extractions: `SELECT category, COUNT(*), SUM(CASE WHEN promoted THEN 1 ELSE 0 END) as promoted, SUM(CASE WHEN discarded THEN 1 ELSE 0 END) as discarded FROM chat_extractions GROUP BY category;`
- Compression: `SELECT period, compression_date, extractions_total, promoted, superseded, flags_for_review FROM compression_summaries ORDER BY compression_date DESC LIMIT 10;`
- Knowledge patterns: `SELECT pattern_type, status, COUNT(*) FROM knowledge_patterns GROUP BY pattern_type, status;`
- X API budget: `SELECT mode, DATE(searched_at), COUNT(*), SUM(tweets_relevant), AVG(value_score)::int FROM x_api_query_log GROUP BY mode, DATE(searched_at) ORDER BY DATE(searched_at) DESC LIMIT 10;`
- Weekly briefs: `SELECT user_id, week_ending, array_length(grains_covered, 1) as grains FROM weekly_farmer_briefs ORDER BY week_ending DESC LIMIT 10;`

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
- `docs/reference/viking-knowledge-architecture.md` — Viking L0/L1/L2 tiered knowledge system: historical architecture, now used as reference context for Claude/Codex workflows
