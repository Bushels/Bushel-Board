# Bushel Board + Bushels

**Prairie grain market intelligence for Canadian farmers.**

Two apps, one backend:

- **Bushels** — a chat-first iOS app (and web app at `/chat`) where farmers talk to Bushy, a conversational grain analyst. Ask about your grain, local prices, or anything farming.
- **Bushel Board** — the web dashboard for grain market intelligence. Supply pipelines, AI analysis, community sentiment, and delivery tracking.

Both share the same Supabase backend (PostgreSQL, Auth, Edge Functions).

## What We're Building

Helping prairie farmers (AB, SK, MB) answer: *"Should I haul or hold my grain this week?"*

| Layer | What It Does | Status |
|-------|-------------|--------|
| **Data Pipeline** | Auto-imports weekly CGC grain statistics (deliveries, exports, stocks) for 16 Canadian grains | Built. Auto-import paused while we refine the AI model. |
| **AI Analysis** | Grok 4.20 Reasoning analyzes each grain — bull/bear thesis, stance score, actionable recommendations | Built. Tuning quality (debate rules, commodity knowledge injection). |
| **Visualizations** | Supply pipeline, YoY delivery gaps, terminal flow, CFTC positioning, price sparklines | Built. Ongoing polish. |
| **My Farm** | Personalized summaries, delivery tracking, percentile comparisons, contract progress | Built. Actively improving. |
| **Social Signals** | Aggregates X/Twitter market chatter, scored by AI + farmer votes for relevance | Built. Signal quality filtering needs work. |
| **Bushy Chat** | Chat with Bushy about your grain, local prices, or anything farming. Available at /chat (web) and iOS app. | Built. Alpha testing. |

## Feature Completion Log

Compressed snapshots of what's been delivered, most recent first.

| # | Feature | Last Worked | Snapshot |
|---|---------|-------------|---------|
| 39 | Unified Pricing Board | 2026-04-14 | Single posted_prices table. Operators post daily prices via chat. Farmers query conversationally. Demand analytics feedback loop. |
| 38 | Operational Feedback Loop | 2026-04-14 | Design doc. feedback_log with user_role for farmer vs operator filtering. |
| 37 | Web Alpha — Bushy Chat | 2026-04-14 | Full chat at /chat. SSE streaming, 10 tools, trust footer, verification prompts, source tags. |
| 36 | Chat-First iOS Pivot | 2026-04-14 | Bushels iOS app design + skeleton. Bushy persona. Chat-architect agent. LLM adapter. |
| 35 | US Thesis Lane + Hermes | 2026-04-11 | USDA export sales/WASDE/crop progress tables. Score trajectory. Hermes pipeline design. |
| 34 | Grok 4.20 + Parallel Debate | 2026-03-21 | Upgraded to grok-4.20-reasoning. Parallel Grok+Claude analysis with divergence debate (>15 pts). Viking L0/L1 injected into both models. 72 web/X searches, 10 debate rounds, Gemini QC validated. |
| 33 | Viking Knowledge System | 2026-03-19 | Replaced flat 7K-token static blob (3 books) with tiered L0/L1/L2 architecture (all 8 books, ~2K tokens). L0: always-loaded analyst worldview. L1: 7 topic summaries loaded by intent detection. L2: existing PostgreSQL full-text search. Zero extra LLM calls at query time. |
| 32 | Live Grain Futures Prices | 2026-03-18 | Yahoo Finance import for Wheat/Corn/Oats/Soybeans. Canola + Spring Wheat unavailable — need Barchart API. |
| 31 | Pipeline v2: Senior Analyst | 2026-03-17 | Single-pass Grok with native web/x search replaces dual-LLM chain. Pre-computed ratios, shipping calendar, research tiers. 27 tests. |
| 30 | Stance Spectrum Meter | 2026-03-16 | Gradient bar (bullish-to-bearish) driven by stance_score. Semicircle confidence gauge on recommendations. |
| 29 | Unified Grok 4.1 Fast | 2026-03-16 | All AI migrated to grok-4-1-fast-reasoning via xAI API. Full 16-grain pipeline re-run. |
| 28 | Terminal Net Flow | 2026-03-16 | Diverging bar chart: weekly receipts vs exports with net flow. Overview banner with sparkline. |
| 27 | Delivery Pace Chart | 2026-03-15 | Dual Y-axis YoY cumulative gap. Pure utility + 5 tests. |
| 23-26 | Dashboard Redesign V2 (4 waves) | 2026-03-14 | AAFC baseline update, grain page restructured into decision tool, engagement voting, crush utilization gauge, price sparklines, processor self-sufficiency. |
| 20-21 | CFTC COT + Dashboard Overhaul | 2026-03-13 | Glassmorphism design system. COT positioning, logistics card, flow donut, recommendation cards (HAUL/HOLD/PRICE/WATCH). |
| 18-19 | Supplementary Data + Debate Rules | 2026-03-13 | Port throughput, vessel queues, rail allocations injected into AI. 11 codified debate rules. |
| 17 | Dual-LLM Pipeline (v1) | 2026-03-12 | Step 3.5 Flash + Grok debate. Superseded by Track 31. |
| 14-16 | Engagement + UX Redesign | 2026-03-11 | Sentiment polls, observer role, 3-section page structure, onboarding flow. |
| 8-13 | Intelligence + Farm + Landing | 2026-03-11 | X signal feed, per-user AI summaries, crop plans, delivery tracking, prairie landing page. |
| 1-7 | Foundation | 2026-03-08 | CGC pipeline, schema, grain dashboard, auth, AAFC supply data, WoW comparisons. |

