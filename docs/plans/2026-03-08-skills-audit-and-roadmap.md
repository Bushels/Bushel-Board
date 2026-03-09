# Bushel Board: Skills Audit & Improvement Roadmap

**Date:** March 8, 2026
**Based on:** Anthropic's Complete Guide to Building Skills for Claude + Full App Audit

---

## Part 1: App Audit Summary

### What's Working Well (7.4/10 Overall)

Your Bushel Board app has a solid foundation. The architecture is clean — Next.js 16 App Router with server components for data-heavy pages, client components only where interactivity is needed. The Supabase setup is well-organized with 18 migrations, proper RLS policies, and a nice automated data pipeline using pg_cron + Edge Functions. The component library (24 dashboard components + 13 shadcn/ui primitives) is well-separated, and your prairie/wheat design system gives it real character.

**Strongest areas:** Architecture (9/10), Database Design (9/10), Tech Stack (9/10)

### Critical Issues Found

**Build Blockers:**
- Missing `@/components/ui/progress` component breaks production builds
- Fix: `npx shadcn-ui@latest add progress`

**React Anti-Patterns (Will Cause Bugs):**
- `pace-chart.tsx` lines 41-66: `CustomTooltip` defined inside render — causes state reset on every re-render
- `waterfall-chart.tsx` lines 78-93: Same issue
- `gamified-grain-chart.tsx` line 57: Variable reassignment after render violates immutability
- Fix: Move tooltip components to module level, use `useState` for mutable values

**ESLint Errors (10 errors, 1 warning):**
- 5 explicit `any` types (disposition-bar, pace-chart, Edge Function)
- Unescaped HTML entity in my-farm/page.tsx
- Unused `slug` variable in grain/[slug]/page.tsx

**Security Gaps:**
- Minimum password length: 6 (should be 8+)
- No email verification on signup
- No CAPTCHA configured

### Weakest Areas

| Area | Rating | Gap |
|------|--------|-----|
| Testing | 4/10 | Only utility tests — no component, integration, or e2e tests |
| Code Quality | 6/10 | ESLint errors, build failures, chart anti-patterns |
| Documentation | 7/10 | Good arch docs but no API docs, no skills |
| Auth | 7/10 | Functional but weak password/verification settings |

### What's Missing Entirely

- **No custom skills** — zero `.skill` folders anywhere in the project
- No error tracking (Sentry, etc.)
- No analytics (Posthog, Mixpanel)
- No structured logging
- No caching layer for expensive queries
- No Suspense boundaries for data loading

---

## Part 2: Skills Guide Key Takeaways

The Anthropic guide identifies three skill categories and five patterns. Here's what matters for Bushel Board:

### The Three-Level Progressive Disclosure Model

1. **Level 1 — YAML Frontmatter:** Always loaded in system prompt. Must be tight — name (kebab-case), description (WHAT + WHEN + trigger phrases, under 1024 chars)
2. **Level 2 — SKILL.md Body:** Only loaded when Claude thinks the skill is relevant. Full instructions, step-by-step workflows
3. **Level 3 — Linked Files:** References/, scripts/, assets/ — Claude navigates on demand

### Five Skill Patterns (Ranked by Relevance to Bushel Board)

1. **Domain-Specific Intelligence** — Most relevant. Your app is ALL about Canadian grain market domain knowledge
2. **Sequential Workflow Orchestration** — For multi-step dev workflows (data pipeline, deployment)
3. **Iterative Refinement** — For building/testing components and charts
4. **Context-Aware Tool Selection** — For choosing the right approach based on what's being worked on
5. **Multi-MCP Coordination** — Less relevant now, but useful if you add Supabase MCP or similar

### Critical Rules from the Guide

- SKILL.md must be exactly that name (case-sensitive)
- Folder names: kebab-case only (no spaces, capitals, underscores)
- No README.md inside skill folders
- No XML angle brackets in frontmatter
- Keep SKILL.md under 5,000 words; move details to references/
- Description must include WHAT it does + WHEN to use it + trigger phrases
- Be specific and actionable in instructions, not vague
- Include error handling and examples
- Add negative triggers to prevent over-triggering

---

## Part 3: Recommended Skills to Build

Based on the audit findings + skills guide patterns, here are the skills that would have the most impact on your development workflow. Ordered by priority.

### Skill 1: `bushel-board-dev` (Workflow Automation)

**Purpose:** Teach Claude your app's architecture, conventions, and how to work on it effectively.

**Why this is #1:** Every time you start a new Cowork session, you're re-explaining the same context — your file structure, naming conventions, data flow patterns, etc. This skill embeds that knowledge permanently.

```
Use Case: Development workflow for Bushel Board
Trigger: User says "add a new chart", "create a component", "fix a bug in bushel board"
Steps:
1. Know the project structure (app/, components/, lib/)
2. Follow existing patterns (server components for data, client for interactivity)
3. Use proper TypeScript types and Supabase query patterns
4. Run linting and tests after changes
Result: Consistent, pattern-following code every time
```

