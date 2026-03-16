# Jules Playbook for Bushel Board

Last updated: 2026-03-16

## Why this exists

Jules works best on tightly scoped tasks with a validated environment. Do not ask it to "go through the whole product" in one session. Split work into isolated passes so plans stay coherent, changes stay reviewable, and sessions do not fight each other.

## Current baseline

Checked locally on 2026-03-16:

- `npm run build` passes
- `npm run test` fails with 1 timeout in `lib/advisor/__tests__/context-builder.test.ts`
- `npx eslint .` fails with 2 errors:
  - `supabase/functions/analyze-market-data/index.ts`
  - `supabase/functions/generate-intelligence/prompt-template.ts`

Implication: the first Jules task should be repo hygiene, not feature work.

## Hard rules

- Use a clean remote branch. Jules only sees GitHub state, not local uncommitted changes.
- Keep one concern per task. Do not mix UI polish, database logic, and auth fixes in the same session.
- Review every plan before approval.
- Require validation commands in every task.
- If a task uncovers unrelated issues, have Jules list them instead of fixing them.
- Never put secrets in prompts or committed files.

## Repo access prerequisites

Jules must have GitHub access to `Bushels/Bushel-Board`.

If the repo does not appear in Jules:

1. Go to GitHub Settings.
2. Open Applications.
3. Find `Google Labs Jules`.
4. Click `Configure`.
5. Grant access to `Bushels/Bushel-Board`.
6. Refresh Jules.

## Jules repo configuration

### Recommended initial setup script

Use this first because the repo is not fully green yet:

```bash
npm install
npm run build
```

After the hygiene task fixes test and lint failures, upgrade the setup script to:

```bash
npm install
npm run build
npm run test
npx eslint .
```

Do not use long-running commands like `npm run dev` in Jules setup.

### Environment variables

Add repo-level environment variables in Jules settings, then enable them per task only when needed.

Minimum likely set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BUSHEL_INTERNAL_FUNCTION_SECRET`
- `NEXT_PUBLIC_MAPBOX_TOKEN`

Only enable these for tasks that need them:

- `XAI_API_KEY`
- `CRON_SECRET`

If a task is pure TypeScript, lint, test, or UI work, keep secret exposure minimal.

## Recommended operating sequence

### Phase 1: Baseline hygiene

Run this first and do not parallelize it.

Prompt:

```text
Fix the current baseline failures in this repo and nothing else.

Scope:
- lib/advisor/__tests__/context-builder.test.ts
- lib/advisor/context-builder.ts
- supabase/functions/analyze-market-data/index.ts
- supabase/functions/generate-intelligence/prompt-template.ts

Goals:
1. Make npm run test pass.
2. Make npx eslint . pass without introducing disable comments unless unavoidable.
3. Keep behavior unchanged except for the minimum code needed to fix the failing test and lint errors.

Validation:
- npm run test
- npx eslint .
- npm run build

Rules:
- Do not edit unrelated files.
- If you find additional issues outside scope, list them in the final summary instead of fixing them.
- Show a plan before writing code.
```

### Phase 2: Data integrity audit

Start only after Phase 1 is merged.

Prompt:

```text
Audit the CGC-derived grain metrics for correctness and add tests or fixes only where the implementation is provably wrong or under-tested.

Scope:
- lib/queries/observations.ts
- lib/queries/intelligence.ts
- lib/queries/grains.ts
- lib/queries/logistics.ts
- tests
- docs/reference/cgc-excel-map.md
- docs/lessons-learned/issues.md

Critical rules from AGENTS.md:
- producer deliveries must use the canonical country-level formula
- use FULL OUTER JOIN when merging Primary + Process data
- cumulative series must forward-fill missing weeks, not zero-fill
- terminal receipts and exports must aggregate grades server-side
- avoid PostgREST 1000-row truncation

Deliverable:
- fix only real logic bugs or missing tests
- add or update tests for every changed behavior

Validation:
- npm run test
- npm run build
```

### Phase 3: Auth and write-path audit

Can run in parallel with Phase 2 if file overlap is low.

Prompt:

```text
Review auth, authorization, and farmer-only write paths for Bushel Board. Fix only concrete issues you can prove from the code.

Scope:
- app/(dashboard)/**/actions.ts
- app/(dashboard)/**/signal-actions.ts
- lib/auth
- lib/supabase
- proxy.ts
- supabase/migrations

Requirements:
- farmer-only writes must be enforced server-side and by RLS
- user-scoped RPCs must derive identity from auth.uid()
- do not trust caller-supplied user ids

Deliverable:
- minimal code changes
- tests for any changed authorization behavior

Validation:
- npm run test
- npm run build
```

### Phase 4: Frontend verification pass

Run after Phase 1. Keep this isolated from backend tasks.

Prompt:

```text
Review the main product flows for UI regressions and usability issues, then fix only the top 3 highest-impact issues.

Scope:
- app/page.tsx
- app/(dashboard)/overview/page.tsx
- app/(dashboard)/grain/[slug]/page.tsx
- app/(dashboard)/my-farm/**
- components/dashboard/**
- components/auth/**

Requirements:
- preserve the existing design language
- prefer targeted fixes over redesign
- verify each change with browser-based checks and screenshots

Validation:
- npm run build
- run the relevant UI verification steps

Rules:
- if an issue needs large redesign work, document it instead of partially fixing it
```

### Phase 5: Intelligence pipeline robustness

Do this after the baseline is green.

Prompt:

```text
Audit the production intelligence pipeline for reliability and maintainability issues, then fix the top 1-2 concrete problems with tests or safer guards.

Scope:
- app/api/cron/**
- supabase/functions/validate-import/**
- supabase/functions/search-x-intelligence/**
- supabase/functions/analyze-market-data/**
- supabase/functions/generate-intelligence/**
- supabase/functions/generate-farm-summary/**
- supabase/functions/validate-site-health/**

Focus:
- idempotency
- secret handling
- retry safety
- batch continuation logic
- failure observability

Rules:
- do not change public behavior unless required to fix a real bug
- do not add complexity without a measurable reliability benefit

Validation:
- npm run build
- targeted tests if you add them
```

## What can run in parallel

Safe parallel mix after Phase 1:

- Phase 2 data integrity
- Phase 3 auth audit
- Phase 4 frontend verification

Avoid parallel overlap on:

- `app/(dashboard)/grain/[slug]/page.tsx`
- shared query modules
- Supabase Edge Functions touching the same prompt/config files

## Plan review checklist

Before you approve a Jules plan, check:

1. The task is narrow and the touched files make sense.
2. Validation commands are explicit.
3. The plan does not rely on `npm run dev`.
4. The plan does not drift into unrelated cleanup.
5. The plan names the risky assumptions.

## CLI examples

Once repo access is configured, you can start a session from the terminal.

```powershell
& 'C:\Users\kyle\AppData\Local\Temp\jules_tmp\jules.exe' remote new --repo Bushels/Bushel-Board --session "Fix the current baseline failures in this repo and nothing else."
```

List sessions:

```powershell
& 'C:\Users\kyle\AppData\Local\Temp\jules_tmp\jules.exe' remote list --session
```

Pull a finished patch:

```powershell
& 'C:\Users\kyle\AppData\Local\Temp\jules_tmp\jules.exe' remote pull --session SESSION_ID --apply
```

## Recommended next move

Do not start with a product-wide prompt. Start with the Phase 1 hygiene session, get the repo green, then launch the Phase 2-4 sessions in parallel.