## Current Focus Areas

- **Chat Alpha** — Bushy chat live at /chat. Testing end-to-end conversation quality.
- **Unified Pricing Board** — Operators post daily prices, farmers query conversationally. Implementation plan ready (Track 39).
- **iOS App** — Bushels iOS app designed, Xcode skeleton built. Pending Mac transition for development.
- **AI Model Quality** — Grok 4.20 with Viking knowledge system. Parallel debate architecture.

## Session Work Log

Compressed snapshots of what was done in each working session, most recent first.

| Date | Session Focus | What Was Done |
|------|--------------|---------------|
| 2026-03-19 | Viking Knowledge Architecture | Audited knowledge retrieval against OpenViking L0/L1/L2 model. Consulted Gemini on architecture (deterministic tiered context won over full agentic RAG for our 200-chunk corpus). Built complete Viking system: L0 unified knowledge card from all 8 books (~420 tokens), L1 cross-book topic summaries for 6 domains (~750 tokens each, loaded by regex intent detection), L2 preserved existing PostgreSQL RPC. Wired into both Edge Function pipeline (analyze-grain-market) and advisor chat (context-builder). Replaced 7K static blob from 3 books with ~2K dynamic context from all 8 books. Fixed distillation attribution (Gemini, not Step 3.5 Flash). Build clean. |
| 2026-03-18 | Yahoo Finance Prices | Track #32. Built grain futures price import from Yahoo Finance. Wheat/Corn/Oats/Soybeans/HRW working. Canola + Spring Wheat unavailable on Yahoo — need Barchart API for Phase B. |
| 2026-03-17 | Pipeline v2 + Crons Disabled | Track #31. Replaced dual-LLM chain with single-pass Senior Analyst (Grok 4.1 Fast with native web_search + x_search). Pre-computed analyst ratios, shipping calendar, research tiers by grain importance. 27 tests. Disabled all Vercel crons — pipeline now manual-only while AI quality is refined. |
| 2026-03-16 | Stance Meter + Terminal Flow + Knowledge Distillation | Tracks #28-30. Diverging bar chart for terminal net flow. Stance spectrum gradient bar. Unified all AI to grok-4-1-fast-reasoning. Distilled 8 books via Gemini into L0/L1/L2 knowledge corpus (~232 packets across 6 fully-distilled books). |
| 2026-03-15 | Delivery Pace + Advisor Design | Track #27. Dual Y-axis YoY cumulative delivery gap chart. Kitchen Table Advisor chat designed (not yet built). |
| 2026-03-14 | Dashboard Redesign V2 | Tracks #23-26 (4 waves). AAFC baseline update, grain page restructured as decision tool, engagement voting, crush utilization gauge, price sparklines, processor self-sufficiency. AI audit identified critical bugs (GEO_SCOPE, max_output_tokens). |
| 2026-03-13 | CFTC COT + Dashboard Overhaul + Debate Rules | Tracks #18-21. Glassmorphism design system. COT positioning cards, logistics card, flow donut, recommendation cards. Port throughput, vessel queues, rail allocations injected into AI. 11 codified debate rules for Grok pipeline. |
| 2026-03-12 | Dual-LLM Pipeline | Track #17. Step 3.5 Flash + Grok debate architecture. 9 bugs shipped — led to mandatory agent verification gates (gates 3-6 in CLAUDE.md). Superseded by Track #31. |
| 2026-03-11 | Engagement + UX + Intelligence | Tracks #8-16. Sentiment polls, observer role, 3-section page structure, X signal feed, per-user AI summaries, crop plans, delivery tracking, prairie landing page, onboarding flow. |
| 2026-03-08 | Foundation | Tracks #1-7. CGC data pipeline, database schema, grain dashboard, Supabase auth, AAFC supply data, week-over-week composite comparisons. |

