import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";

const PRAIRIE_PROVINCES = ["Alberta", "Saskatchewan", "Manitoba"];

export interface ObservationRow {
  grain_week: number;
  week_ending_date: string;
  region: string;
  ktonnes: number;
}

export interface RegionValue {
  region: string;
  ktonnes: number;
}

/**
 * Get weekly delivery time series for a grain (current crop year).
 * Returns data for each province by week.
 */
export async function getDeliveryTimeSeries(
  grainName: string,
  cropYear?: string
): Promise<ObservationRow[]> {
  try {
    const supabase = await createClient();
    const year = cropYear || (await getLatestCropYear(supabase));

    const { data, error } = await supabase
      .from("cgc_observations")
      .select("grain_week, week_ending_date, region, ktonnes")
      .eq("worksheet", "Primary")
      .eq("metric", "Deliveries")
      .eq("period", "Current Week")
      .eq("grain", grainName)
      .eq("crop_year", year)
      .in("region", PRAIRIE_PROVINCES)
      .order("grain_week");

    if (error) {
      console.error("getDeliveryTimeSeries error:", error.message);
      return [];
    }
    return (data as ObservationRow[]) || [];
  } catch (err) {
    console.error("getDeliveryTimeSeries failed:", err);
    return [];
  }
}

/**
 * Get weekly shipment time series for a grain.
 */
export async function getShipmentTimeSeries(
  grainName: string,
  cropYear?: string
): Promise<ObservationRow[]> {
  try {
    const supabase = await createClient();
    const year = cropYear || (await getLatestCropYear(supabase));

    const { data, error } = await supabase
      .from("cgc_observations")
      .select("grain_week, week_ending_date, region, ktonnes")
      .eq("worksheet", "Primary")
      .eq("metric", "Shipments")
      .eq("period", "Current Week")
      .eq("grain", grainName)
      .eq("crop_year", year)
      .in("region", PRAIRIE_PROVINCES)
      .order("grain_week");

    if (error) {
      console.error("getShipmentTimeSeries error:", error.message);
      return [];
    }
    return (data as ObservationRow[]) || [];
  } catch (err) {
    console.error("getShipmentTimeSeries failed:", err);
    return [];
  }
}

/**
 * Get provincial deliveries (crop year total) for a grain.
 */
export async function getProvincialDeliveries(
  grainName: string
): Promise<RegionValue[]> {
  try {
    const supabase = await createClient();
    const year = await getLatestCropYear(supabase);
    const week = await getLatestWeek(supabase, year);

    const { data, error } = await supabase
      .from("cgc_observations")
      .select("region, ktonnes")
      .eq("worksheet", "Primary")
      .eq("metric", "Deliveries")
      .eq("period", "Crop Year")
      .eq("grain", grainName)
      .eq("crop_year", year)
      .eq("grain_week", week)
      .in("region", PRAIRIE_PROVINCES);

    if (error) {
      console.error("getProvincialDeliveries error:", error.message);
      return [];
    }
    return (data as RegionValue[]) || [];
  } catch (err) {
    console.error("getProvincialDeliveries failed:", err);
    return [];
  }
}

/**
 * Get shipment distribution (where grain went: Pacific, Thunder Bay, etc.)
 */
export async function getShipmentDistribution(
  grainName: string
): Promise<RegionValue[]> {
  try {
    const supabase = await createClient();
    const year = await getLatestCropYear(supabase);
    const week = await getLatestWeek(supabase, year);

    const { data, error } = await supabase
      .from("cgc_observations")
      .select("region, ktonnes")
      .or(
        "and(worksheet.eq.Primary Shipment Distribution,metric.eq.Shipment Distribution)," +
        "and(worksheet.eq.Feed Grains Shipment Distribution,metric.eq.Feed Grain Shipment Distribution)"
      )
      .eq("period", "Crop Year")
      .eq("grain", grainName)
      .eq("crop_year", year)
      .eq("grain_week", week);

    if (error) {
      console.error("getShipmentDistribution error:", error.message);
      return [];
    }
    return (data as RegionValue[]) || [];
  } catch (err) {
    console.error("getShipmentDistribution failed:", err);
    return [];
  }
}

// --- Internal helpers ---

async function getLatestCropYear(
  supabase: SupabaseClient
): Promise<string> {
  const { data } = await supabase
    .from("cgc_observations")
    .select("crop_year")
    .order("crop_year", { ascending: false })
    .limit(1)
    .single();
  return data?.crop_year || CURRENT_CROP_YEAR;
}

