# Bushel Board - Feature Status Tracker

Last updated: 2026-04-18

## Feature Tracks

| # | Feature | Status | Date | Key Files |
|---|---------|--------|------|-----------|
| 1 | CGC Data Pipeline (import, backfill, Vercel cron ingress) | Complete | 2026-03-04 | `supabase/functions/import-cgc-weekly/`, `app/api/cron/import-cgc/route.ts`, `scripts/backfill.ts` |
| 2 | Database Schema & Migrations | Complete | 2026-03-04 | `supabase/migrations/` |
| 3 | Grain Dashboard (overview, detail, all grains) | Complete | 2026-03-05 | `app/(dashboard)/overview/`, `app/(dashboard)/grain/[slug]/` |
| 4 | Email/Password Auth + Middleware | Complete | 2026-03-11 | `app/(auth)/`, `components/auth/`, `lib/auth/auth-scene.ts`, `lib/supabase/`, `proxy.ts` |
| 5 | Supply/Disposition Balance Sheets | Complete | 2026-03-06 | `scripts/seed-supply-disposition.ts`, `lib/queries/intelligence.ts`, `lib/queries/supply-disposition.ts` |
| 6 | AI Grain Intelligence (Grok + x_search) | Complete | 2026-03-07 | `supabase/functions/generate-intelligence/`, `components/dashboard/thesis-banner.tsx` |
| 7 | Week-over-Week Comparison (composite metrics) | Complete | 2026-03-08 | `components/dashboard/wow-comparison.tsx`, `lib/queries/observations.ts` |
| 8 | X/Twitter Signal Feed + Relevance Voting | Complete | 2026-03-09 | `supabase/functions/search-x-intelligence/`, `components/dashboard/x-signal-feed.tsx` |
| 9 | Farm Summary (per-user AI narratives + percentiles) | Complete | 2026-03-11 | `supabase/functions/generate-farm-summary/`, `components/dashboard/farm-summary-card.tsx` |
| 10 | My Farm (crop plans, delivery tracking, inventory percentages) | Complete | 2026-03-11 | `app/(dashboard)/my-farm/`, `lib/queries/crop-plans.ts`, `supabase/migrations/20260312110000_crop_inventory_marketing_tracking.sql` |
| 11 | Pipeline Velocity Chart (RPC-based) | Complete | 2026-03-10 | `components/dashboard/gamified-grain-chart.tsx`, `supabase/migrations/20260310200000_pipeline_velocity_rpc.sql` |
| 12 | Import Validation (post-import anomaly detection) | Complete | 2026-03-07 | `supabase/functions/validate-import/` |
| 13 | Prairie Landing Page | Complete | 2026-03-11 | `app/page.tsx`, `components/landing/landing-page.tsx`, `components/layout/logo.tsx` |
| 14 | Farmer Engagement & Input System | Complete | 2026-03-11 | `lib/auth/role-guard.ts`, `components/dashboard/sentiment-banner.tsx`, `components/dashboard/delivery-pace-card.tsx` |
| 15 | Farmer-First Onboarding, Unlock UX, and Nav Polish | Complete | 2026-03-11 | `lib/auth/post-auth-destination.ts`, `app/(dashboard)/my-farm/`, `components/layout/`, `components/auth/`, `components/dashboard/x-signal-feed.tsx` |
| 16 | UX Layout & Hierarchy Redesign (P1) | Complete | 2026-03-11 | `components/dashboard/section-header.tsx`, `components/dashboard/compact-signal-strip.tsx`, `components/dashboard/supply-pipeline.tsx`, `app/(dashboard)/overview/page.tsx`, `app/(dashboard)/grain/[slug]/page.tsx` |
| 17 | Dual-LLM Intelligence Pipeline (Step 3.5 Flash + Grok debate) | Complete | 2026-03-12 | `supabase/functions/analyze-market-data/`, `supabase/functions/_shared/commodity-knowledge.ts`, `components/dashboard/bull-bear-cards.tsx`, `lib/queries/intelligence.ts` |
| 18 | Supplementary Data Pipeline (Grain Monitor & Producer Cars) | Complete | 2026-03-13 | `supabase/migrations/20260313120000_create_grain_monitor_and_producer_cars.sql`, `supabase/functions/analyze-market-data/`, `supabase/functions/generate-intelligence/`, `docs/reference/agent-debate-rules.md` |
| 19 | AI Thesis Debate Moderation & Agent Improvement | Complete | 2026-03-13 | `docs/lessons-learned/canola-week31-debate-moderation.md`, `docs/reference/agent-debate-rules.md` |
| 20 | CFTC COT Positioning Integration | Complete | 2026-03-13 | `supabase/migrations/20260313140000_create_cftc_cot_positions.sql`, `supabase/functions/import-cftc-cot/`, `app/api/cron/import-cftc-cot/route.ts`, `.claude/skills/cftc-cot/SKILL.md`, `docs/plans/2026-03-13-cftc-cot-integration-design.md` |
| 21 | Dashboard Overhaul — Farmer Decision Architecture | Complete | 2026-03-13 | `components/ui/glass-card.tsx`, `components/dashboard/cot-positioning-card.tsx`, `components/dashboard/logistics-card.tsx`, `components/dashboard/flow-donut-chart.tsx`, `components/dashboard/recommendation-card.tsx`, `components/dashboard/multi-grain-sentiment.tsx` |
| 22 | Farmer Advisor Chat & Memory | Proposed | 2026-03-13 | `docs/plans/2026-03-13-farmer-advisor-chat-design.md`, `docs/plans/2026-03-13-farmer-advisor-chat-implementation.md` |
| 23 | Dashboard Redesign V2 — Wave 1: Data Foundation | Complete | 2026-03-14 | `scripts/seed-supply-disposition.ts`, `app/(dashboard)/my-farm/client.tsx`, `app/(dashboard)/grain/[slug]/page.tsx`, `lib/utils/crop-year.ts`, `components/auth/auth-shell.tsx`, `components/dashboard/crop-summary-card.tsx` |
| 24 | Dashboard Redesign V2 — Wave 2: Grain Page Redesign | Complete | 2026-03-14 | `components/dashboard/key-metrics-cards.tsx`, `components/dashboard/net-balance-chart.tsx`, `components/dashboard/delivery-breakdown-chart.tsx`, `components/dashboard/grain-quality-donut.tsx`, `app/(dashboard)/grain/[slug]/page.tsx` |