## Tech Stack

- **Frontend:** Next.js 16 (App Router) + TypeScript, deployed on Vercel
- **Backend:** Supabase (PostgreSQL, Auth, Edge Functions)
- **UI:** shadcn/ui + Tailwind CSS (custom wheat palette)
- **Charts:** Recharts
- **Fonts:** DM Sans (body) + Fraunces (display)
- **AI:** Grok 4.20 Reasoning via xAI Responses API

## Getting Started

### Prerequisites

- Node.js 20+
- A Supabase project (free tier works)

### Environment Setup

Create `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

For the intelligence pipeline (Edge Function secrets):

```bash
npx supabase secrets set XAI_API_KEY=xai-your-key
```

### Install & Run

```bash
npm install
npx supabase db push          # Apply database migrations
npm run backfill              # Load CGC historical data (~1.1M rows)
npm run seed-supply           # Seed AAFC supply/disposition data
npm run dev                   # Start dev server at localhost:3001
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run test` | Run tests |
| `npm run backfill` | Load historical CGC CSV data into Supabase |
| `npm run seed-supply` | Seed AAFC supply/disposition balance sheets |
| `npm run seed-capacity` | Seed processor capacity reference data |
| `npm run import-prices` | Fetch daily grain futures from Yahoo Finance |
| `npm run audit-data` | Run CGC data audit (Excel ↔ CSV ↔ Supabase) |

## Data Sources

- **CGC Weekly Grain Statistics:** Updated every Thursday ~1pm MST from grainscanada.gc.ca
- **AAFC Crop Outlook:** Annual supply/disposition balance sheets from Agriculture Canada
- **CFTC COT Reports:** Managed money + commercial positioning for grain futures
- **Yahoo Finance:** Daily futures settlement prices (Wheat, Corn, Oats, Soybeans, HRW Wheat)
- **X/Twitter:** Market chatter scored for relevance by AI + farmer votes

## Project Structure

```
app/
  (auth)/               # Login, signup, password reset
  (dashboard)/          # Protected pages
    overview/           # Main dashboard with charts
    grain/[slug]/       # Individual grain detail + AI analysis
    my-farm/            # Personal crop & delivery tracking
  api/cron/             # Pipeline trigger endpoints (manual-only)
components/
  dashboard/            # Charts, cards, intelligence UI
  ui/                   # Glass cards, badges, tooltips (shadcn/ui)
lib/
  knowledge/            # Viking tiered knowledge (L0/L1/L2 retrieval)
  queries/              # Server-side Supabase query modules
  utils/                # Crop year, delivery gap, recommendations
  advisor/              # Grok advisor chat client
supabase/
  functions/            # Edge Functions (AI pipeline, imports)
  migrations/           # Database schema
docs/
  plans/                # Design docs + STATUS.md tracker
  lessons-learned/      # Bug writeups, data issues
  reference/            # CGC data map, debate rules
```

## License

Private — not yet licensed for distribution.

---
*Last updated: 2026-04-14*