async function getLatestWeek(
  supabase: SupabaseClient,
  cropYear: string
): Promise<number> {
  const { data } = await supabase
    .from("cgc_observations")
    .select("grain_week")
    .eq("crop_year", cropYear)
    .order("grain_week", { ascending: false })
    .limit(1)
    .single();
  return data?.grain_week || 1;
}

// --- Week-over-Week Comparison ---

export interface WoWMetric {
  metric: string;
  thisWeek: number;
  lastWeek: number;
  changeKt: number;
  changePct: number;
}

export interface WoWComparison {
  thisWeekNum: number;
  lastWeekNum: number;
  metrics: WoWMetric[];
}

/**
 * Get week-over-week comparison for a grain across key pipeline metrics.
 * Fetches the latest two grain weeks and compares Current Week values.
 */
export async function getWeekOverWeekComparison(
  grainName: string,
  cropYear?: string
): Promise<WoWComparison | null> {
  try {
    const supabase = await createClient();
    const year = cropYear ?? (await getLatestCropYear(supabase));

    // Get the latest grain_week for this grain.
    const { data: latestRow } = await supabase
      .from("cgc_observations")
      .select("grain_week")
      .eq("grain", grainName)
      .eq("crop_year", year)
      .order("grain_week", { ascending: false })
      .limit(1)
      .single();

    if (!latestRow) return null;
    const thisWeekNum = latestRow.grain_week;

    // Get the previous distinct grain_week (the highest week before the latest).
    const { data: prevRow } = await supabase
      .from("cgc_observations")
      .select("grain_week")
      .eq("grain", grainName)
      .eq("crop_year", year)
      .lt("grain_week", thisWeekNum)
      .order("grain_week", { ascending: false })
      .limit(1)
      .single();

    if (!prevRow) return null;
    const lastWeekNum = prevRow.grain_week;
    const weeks = [thisWeekNum, lastWeekNum];

    // Fetch observations for both weeks using broad filters, then narrow client-side.
    // This avoids PostgREST .or()+and() quoting issues with values containing
    // spaces ("Terminal Exports") and slashes ("Milled/Mfg Grain").
    const { data: obs, error: obsError } = await supabase
      .from("cgc_observations")
      .select("grain_week, worksheet, metric, period, region, ktonnes")
      .eq("grain", grainName)
      .eq("crop_year", year)
      .eq("period", "Current Week")
      .in("grain_week", weeks)
      .in("worksheet", ["Primary", "Terminal Exports", "Terminal Receipts", "Process"])
      .in("metric", [
        "Deliveries", "Shipments", "Stocks", "Exports",
        "Milled/Mfg Grain", "Producer Deliveries", "Receipts",
      ]);

    if (obsError) {
      return null;
    }
    if (!obs || obs.length === 0) return null;

    // Define metric aggregation rules.
    // "composite" metrics sum multiple worksheet/metric combos (e.g. Deliveries =
    // Primary prairie provinces + Process national producer deliveries).
    type MetricDef = {
      label: string;
      regionFilter: "prairie" | "all";
    } & (
      | { type?: "simple"; worksheet: string; metric: string }
      | { type: "composite"; sources: { worksheet: string; metric: string; regionFilter: "prairie" | "all" }[] }
    );

    const metricDefs: MetricDef[] = [
      {
        label: "Deliveries",
        type: "composite",
        regionFilter: "all", // overridden per-source
        sources: [
          { worksheet: "Primary", metric: "Deliveries", regionFilter: "prairie" },
          { worksheet: "Process", metric: "Producer Deliveries", regionFilter: "all" },
        ],
      },
      { label: "Terminal Receipts", worksheet: "Terminal Receipts", metric: "Receipts", regionFilter: "all" },
      { label: "Shipments", worksheet: "Primary", metric: "Shipments", regionFilter: "prairie" },
      { label: "Exports", worksheet: "Terminal Exports", metric: "Exports", regionFilter: "all" },
      { label: "Processing", worksheet: "Process", metric: "Milled/Mfg Grain", regionFilter: "all" },
      { label: "Stocks", worksheet: "Primary", metric: "Stocks", regionFilter: "prairie" },
    ];

    const results: WoWMetric[] = [];

    // Helper to sum matching observations for a given week
    const sumObs = (
      weekNum: number,
      worksheet: string,
      metric: string,
      regionFilter: "prairie" | "all"
    ) =>
      obs
        .filter(
          (o) =>
            o.grain_week === weekNum &&
            o.worksheet === worksheet &&
            o.metric === metric &&
            (regionFilter === "prairie"
              ? PRAIRIE_PROVINCES.includes(o.region)
              : true)
        )
        .reduce((sum, o) => sum + (o.ktonnes ?? 0), 0);

    for (const def of metricDefs) {
      let thisWeekVal: number;
      let lastWeekVal: number;

      if ("type" in def && def.type === "composite") {
        // Sum across multiple sources
        thisWeekVal = def.sources.reduce(
          (sum, s) => sum + sumObs(thisWeekNum, s.worksheet, s.metric, s.regionFilter), 0
        );
        lastWeekVal = def.sources.reduce(
          (sum, s) => sum + sumObs(lastWeekNum, s.worksheet, s.metric, s.regionFilter), 0
        );
      } else {
        const simple = def as MetricDef & { worksheet: string; metric: string };
        thisWeekVal = sumObs(thisWeekNum, simple.worksheet, simple.metric, def.regionFilter);
        lastWeekVal = sumObs(lastWeekNum, simple.worksheet, simple.metric, def.regionFilter);
      }

      const changeKt = thisWeekVal - lastWeekVal;
      const changePct = lastWeekVal !== 0 ? (changeKt / lastWeekVal) * 100 : 0;

      results.push({
        metric: def.label,
        thisWeek: thisWeekVal,
        lastWeek: lastWeekVal,
        changeKt,
        changePct,
      });
    }

    return { thisWeekNum, lastWeekNum, metrics: results };
  } catch (err) {
    console.error("getWeekOverWeekComparison failed:", err);
    return null;
  }
}