| 25 | Dashboard Redesign V2 — Wave 3: Engagement & My Farm | Complete | 2026-03-14 | `components/dashboard/metric-sentiment-vote.tsx`, `components/dashboard/percentile-graph.tsx`, `components/ui/grain-icon.tsx`, `app/(dashboard)/overview/signal-strip-with-voting.tsx`, `components/dashboard/farmer-cot-card.tsx` |
| 26 | Dashboard Redesign V2 — Wave 4: Advanced Intelligence | Complete | 2026-03-14 | `supabase/migrations/20260314500000_*`, `components/dashboard/crush-utilization-gauge.tsx`, `components/dashboard/price-sparkline.tsx`, `lib/queries/processor-capacity.ts`, `lib/queries/grain-prices.ts` |
| 27 | Delivery Pace Chart (YoY Cumulative Gap, Dual Y-Axis) | Complete | 2026-03-15 | `components/dashboard/delivery-gap-chart.tsx`, `lib/utils/delivery-gap.ts`, `tests/lib/utils/delivery-gap.test.ts`, `app/(dashboard)/grain/[slug]/page.tsx` |
| 28 | Terminal Net Flow Visualization | Complete | 2026-03-16 | `components/dashboard/terminal-flow-chart.tsx`, `components/dashboard/logistics-banner.tsx`, `components/dashboard/logistics-stat-pill.tsx`, `lib/queries/logistics-utils.ts`, `lib/queries/logistics.ts`, `supabase/migrations/20260316120000_weekly_terminal_flow_rpc.sql` |
| 29 | Unified Grok 4.1 Fast Migration | Complete | 2026-03-16 | `supabase/functions/analyze-market-data/index.ts`, `supabase/functions/generate-intelligence/index.ts`, `lib/advisor/openrouter-client.ts`, `app/api/advisor/chat/route.ts`, `lib/advisor/system-prompt.ts` |
| 30 | Stance Spectrum Meter & Confidence Gauge | Complete | 2026-03-16 | `components/dashboard/bull-bear-cards.tsx`, `components/dashboard/recommendation-card.tsx`, `lib/utils/recommendations.ts`, `supabase/migrations/20260316130000_add_stance_score.sql` |
| 31 | Pipeline v2: Senior Analyst (single-pass) | Complete | 2026-03-17 | `supabase/functions/analyze-grain-market/`, `lib/shipping-calendar.ts`, `lib/data-brief.ts`, `lib/analyst-prompt.ts` |
| 32 | Live Grain Futures Prices (Phase A) | Complete | 2026-03-18 | `scripts/import-grain-prices.ts`, `lib/queries/grain-prices.ts`, `supabase/migrations/20260318120000_add_grain_prices_unit.sql` |
| 33 | Viking Knowledge System (L0/L1/L2) | Complete | 2026-03-19 | `lib/knowledge/viking-l0.ts`, `lib/knowledge/viking-l1.ts`, `lib/knowledge/viking-retrieval.ts`, `supabase/functions/_shared/viking-knowledge.ts` |
| 34 | Grok 4.20 Upgrade + Parallel Debate Architecture | Complete | 2026-03-21 | `supabase/functions/analyze-grain-market/index.ts`, `scripts/parallel-debate.ts`, `scripts/debate-grok-round2.ts` |
| 35 | Hermes Pipeline Design + US Thesis Lane | Complete | 2026-04-11 | `docs/hermes/SOUL.md`, `supabase/migrations/20260412100*`, `lib/us-market-context.ts`, `docs/plans/2026-03-28-hermes-pipeline-design.md` |
| 36 | Chat-First iOS Pivot + Bushy Persona | Complete | 2026-04-14 | `docs/plans/2026-04-13-chat-first-ios-design.md`, `BushelBoard/`, `.claude/agents/chat-architect.md`, `supabase/functions/chat-completion/` |
| 37 | Web Alpha — Bushy Chat | Complete | 2026-04-14 | `app/(dashboard)/chat/page.tsx`, `components/bushy/`, `supabase/functions/_shared/chat-tools.ts`, `supabase/functions/_shared/chat-context-builder.ts` |
| 38 | Operational Feedback Loop | Design Only | 2026-04-14 | Design doc committed, not yet implemented |
| 39 | Unified Pricing Board | Complete | 2026-04-14 | `supabase/migrations/20260418100100_unified_pricing_board.sql`, `supabase/functions/_shared/chat-tools.ts`, `components/auth/signup-form.tsx` |
| 40 | Parallel Pipeline Orchestrator | Design Only | 2026-04-15 | `docs/plans/2026-04-15-parallel-pipeline-orchestrator-design.md` |
| 41 | Claude Agent Desk | Complete | 2026-04-15 | `.claude/agents/{supply,demand,basis,sentiment,logistics,macro}-scout.md`, `.claude/agents/{export,domestic,risk}-analyst.md`, `docs/reference/grain-desk-swarm-prompt.md`, `docs/reference/collector-task-configs.md`, `scripts/xai-search.ts` |
| 42 | Hermes Chat Agent — Tiered Memory | 2026-04-15 | Design + skeleton: 6 tables, classification engine, supersession engine, X API v2 client, compression engine, Hermes server, Vercel proxy, 4 RPCs |
| 43 | Grain Detail Simplification | 2026-04-15 | Strip grain detail page to 3 sections: Market Thesis (two-column reasoning), Ask Bushy (embedded chat), My Farm (progress + recommendation). Fix stale week display. |
| 44 | Overview Bull/Bear Unification | 2026-04-16 | Single `UnifiedMarketStanceChart` grouped by region (CA 10 grains + US 4 markets), accordion rows expand to two-column bull/bear bullet panels with recommendation + detail link. CGC snapshot grid, Logistics Banner, and Community Pulse removed from Overview. `lib/queries/us-market-stance.ts`, `lib/queries/market-stance.ts` extended with `bullPoints`/`bearPoints`/`region`/`detailHref`. |
| 45 | Bio Trial Signup (landing-page lead capture + email notification) | Complete | 2026-04-18 | `components/landing/trial-desk-section.tsx`, `components/landing/trial-form.tsx`, `components/landing/trial-client.ts`, `components/landing/trial-odometer.tsx`, `components/landing/trial-desk.css`, `components/landing/trial-actions.ts` (SSR only), `app/api/trial-notify/route.ts`, `lib/supabase/middleware.ts` (route exemption), Supabase RPCs `public.submit_bio_trial_signup` / `public.get_bio_trial_acres`. **Reference:** `docs/reference/bio-trial-signup.md`. |
| 46 | Seeding Progress Map (`/seeding` Crop Pulse Seismograph) | Complete | 2026-04-28 | `app/(dashboard)/seeding/page.tsx`, `components/dashboard/seeding-{map,seismograph-glyph,scrubber,legend,canada-placeholder,table-fallback}.tsx`, `lib/queries/seeding-progress{,-utils}.ts`, `supabase/migrations/20260428000000_us_state_centroids.sql`, `supabase/migrations/20260428000100_get_seeding_seismograph.sql`, `scripts/import-usda-crop-progress.py` (per-state ingest), `docs/plans/2026-04-27-seeding-progress-map-design.md`, `docs/plans/2026-04-27-seeding-progress-map-plan.md`, `docs/plans/2026-04-27-bushel-board-cohesion-audit.md`. v1: US-only (15 grain-belt states), 5 commodities, week scrubber, a11y table fallback, Canada placeholder. v2/v3: Northbound Crop Wave + Supply Stress Halos deferred. |

