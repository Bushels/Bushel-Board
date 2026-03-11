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
import {
  buildInternalHeaders,
  requireInternalRequest,
} from "../_shared/internal-auth.ts";

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
  const authError = requireInternalRequest(req);
  if (authError) {
    return authError;
  }

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
            headers: buildInternalHeaders(),
            body: JSON.stringify({ mode: "deep", crop_year: cropYear, grain_week: grainWeek }),
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