// --- Storage Breakdown (Task 6) ---

export interface StorageBreakdown {
  storage_type: string;
  ktonnes: number;
  /** Previous week ktonnes for WoW comparison (undefined if no prior week) */
  prevKtonnes?: number;
}

export async function getStorageBreakdown(
  grainName: string,
  cropYear?: string
): Promise<StorageBreakdown[]> {
  const supabase = await createClient();
  const year = cropYear ?? (await getLatestCropYear(supabase));
  const week = await getLatestWeek(supabase, year);
  const prevWeek = week > 1 ? week - 1 : undefined;

  // Summary worksheet has stocks by elevator type — current + previous week
  const { data } = await supabase
    .from("cgc_observations")
    .select("region, ktonnes, grain_week")
    .eq("crop_year", year)
    .in("grain_week", prevWeek ? [week, prevWeek] : [week])
    .eq("worksheet", "Summary")
    .eq("metric", "Stocks")
    .eq("period", "Current Week")
    .eq("grain", grainName)
    .eq("grade", "")
    .in("region", [
      "Primary Elevators",
      "Process Elevators"
    ]);

  // Also get terminal stocks total — current + previous week
  const { data: terminalData } = await supabase
    .from("cgc_observations")
    .select("region, ktonnes, grain_week")
    .eq("crop_year", year)
    .in("grain_week", prevWeek ? [week, prevWeek] : [week])
    .eq("worksheet", "Terminal Stocks")
    .eq("metric", "Stocks")
    .eq("period", "Current Week")
    .eq("grain", grainName);

  // Split terminal data by week
  const terminalCurrent = (terminalData ?? [])
    .filter(r => r.grain_week === week)
    .reduce((sum, r) => sum + (r.ktonnes ?? 0), 0);
  const terminalPrev = prevWeek
    ? (terminalData ?? [])
        .filter(r => r.grain_week === prevWeek)
        .reduce((sum, r) => sum + (r.ktonnes ?? 0), 0)
    : undefined;

  // Build lookup for previous week values
  const prevLookup: Record<string, number> = {};
  if (prevWeek) {
    for (const r of (data ?? []).filter(r => r.grain_week === prevWeek)) {
      prevLookup[r.region] = r.ktonnes ?? 0;
    }
  }

  const result: StorageBreakdown[] = (data ?? [])
    .filter(r => r.grain_week === week)
    .map(r => ({
      storage_type: r.region,
      ktonnes: r.ktonnes ?? 0,
      prevKtonnes: prevLookup[r.region],
    }));

  if (terminalCurrent > 0) {
    result.push({
      storage_type: "Terminal Elevators",
      ktonnes: terminalCurrent,
      prevKtonnes: terminalPrev,
    });
  }

  return result;
}

// --- Cumulative Deliveries & Disappearance (Task 7) ---
// TODO: v_grain_overview (in 20260304200100_dashboard_views.sql) uses v_grain_deliveries
// which only queries Primary.Deliveries. It should also include Process.Producer Deliveries
// (national total, region='') to capture direct-to-processor deliveries. Without this,
// cy_deliveries_kt, cw_deliveries_kt, and prev_deliveries_kt undercount total producer
// deliveries (e.g. ~44% undercount for Canola). A migration should UNION the Process
// worksheet data into the cy_deliveries, cw_deliveries, and prev_deliveries CTEs.