### 2026-04-18 — Bio Trial Signup (Track 45)

**What was delivered:**
- Landing-page trial section (`<TrialDeskSection>`) with agronomist-desk aesthetic — hero, sticky-note benefits, clipboard signup form, brass odometer showing running enrolled-acres total.
- Client-side Supabase RPC wrappers (`components/landing/trial-client.ts`) — deliberately bypass Next.js server actions so submit-to-APPROVED latency stays under ~500 ms (server actions triggered RSC revalidation of the dynamic landing route).
- Fire-and-forget notification email pipeline: browser POSTs to `/api/trial-notify` (Node runtime), which Zod-validates and ships a kraft-paper-styled HTML + plain-text email via the Resend SDK. Email failures never affect the user's APPROVED state.
- Middleware exemption for `/api/trial-notify` in `lib/supabase/middleware.ts` so the unauthenticated public landing page can hit the notification endpoint without a 307 to `/login`.
- End-to-end verified 2026-04-18: odometer rolled 003000 → 003025, row persisted with `status: new`, Resend delivery confirmed.

**Critical invariants** (full list in the reference doc): don't re-introduce a server action for the submit path; keep the notification POST fire-and-forget; keep `/api/trial-notify` on the middleware exemption list; Resend is in sandbox mode so `TRIAL_NOTIFY_TO` must be the Resend account owner until a domain is verified.

**Plans:** `docs/plans/2026-04-18-bio-trial-integration-design.md` (phases 1–3 shipped; 4–7 still ahead).
**Reference:** `docs/reference/bio-trial-signup.md`.
**Consolidated status + Mermaid flow diagram + next steps:** `docs/handovers/2026-04-18-bio-trial-feature-status.md` (2026-04-18 evening).

**2026-04-18 evening update:** Work on the trial was moved to its own long-lived branch `feature/bio-trial-integration` (seasonal feature — merge into master when a trial season opens). A standalone SixRing vendor console was shipped on the `bio_trial/` static site this session (`vendor.html` + `vendor.js`) — it covers Phase 4's functional scope but lives outside the Bushel Board app. Phase 4 proper (porting that console to `/admin`) is still ahead, along with Phase 5 (chat gating), Phase 6 (delivery → magic-link invite), and the new Phase 7 (Trial tab with chat-extracted trial events). A RPC-naming reconcile is needed — two sets of vendor RPCs exist in the DB right now; only one should survive.

### 2026-04-16 — Overview Bull/Bear Unification (Track 44)

**What was delivered:**
- New `components/dashboard/unified-market-stance-chart.tsx` — single chart grouped by region (🇨🇦 CA + 🇺🇸 US) with expand-on-click accordion rows revealing a two-column bull/bear bullet panel plus recommendation + detail link.
- New `lib/queries/us-market-stance.ts` with `getUsMarketStancesForOverview(marketYear)` and pure `normalizeUsKeySignals(unknown)` helper that splits `us_market_analysis.key_signals` into `bullPoints`/`bearPoints`. Markets with no analysis yet are omitted (flatMap pattern) rather than rendered as stubs.
- Extended `lib/queries/market-stance.ts` CA query: SELECT adds `bull_reasoning`, `bear_reasoning` JSONB, output shape now carries `region: "CA"`, `bullPoints`, `bearPoints`, `detailHref`. Defensive `coerceBullets(unknown)` parser.
- Extended shared types in `components/dashboard/market-stance-chart.tsx`: new `BulletPoint` interface, `region`, `bullPoints`, `bearPoints`, `recommendation?`, `detailHref` on `GrainStanceData`.
- `app/(dashboard)/overview/page.tsx` shrunk from 167 → 53 lines. The CGC market snapshot grid, Logistics Banner, and Community Pulse (sentiment banner + signal strip) are removed from this page.
- Unit test `tests/lib/us-market-stance-normalize.test.ts` — 3 cases (split bull/bear, null/empty, malformed entries).

**Orphans noted:** `MarketSnapshotGrid`, `LogisticsBanner`, `SignalStripWithVoting`, `MarketStanceChart` (the React component; its type exports are still live), and queries `getMarketOverviewSnapshot`, `getLogisticsSnapshotRaw`, `getAggregateTerminalFlow`, `getLatestXSignals` — documented in `docs/lessons-learned/issues.md` for a separate cleanup PR after one-week soak. `SentimentBanner` is still imported by My Farm so it stays.

**Data notes:**
- Only 4 of 5 US markets currently have analysis (Barley missing at time of ship). `flatMap` approach means the US group shows just the rows that have data.
- US `priorScore` is `null` for now — the `us_market_analysis` table doesn't store a weekly stance anchor; trajectory lives in `us_score_trajectory` and is out of scope. TODO left in the query.
- US prices query explicitly filters `.in("grain", futuresGrains)` and dedupes latest-per-grain rather than relying on `.limit(N)`, so a busy CA price table can never starve the US group.

