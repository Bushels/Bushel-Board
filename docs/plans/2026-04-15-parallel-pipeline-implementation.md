# Parallel Pipeline + Overview Explainer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the serial 16-grain pipeline with a parallel orchestrator, add pipeline observability, and surface thesis explainers on the Overview page.

**Architecture:** New Vercel API route (`/api/pipeline/run`) fires all 16 grain analyses in parallel via pg_net, polls a `pipeline_runs` table for completion, then triggers farm summaries and health checks. Overview chart gets a `thesisSummary` field and an "Analyzed by 16 Agriculture Trained AI Agents" badge.

**Tech Stack:** Next.js API route (Vercel serverless), Supabase Edge Functions (Deno), PostgreSQL (pg_net, RPC), React (Recharts).

**Design doc:** `docs/plans/2026-04-15-parallel-pipeline-design.md`

**Skills:** pre-commit-validator, data-integrity-rules, supabase-deploy

---

### Task 1: Migration — `pipeline_runs` table + `update_pipeline_grain_status` RPC

**Files:**
- Create: `supabase/migrations/20260418100300_parallel_pipeline.sql`

**Step 1: Write the migration**

Create `pipeline_runs` table:
```sql
CREATE TABLE public.pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_year text NOT NULL,
  grain_week smallint NOT NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','completed','partial','failed')),
  grains_requested text[] NOT NULL,
  grains_completed text[] NOT NULL DEFAULT '{}',
  grains_failed text[] NOT NULL DEFAULT '{}',
  failure_details jsonb NOT NULL DEFAULT '{}',
  farm_summaries_completed int NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms int,
  triggered_by text NOT NULL DEFAULT 'manual'
    CHECK (triggered_by IN ('manual','cron','retry'))
);
```

RLS: service_role only (pipeline is internal, not user-facing).
```sql
ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pipeline_runs TO service_role;
-- No grants to authenticated — internal only
```

Create `update_pipeline_grain_status` RPC:
```sql
CREATE OR REPLACE FUNCTION public.update_pipeline_grain_status(
  p_run_id uuid,
  p_grain text,
  p_status text,  -- 'completed' or 'failed'
  p_error text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  IF p_status = 'completed' THEN
    UPDATE public.pipeline_runs
    SET grains_completed = array_append(grains_completed, p_grain)
    WHERE id = p_run_id
      AND NOT (p_grain = ANY(grains_completed));  -- idempotent
  ELSIF p_status = 'failed' THEN
    UPDATE public.pipeline_runs
    SET grains_failed = array_append(grains_failed, p_grain),
        failure_details = failure_details || jsonb_build_object(p_grain, p_error)
    WHERE id = p_run_id
      AND NOT (p_grain = ANY(grains_failed));  -- idempotent
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_pipeline_grain_status TO service_role;
```

Create `complete_pipeline_run` RPC (called by orchestrator when all grains report):
```sql
CREATE OR REPLACE FUNCTION public.complete_pipeline_run(
  p_run_id uuid
)
RETURNS void AS $$
DECLARE
  v_requested int;
  v_completed int;
  v_failed int;
BEGIN
  SELECT
    array_length(grains_requested, 1),
    COALESCE(array_length(grains_completed, 1), 0),
    COALESCE(array_length(grains_failed, 1), 0)
  INTO v_requested, v_completed, v_failed
  FROM public.pipeline_runs WHERE id = p_run_id;

  UPDATE public.pipeline_runs SET
    status = CASE
      WHEN v_failed = 0 AND v_completed = v_requested THEN 'completed'
      WHEN v_completed > 0 THEN 'partial'
      ELSE 'failed'
    END,
    completed_at = now(),
    duration_ms = EXTRACT(EPOCH FROM (now() - started_at))::int * 1000
  WHERE id = p_run_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.complete_pipeline_run TO service_role;
```

**Step 2: Pre-commit check #6**