export interface CumulativeWeekRow {
  grain_week: number;
  week_ending_date: string;
  producer_deliveries_kt: number;
  terminal_receipts_kt: number;
  exports_kt: number;
  processing_kt: number;
  /** @deprecated Use exports_kt + processing_kt instead */
  domestic_disappearance_kt: number;
}

export async function getCumulativeTimeSeries(
  grainName: string,
  cropYear?: string
): Promise<CumulativeWeekRow[]> {
  const supabase = await createClient();
  const year = cropYear ?? (await getLatestCropYear(supabase));

  // Use server-side RPC to aggregate pipeline data in Postgres.
  // This replaces 5 separate client queries that hit PostgREST's max_rows=1000
  // limit — Terminal Receipts alone has ~3,648 rows per grain (20 grades × 6
  // ports × 30 weeks), causing silent data truncation.
  const { data: rows, error } = await supabase.rpc("get_pipeline_velocity", {
    p_grain: grainName,
    p_crop_year: year,
  });

  if (error || !rows || rows.length === 0) return [];

  // Coerce numeric strings (Supabase returns numeric columns as strings)
  const kt = (v: unknown): number => Number(v) || 0;

  // Forward-fill: different CGC worksheets may report up to different weeks.
  // When a metric has no observation for a given week, carry forward the last
  // known cumulative value instead of defaulting to 0.
  let prevDel = 0;
  let prevRec = 0;
  let prevExp = 0;
  let prevProc = 0;
  let prevDate = "";

  return (rows as Array<Record<string, unknown>>).map((row) => {
    const del = kt(row.producer_deliveries_kt);
    const rec = kt(row.terminal_receipts_kt);
    const exp = kt(row.exports_kt);
    const proc = kt(row.processing_kt);
    const date = (row.week_ending_date as string) || prevDate;

    // Forward-fill: use previous value if this week's value is 0
    // (means that worksheet hasn't reported this week yet)
    const delVal = del > 0 ? del : prevDel;
    const recVal = rec > 0 ? rec : prevRec;
    const expVal = exp > 0 ? exp : prevExp;
    const procVal = proc > 0 ? proc : prevProc;

    prevDel = delVal;
    prevRec = recVal;
    prevExp = expVal;
    prevProc = procVal;
    if (date) prevDate = date;

    return {
      grain_week: Number(row.grain_week),
      week_ending_date: date,
      producer_deliveries_kt: delVal,
      terminal_receipts_kt: recVal,
      exports_kt: expVal,
      processing_kt: procVal,
      domestic_disappearance_kt: expVal + procVal,
    };
  });
}

// --- Grade Distribution (Terminal Receipts by grade) ---

export interface GradeDistribution {
  grade: string;
  ktonnes: number;
  percentage: number;
}

/**
 * Get Terminal Receipts broken down by grade for a grain.
 * Terminal Receipts has no pre-aggregated `grade=''` rows — must sum all
 * grades across ports. Uses only the latest grain_week to avoid
 * double-counting cumulative "Crop Year" data across weeks.
 */
export async function getGradeDistribution(
  grainName: string,
  cropYear?: string
): Promise<GradeDistribution[]> {
  try {
    const supabase = await createClient();
    const year = cropYear ?? (await getLatestCropYear(supabase));

    // First, find the latest grain_week for Terminal Receipts for this grain
    const { data: weekRow } = await supabase
      .from("cgc_observations")
      .select("grain_week")
      .eq("grain", grainName)
      .eq("crop_year", year)
      .eq("worksheet", "Terminal Receipts")
      .eq("metric", "Receipts")
      .eq("period", "Crop Year")
      .neq("grade", "")
      .order("grain_week", { ascending: false })
      .limit(1)
      .single();

    if (!weekRow) return [];
    const latestWeek = weekRow.grain_week;

    // Fetch all per-grade, per-port rows for the latest week
    const { data, error } = await supabase
      .from("cgc_observations")
      .select("grade, ktonnes")
      .eq("grain", grainName)
      .eq("crop_year", year)
      .eq("worksheet", "Terminal Receipts")
      .eq("metric", "Receipts")
      .eq("period", "Crop Year")
      .eq("grain_week", latestWeek)
      .neq("grade", "");

    if (error) {
      console.error("getGradeDistribution error:", error.message);
      return [];
    }
    if (!data || data.length === 0) return [];

    // Aggregate ktonnes by grade (summing across ports)
    const gradeMap = new Map<string, number>();
    for (const row of data) {
      const kt = Number(row.ktonnes) || 0;
      gradeMap.set(row.grade, (gradeMap.get(row.grade) ?? 0) + kt);
    }

    // Calculate total for percentages
    let total = 0;
    for (const kt of gradeMap.values()) {
      total += kt;
    }

    // Build result sorted by ktonnes descending
    const result: GradeDistribution[] = [];
    for (const [grade, ktonnes] of gradeMap.entries()) {
      result.push({
        grade,
        ktonnes,
        percentage: total > 0 ? (ktonnes / total) * 100 : 0,
      });
    }
    result.sort((a, b) => b.ktonnes - a.ktonnes);

    return result;
  } catch (err) {
    console.error("getGradeDistribution failed:", err);
    return [];
  }
}

