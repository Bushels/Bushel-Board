# Validate-Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a deterministic validation Edge Function between `import-cgc-weekly` and `search-x-intelligence` that gates the intelligence pipeline on data quality checks.

**Architecture:** New `validate-import` Supabase Edge Function queries `cgc_observations` after an import to run 5 checks (row count, grain coverage, week continuity, delivery sanity, WoW delta). Results are logged to a new `validation_reports` table. On pass, the existing intelligence chain continues. On fail, the chain stops.

**Tech Stack:** Deno (Supabase Edge Function), PostgreSQL, Supabase JS client

---

### Task 1: Create `validation_reports` Migration

**Files:**
- Create: `supabase/migrations/20260309600000_validation_reports.sql`

**Step 1: Write the migration**

```sql
-- Stores results of post-import data validation checks.
-- Populated by the validate-import Edge Function.
CREATE TABLE validation_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  crop_year text NOT NULL,
  grain_week integer NOT NULL,
  status text NOT NULL CHECK (status IN ('pass', 'fail', 'warn')),
  checks jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Index for querying latest report per crop year
CREATE INDEX idx_validation_reports_week ON validation_reports (crop_year, grain_week DESC);

-- RLS: publicly readable, only service_role can write
ALTER TABLE validation_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read validation_reports" ON validation_reports FOR SELECT USING (true);
```

**Step 2: Apply the migration**

Run: `cd ../bushel-board-app && npx supabase db push`
Expected: Migration applied successfully, table created.

**Step 3: Verify table exists**

Run: `curl` to query `validation_reports` via REST API — should return `[]` (empty).

**Step 4: Commit**

```bash
git add supabase/migrations/20260309600000_validation_reports.sql
git commit -m "feat: add validation_reports table for post-import data checks"
```

---

### Task 2: Create `validate-import` Edge Function

**Files:**
- Create: `supabase/functions/validate-import/index.ts`

**Context:** This function receives `{ crop_year, grain_week }` from `import-cgc-weekly`. It runs 5 deterministic checks against `cgc_observations`, logs results to `validation_reports`, and on pass chains to `search-x-intelligence`.

**Step 1: Write the Edge Function**

