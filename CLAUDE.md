# Bushel Board — Prairie Grain Market Intelligence Dashboard

## Project Overview
A Next.js + Supabase dashboard that auto-imports Canadian Grain Commission (CGC) weekly data and displays grain statistics for prairie farmers (AB, SK, MB). MVP phase: real data pipeline, grain dashboard, email/password auth.

## Current Status
**Phase:** MVP + Intelligence — data pipeline, AI narratives, dashboard all operational
**Design Doc:** `docs/plans/2026-03-04-bushel-board-mvp-design.md`
**Implementation Plans:**
- MVP: `docs/plans/2026-03-04-bushel-board-mvp-implementation.md` (15 tasks)
- Intelligence: `docs/plans/2026-03-06-grain-intelligence-implementation.md` (19 tasks, complete)

## Tech Stack
- **Frontend:** Next.js 16 (App Router) + TypeScript, deployed on Vercel
- **Backend:** Supabase (PostgreSQL, Auth, Edge Functions, pg_cron)
- **UI:** shadcn/ui + Tailwind CSS (custom wheat palette)
- **Charts:** Recharts
- **Fonts:** DM Sans (body) + Fraunces (display)
- **Supabase Project:** ibgsloyjxdopkvwqcqwh

## Key Directories
- `docs/plans/` — Design docs and implementation plans
- `.claude/agents/` — Agent definitions (8 agents)
- `data/` — Reference CGC CSV data (gsw-shg-en.csv, 118k rows)
- New project will be at: `../bushel-board-app/`

## Agent Team
| Agent | Role | Color | Model |
|-------|------|-------|-------|
| ultra-agent | Team lead, coordinator, quality authority | Red | Opus |
| innovation-agent | Research, trends, AI advancements | Cyan | Sonnet |
| ux-agent | User experience, psychology, gamification | Green | Sonnet |
| ui-agent | Visual design, animations, components | Magenta | Inherit |
| documentation-agent | Docs, handovers, lessons learned | Yellow | Haiku |
| db-architect | Database, Edge Functions, data pipeline | Blue | Inherit |
| frontend-dev | Next.js pages, React components | Green | Inherit |
| auth-engineer | Supabase Auth, middleware, security | Yellow | Inherit |

## Data Source
CGC weekly grain statistics CSV from grainscanada.gc.ca
- Updates every Thursday ~1pm MST
- Format: Crop Year, Grain Week, Week Ending Date, worksheet, metric, period, grain, grade, Region, Ktonnes
- 16 Canadian grain types, 12 worksheets, 19 metrics, 27 regions
- Stored in Supabase as long-format observations (one row per measurement)

## Design Tokens
- Background: wheat-50 (#f5f3ee) / wheat-900 (#2a261e) dark
- Primary: canola (#c17f24)
- Success: prairie (#437a22)
- Warning: amber (#d97706)
- Province AB: #2e6b9e, SK: #6d9e3a, MB: #b37d24
- Easing: cubic-bezier(0.16, 1, 0.3, 1)
- Animation stagger: 40ms between siblings

## Existing Prototype
The current directory contains a vanilla JS prototype built by Perplexity Computer. Use as visual reference only — do not copy code. All new work goes in `../bushel-board-app/`.

## Commands (after scaffold)
- `npm run dev` — Start dev server
- `npm run build` — Production build
- `npm run backfill` — Load historical CGC data into Supabase
- `npx supabase db push` — Apply migrations
- `npx supabase functions deploy <name>` — Deploy Edge Functions
- `npx @next/codemod@canary agents-md` — Generate AGENTS.md with Next.js 15 docs

## Intelligence Pipeline
- **Edge Functions:** `import-cgc-weekly` → `generate-intelligence` → `generate-farm-summary` (chain triggers)
- **Model:** `grok-4-1-fast-reasoning` via xAI Grok Responses API with `x_search` for real-time X/Twitter agriculture sentiment (~$0.04/weekly run)
- **Tables:** `grain_intelligence` (per-grain market analysis), `farm_summaries` (per-user weekly narratives + percentiles)
- **Function:** `calculate_delivery_percentiles()` — PERCENT_RANK over user deliveries by grain
- **Views:** `v_grain_yoy_comparison` (YoY metrics), `v_supply_pipeline` (AAFC balance sheet)
- **UI:** ThesisBanner, IntelligenceKpis, SupplyPipeline, InsightCards on grain detail pages; FarmSummaryCard + percentile badges on My Farm
- **Query layer:** `lib/queries/intelligence.ts` (getGrainIntelligence, getSupplyPipeline, getFarmSummary)

## Pipeline Monitoring
- Cron status: `SELECT * FROM cron.job WHERE jobname = 'cgc-weekly-import';`
- Import audit: `SELECT * FROM cgc_imports ORDER BY imported_at DESC LIMIT 5;`
- Data freshness: `SELECT * FROM v_latest_import;`
- Intelligence: `SELECT grain, grain_week, generated_at FROM grain_intelligence ORDER BY generated_at DESC LIMIT 5;`
- Farm summaries: `SELECT user_id, grain_week, generated_at FROM farm_summaries ORDER BY generated_at DESC LIMIT 5;`
- pg_net responses: `SELECT * FROM net._http_response ORDER BY created DESC LIMIT 5;`

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

### Script Conventions
All scripts in `scripts/` must: accept `--help`, output JSON to stdout, diagnostics to stderr, be idempotent, pin dependency versions.

## Reference Files
- `.claude/agents/AGENTS.md` — Detailed framework patterns, Supabase code samples, design tokens, CGC schema
- `docs/plans/2026-03-04-bushel-board-mvp-design.md` — Approved MVP design
- `docs/plans/2026-03-04-bushel-board-mvp-implementation.md` — 15-task MVP implementation plan
- `docs/plans/2026-03-06-grain-intelligence-design.md` — Intelligence feature design doc
- `docs/plans/2026-03-06-grain-intelligence-implementation.md` — 19-task intelligence plan (complete)