**Folder structure:**
```
bushel-board-dev/
  SKILL.md                    # Core dev workflow instructions
  references/
    architecture.md           # Copy of docs/architecture/data-pipeline.md
    component-patterns.md     # How dashboard components are structured
    database-schema.md        # Tables, views, RLS policies
    supabase-queries.md       # Query function patterns from lib/queries/
    style-guide.md            # Tailwind classes, color palette, fonts
```

**Key instructions to include:**
- Server component pattern for data fetching (revalidate, ISR)
- Client component pattern with "use client" directive
- Supabase query pattern (createClient → auth check → query → type return)
- Server action pattern (Zod validation → auth → upsert → revalidatePath)
- Chart component pattern (Recharts with custom tooltips at MODULE level)
- Never define components inside render functions
- Always use `WidthType.DXA` for any table widths
- Grain color palette from `lib/utils/grain-colors.ts`

### Skill 2: `cgc-data-pipeline` (Domain Intelligence + Workflow)

**Purpose:** Encode your CGC data pipeline knowledge so Claude can manage, debug, and extend it.

**Why:** Your data pipeline is the backbone of the app — pg_cron scheduling, Edge Functions, CSV parsing, the whole flow. Every time something breaks on Thursday afternoon, you need to re-explain how it all works.

```
Use Case: CGC data pipeline management
Trigger: User says "data isn't updating", "run the import", "add a new grain metric"
Steps:
1. Check pg_cron job status
2. Verify Edge Function health
3. Query cgc_imports audit log
4. Diagnose and fix issues
Result: Pipeline issues diagnosed and resolved without re-explaining architecture
```

**Folder structure:**
```
cgc-data-pipeline/
  SKILL.md                    # Pipeline workflow + troubleshooting
  references/
    pipeline-architecture.md  # The full data flow diagram
    monitoring-queries.md     # SQL queries for checking health
    csv-parser-spec.md        # How CGC CSV format works
    edge-function-api.md      # Edge Function parameters and responses
  scripts/
    check-pipeline.sh         # Quick health check script
```

### Skill 3: `grain-intelligence` (Domain Intelligence)

**Purpose:** Embed Canadian grain market domain knowledge — crop years, grain types, market terminology, AAFC balance sheet structure.

**Why:** This is the "secret sauce" that makes your app useful. When you ask Claude to build a new feature or write copy, it needs to understand things like "crop year runs Aug 1 - Jul 31", "carry-out is ending stocks", "primary elevators are country elevators near farms".

```
Use Case: Grain market domain expertise
Trigger: User mentions grain types, crop years, supply/disposition, CGC terminology
Steps:
1. Apply correct domain terminology
2. Use proper crop year format (2025-26, starting Aug 1)
3. Understand supply chain flow (production → deliveries → processing/export → carry-out)
4. Know the 16 grain types and their slugs
Result: Domain-accurate features, copy, and analysis
```

**Folder structure:**
```
grain-intelligence/
  SKILL.md                    # Core grain market knowledge
  references/
    grain-types.md            # All 16 grains with slugs and display order
    supply-chain.md           # Production → delivery → disposition flow
    cgc-terminology.md        # Worksheet names, metric definitions
    crop-year-rules.md        # Aug 1 start, format conventions
    provincial-context.md     # AB/SK/MB regional differences
```

### Skill 4: `bushel-board-testing` (Workflow Automation)

**Purpose:** Since testing is your weakest area (4/10), create a skill that makes it easy to write and run proper tests.

```
Use Case: Writing tests for Bushel Board
Trigger: User says "add tests", "test this component", "write test for"
Steps:
1. Determine test type (unit, component, integration)
2. Set up proper mocks (Supabase client, auth)
3. Follow existing test patterns (Vitest + Testing Library)
4. Run tests and verify passing
Result: Consistent, well-structured tests that actually catch bugs
```

### Skill 5: `bushel-board-deploy` (Sequential Workflow)

**Purpose:** Standardize the build → lint → test → deploy workflow.

```
Use Case: Deploying Bushel Board
Trigger: User says "deploy", "push to production", "ship it"
Steps:
1. Run ESLint and fix errors
2. Run test suite
3. Run production build
4. Verify no type errors
5. Deploy to Vercel
Result: Clean, verified deployments every time
```

---

## Part 4: Priority Action Items

### Immediate (Do This Week)

1. **Fix the build** — `npx shadcn-ui@latest add progress` to unblock production builds
2. **Fix chart anti-patterns** — Move CustomTooltip out of render in pace-chart.tsx and waterfall-chart.tsx
3. **Build `bushel-board-dev` skill** — Highest ROI; every future session benefits
4. **Fix ESLint errors** — Clean up the 10 errors blocking code quality

### Short Term (Next 2 Weeks)