// --- Delivery Channel Breakdown (Task 2) ---

export interface DeliveryChannelWeek {
  grain_week: number;
  primary_elevators_kt: number;
  processors_kt: number;
  producer_cars_kt: number;
}

/**
 * Get weekly delivery breakdown by channel: Primary Elevators, Processors,
 * and Producer Cars. Returns a time series for a stacked area chart.
 *
 * - Primary Elevators: cgc_observations Primary.Deliveries (3 prairie provinces summed)
 * - Processors: cgc_observations Process.Producer Deliveries (national total)
 * - Producer Cars: producer_car_allocations week_cars (car count, NOT Kt)
 */
export async function getDeliveryChannelBreakdown(
  grainName: string,
  cropYear?: string
): Promise<DeliveryChannelWeek[]> {
  try {
    const supabase = await createClient();
    const year = cropYear ?? (await getLatestCropYear(supabase));

    // Three parallel queries for the three delivery channels
    const [primaryRes, processRes, producerCarRes] = await Promise.all([
      // 1. Primary Elevators: 3 prairie provinces, sum per grain_week
      supabase
        .from("cgc_observations")
        .select("grain_week, ktonnes")
        .eq("worksheet", "Primary")
        .eq("metric", "Deliveries")
        .eq("period", "Current Week")
        .eq("grain", grainName)
        .eq("crop_year", year)
        .eq("grade", "")
        .in("region", PRAIRIE_PROVINCES)
        .order("grain_week"),

      // 2. Processors: national total (one row per week)
      supabase
        .from("cgc_observations")
        .select("grain_week, ktonnes")
        .eq("worksheet", "Process")
        .eq("metric", "Producer Deliveries")
        .eq("period", "Current Week")
        .eq("grain", grainName)
        .eq("crop_year", year)
        .eq("grade", "")
        .order("grain_week"),

      // 3. Producer Cars: week_cars per grain_week
      supabase
        .from("producer_car_allocations")
        .select("grain_week, week_cars")
        .ilike("grain", grainName)
        .eq("crop_year", year)
        .order("grain_week"),
    ]);

    if (primaryRes.error) {
      console.error("getDeliveryChannelBreakdown primary error:", primaryRes.error.message);
    }
    if (processRes.error) {
      console.error("getDeliveryChannelBreakdown process error:", processRes.error.message);
    }
    if (producerCarRes.error) {
      console.error("getDeliveryChannelBreakdown producer cars error:", producerCarRes.error.message);
    }

    // Aggregate Primary Elevators by grain_week (3 provinces → 1 total)
    const primaryByWeek = new Map<number, number>();
    for (const row of primaryRes.data ?? []) {
      const wk = Number(row.grain_week);
      primaryByWeek.set(wk, (primaryByWeek.get(wk) ?? 0) + Number(row.ktonnes));
    }

    // Processors: one row per week
    const processByWeek = new Map<number, number>();
    for (const row of processRes.data ?? []) {
      processByWeek.set(Number(row.grain_week), Number(row.ktonnes));
    }

    // Producer Cars: week_cars per week
    const carsByWeek = new Map<number, number>();
    for (const row of producerCarRes.data ?? []) {
      carsByWeek.set(Number(row.grain_week), Number(row.week_cars));
    }

    // Merge all grain_weeks into a single sorted array
    const allWeeks = new Set<number>([
      ...primaryByWeek.keys(),
      ...processByWeek.keys(),
      ...carsByWeek.keys(),
    ]);

    const result: DeliveryChannelWeek[] = Array.from(allWeeks)
      .sort((a, b) => a - b)
      .map((wk) => ({
        grain_week: wk,
        primary_elevators_kt: primaryByWeek.get(wk) ?? 0,
        processors_kt: processByWeek.get(wk) ?? 0,
        producer_cars_kt: carsByWeek.get(wk) ?? 0,
      }));

    return result;
  } catch (err) {
    console.error("getDeliveryChannelBreakdown failed:", err);
    return [];
  }
}