**Defensive parsing:** Both CA and US normalizers take `unknown` JSONB and do structural narrowing with `typeof === "string"` guards, matching the project convention for untrusted DB shapes.

**Plans:** `docs/plans/2026-04-16-overview-bullbear-unification-design.md`, `docs/plans/2026-04-16-overview-bullbear-unification-implementation.md`.

### 2026-04-15 — Claude Agent Desk (Track 41)

**What was delivered:**
- 6 scout agent definitions: supply-scout, demand-scout, basis-scout, sentiment-scout, logistics-scout, macro-scout (5 Haiku + 1 Sonnet)
- 3 specialist agent definitions: export-analyst, domestic-analyst, risk-analyst (all Sonnet)
- Friday swarm orchestration prompt (`grain-desk-weekly` scheduled task, Fri 6:47 PM ET): 7-phase desk chief that dispatches scouts in parallel, compiles briefs, dispatches specialists, resolves divergence using all 15 debate rules + Viking L0/L1/L2, writes to `market_analysis`
- 6 daily data collector scheduled tasks: crop-progress (Mon), grain-monitor (Wed), export-sales (Thu AM), cgc (Thu PM), cftc-cot (Fri PM), wasde (Fri monthly)
- xAI search helper script (`scripts/xai-search.ts`) for macro-scout web_search/x_search via grok-3-mini-fast
- Reference docs: `docs/reference/grain-desk-swarm-prompt.md`, `docs/reference/collector-task-configs.md`
- Integration verified: build passes, 214 tests pass, all RPCs return data for Wheat Week 35
- Grok pipeline (`analyze-grain-market`) retained as fallback

### 2026-04-14 — Unified Pricing Board (Track 39)

**What was delivered:**
- Unified `posted_prices` table replacing separate `elevator_prices` + `provider_listings` (both had 0 rows — clean swap)
- `operator_products` table for operator product catalogs, seeded at signup
- `price_query_log` table for demand analytics — logs every farmer price query for operator feedback
- `get_area_prices` RPC (farmer price lookup), `get_operator_analytics` RPC (demand trends), `get_operator_reach` RPC (farmer count in FSA)
- 5 unified chat tools: `post_daily_prices`, `get_area_prices`, `manage_products`, `get_demand_analytics`, `update_facility_status`
- Signup form supports all operator types (elevator/crusher/mill/terminal/seed/fertilizer/chemical) with product line capture
- `facility_status` on profiles for operational notes ("Taking canola until Wed")
- `user_role` on `feedback_log` for filtering farmer vs operator feedback
- 24h price expiry drives daily posting rhythm
- Design doc: `docs/plans/2026-04-14-unified-pricing-board-design.md`

### 2026-04-14 — Web Alpha: Bushy Chat (Track 37)

**What was delivered:**
- Full Bushy chat at `/chat` route with auth guard
- SSE streaming from Supabase `chat-completion` Edge Function
- 10 chat tools: save_local_intel, update_farmer_memory, get_area_stance, search_market, create_crop_plan, post_daily_prices, get_area_prices, manage_products, get_demand_analytics, save_feedback
- Context builder with parallel data loading (farmer profile, crop plans, national stances, area intel, posted prices)
- Trust footer with data freshness (CGC, futures, local reports, posted prices)
- Quick chips for conversation starters
- Verification prompts for farmer-reported data (basis, prices, yields)
- Source tags: [posted pricing], [local reports], [sponsored], [national market], [your history]

### 2026-04-14 — Chat-First iOS Pivot + Bushy Persona (Track 36)

**What was delivered:**
- Complete iOS design doc: Swift/SwiftUI chat app with Apple Intelligence, Siri intents, widgets
- Xcode project skeleton with chat UI, auth, SSE client
- Bushy persona: grain analyst buddy, prairie farmer vocabulary, conversational tone
- chat-architect agent definition for prompt engineering and tool design
- LLM adapter layer for model-agnostic architecture (Grok primary, swappable)
- Rebrand: iOS app is "Bushels", agent is "Bushy", gamified data exchange

### 2026-03-17 — Pipeline v2: Senior Analyst Single-Pass Architecture (Track 31)

**What was delivered:**
- New `analyze-grain-market` Edge Function replacing the dual-LLM chain (`analyze-market-data` + `generate-intelligence`) with a single-pass Senior Analyst using xAI Responses API with native `web_search` + `x_search` tools
- **Dynamic Shipping Calendar** (`lib/shipping-calendar.ts`) — temporal context module computing data lag, seasonal context, and week-aware framing for LLM injection (6 seasonal buckets, RangeError validation)
- **Pre-computed Analyst Ratios** (`lib/data-brief.ts`) — server-side arithmetic (export pace, stocks-to-use, crush utilization, delivery/export vs 5yr avg, managed money positioning) so LLM interprets rather than calculates
- **Analyst Prompt Builder** (`lib/analyst-prompt.ts`) — research-tier system (major 4+4 queries, mid 2+2, minor 1+1) with commodity knowledge injection, data hygiene rules, and structured output schema
- Self-batching with BATCH_SIZE=1, self-triggers via `enqueue_internal_function` RPC, chains to `generate-farm-summary` after all grains complete
- 27 new unit tests across 3 modules (shipping-calendar: 10, data-brief: 8, analyst-prompt: 9)
- Deno-compatible copies in `supabase/functions/_shared/` for Edge Function runtime

**Benchmark results (litmus tests):**
- Barley: v1 stance=-45 → v2 stance=+35 (PASS — correctly identified +78% export pace)
- Flaxseed: v1 stance=+25 → v2 stance=+20 (Partial — web search found offsetting factors: firm $16-17/bu cash bids, low commercial stocks tempering the bearish 17% export pace signal)
- Canola: v1 stance=-45 → v2 stance=+45 (Bonus — web search enriched thesis with real-time context)

**Architecture change:** Single xAI API call with tool use replaces 2 sequential LLM calls + separate X signal search. The model autonomously decides when/how to use web_search and x_search based on research tier guidance.

**Design doc:** `docs/plans/2026-03-17-pipeline-v2-senior-analyst-design.md`
**Implementation plan:** `docs/plans/2026-03-17-pipeline-v2-senior-analyst-implementation.md` (7 tasks)

