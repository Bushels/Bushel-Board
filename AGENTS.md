# Bushel Board — Prairie Grain Market Intelligence Dashboard

## Project Overview
Bushel Board is a Next.js + Supabase dashboard that helps prairie farmers understand grain market flow, supply pressure, price context, and AI-generated market thesis work. Core users are AB, SK, and MB farmers.

## Collaboration Preferences
- The project owner is a non-coder. Explain technical work in plain language, roughly first-year computer science level.
- Define important jargon briefly the first time it matters.
- Connect system changes to farmer/product outcomes.
- Avoid assuming deep infrastructure, AI orchestration, or database knowledge.
- Raw knowledge books and derived distillation artifacts are local-only and must live outside the repo. Use `BUSHEL_KNOWLEDGE_HOME` or the default local user-profile path.
- Public-facing claims must be tight. Flag legal, factual, data-source, or reputation risk before publishing.

## Tech Stack
- Frontend: Next.js 16 App Router + TypeScript, deployed on Vercel.
- Backend: Supabase PostgreSQL, Auth, Edge Functions, and manual/Claude Desktop Routine triggers. Vercel crons are disabled for active pipeline automation.
- UI: shadcn/ui + Tailwind CSS using the custom wheat/canola/prairie palette.
- Charts: Recharts.
- Fonts: DM Sans body + Fraunces display.
- Supabase project: `ibgsloyjxdopkvwqcqwh`.

## Key Directories
- `app/` — Next.js App Router pages, layouts, route handlers, and server actions.
- `components/` — Reusable UI and dashboard components.
- `lib/` — Query helpers, auth helpers, utilities, and shared business logic.
- `scripts/` — Local import, audit, collector, and maintenance scripts.
- `supabase/` — Migrations, tests, and Edge Functions.
- `docs/plans/` — Design docs, implementation plans, and `STATUS.md`.
- `docs/reference/` — Data sources, collector configs, framework notes, and source maps.
- `docs/lessons-learned/` — Bug writeups and operational lessons.
- `docs/journal/` — Append-only month-rollup history (cleanup passes, structural changes).
- `.claude/agents/` — Claude Agent Desk definitions, approximately 38 agents.
- `.claude/skills/` — Project-specific skills only. Cross-cutting skills live in `~/.claude/skills/`.
- `data/CGC Weekly/` — CGC source/reference files and local import artifacts.
- `components/dashboard/wow-comparison.tsx` — Week-over-week comparison card and composite metric system.

## Truth Files (rules vs activity)
- `AGENTS.md` (this file) and `CLAUDE.md` — rules-only. Do NOT add status, phase, recent-changes, or session notes.
- `PROJECT_STATE.md` — current truth: last verified commit, active task, known blockers, next action.
- `docs/journal/YYYY-MM.md` — append-only history of structural changes and cleanup passes.
- `docs/plans/STATUS.md` — feature track ledger.

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
| qc-crawler | Post-deploy/import site verification and freshness checks | Lime | Inherit |
| Claude Agent Desk scouts/analysts | Canada and US weekly market desk swarm | Mixed | Haiku/Sonnet/Opus |

## Data Source
CGC weekly grain statistics CSV from grainscanada.gc.ca:
- Updates Thursday around 1 PM Mountain time.
- Schema: Crop Year, Grain Week, Week Ending Date, worksheet, metric, period, grain, grade, Region, Ktonnes.
- Covers 16 Canadian grain types, 12 worksheets, 19 metrics, and 27 regions.
- Stored in Supabase as long-format observations: one row per measurement.
- Key worksheets: Primary, Process, Terminal Receipts, Terminal Exports, Summary, Primary Shipment Distribution, Producer Cars.

## CGC Data Rules
- Exports: CGC Summary exports equal terminal exports plus direct export-destination flows, including relevant Producer Cars destination rows.
- Producer deliveries: use `Primary.Deliveries` for AB/SK/MB/BC with `grade=''`, plus `Process.Producer Deliveries` national with `grade=''`, plus `Producer Cars.Shipments` for AB/SK/MB with `grade=''`.
- Domestic disappearance is residual math, not a standalone CSV metric.
- Use FULL OUTER JOIN when combining worksheets that may not contain the same grains.
- Forward-fill cumulative crop-year series when worksheets report through different grain weeks; do not default missing cumulative values to zero.
- PostgREST silently truncates large result sets at 1,000 rows. Use server-side RPCs with `SUM()` and `GROUP BY` for large worksheet aggregates.
- Terminal Receipts and Terminal Exports do not have `grade=''` aggregate rows. Sum grades in SQL.
- For Primary, Process producer deliveries, and Producer Cars shipments, filter `grade=''` when the pre-aggregated total is required.

## Definition of Done
Every completed change must satisfy:
1. `npm run build` passes.
2. Relevant tests pass or the unrun test gap is stated clearly.
3. No browser console errors on affected pages.
4. User-facing UI changes are visually checked.
5. Data/RPC/Edge Function changes receive data-audit review.
6. Auth, RLS, grants, secrets, or role-boundary changes receive security review.
7. `docs/lessons-learned/issues.md` is updated for non-obvious bugs.
8. `docs/plans/STATUS.md` is updated when a feature track is completed.
9. Destructive changes are verified with search before deletion.
10. Production/deploy proof is separated from local proof.

## Critical Framework Patterns
Prefer retrieval-led reasoning over memory for Next.js, Supabase, Tailwind, and repo-specific behavior.

### Next.js 16
- `params` is a Promise: `const { slug } = await params;`.
- `cookies()` is async: `const cookieStore = await cookies();`.
- Server Components are default. Add `"use client"` only when browser state, effects, or event handlers are required.
- Client components cannot import server-only modules, including `@/lib/supabase/server`.

### Client/Server Boundary
- Split mixed logic into client-safe utilities and server-only query modules.
- Pattern: `foo-utils.ts` for types and pure functions; `foo.ts` for Supabase/server queries.
- Client components import from `-utils`; server code may import either.

### Supabase SSR
- Server client: `createServerClient()` with async cookie get/set from `next/headers`.
- Browser client: `createBrowserClient()` only inside client components.
- Middleware refreshes sessions with `supabase.auth.getUser()`.
- Never expose service-role keys to browser code.
- Enforce farmer-only writes in both server actions and RLS.
- User-scoped RPCs must derive identity from `auth.uid()`, not caller-supplied user IDs.

### Script Conventions
All scripts in `scripts/` must:
- Accept `--help`.
- Output machine-readable JSON to stdout when practical.
- Send diagnostics to stderr.
- Be idempotent.
- Pin or document external dependency versions.

## Cleanup And Git Guardrails
- Do not modify unrelated dirty files.
- Do not merge `CLAUDE.md` into this file. `CLAUDE.md` remains the comprehensive source of truth; this file is the short landing brief.
- On Windows/Git Bash, avoid case-only renames unless explicitly staged and verified.
- Do not ignore `.claude/agents/`; those agent definitions are project source.
- Folder-level ignore rules must be anchored at repo root with a leading `/`.
- Status, phase, plan-link bullets, and dated activity belong in `PROJECT_STATE.md` or `docs/journal/`, not in this file.