Run:
```bash
grep -c 'CREATE.*FUNCTION' supabase/migrations/20260418100300_parallel_pipeline.sql
grep -c 'GRANT EXECUTE' supabase/migrations/20260418100300_parallel_pipeline.sql
```
Expected: 2 CREATE FUNCTION, 2 GRANT EXECUTE (both are service_role only)

**Step 3: Commit**

```bash
git add supabase/migrations/20260418100300_parallel_pipeline.sql
git commit -m "feat: pipeline_runs table + status RPCs (Track 40)"
```

---

### Task 2: Modify `analyze-grain-market` — Remove chaining, add run tracking

**Files:**
- Modify: `supabase/functions/analyze-grain-market/index.ts`

**Step 1: Add `run_id` to request body parsing**

Near the top of the handler (where `body.grains` and `body.crop_year` are parsed), add:
```typescript
const runId = body.run_id as string | undefined;
```

**Step 2: Remove self-chaining logic**

Delete the block at lines ~590-604 that:
- Checks `remainingGrains.length > 0` and calls `enqueueInternalFunction(supabase, "analyze-grain-market", ...)`
- Checks `else` and calls `enqueueInternalFunction(supabase, "generate-farm-summary", ...)`

Replace with run status reporting:
```typescript
// Report completion to pipeline_runs (if orchestrated)
if (runId) {
  const grainStatus = results.some((r: any) => r.status === "failed") ? "failed" : "completed";
  const errorMsg = results.find((r: any) => r.status === "failed")?.error ?? null;
  await supabase.rpc("update_pipeline_grain_status", {
    p_run_id: runId,
    p_grain: grainNames[0],  // BATCH_SIZE=1, always one grain
    p_status: grainStatus,
    p_error: errorMsg,
  }).catch((err: Error) => console.error("Pipeline status update failed:", err));
}
```

**Step 3: Keep backward compatibility**

If `run_id` is NOT provided (legacy/manual calls), the function should still work — it just doesn't report to `pipeline_runs`. No chaining in either case.

**Step 4: Commit**

```bash
git add supabase/functions/analyze-grain-market/index.ts
git commit -m "refactor: remove self-chaining from analyze-grain-market, add run_id tracking"
```

---

### Task 3: Create the parallel orchestrator `/api/pipeline/run`

**Files:**
- Create: `app/api/pipeline/run/route.ts`

**Step 1: Write the orchestrator**

```typescript
// POST /api/pipeline/run
// Parallel pipeline orchestrator — fires 16 grain analyses simultaneously,
// polls for completion, triggers farm summaries + health check.
//
// Query params:
//   grains: comma-separated grain names (default: all 16)
//   skip_import: "true" to skip CGC import
//
// Returns JSON with run_id, status, duration, grain counts.
```

Implementation outline:
1. Auth check — require `CRON_SECRET` or `BUSHEL_INTERNAL_FUNCTION_SECRET` header (same pattern as existing cron routes in `lib/cron/route-guards.ts`)
2. Create `pipeline_runs` row with all requested grains
3. Determine `grain_week` from `MAX(grain_week) FROM cgc_observations`
4. Fire 16 `enqueueInternalFunction` calls in parallel (one per grain), each with `run_id`
5. Poll `pipeline_runs` every 5 seconds: check `array_length(grains_completed) + array_length(grains_failed) = array_length(grains_requested)`
6. Timeout after 120 seconds — mark remaining grains as timed out
7. Call `complete_pipeline_run` RPC to finalize status
8. If any grains completed, fire `generate-farm-summary`
9. Fire `validate-site-health`
10. Return JSON summary

Key imports:
- `createClient` from `@supabase/supabase-js` (server-side, service role)
- `authorizeCronRequest` from `@/lib/cron/route-guards` (or use a dedicated pipeline auth)

**Step 2: Add route guard**

Read `lib/cron/route-guards.ts` to understand the existing auth pattern. The orchestrator should accept either:
- `Authorization: Bearer <CRON_SECRET>` header
- `x-bushel-internal-secret` header

**Step 3: Commit**

```bash
git add app/api/pipeline/run/route.ts
git commit -m "feat: parallel pipeline orchestrator /api/pipeline/run (Track 40)"
```