**New files:** `supabase/functions/analyze-grain-market/index.ts`, `lib/shipping-calendar.ts`, `lib/data-brief.ts`, `lib/analyst-prompt.ts`, `lib/commodity-knowledge-text.ts`, `lib/__tests__/shipping-calendar.test.ts`, `lib/__tests__/data-brief.test.ts`, `lib/__tests__/analyst-prompt.test.ts`, `supabase/functions/_shared/shipping-calendar.ts`, `supabase/functions/_shared/data-brief.ts`, `supabase/functions/_shared/analyst-prompt.ts`
**Modified files:** `supabase/config.toml`, `supabase/functions/_shared/market-intelligence-config.ts`

### 2026-03-16 — Stance Spectrum Meter & Confidence Gauge (Track 30)

**What was delivered:**
- Stance spectrum meter in `BullBearCards` — horizontal gradient bar (bullish green → neutral gray → bearish amber) with positioned marker driven by `stance_score` (-100 to +100)
- Semicircle confidence gauge in `RecommendationCard` — replaces text badge with SVG arc showing numeric confidence (0-100%)
- `stance_score smallint` column added to `market_analysis` table with CHECK constraint
- `computeConfidenceScore()` in `lib/utils/recommendations.ts` — blends stance magnitude (60%) with pace alignment (40%)
- Edge Function schema updated to request `stance_score` from Grok 4.1 Fast structured output
- Hero `MarketStanceBadge` now derives stance from `stance_score` instead of keyword matching

### 2026-03-16 — Unified Grok 4.1 Fast Migration (Track 29)

**What was delivered:**
- All AI systems migrated from mixed OpenRouter/xAI to unified `grok-4-1-fast-reasoning` via xAI API
- `analyze-market-data` Edge Function switched from OpenRouter (Step 3.5 Flash) to xAI Responses API with structured JSON schema
- Advisor chat switched to xAI Responses API with `x_search` tool for real-time price lookups
- X market signals added to advisor context for richer market awareness
- Full pipeline re-run completed — all 16 grains regenerated with Grok 4.1 Fast

### 2026-03-16 — Terminal Net Flow Visualization (Track 28)

**What was delivered:**
- `TerminalFlowChart` component on grain detail page — diverging bar + line chart showing weekly terminal receipts vs exports with net flow
- `LogisticsBanner` component on overview page — narrative headline with sparkline summarizing terminal flow across grains
- `LogisticsStatPill` component — compact stat display used within the logistics banner
- Two new RPC functions: `get_weekly_terminal_flow` (per-grain weekly receipts/exports/net) and `get_aggregate_terminal_flow` (cross-grain summary)
- Client-safe utility module `lib/queries/logistics-utils.ts` for headline generation logic
- Server query module `lib/queries/logistics.ts` for Supabase RPC calls
- 5 unit tests for the logistics headline generator
- Wired into `app/(dashboard)/grain/[slug]/page.tsx` (TerminalFlowChart) and `app/(dashboard)/overview/page.tsx` (LogisticsBanner)

**Design doc:** `docs/plans/2026-03-16-terminal-net-flow-design.md`
**Implementation plan:** `docs/plans/2026-03-16-terminal-net-flow-implementation.md` (9 tasks, all complete)

**New files:** `components/dashboard/terminal-flow-chart.tsx`, `components/dashboard/logistics-banner.tsx`, `components/dashboard/logistics-stat-pill.tsx`, `lib/queries/logistics-utils.ts`, `lib/queries/logistics.ts`, `supabase/migrations/20260316120000_weekly_terminal_flow_rpc.sql`
**Modified files:** `app/(dashboard)/grain/[slug]/page.tsx`, `app/(dashboard)/overview/page.tsx`

### 2026-03-15 — Delivery Pace Chart: YoY Cumulative Gap with Dual Y-Axis (Track 27)

**What was delivered:**
- `DeliveryGapChart` component with dual Y-axes: left axis for cumulative deliveries (Kt), right axis for YoY gap (Kt) with green ticks
- 3 datasets on 2 axes: current year solid line + prior year dashed line (left), gap line + shaded fill area (right)
- Pure utility function `computeDeliveryGap()` with 5 passing tests
- Canola-gated Delivery Pace section on grain detail page between Key Metrics and Net Balance
- SectionHeader with dynamic pills: YoY % (red/green) and gap Kt ("X kt withheld"/"X kt ahead")
- Prototype fidelity lesson documented — design doc initially simplified the user's Chart.js prototype, dropping the right Y-axis

**Process improvements from this track:**
- Updated gemini-collab skill with Prototype Fidelity Check (Pattern 4), Design Doc Deviation Check (Pattern 5), and Prototype Fidelity Review workflow (Workflow 6)
- Documented full retrospective in `docs/lessons-learned/issues.md`
- Rule: when user provides source code, default to faithful reproduction first, improvements second

**New files:** `components/dashboard/delivery-gap-chart.tsx`, `lib/utils/delivery-gap.ts`, `tests/lib/utils/delivery-gap.test.ts`
**Modified files:** `app/(dashboard)/grain/[slug]/page.tsx`, `components/dashboard/CLAUDE.md`

### 2026-03-14 — Dashboard Redesign V2: Wave 4 Advanced Intelligence (Track 26)

**What was delivered:**
- Processor self-sufficiency RPC (`get_processor_self_sufficiency`) — computes producer vs non-producer delivery ratio from Process worksheet
- Self-sufficiency signal injected into `analyze-market-data` Edge Function for AI thesis generation
- Processor capacity reference table with 12 grains seeded from AAFC/industry data
- YoY toggle on Pipeline Velocity chart — "Last Year" and "5yr Avg" overlay lines with toggle pills
- Historical pipeline average RPC (`get_pipeline_velocity_avg`) — N-year average cumulative metrics per grain week
- Crush utilization gauge — semicircular SVG arc showing annualized processing vs capacity with bullish/moderate/low signals
- Grain prices table (`grain_prices`) with sample futures data for Canola, Wheat, Barley, Oats
- Price sparkline in grain detail hero — compact SVG trend line with latest settlement price and daily change
- New migrations: `20260314500000` (self-sufficiency RPC), `20260314510000` (processor capacity table), `20260314520000` (historical pipeline avg RPC), `20260314530000` (grain prices table)

