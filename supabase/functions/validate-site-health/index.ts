/**
 * Supabase Edge Function: validate-site-health
 *
 * Runs 7 deterministic health checks against the live database to verify
 * site data integrity. Called as step 6 in the import pipeline chain
 * (after generate-farm-summary) and daily by cron.
 *
 * Input body (optional): { "crop_year": "2025-2026", "grain_week": 30, "source": "pipeline" }
 * If omitted, derives current crop year dynamically.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireInternalRequest } from "../_shared/internal-auth.ts";

// Tables to check for short-format crop year violations
const CROP_YEAR_TABLES = [
  "cgc_imports",
  "cgc_observations",
  "grain_intelligence",
  "x_market_signals",
  "farm_summaries",
  "crop_plans",
  "macro_estimates",
  "supply_disposition",
  "validation_reports",
];

interface CheckResult {
  passed: boolean;
  value: number | string | null;
  detail: string;
}

function currentCropYear(): string {
  const now = new Date();
  const month = now.getUTCMonth() + 1; // 1-indexed
  const year = now.getUTCFullYear();
  if (month >= 8) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

Deno.serve(async (req) => {
  const authError = requireInternalRequest(req);
  if (authError) return authError;

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const cropYear: string = body.crop_year || currentCropYear();
    const grainWeek: number | null = body.grain_week || null;
    const source: string = body.source || "manual";

    const checks: Record<string, CheckResult> = {};

    // ── Check 1: Data freshness ───────────────────────────────────────────
    {
      const { data, error } = await supabase
        .from("cgc_imports")
        .select("crop_year, grain_week, imported_at")
        .eq("status", "success")
        .order("crop_year", { ascending: false })
        .order("grain_week", { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        checks.freshness = {
          passed: false,
          value: null,
          detail: `No successful imports found: ${error?.message || "empty"}`,
        };
      } else {
        const matchesCropYear = data.crop_year === cropYear;
        checks.freshness = {
          passed: matchesCropYear,
          value: `${data.crop_year} Wk ${data.grain_week}`,
          detail: matchesCropYear
            ? `Latest import is ${data.crop_year} Wk ${data.grain_week}`
            : `Expected crop year ${cropYear}, got ${data.crop_year} Wk ${data.grain_week}`,
        };
      }
    }

    // ── Check 2: Crop year convention (no short-format rows) ──────────────
    {
      // Check each table individually for short-format crop years via PostgREST
      // Pattern: match "YYYY-YY" (7 chars) but not "YYYY-YYYY" (9 chars)
      let totalViolations = 0;
      const violations: string[] = [];

      for (const table of CROP_YEAR_TABLES) {
        const { count } = await supabase
          .from(table)
          .select("*", { count: "exact", head: true })
          .like("crop_year", "____-__")
          .not("crop_year", "like", "____-____");

        if (count && count > 0) {
          violations.push(`${table}: ${count}`);
          totalViolations += count;
        }
      }

      checks.crop_year_convention = {
        passed: totalViolations === 0,
        value: totalViolations,
        detail:
          totalViolations === 0
            ? "All tables use long-format crop years"
            : `Short-format violations: ${violations.join(", ")}`,
      };
    }

    // ── Check 3: Community stats ──────────────────────────────────────────
    {
      const { data, error } = await supabase
        .from("v_community_stats")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error) {
        checks.community_stats = {
          passed: false,
          value: null,
          detail: `v_community_stats query failed: ${error.message}`,
        };
      } else if (!data) {
        checks.community_stats = {
          passed: false,
          value: null,
          detail: "v_community_stats returned no rows",
        };
      } else {
        const farmerCount = Number(data.farmer_count) || 0;
        checks.community_stats = {
          passed: farmerCount > 0,
          value: `${farmerCount} farmers, ${Number(data.total_tonnes) || 0} tonnes`,
          detail:
            farmerCount > 0
              ? `Community stats healthy: ${farmerCount} farmers tracking ${Number(data.grain_count)} grains`
              : "Community stats show 0 farmers — view may be misconfigured",
        };
      }
    }

    // ── Check 4: RPC health — get_historical_average ──────────────────────
    {
      // p_grain_week is required; use grain_week from body or default to 30
      const checkWeek = grainWeek || 30;
      const { data, error } = await supabase.rpc("get_historical_average", {
        p_grain: "Wheat",
        p_metric: "Deliveries",
        p_worksheet: "Primary",
        p_grain_week: checkWeek,
      });

      if (error) {
        checks.rpc_historical = {
          passed: false,
          value: null,
          detail: `get_historical_average() failed: ${error.message}`,
        };
      } else {
        const rowCount = Array.isArray(data) ? data.length : 0;
        checks.rpc_historical = {
          passed: rowCount > 0,
          value: rowCount,
          detail:
            rowCount > 0
              ? `get_historical_average() returned ${rowCount} rows for Wheat`
              : "get_historical_average() returned no data for Wheat",
        };
      }
    }

    // ── Check 5: RPC health — calculate_delivery_percentiles ──────────────
    {
      const { data, error } = await supabase.rpc(
        "calculate_delivery_percentiles"
      );

      if (error) {
        checks.rpc_percentiles = {
          passed: false,
          value: null,
          detail: `calculate_delivery_percentiles() failed: ${error.message}`,
        };
      } else {
        const rowCount = Array.isArray(data) ? data.length : 0;
        checks.rpc_percentiles = {
          passed: true, // 0 rows is ok (no crop plans yet)
          value: rowCount,
          detail: `calculate_delivery_percentiles() returned ${rowCount} rows (0 is ok if no crop plans)`,
        };
      }
    }

    // ── Check 6: RPC health — get_pipeline_velocity ───────────────────────
    {
      const { data, error } = await supabase.rpc("get_pipeline_velocity", {
        p_grain: "Wheat",
        p_crop_year: cropYear,
      });

      if (error) {
        checks.rpc_pipeline = {
          passed: false,
          value: null,
          detail: `get_pipeline_velocity() failed: ${error.message}`,
        };
      } else {
        const rowCount = Array.isArray(data) ? data.length : 0;
        checks.rpc_pipeline = {
          passed: rowCount > 0,
          value: rowCount,
          detail:
            rowCount > 0
              ? `get_pipeline_velocity() returned ${rowCount} rows for Wheat/${cropYear}`
              : `get_pipeline_velocity() returned no data for Wheat/${cropYear}`,
        };
      }
    }

    // ── Check 7: Intelligence freshness ───────────────────────────────────
    {
      const { data, error } = await supabase
        .from("grain_intelligence")
        .select("grain, crop_year, grain_week, generated_at")
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        checks.intelligence_freshness = {
          passed: false,
          value: null,
          detail: `No grain_intelligence rows found: ${error?.message || "empty"}`,
        };
      } else {
        const generatedAt = new Date(data.generated_at);
        const daysSince = Math.floor(
          (Date.now() - generatedAt.getTime()) / 86400000
        );
        const isFresh = daysSince <= 14;

        checks.intelligence_freshness = {
          passed: isFresh,
          value: `${data.grain} Wk ${data.grain_week} (${daysSince}d ago)`,
          detail: isFresh
            ? `Latest intelligence: ${data.grain} Wk ${data.grain_week}, generated ${daysSince} days ago`
            : `Intelligence is stale: ${data.grain} Wk ${data.grain_week}, generated ${daysSince} days ago (>14 days)`,
        };
      }
    }

    // ── Aggregate results ─────────────────────────────────────────────────
    const allPassed = Object.values(checks).every((c) => c.passed);
    const anyFailed = Object.values(checks).some((c) => !c.passed);
    const status = allPassed ? "pass" : anyFailed ? "fail" : "warn";

    // ── Store results ─────────────────────────────────────────────────────
    const { error: insertError } = await supabase
      .from("health_checks")
      .insert({
        crop_year: cropYear,
        grain_week: grainWeek,
        status,
        checks,
        source,
      });

    if (insertError) {
      console.error("Failed to store health check:", insertError);
    }

    const duration = Date.now() - startTime;
    const passCount = Object.values(checks).filter((c) => c.passed).length;
    const failCount = Object.values(checks).filter((c) => !c.passed).length;

    console.log(
      `Health check ${status}: ${passCount} passed, ${failCount} failed (${duration}ms)`
    );

    return new Response(
      JSON.stringify({
        crop_year: cropYear,
        grain_week: grainWeek,
        status,
        checks,
        pass_count: passCount,
        fail_count: failCount,
        duration_ms: duration,
        source,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("validate-site-health error:", err);
    return new Response(
      JSON.stringify({
        error: String(err),
        duration_ms: Date.now() - startTime,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
