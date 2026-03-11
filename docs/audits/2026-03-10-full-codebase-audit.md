# Bushel Board — Full Codebase Audit

**Date:** March 10, 2026
**Auditor:** Claude Opus 4.6
**Scope:** Full application audit — architecture, frontend, backend, security, data pipeline, documentation, and latest updates

---

## Overall Rating: B+ (Strong MVP, Production-Ready Foundation)

This is an impressive vibe-coded project, Kyle. For something that's been built iteratively over ~7 days, the architecture is surprisingly mature. The latest round of security hardening and documentation updates shows real growth from "make it work" to "make it right." A few areas hold it back from an A — mainly test coverage and some frontend patterns that will bite as the user base grows.

---

## 1. Architecture & Project Structure — A-

**What's working well:**

The project structure is clean and intuitive. The separation between `app/` routes, `components/` (66 files across dashboard/layout/motion/ui), `lib/` (queries, auth, utils), and `supabase/` (functions, migrations) follows Next.js 16 conventions correctly. The `docs/` folder with `plans/`, `architecture/`, `lessons-learned/`, and `audits/` subfolders is unusually well-organized for a project this young.

The tech stack choices are solid and cohesive: Next.js 16 App Router with Server Components as the default, `@supabase/ssr` (not the deprecated auth helpers), Recharts for charting, Framer Motion for animations, Zod for validation. Dependencies are modern — React 19.2, Next 16.1, Tailwind v4, Vitest 4.

**Key strengths:**

- Server Components by default, `"use client"` only where needed (motion components, interactive forms)
- Parallel data fetching via `Promise.all()` on every page — no waterfall loads
- `params` correctly handled as Promises (Next.js 16 pattern)
- Clean route grouping: `(auth)` for login flows, `(dashboard)` for protected pages
- Middleware properly excludes cron routes and static assets

**Minor concerns:**

- The grain detail page fetches 11 parallel queries, then does a second round of 4 more. This could be consolidated — though the Promise.all pattern keeps it fast
- `revalidate = 3600` on the overview page is a reasonable cache, but there's no manual revalidation hook after imports complete

---

## 2. Data Pipeline — A

This is the crown jewel of the project. The 5-function Edge Function chain (`import → validate → search-x → generate-intelligence → generate-farm-summary`) is well-architected.

**Highlights:**