### 2026-03-14 — Dashboard Redesign V2: Wave 3 Engagement & My Farm (Track 25)

**What was delivered:**
- Per-card metric sentiment voting (bullish/bearish) on Key Metrics cards with optimistic UI
- X signal voting on overview page CompactSignalStrip (thumbs up/down with vote state management)
- Farmer-friendly COT positioning card replacing trader-focused chart (mood gauge, plain-English insights)
- Bull/Bear confidence bar made prominent, model attribution removed
- Prairie Chatter removed from grain detail page (overview only)
- Key Metrics cards moved above Net Balance chart (both full-width)
- Custom grain SVG icons component
- Percentile distribution bell curve graph for delivery pace comparison
- Delivery logging default unit changed to kg, destination helper text added
- Edge Function prompt updated for shorter bullets, `confidence_score` (0-100), and `final_assessment`
- New migration: `metric_sentiment_votes` table + `confidence_score`/`final_assessment` columns on `market_analysis`

**New components:** `farmer-cot-card.tsx`, `metric-sentiment-vote.tsx`, `percentile-graph.tsx`, `grain-icon.tsx`, `key-metrics-with-voting.tsx`, `signal-strip-with-voting.tsx`
**New queries:** `lib/queries/metric-sentiment.ts`
**New actions:** `app/(dashboard)/overview/actions.ts`, `app/(dashboard)/grain/[slug]/metric-actions.ts`

### 2026-03-14 — Dashboard Redesign V2: Wave 2 Grain Page Redesign (Track 24)

**What was delivered:**
- Grain detail page completely restructured from reporting dashboard to signal-generating decision tool
- New components: Key Metrics Cards (4 vertical cards with WoW + insights), Net Balance Chart (surplus/deficit bars + cumulative line), Delivery Breakdown Chart (stacked area: elevators/processors/cars), Grain Quality Donut (Terminal Receipts by grade)
- Enhanced components: StorageBreakdown redesigned with CSS horizontal bars, BullBearCards with confidence gauge + final assessment, LogisticsCard with grain week labels on every KPI
- Bull & Bear Cases promoted from collapsed `<details>` to visible section
- Removed redundant sections: Flow Donut, Supply Pipeline, IntelligenceKpis, expandable Market Signals
- New queries: `getGradeDistribution()` (Terminal Receipts by grade), `getDeliveryChannelBreakdown()` (3 delivery channels)

**Deleted components:** `flow-donut-chart.tsx`, `supply-pipeline.tsx`, `intelligence-kpis.tsx`, `x-signal-feed.tsx`

### 2026-03-14 — Dashboard Redesign V2: Wave 1 Data Foundation (Track 23)

**What was delivered:**
- AAFC supply baseline updated to Feb 2026 figures (16 grains, `is_approximate` flag for 5 estimated grains)
- "% Left in Bin vs Market" calculation corrected: Total Opening Supply - CYTD Producer Deliveries (live CGC data)
- Data freshness badge on grain detail page hero section
- Fraunces font rendering fix (variable font axes), estimated yield alignment, hover arrows on crop summary cards, flow donut overflow fix

### 2026-03-13 — Dashboard Overhaul: Farmer Decision Architecture (Track 21)

**What was delivered:**
- Grain detail page restructured with 2-column layout, hero BULLISH/BEARISH badge, bullet-point thesis format
- New components: COT Positioning card, Logistics Snapshot card, "Where Grain Went" donut chart, Recommendation cards (HAUL/HOLD/PRICE/WATCH)
- My Farm page restructured with multi-grain sentiment voting and recommendation badges
- Supply Pipeline redesigned with "Still in Bins" hero metric and corrected labels (Processing, Carry Forward, Shrink & Waste)
- Glassmorphism design system: GlassCard, GlassTooltip, MarketStanceBadge, ActionBadge components with 3D elevation shadows and button underglow
- Overview page upgraded with glass treatment and market stance badges
- AI prompts updated for bullet-point format and `market_stance` field in `generate-intelligence` and `generate-farm-summary`

**New query modules:** `lib/queries/cot.ts`, `lib/queries/logistics.ts`, `lib/queries/flow-breakdown.ts`

## Performance Fixes

### 2026-03-12 — v_grain_overview 945x Query Speedup

- The Overview page silently timed out because `v_grain_overview`'s `latest_week` CTE did a `GROUP BY` + `MAX()` full-table scan on 1M+ rows in `cgc_observations` (5.2s, exceeding PostgREST statement timeout).
- Added composite index `idx_cgc_obs_crop_year_grain_week (crop_year DESC, grain_week DESC)` and rewrote the CTE to `ORDER BY ... LIMIT 1`, enabling an Index Only Scan with 0 heap fetches.
- Query time: 5,200ms -> 5.5ms.

**Migration:** `supabase/migrations/20260312180000_optimize_v_grain_overview.sql`

## Recent UI Polish

### 2026-03-12 — Overview Community Pulse Rail Refresh

- Reworked the overview X/community preview from a plain horizontal strip into a designed signal rail with larger cards, stronger metadata hierarchy, edge fades, left/right controls, and a custom draggable scrubber.
- Replaced reliance on an undefined `scrollbar-hide` utility with an explicit cross-browser scrollbar-hiding utility in `app/globals.css`, then gave the overview rail its own visible scroll affordance.
- Verified the redesigned rail visually in-browser after implementation.

**Files modified:** `components/dashboard/compact-signal-strip.tsx`, `app/globals.css`

### 2026-03-12 — Chart Upgrades: Dual-Axis Deliveries (#1) & Storage WoW (#8)

- **#1 — Dual-axis delivery chart:** Added separate Y-axes for pipeline metrics (kt, left) and farmer deliveries (tonnes, right) so farmer-scale data is no longer invisible against pipeline volumes. Applied to `gamified-grain-chart.tsx` and `pace-chart.tsx`.
- **#8 — Storage chart total + WoW:** Added a total summary line with WoW badge and per-bar delta badges using prairie green/amber color coding.

**Files modified:** `components/dashboard/gamified-grain-chart.tsx`, `components/dashboard/pace-chart.tsx`, storage chart component

### 2026-03-12 — Data Enrichment: Backlog Items #5, #6, #9