---

### Task 4: Overview page — Add thesis explainer + "Analyzed by" badge

**Files:**
- Modify: `lib/queries/market-stance.ts` — add `thesis_title` to query
- Modify: `components/dashboard/market-stance-chart.tsx` — add `thesisSummary` to interface + render
- Modify: `app/(dashboard)/overview/page.tsx` — pass thesis data through

**Step 1: Update `GrainStanceData` interface**

In `components/dashboard/market-stance-chart.tsx`, add to the interface:
```typescript
export interface GrainStanceData {
  grain: string;
  slug: string;
  score: number;
  priorScore: number | null;
  confidence: "high" | "medium" | "low";
  cashPrice?: string | null;
  priceChange?: string | null;
  thesisSummary?: string | null;  // NEW — one-line explainer
}
```

**Step 2: Update `getMarketStances` query**

In `lib/queries/market-stance.ts`, add `thesis_title` to the select:
```typescript
.select("grain, grain_week, stance_score, data_confidence, generated_at, thesis_title")
```

And map it to `thesisSummary` in the return:
```typescript
thesisSummary: s.thesis_title ?? null,
```

**Step 3: Render thesis explainer in the chart**

In `market-stance-chart.tsx`, below each grain's stance bar, render:
```tsx
{stance.thesisSummary && (
  <p className="mt-0.5 truncate text-xs text-muted-foreground">
    {stance.thesisSummary}
  </p>
)}
```

**Step 4: Add "Analyzed by" badge**

In `market-stance-chart.tsx`, below the chart title/header, add:
```tsx
<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
  <Brain className="h-3 w-3" />
  Analyzed by 16 Agriculture Trained AI Agents · Week {grainWeek}
</p>
```

The `Brain` icon is already imported (line 3 of existing file).

**Step 5: Commit**

```bash
git add lib/queries/market-stance.ts components/dashboard/market-stance-chart.tsx
git commit -m "feat: thesis explainer + AI agents badge on Overview (Track 40)"
```

---

### Task 5: Gate — tests + build + deploy

**Step 1: Run test suite**

Run: `npm run test`
Expected: 214 tests pass

**Step 2: Run production build**

Run: `npm run build`
Expected: clean build

**Step 3: Push migration**

Run: `npx supabase db push --linked`
Expected: `20260418100300_parallel_pipeline.sql` applied

**Step 4: Deploy Edge Function**

Run: `npx supabase functions deploy analyze-grain-market --project-ref ibgsloyjxdopkvwqcqwh`
Expected: deployed with chaining removed

**Step 5: Verify in production**

```sql
-- pipeline_runs table exists
SELECT * FROM pipeline_runs LIMIT 1;

-- RPCs work
SELECT update_pipeline_grain_status(gen_random_uuid(), 'Wheat', 'completed');

-- thesis_title accessible
SELECT grain, thesis_title FROM market_analysis WHERE grain_week = 35 LIMIT 5;
```

**Step 6: Push to GitHub (triggers Vercel deploy)**

```bash
git push origin master
```

**Step 7: Test the orchestrator**

```bash
curl -X POST https://bushel-board-app.vercel.app/api/pipeline/run \
  -H "x-bushel-internal-secret: $BUSHEL_INTERNAL_FUNCTION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"skip_import": true}'
```

Expected: JSON response with 16 grains completed in ~90 seconds.

**Step 8: Final commit**

```bash
git add -A
git commit -m "feat: Track 40 — Parallel Pipeline deployed and verified"
```

---

### Task Dependency Graph

```
Task 1 (Migration — pipeline_runs + RPCs)
  ↓
Task 2 (Modify analyze-grain-market — remove chaining, add run_id)
  ↓
Task 3 (Create /api/pipeline/run orchestrator — depends on Tasks 1+2)

Task 4 (Overview explainer — independent, can run in parallel with 1-3)

Task 5 (Gate — depends on all above)
```

Tasks 1-3 are sequential (each builds on the previous).
Task 4 is fully independent — can be done in parallel.
Task 5 is the deploy gate.