- Vercel cron as the single public ingress, running every Thursday at 8pm UTC (matching CGC's ~1pm MST Thursday releases)
- Internal functions use `verify_jwt = false` + shared `BUSHEL_INTERNAL_FUNCTION_SECRET` — the correct pattern for function-to-function chaining
- Batch processing (4 grains per invocation for search + intelligence, 50 users for farm summaries) prevents timeout issues
- The `get_pipeline_velocity()` RPC elegantly solves the PostgREST 1000-row truncation problem — server-side `SUM() GROUP BY` returns ~30 rows instead of 3,648+
- CSV is fetched from CGC by the Vercel route (where IPs aren't blocked), then forwarded to Supabase — smart workaround

**The `internal-auth.ts` shared module** is clean: method check, secret validation, helper to build outbound headers. No unnecessary complexity.

**38 migrations** tell a story of iterative, well-ordered schema evolution. The latest hardening migration (388 lines) is the most substantial single migration and correctly: unschedules legacy pg_cron, creates `is_farmer()` helper, replaces user-scoped policies with farmer-scoped ones, fixes RPCs to derive identity from `auth.uid()`, and rebuilds `v_supply_pipeline` with ranked source selection.

---

## 3. Security Posture — A- (Major Improvement in Latest Updates)

The March 10-11 security hardening was a meaningful level-up. Before these changes, the app had three real vulnerabilities. All three are now addressed:

**Fixed — Internal Pipeline Was Public-by-Default:**
Edge Functions chained via anon JWT, meaning anyone who knew the function URLs could trigger the intelligence pipeline. Now locked behind `BUSHEL_INTERNAL_FUNCTION_SECRET` with the Vercel cron route as the only entry point. Legacy `pg_cron` job is explicitly unscheduled in a migration — drift detection is documented.

**Fixed — UI-Only Role Gating:**
Observer accounts could bypass the UI and call server actions directly to mutate crop plans, deliveries, and votes. Now enforced at three layers: server actions check `getAuthenticatedUserContext()`, RLS policies call `is_farmer(auth.uid())`, and missing profiles default to observer (deny-by-default).

**Fixed — User-Supplied IDs in RPCs:**
`get_signals_with_feedback()` previously accepted a caller-supplied user ID parameter. Now derives identity from `auth.uid()` inside the function. `get_signals_for_intelligence()` is properly locked to `service_role` only.

**What's good:**

- `is_farmer()` is `SECURITY DEFINER` with `SET search_path = public` — correct pattern
- Service-only RPCs (`calculate_delivery_percentiles`, `get_signals_for_intelligence`) revoke from PUBLIC, anon, AND authenticated
- `get_delivery_analytics()` has a privacy threshold (≥5 farmers) to prevent de-anonymization
- The `security-guardrails.md` doc is a real guardrail — it captures the *why* behind each rule

**Remaining considerations:**

- No rate limiting on server actions (sentiment votes, delivery logging). A motivated user could spam votes
- The crop plan `logDelivery` action appends to a JSONB array — no server-side deduplication check. If a form submits twice, you get duplicate deliveries
- No audit trail for who changed what in crop plans (the JSONB `deliveries` array is overwritten wholesale)

---

## 4. Frontend & UI — B+

**66 component files** is a healthy component library for an MVP. The separation into `dashboard/`, `layout/`, `motion/`, and `ui/` directories is clean.

**Strengths:**

- Custom design system with wheat palette, Fraunces display font, and prairie-themed tokens — gives the app real identity
- Animation system (Framer Motion) with `AnimatedCard`, `StaggerGroup`, `CountUp`, `MicroCelebration`, and `PageTransition` — thoughtful UX
- The `GrainLockedView` pattern (unlock via My Farm) creates a natural engagement loop
- Overview page personalizes to user's unlocked grains with intelligent fallbacks
- Signal tape, sentiment banner, and market pulse cards create information density without overwhelm

**Concerns:**

- The grain detail page is ~316 lines of server component with inline data massaging. The `correctedKpiData` override logic (lines 101-114) patches AI-generated KPIs with actual view data — this works but is fragile. If the view schema changes, this silent override could produce wrong numbers without any error
- Several components mix data transformation with rendering. The `MarketPulseSection` in the overview page derives sentiment from insight signals inline — this logic should live in a utility
- No error boundaries visible except a single `error-boundary.tsx` — individual sections that fail (e.g., sentiment API down) would crash the entire page
- The prairie scene (5 files: hills, noise, particles, sky, wheat) is a cool creative touch, but heavy for a data dashboard landing page

---

## 5. Query Layer & Data Integrity — A-

The `lib/queries/` directory (10 files) is well-organized by domain: grains, observations, intelligence, x-signals, sentiment, delivery-analytics, crop-plans, community, supply-disposition.

**Strengths:**

- The `getCumulativeTimeSeries()` function correctly uses the `get_pipeline_velocity` RPC to bypass PostgREST's 1000-row ceiling
- Forward-fill logic for cumulative series handles the CGC's staggered worksheet reporting
- `Number()` coercion on Postgres `numeric` types (which PostgREST returns as strings) is applied consistently
- The composite metric system in `wow-comparison.tsx` is well-documented
- `getGrainOverviewBySlug` correctly combines Primary + Process deliveries — matching the CGC's own "Exports" definition

**One concern:**

- Supply disposition query uses client-side `.select()` — should be fine for ~200 rows, but the pattern doesn't match the RPC-first approach used elsewhere

---

## 6. Testing — C

This is the weakest area. **7 test files** with mostly unit-level coverage:

- `crop-plan.test.ts` (57 lines) — delivery pace math
- `crop-year.test.ts` / `crop-year-util.test.ts` — date utilities
- `format.test.ts` — number formatting
- `validation.test.ts` — form validation
- `supply-disposition.test.ts` — data queries
- `setup.ts` — test boilerplate

**What's missing:**

- No integration tests for server actions (the security-critical path)
- No tests for the Edge Function chain or internal auth module
- No tests for RPC functions or the migration logic
- No component tests (despite `@testing-library/react` being installed)
- No E2E tests at all

For a vibe-coded MVP this is understandable, but the delivery pace math bug (remaining inventory vs. plan volume) that was caught and fixed would have been caught earlier with property-based tests on the crop-plan utilities. The security fixes (role enforcement in server actions) are exactly the kind of thing that regression tests should lock down.

---

## 7. Documentation — A

This is unusually strong. The documentation ecosystem includes:

- **CLAUDE.md** (project root) — comprehensive single-source-of-truth with tech stack, data nuances, monitoring queries, design tokens, intelligence pipeline, and critical patterns
- **9 agent definitions** in `.claude/agents/` — each with clear responsibilities, required checks, and domain-specific watchouts
- **STATUS.md** — 14-track feature completion tracker with key files per feature
- **Architecture docs** — `data-pipeline.md` and `security-guardrails.md` (both new as of this update)
- **Lessons learned** — `issues.md` with 4 detailed bug writeups (symptom → root cause → solution → prevention → files modified → tags)
- **14 design + implementation plan pairs** in `docs/plans/`

**The security-auditor agent definition** is particularly good. It codifies the exact checks that caught the three vulnerabilities fixed in this update. The "Bushel-Specific Watchouts" section prevents the team from making the same category of mistake again.

**The data-pipeline.md** document is a proper runbook: data flow diagram, auth model, scheduling details, monitoring queries, drift checks, and troubleshooting playbook.

---

## 8. Latest Updates Commentary

The March 10-11 batch is the most significant quality improvement since the initial MVP:

**Security hardening migration** (`20260311110000`) — 388 lines of careful SQL that touches the three most sensitive areas: pipeline ingress, write authorization, and RPC signatures. The migration is idempotent (checks for existence before unscheduling pg_cron), uses `DROP POLICY IF EXISTS` before recreating, and handles the function signature change for `get_signals_with_feedback` cleanly.

**The issues.md entries** are excellent. The PostgREST truncation bug writeup explains *why* `.limit(10000)` doesn't work (server `max_rows` is a ceiling, not a floor) and provides a clear prevention rule: "If a query could exceed ~500 rows, prefer a server-side RPC with GROUP BY." This is institutional knowledge that prevents the same class of bug from recurring.

**The security-auditor agent** is a good addition to the agent team. Its checklist-style "Required Checks" section means future changes to auth, RLS, or RPCs will be reviewed against a consistent standard.

**One note on STATUS.md:** The Intelligence Pipeline section still says "Trigger: pg_cron every Thursday 1:30pm MST" — this should be updated to reflect the Vercel cron trigger, since the pg_cron job was explicitly unscheduled in the hardening migration.

---

## Recommendations (Priority Order)

1. **Add server action tests** — Lock down the role enforcement in `my-farm/actions.ts` and `grain/[slug]/signal-actions.ts` with tests that verify observer accounts get rejected. This is the highest-risk regression surface.

2. **Add delivery deduplication** — The `logDelivery` action appends to a JSONB array with no idempotency check. Add a dedup key (e.g., `date + grain + amount_kt`) or at minimum a last-write timestamp.

3. **Update STATUS.md** — The pipeline trigger reference is stale (says pg_cron, should say Vercel cron).

4. **Consider rate limiting** — Even a simple in-memory counter on sentiment votes and signal feedback would prevent spam. Supabase has no built-in rate limiting, but a Redis sidecar or Vercel Edge Middleware check would work.

5. **Add error boundaries per section** — The grain detail page loads 15 parallel queries. If any one fails, the entire page crashes. Wrap each section (`IntelligenceKpis`, `XSignalFeed`, `SupplyPipeline`, etc.) in its own error boundary with a graceful fallback.

---

## Score Summary

| Section | Grade | Weight | Notes |
|---------|-------|--------|-------|
| Architecture & Structure | A- | 15% | Clean, modern, well-organized |
| Data Pipeline | A | 20% | Robust chain, correct auth, smart RPC solutions |
| Security | A- | 20% | Major hardening in latest update, 3 real vulns fixed |
| Frontend & UI | B+ | 15% | Strong design system, some data-mixing in components |
| Query Layer | A- | 10% | Correct CGC nuances, PostgREST awareness |
| Testing | C | 10% | Minimal coverage, no integration or E2E tests |
| Documentation | A | 10% | Exceptionally thorough for a project this age |

**Weighted Overall: B+ / 85%**

The project punches above its weight for a week-old vibe-coded MVP. The data pipeline and documentation are near-professional quality. The security hardening shows the team is learning from mistakes and codifying prevention. Testing is the clear gap — but for a prairie grain dashboard with a small initial user base, the risk is manageable if addressed before scaling.