- **#5 — % left in bin vs market:** Dual progress bars on My Farm crop cards comparing farmer remaining vs AAFC carry-out, using existing supply disposition query.
- **#6 — Net deliveries vs disappearance KPI:** New NetBalanceKpi component on grain detail showing producer deliveries vs domestic disappearance with bullish/bearish signal, reusing existing WoW data.
- **#9 — Customize X feed grain selection:** Grain filter pill toggles on CompactSignalStrip on Overview, pre-selects unlocked grains, client-side filtering.

### 2026-03-12 — X Thread Backlog Items #10, #11, #12, #13 (Analytics Foundation)

- **#11 — Sentiment shipping week fix:** Sentiment poll now uses `getCurrentGrainWeek()` (shipping week N+1) instead of `latestGrainWeek` (CGC data week N). Added clarifying subtitle.
- **#13 — AI temporal awareness:** All Edge Function intelligence prompts now include `TEMPORAL_AWARENESS` preamble distinguishing CGC data week N from farmer shipping week N+1. Prompt versions bumped to v3.
- **#10 — Save Community Pulse history:** New `sentiment_history` table + `snapshot_weekly_sentiment()` RPC. Archives weekly per-grain sentiment aggregates. RLS + SECURITY DEFINER hardened.
- **#12 — Daily sentiment rollups:** New `sentiment_daily_rollup` table + `snapshot_daily_sentiment()` RPC. Tracks intra-week sentiment trajectory with delta tracking.

**All 13 X Thread backlog items now complete.**

**Files created:** `supabase/migrations/20260312190000_sentiment_history.sql`, `20260312190100_sentiment_daily_rollup.sql`, `20260312190200_harden_sentiment_rpcs.sql`, `lib/queries/sentiment-history.ts`, `lib/queries/sentiment-daily.ts`
**Files modified:** `app/(dashboard)/grain/[slug]/page.tsx`, `components/dashboard/sentiment-poll.tsx`, `supabase/functions/_shared/market-intelligence-config.ts`, `supabase/functions/analyze-market-data/index.ts`, `supabase/functions/generate-intelligence/prompt-template.ts`, `supabase/functions/generate-farm-summary/index.ts`

### 2026-03-12 — X Thread Backlog Items #4 & #7

- **#4 — Overview section reorder:** Moved Market Intelligence above the Community Pulse X feed on the Overview page. Section order is now Snapshot → Intelligence → Community Pulse.
- **#7 — Province map labels:** Province map labels now show both metric tons and percentage of total (e.g., "AB\n4,200.0 kt (38.2%)").

**Files modified:** `app/(dashboard)/overview/page.tsx`, `components/dashboard/province-map.tsx`

### 2026-03-12 — Daylight Auth Contrast & Spacing Fix

- Fixed the top-third readability issue on the daylight auth shell by switching the hero copy from low-contrast white text to dark wheat text on the daytime variant.
- Strengthened the daylight badge, logo chip, and proof cards, added a subtle glass panel behind the hero copy, and increased top spacing so the badge no longer crowds the top-left brand chip on narrower viewports.
- Verified the updated `/signup` page visually in-browser after implementation.

**Files modified:** `components/auth/auth-shell.tsx`

### 2026-03-13 — Supplementary Data Pipeline: Grain Monitor & Producer Cars (Track 18)

**Status:** Complete for the production rollout — data layer, AI integration, Edge Function deployments, and debate moderation all done. UI display, automated scraping, and scripted repo seeding remain future work.

**What was implemented:**
- **New tables:**
  - `grain_monitor_snapshots` — Government Grain Monitor PDFs (port throughput, grain-in-storage, carryover trends). Week 30 sample data was inserted in production (lagged 1 week for Week 31 analysis).
  - `producer_car_allocations` — CGC Producer Car reports (forward-looking rail allocations). Week 33 sample data was inserted in production (2-week forward for Week 31 analysis).

- **New RPC:** `get_logistics_snapshot(crop_year, grain_week)` returns both tables as structured JSON.

- **AI integration:** Embedded logistics context into commodity knowledge (2 new sections: "Marketing Strategy & Contract Guidance" + "Logistics & Transport Awareness", ~1.5K tokens). Injected into Step 3.5 Flash + Grok prompts via updated `market-intelligence-config.ts` version bumps (v4 analyze/generate, v3 knowledge).

- **Data insertion:** Week 30 Grain Monitor + Week 33 Producer Car allocations for 2025-2026 were manually loaded in the live project. The repo currently ships schema plus source files, not an automated sample-data seed for those rows.

**Known issues (resolved):**
- ~~Grain name mismatch between `producer_car_allocations` ("Durum") and `grains` table ("Amber Durum").~~ Fixed via SQL UPDATE: "Durum" → "Amber Durum", "Chickpeas" → "Chick Peas". Buckwheat remains unmatched (minor grain, not in tracked 16).
- Producer car data is cumulative forward-looking, not weekly. RPC returns latest available week ≤ grain_week + 3 to prevent allocations from aging out mid-analysis.

**Edge Function deployments (2026-03-13):**
- `analyze-market-data` v10 — ACTIVE (logistics snapshot integration)
- `generate-intelligence` v31 — ACTIVE (logistics in Grok prompt)
- `generate-farm-summary` v21 — ACTIVE (updated shared config with v4 version bumps)

**What remains (future work):**
- Automated PDF scraping from Government Grain Monitor and CGC Producer Car reports
- Historical backfill of pre-2026 grain monitor and producer car data
- UI display: logistics tiles, supply-chain context cards, port/rail status summaries on Overview and Grain Detail pages
- Automated scheduler integration (daily/weekly pulls depending on source update cadence)

**Files modified:**
- `supabase/migrations/20260313120000_create_grain_monitor_and_producer_cars.sql` (new)
- `supabase/functions/_shared/commodity-knowledge.ts`
- `supabase/functions/_shared/market-intelligence-config.ts`
- `supabase/functions/analyze-market-data/index.ts`
- `supabase/functions/generate-intelligence/index.ts`
- `supabase/functions/generate-intelligence/prompt-template.ts`

### 2026-03-13 — AI Thesis Debate Moderation & Agent Improvement Reference (Track 19)