```typescript
/**
 * Supabase Edge Function: validate-import
 *
 * Runs 5 deterministic data quality checks after a CGC weekly import.
 * If all checks pass, chains to search-x-intelligence.
 * If any check fails, logs the failure and stops the pipeline.
 *
 * Input body: { "crop_year": "2025-2026", "grain_week": 30 }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// The 16 CGC grains present in Primary/Deliveries data
const EXPECTED_GRAINS = [
  "Wheat", "Amber Durum", "Canola", "Barley", "Oats", "Peas",
  "Lentils", "Flaxseed", "Soybeans", "Corn", "Rye",
  "Mustard Seed", "Canaryseed", "Chick Peas", "Sunflower", "Beans",
];

const PRAIRIE_PROVINCES = ["Alberta", "Saskatchewan", "Manitoba"];

// Row count bounds — typical week has ~4,000-4,500 rows
const MIN_ROWS = 3500;
const MAX_ROWS = 5500;

// Week-over-week delivery drop threshold (fail if deliveries drop below 30% of prior week)
const WOW_DROP_THRESHOLD = 0.30;

interface CheckResult {
  passed: boolean;
  value: number | string;
  detail: string;
}

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const cropYear: string = body.crop_year;
    const grainWeek: number = body.grain_week;

    if (!cropYear || !grainWeek) {
      return new Response(
        JSON.stringify({ error: "crop_year and grain_week are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Validating import: week ${grainWeek}, crop year ${cropYear}`);

    const checks: Record<string, CheckResult> = {};
    let allPassed = true;

    // ── Check 1: Row count ──────────────────────────────────────────────
    const { count: rowCount } = await supabase
      .from("cgc_observations")
      .select("*", { count: "exact", head: true })
      .eq("crop_year", cropYear)
      .eq("grain_week", grainWeek);

    const rc = rowCount ?? 0;
    const rowCountPassed = rc >= MIN_ROWS && rc <= MAX_ROWS;
    checks.row_count = {
      passed: rowCountPassed,
      value: rc,
      detail: rowCountPassed
        ? `${rc} rows within ${MIN_ROWS}-${MAX_ROWS} range`
        : `${rc} rows outside expected ${MIN_ROWS}-${MAX_ROWS} range`,
    };
    if (!rowCountPassed) allPassed = false;

    // ── Check 2: Grain coverage ─────────────────────────────────────────
    const { data: grainRows } = await supabase
      .from("cgc_observations")
      .select("grain")
      .eq("crop_year", cropYear)
      .eq("grain_week", grainWeek)
      .eq("worksheet", "Primary")
      .eq("metric", "Deliveries")
      .eq("period", "Current Week");

    const presentGrains = new Set((grainRows ?? []).map((r: { grain: string }) => r.grain));
    const missingGrains = EXPECTED_GRAINS.filter((g) => !presentGrains.has(g));
    const grainCoveragePassed = missingGrains.length === 0;
    checks.grain_coverage = {
      passed: grainCoveragePassed,
      value: presentGrains.size,
      detail: grainCoveragePassed
        ? `All ${EXPECTED_GRAINS.length} grains present`
        : `Missing grains: ${missingGrains.join(", ")}`,
    };
    if (!grainCoveragePassed) allPassed = false;

    // ── Check 3: Week continuity ────────────────────────────────────────
    const { data: prevWeekRow } = await supabase
      .from("cgc_observations")
      .select("grain_week")
      .eq("crop_year", cropYear)
      .neq("grain_week", grainWeek)
      .order("grain_week", { ascending: false })
      .limit(1)
      .single();

    const prevMaxWeek = prevWeekRow?.grain_week ?? 0;
    // Valid: imported week is previous + 1, or same week (re-import), or first week
    const weekContinuityPassed =
      grainWeek <= prevMaxWeek + 1 || prevMaxWeek === 0;
    checks.week_continuity = {
      passed: weekContinuityPassed,
      value: grainWeek,
      detail: weekContinuityPassed
        ? `Week ${grainWeek} follows previous max ${prevMaxWeek}`
        : `Week ${grainWeek} skips ahead from previous max ${prevMaxWeek} (gap of ${grainWeek - prevMaxWeek - 1} weeks)`,
    };
    if (!weekContinuityPassed) allPassed = false;

    // ── Check 4: Delivery sanity ────────────────────────────────────────
    const { data: deliveryRows } = await supabase
      .from("cgc_observations")
      .select("ktonnes")
      .eq("crop_year", cropYear)
      .eq("grain_week", grainWeek)
      .eq("worksheet", "Primary")
      .eq("metric", "Deliveries")
      .eq("period", "Current Week")
      .in("region", PRAIRIE_PROVINCES);

    const totalDeliveries = (deliveryRows ?? []).reduce(
      (sum: number, r: { ktonnes: number }) => sum + (r.ktonnes ?? 0),
      0
    );
    const deliverySanityPassed = totalDeliveries > 0;
    checks.delivery_sanity = {
      passed: deliverySanityPassed,
      value: Math.round(totalDeliveries * 10) / 10,
      detail: deliverySanityPassed
        ? `Total prairie deliveries: ${totalDeliveries.toFixed(1)} kt`
        : "Zero total prairie deliveries — possible parsing failure",
    };
    if (!deliverySanityPassed) allPassed = false;

    // ── Check 5: Week-over-week delta ───────────────────────────────────
    let wowPassed = true;
    if (prevMaxWeek > 0) {
      const { data: prevDeliveryRows } = await supabase
        .from("cgc_observations")
        .select("ktonnes")
        .eq("crop_year", cropYear)
        .eq("grain_week", prevMaxWeek)
        .eq("worksheet", "Primary")
        .eq("metric", "Deliveries")
        .eq("period", "Current Week")
        .in("region", PRAIRIE_PROVINCES);

      const prevTotal = (prevDeliveryRows ?? []).reduce(
        (sum: number, r: { ktonnes: number }) => sum + (r.ktonnes ?? 0),
        0
      );

      if (prevTotal > 0) {
        const ratio = totalDeliveries / prevTotal;
        wowPassed = ratio >= WOW_DROP_THRESHOLD;
        const pctChange = ((ratio - 1) * 100).toFixed(1);
        checks.wow_delta = {
          passed: wowPassed,
          value: `${pctChange}%`,
          detail: wowPassed
            ? `${pctChange}% vs prior week (${prevTotal.toFixed(1)} kt → ${totalDeliveries.toFixed(1)} kt)`
            : `Dropped to ${(ratio * 100).toFixed(0)}% of prior week (${prevTotal.toFixed(1)} kt → ${totalDeliveries.toFixed(1)} kt). Threshold: ${WOW_DROP_THRESHOLD * 100}%`,
        };
      } else {
        checks.wow_delta = {
          passed: true,
          value: "N/A",
          detail: "Prior week had zero deliveries — skipping comparison",
        };
      }
    } else {
      checks.wow_delta = {
        passed: true,
        value: "N/A",
        detail: "First week of crop year — no prior week to compare",
      };
    }
    if (!wowPassed) allPassed = false;

    // ── Log validation report ───────────────────────────────────────────
    const status = allPassed ? "pass" : "fail";
    await supabase.from("validation_reports").insert({
      crop_year: cropYear,
      grain_week: grainWeek,
      status,
      checks,
    });

    console.log(`Validation ${status}: ${JSON.stringify(checks)}`);

    // ── Chain trigger (only on pass) ────────────────────────────────────
    if (allPassed) {
      try {
        console.log("Validation passed — triggering search-x-intelligence...");
        const chainRes = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/search-x-intelligence`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ crop_year: cropYear, grain_week: grainWeek }),
          }
        );
        console.log(`search-x-intelligence trigger: HTTP ${chainRes.status}`);
      } catch (chainErr) {
        console.error("search-x-intelligence chain-trigger failed:", chainErr);
        // Don't fail validation — intelligence pipeline is best-effort
      }
    } else {
      console.log("Validation FAILED — intelligence chain blocked.");
    }

    return new Response(
      JSON.stringify({
        crop_year: cropYear,
        grain_week: grainWeek,
        status,
        checks,
        chain_triggered: allPassed,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Validation error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
```

**Step 2: Deploy the function**

Run: `cd ../bushel-board-app && npx supabase functions deploy validate-import`
Expected: Deployed successfully.

**Step 3: Test with current data (week 30)**

Run:
```bash
curl -X POST \
  "https://ibgsloyjxdopkvwqcqwh.supabase.co/functions/v1/validate-import" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SUPABASE_ANON_JWT>" \
  -d '{"crop_year":"2025-2026","grain_week":30}'
```

Expected: `{ "status": "pass", "checks": { ... all passed ... }, "chain_triggered": true }`

**Step 4: Verify `validation_reports` table has an entry**

Run: Query `validation_reports` via REST API.
Expected: One row with `status: "pass"`, `grain_week: 30`.

**Step 5: Commit**

```bash
git add supabase/functions/validate-import/index.ts
git commit -m "feat: add validate-import Edge Function with 5 data quality checks"
```

---

### Task 3: Rewire `import-cgc-weekly` Chain Target

**Files:**
- Modify: `supabase/functions/import-cgc-weekly/index.ts` (lines 213-237)

**Context:** Change the chain trigger from `search-x-intelligence` to `validate-import`. The validation function will chain to `search-x-intelligence` if checks pass.

**Step 1: Update the chain trigger**

In `import-cgc-weekly/index.ts`, replace the chain-trigger block (lines ~213-237):

Old code (search-x-intelligence):
```typescript
    // Chain-trigger: search-x-intelligence → generate-intelligence → generate-farm-summary
    if (skipped === 0) {
      try {
        console.log("Triggering X market signal search...");
        const intRes = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/search-x-intelligence`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ crop_year: cropYear, grain_week: targetWeek }),
          }
        );
        console.log(`search-x-intelligence trigger: HTTP ${intRes.status}`);
        if (!intRes.ok) {
          const errBody = await intRes.text();
          console.error(`search-x-intelligence trigger failed: ${errBody.slice(0, 300)}`);
        }
      } catch (chainErr) {
        console.error("search-x-intelligence chain-trigger failed:", chainErr);
        // Don't fail the import — intelligence pipeline is best-effort
      }
    }
