# Bull/Bear Thesis Refresh Plan

> For Hermes: use subagent-driven-development only after the private Viking knowledge files are restored locally and deployment credentials are available.

Goal: update Bushel Board so the latest Viking bull/bear thesis logic flows through the intelligence pipeline, renders correctly in the app, and is safe to ship to production.

Architecture: Bushel Board already has a working thesis pipeline. The canonical v2 path is Vercel cron -> /api/cron/import-cgc -> validate-import -> search-x-intelligence -> analyze-grain-market -> generate-farm-summary -> validate-site-health. The grain UI reads structured fields from market_analysis and summary/narrative fields from grain_intelligence.

Tech stack: Next.js 16, TypeScript, Supabase Edge Functions, Supabase Postgres, xAI Grok Responses API, Vercel.

---

## What I verified

1. Thesis generation currently lives in `supabase/functions/analyze-grain-market/index.ts`
   - Produces `initial_thesis`, `bull_case`, `bear_case`, `stance_score`, `confidence_score`, `final_assessment`, `key_signals`
   - Upserts into `market_analysis`
   - Also writes a backward-compat narrative into `grain_intelligence`

2. Legacy thesis flow still exists
   - `supabase/functions/analyze-market-data/index.ts`
   - `supabase/functions/generate-intelligence/index.ts`
   - But docs mark v2 as current and v1 as fallback/legacy

3. UI wiring already exists
   - `lib/queries/intelligence.ts`
   - `components/dashboard/bull-bear-cards.tsx`
   - `app/(dashboard)/grain/[slug]/page.tsx`
   - `app/(dashboard)/my-farm/page.tsx`

4. Current blockers
   - Missing private gitignored files:
     - `lib/knowledge/viking-l0.ts`
     - `lib/knowledge/viking-l1.ts`
     - `supabase/functions/_shared/viking-knowledge.ts`
   - These are intentionally gitignored and not present in this checkout
   - Tests currently fail because those files are missing
   - `npx vercel whoami` fails because this machine is not authenticated to Vercel
   - Local `npm run build` was killed with exit 137, likely resource pressure, but repo health is not clean enough to trust deployment yet

5. Deployment path
   - Production ingress is Vercel cron
   - Production deploy can happen either by GitHub->Vercel auto deploy or `npx vercel --prod`
   - This machine cannot do direct Vercel deploy until auth is added

---

## Exact process to refresh the bull/bear thesis

### Phase 1: Restore local repo health

Objective: make the repo testable and deployable before changing thesis logic.

Files needed locally:
- `lib/knowledge/viking-l0.ts`
- `lib/knowledge/viking-l1.ts`
- `supabase/functions/_shared/viking-knowledge.ts`

Verification:
- `npm test`
- `npm run build`

Success condition:
- knowledge imports resolve
- tests no longer fail on missing Viking modules

### Phase 2: Decide the source of truth for thesis generation

Objective: avoid editing the wrong pipeline.

Canonical production path to update:
- `supabase/functions/analyze-grain-market/index.ts`

Supporting prompt/config files to inspect/update:
- `supabase/functions/_shared/market-intelligence-config.ts`
- `supabase/functions/_shared/analyst-prompt.ts`
- `docs/reference/agent-debate-rules.md`
- `lib/analyst-prompt.ts`
- `scripts/parallel-debate.ts`

Important note:
- If the new bull/bear thesis is meant for production site output, prioritize v2 `analyze-grain-market`
- Only update legacy `analyze-market-data` and `generate-intelligence` if you still intend to use v1 fallback or want consistency

### Phase 3: Apply the new Viking thesis rules to the live prompt/output contract

Objective: make the AI produce the updated thesis behavior.

Expected outputs already supported by schema:
- `initial_thesis`
- `bull_case`
- `bear_case`
- `stance_score`
- `confidence_score`
- `final_assessment`
- `key_signals`

Likely changes:
- strengthen recommendation philosophy inside the system prompt
- embed the new debate rules and action mapping into the analyst prompt
- ensure the model explicitly handles:
  - PATIENCE / WATCH / SCALE_IN / ACCELERATE / HOLD_FIRM / PRICE
  - reversal risk
  - data freshness weighting
  - logistics-first near-term thinking
  - basis over futures when they disagree

Potential schema follow-up:
- if you want recommendation type stored explicitly instead of inferred, add a field to `market_analysis`
- current app mostly infers action from stance + thesis/farm context rather than storing a first-class recommendation enum

### Phase 4: Regenerate analysis data

Objective: produce fresh rows with the new thesis for all grains.

Preferred path:
- run the v2 chain manually using the existing production-style route/function flow

Production-style sequence:
1. `/api/cron/import-cgc`
2. `validate-import`
3. `search-x-intelligence`
4. `analyze-grain-market`
5. `generate-farm-summary`
6. `validate-site-health`

Alternative targeted refresh:
- call `analyze-grain-market` directly for selected grains/week with internal secret

Verification SQL:
- `SELECT grain, grain_week, generated_at, stance_score, confidence_score, final_assessment FROM market_analysis ORDER BY generated_at DESC LIMIT 20;`
- `SELECT grain, grain_week, generated_at FROM grain_intelligence ORDER BY generated_at DESC LIMIT 20;`

Success condition:
- all target grains have fresh `market_analysis` rows for the intended week
- grain pages render the updated bull/bear cases and stance

### Phase 5: Validate UI rendering

Objective: ensure the new thesis shape still looks right to the farmer.

Pages/components to check:
- `app/(dashboard)/grain/[slug]/page.tsx`
- `components/dashboard/bull-bear-cards.tsx`
- `components/dashboard/recommendation-card.tsx`
- `app/(dashboard)/my-farm/page.tsx`

Checks:
- bull case splits cleanly into bullets
- bear case splits cleanly into bullets
- stance meter aligns with `stance_score`
- final assessment reads like farmer language, not analyst mush
- my-farm recommendation logic does not conflict with new action philosophy

### Phase 6: Deploy safely

Objective: ship only after repo health and credentials are confirmed.

Path A: Git push and let Vercel auto-deploy
- best if GitHub repo is already connected to the Vercel project

Path B: direct Vercel deploy
- requires `npx vercel login` or token-based auth on this machine

Required environment checks in production:
- `CRON_SECRET`
- `BUSHEL_INTERNAL_FUNCTION_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `XAI_API_KEY`

---

## Current recommendation

Do this in order:
1. restore the private Viking knowledge files locally
2. get tests green again
3. inspect and update `supabase/functions/analyze-grain-market/index.ts`
4. decide whether to add a first-class recommendation enum to `market_analysis`
5. run a targeted refresh for 1-2 grains first
6. validate UI
7. deploy to Vercel
8. run full-grain refresh

---

## Immediate next actions

1. Restore these local-only files into this checkout:
   - `lib/knowledge/viking-l0.ts`
   - `lib/knowledge/viking-l1.ts`
   - `supabase/functions/_shared/viking-knowledge.ts`

2. After that, run:
   - `npm test`
   - `npm run build`

3. Then edit the v2 prompt path:
   - `supabase/functions/analyze-grain-market/index.ts`
   - `supabase/functions/_shared/market-intelligence-config.ts`

4. Then test a single-grain refresh before touching all 16 grains.

---

## What is blocked right now

- I cannot finish a safe production update from this machine until the private Viking knowledge files are restored locally.
- I also cannot do a direct Vercel production deploy from this machine until Vercel auth is provided.