**What:** Claude moderated the Canola Week 31 disagreement between Step 3.5 Flash (bearish) and Grok (bullish), identifying 3 specific logical errors in Step 3.5's analysis. Created reusable reference docs for continuous agent improvement.

**Key findings:**
- Step 3.5 conflated YTD exports (-28% YoY) with current-week flow — stocks drew -175.6 Kt while 455.6 Kt of deliveries arrived, meaning 631 Kt absorbed in one week
- The export lag reflects Vancouver port congestion (107% capacity, 26 vessels vs avg 20), not demand weakness
- Grok's bullish thesis was directionally correct but needed sharper specifics (timeline, triggers, risk)

**New reference docs:**
- `docs/lessons-learned/canola-week31-debate-moderation.md` — full evidence-based moderation with corrected thesis
- `docs/reference/agent-debate-rules.md` — 8 reusable rules (flow coherence, thesis quality) + grain-specific rules + validation checklist

## Intelligence Pipeline

### v2 (Current — Track 31)
```text
GET /api/cron/import-cgc -> validate-import -> search-x-intelligence -> analyze-grain-market -> generate-farm-summary -> validate-site-health
```

- Single-pass Senior Analyst: `analyze-grain-market` — Grok 4.1 Fast with native `web_search` + `x_search` tools, pre-computed ratios, shipping calendar context
- Model: `grok-4-1-fast-reasoning` (xAI Responses API)
- Batch size: 1 grain per invocation (self-triggers for remaining), 50 users for farm summaries
- Version: `analyze-grain-market-v1`

### v1 (Legacy — Tracks 17/29)
```text
GET /api/cron/import-cgc -> validate-import -> search-x-intelligence -> analyze-market-data -> generate-intelligence -> generate-farm-summary -> validate-site-health
```

- Round 1: `analyze-market-data` — data-driven thesis, bull/bear cases, historical context
- Round 2: `generate-intelligence` — reviews/challenges with X signals and farmer sentiment
- Model: `grok-4-1-fast-reasoning` (xAI) for both rounds
- Batch sizes: 4 grains per invocation for analysis/intelligence, 50 users for farm summaries

## Database Tables

| Table | Rows (approx) | Purpose |
|-------|---------------|---------|
| `cgc_observations` | ~1.1M | Weekly grain statistics in long format (6 crop years: 2020-2026) |
| `grains` | 16 | Canadian grain types with slugs |
| `supply_disposition` | ~200 | AAFC balance sheet data per grain/year/source |
| `crop_plans` | varies | User crop plans with starting grain, live remaining inventory, and contract splits |
| `crop_plan_deliveries` | varies | Append-only farmer delivery ledger with idempotency keys and sale classification |
| `profiles` | varies | User profiles with farm metadata and role |
| `market_analysis` | ~16/week | Step 3.5 Flash data-driven thesis, bull/bear, historical context |
| `grain_intelligence` | ~16/week | AI-generated grain narratives and KPIs (Grok round 2) |
| `farm_summaries` | ~users/week | Per-user weekly AI farm summaries |
| `x_market_signals` | ~80/week | X/Twitter posts scored per grain/week |
| `validation_reports` | 1/import | Post-import anomaly detection results |
| `signal_feedback` | varies | Farmer relevance votes on X signals |
| `grain_sentiment_votes` | varies | Weekly haul/hold/neutral votes by grain |
| `cgc_imports` | 1/import | Audit log of data loads |
| `grain_monitor_snapshots` | 1/week | Government Grain Monitor: port throughput, vessel queues, OCT, storage capacity |
| `producer_car_allocations` | ~11/week | CGC Producer Cars: forward-looking rail allocations by grain/province/destination |
| `signal_scan_log` | ~3/day | Scan observability: mode, grains scanned, signals found, duration |
| `sentiment_history` | ~16/week | Archived weekly per-grain sentiment aggregates |
| `sentiment_daily_rollup` | ~16/day | Intra-week daily sentiment trajectory with delta tracking |
| `health_checks` | 1/pipeline | Post-pipeline site health validation results |
| `cftc_cot_positions` | ~9/week | CFTC Disaggregated COT: trader positioning per commodity per week, mapped to CGC grains |

## Key Views & RPC Functions

| Name | Type | Purpose |
|------|------|---------|
| `v_grain_yoy_comparison` | View | YoY metrics built from `v_country_producer_deliveries` plus terminal receipts/exports/stocks |
| `v_supply_pipeline` | View | Canonical AAFC balance sheet for the supply pipeline component |
| `v_supply_disposition_current` | View | Canonical latest supply-disposition row per grain/year |
| `v_signal_relevance_scores` | View | Blended relevance: 50% recency-adjusted AI + 40% farmer + 10% bonuses |
| `v_latest_import` | View | Data freshness check |
| `get_pipeline_velocity()` | RPC | Five pipeline metrics server-side, bypassing PostgREST row limits |
| `get_signals_with_feedback()` | RPC | X signal feed with current-user vote state |
| `get_signals_for_intelligence()` | RPC | Service-only X signals for intelligence generation |
| `calculate_delivery_percentiles()` | RPC | Percentile ranking over priced-progress pace by grain |
| `get_sentiment_overview()` | RPC | Per-grain sentiment aggregates for the overview banner |
| `get_delivery_analytics()` | RPC | Anonymized delivery + marketing-position stats with privacy threshold (>=5 farmers) |
| `get_historical_average()` | RPC | 5-year historical average/min/max/stddev for any grain/metric/worksheet |
| `get_seasonal_pattern()` | RPC | Weekly seasonal aggregates across multiple crop years |
| `get_week_percentile()` | RPC | Where current value sits in 5-year historical range |
| `get_logistics_snapshot()` | RPC | Grain Monitor + Producer Car data as structured JSON for Edge Functions |
| `snapshot_weekly_sentiment()` | RPC | Archives weekly per-grain sentiment aggregates to `sentiment_history` |
| `snapshot_daily_sentiment()` | RPC | Snapshots daily sentiment with delta tracking to `sentiment_daily_rollup` |
| `get_cot_positioning()` | RPC | Managed money and commercial net positions with spec/commercial divergence flag |
| `get_weekly_terminal_flow()` | RPC | Per-grain weekly terminal receipts, exports, and net flow |
| `get_aggregate_terminal_flow()` | RPC | Cross-grain aggregate terminal flow summary |