5. **Build `cgc-data-pipeline` skill** — Pipeline runs every Thursday, you want this before next import
6. **Build `grain-intelligence` skill** — Domain knowledge gets reused constantly
7. **Increase password minimum** to 8+ characters in supabase/config.toml
8. **Enable email verification** on signup
9. **Add component tests** for at least the main dashboard charts

### Medium Term (Next Month)

10. **Build `bushel-board-testing` skill** — Once you have patterns, encode them
11. **Build `bushel-board-deploy` skill** — Standardize your ship workflow
12. **Add Sentry** for production error tracking
13. **Add caching layer** for expensive aggregation queries
14. **Add Suspense boundaries** for better loading states

---

## Part 5: Sample Skill — `bushel-board-dev` SKILL.md

Here's what the first skill would look like, following the guide's best practices:

```markdown
---
name: bushel-board-dev
description: Development workflow for the Bushel Board grain market dashboard. Enforces Next.js 16 App Router patterns, Supabase query conventions, Recharts component structure, and prairie design system. Use when building features, fixing bugs, or adding components to the Bushel Board app. Triggers on "bushel board", "grain dashboard", "add a chart", "new component", "fix the dashboard".
metadata:
  author: Bushels Energy
  version: 1.0.0
---

# Bushel Board Development Guide

## Architecture Overview

Bushel Board is a Next.js 16 App Router application with Supabase backend, serving Canadian grain market data to prairie farmers.

CRITICAL: Before writing any code, consult `references/architecture.md` for the data flow and `references/component-patterns.md` for existing patterns.

## Instructions

### Step 1: Understand the Request

Determine which layer the work touches:
- **Data layer** (lib/queries/, supabase/migrations/) → See references/database-schema.md
- **UI layer** (components/dashboard/) → See references/component-patterns.md
- **Page layer** (app/(dashboard)/) → Server component with data fetching
- **Auth layer** (app/(auth)/, lib/supabase/) → See references/architecture.md

### Step 2: Follow Existing Patterns

#### Server Components (Pages)
- Fetch data at page level using lib/queries/ functions
- Pass data as props to client components
- Set `revalidate` for ISR where appropriate
- Use loading.tsx for skeleton states

#### Client Components (Interactive)
- Add "use client" directive
- Receive data via props, never fetch directly
- Use useState only for UI state
- NEVER define components inside render functions

#### Supabase Queries
- Always create client with `await createClient()`
- Check auth with `supabase.auth.getUser()` for protected data
- Return typed results (define interfaces in the query file)
- Handle errors with console.error and empty fallback

#### Server Actions
- Validate with Zod schemas
- Check auth before any mutation
- Use upsert with onConflict for idempotency
- Call revalidatePath() after mutations

### Step 3: Chart Components

CRITICAL: Recharts custom tooltips and formatters MUST be defined at module level.

```javascript
// CORRECT - module level
const CustomTooltip = ({ active, payload }) => { ... }

export function MyChart({ data }) {
  return <LineChart><Tooltip content={CustomTooltip} /></LineChart>
}
```

```javascript
// WRONG - inside component (causes state reset on re-render)
export function MyChart({ data }) {
  const CustomTooltip = ({ active, payload }) => { ... }  // BAD
  return <LineChart><Tooltip content={CustomTooltip} /></LineChart>
}
```

### Step 4: Styling

- Use Tailwind utility classes
- Grain colors: consult `references/style-guide.md`
- Province colors: AB = blue, SK = green, MB = gold
- Fonts: DM Sans (body), Fraunces (display headings)
- Primary brand color (canola): #c17f24

### Step 5: Validate

After making changes:
1. Run `npm run lint` — fix any errors
2. Run `npm run test` — ensure no regressions
3. Run `npm run build` — verify production build succeeds

## Common Issues

### "Module not found" on build
Check that shadcn/ui components are generated locally. Run `npx shadcn-ui@latest add [component]`.

### Chart tooltip flickering
CustomTooltip is defined inside the component. Move it to module level.

### Data not updating after form submission
Missing `revalidatePath()` in the server action. Add it after the Supabase write.

### Type errors on Supabase queries
Supabase types may be stale. Regenerate with `npx supabase gen types typescript`.
```

---

## Summary

Your Bushel Board app is a solid 7.4/10 — great architecture and tech choices, but held back by testing gaps, code quality issues, and zero skills to maintain consistency across sessions. The skills guide shows you exactly how to fix that last piece.

The biggest bang for your buck is building `bushel-board-dev` first. It encodes your conventions so every future Cowork or Claude Code session starts with full context instead of starting from scratch. The domain knowledge skills (`cgc-data-pipeline`, `grain-intelligence`) come next — they're what make your app unique and they prevent the most expensive re-explanation cycles.

Think of it this way: the app itself is the product, but skills are the instruction manual for building it consistently. Right now you're working without that manual every time.