```

New code (validate-import):
```typescript
    // Chain-trigger: validate-import → (if pass) search-x-intelligence → generate-intelligence → generate-farm-summary
    if (skipped === 0) {
      try {
        console.log("Triggering post-import validation...");
        const valRes = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/validate-import`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ crop_year: cropYear, grain_week: targetWeek }),
          }
        );
        console.log(`validate-import trigger: HTTP ${valRes.status}`);
        if (!valRes.ok) {
          const errBody = await valRes.text();
          console.error(`validate-import trigger failed: ${errBody.slice(0, 300)}`);
        }
      } catch (chainErr) {
        console.error("validate-import chain-trigger failed:", chainErr);
        // Don't fail the import — validation/intelligence pipeline is best-effort
      }
    }
```

**Step 2: Redeploy import-cgc-weekly**

Run: `npx supabase functions deploy import-cgc-weekly`
Expected: Deployed successfully.

**Step 3: Commit**

```bash
git add supabase/functions/import-cgc-weekly/index.ts
git commit -m "feat: rewire import chain to validate-import before intelligence pipeline"
```

---

### Task 4: End-to-End Verification

**Files:** None (testing only)

**Step 1: Test full chain via Vercel cron route**

Manually trigger the cron route (which fetches CSV → import → validate → intelligence chain):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://bushel-board-app.vercel.app/api/cron/import-cgc"
```

Expected: Success response. Check `validation_reports` table for a new `pass` entry.

**Step 2: Verify chain reached intelligence**

Query `grain_intelligence` to confirm the chain continued through to intelligence generation.

**Step 3: Test failure scenario (optional)**

Invoke `validate-import` with a bogus week number (e.g., week 99) to confirm it fails and does NOT trigger the chain:

```bash
curl -X POST \
  "https://ibgsloyjxdopkvwqcqwh.supabase.co/functions/v1/validate-import" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SUPABASE_ANON_JWT>" \
  -d '{"crop_year":"2025-2026","grain_week":99}'
```

Expected: `{ "status": "fail", "chain_triggered": false }`

**Step 4: Deploy to Vercel (app unchanged but fresh build)**

Run: `npx vercel --prod --yes`
Expected: Deployed successfully.

**Step 5: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: validate-import pipeline integration complete"
```
