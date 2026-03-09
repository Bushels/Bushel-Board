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
}

export async function getStorageBreakdown(
  grainName: string,
  cropYear?: string
): Promise<StorageBreakdown[]> {
  const supabase = await createClient();
  const year = cropYear ?? (await getLatestCropYear(supabase));
  const week = await getLatestWeek(supabase, year);

  // Summary worksheet has stocks by elevator type
  const { data } = await supabase
    .from("cgc_observations")
    .select("region, ktonnes")
    .eq("crop_year", year)
    .eq("grain_week", week)
    .eq("worksheet", "Summary")
    .eq("metric", "Stocks")
    .eq("period", "Current Week")
    .eq("grain", grainName)
    .eq("grade", "")
    .in("region", [
      "Primary Elevators",
      "Process Elevators"
    ]);

  // Also get terminal stocks total
  const { data: terminalData } = await supabase
    .from("cgc_observations")
    .select("region, ktonnes")
    .eq("crop_year", year)
    .eq("grain_week", week)
    .eq("worksheet", "Terminal Stocks")
    .eq("metric", "Stocks")
    .eq("period", "Current Week")
    .eq("grain", grainName);
  const terminalTotal = (terminalData ?? []).reduce(
    (sum, r) => sum + (r.ktonnes ?? 0), 0
  );

  const result: StorageBreakdown[] = (data ?? []).map(r => ({
    storage_type: r.region,
    ktonnes: r.ktonnes ?? 0,
  }));

  if (terminalTotal > 0) {
    result.push({ storage_type: "Terminal Elevators", ktonnes: terminalTotal });
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

  // Cumulative producer deliveries to primary elevators (prairie provinces)
  const { data: deliveries } = await supabase
    .from("cgc_observations")
    .select("grain_week, week_ending_date, ktonnes")
    .eq("crop_year", year)
    .eq("grain", grainName)
    .eq("grade", "")
    .eq("worksheet", "Primary")
    .eq("metric", "Deliveries")
    .eq("period", "Crop Year")
    .in("region", PRAIRIE_PROVINCES)
    .order("grain_week", { ascending: true });

  // Cumulative terminal receipts (grain arriving at terminals)
  const { data: terminalReceipts } = await supabase
    .from("cgc_observations")
    .select("grain_week, ktonnes")
    .eq("crop_year", year)
    .eq("grain", grainName)
    .eq("worksheet", "Terminal Receipts")
    .eq("metric", "Receipts")
    .eq("period", "Crop Year")
    .order("grain_week", { ascending: true });

  // Cumulative terminal exports
  const { data: exports } = await supabase
    .from("cgc_observations")
    .select("grain_week, ktonnes")
    .eq("crop_year", year)
    .eq("grain", grainName)
    .eq("worksheet", "Terminal Exports")
    .eq("metric", "Exports")
    .eq("period", "Crop Year")
    .order("grain_week", { ascending: true });

  // Cumulative processing (domestic use)
  const { data: processing } = await supabase
    .from("cgc_observations")
    .select("grain_week, ktonnes")
    .eq("crop_year", year)
    .eq("grain", grainName)
    .eq("grade", "")
    .eq("worksheet", "Process")
    .eq("metric", "Milled/Mfg Grain")
    .eq("period", "Crop Year")
    .order("grain_week", { ascending: true });

  // Cumulative direct-to-processor deliveries (national total)
  // Process worksheet has region='' (national only, no provincial breakdown)
  const { data: directProcessDeliveries } = await supabase
    .from("cgc_observations")
    .select("grain_week, ktonnes")
    .eq("crop_year", year)
    .eq("grain", grainName)
    .eq("grade", "")
    .eq("worksheet", "Process")
    .eq("metric", "Producer Deliveries")
    .eq("period", "Crop Year")
    .order("grain_week", { ascending: true });

  // Sum deliveries by week across provinces
  const deliveryByWeek = new Map<number, { total: number; date: string }>();
  for (const d of deliveries ?? []) {
    const existing = deliveryByWeek.get(d.grain_week);
    if (existing) {
      existing.total += d.ktonnes ?? 0;
    } else {
      deliveryByWeek.set(d.grain_week, {
        total: d.ktonnes ?? 0,
        date: d.week_ending_date,
      });
    }
  }

  // Add direct-to-processor deliveries to the total
  for (const d of directProcessDeliveries ?? []) {
    const existing = deliveryByWeek.get(d.grain_week);
    if (existing) {
      existing.total += d.ktonnes ?? 0;
    } else {
      deliveryByWeek.set(d.grain_week, {
        total: d.ktonnes ?? 0,
        date: "", // will be filled by other data
      });
    }
  }

  // Sum terminal receipts by week across ports
  const receiptByWeek = new Map<number, number>();
  for (const r of terminalReceipts ?? []) {
    receiptByWeek.set(
      r.grain_week,
      (receiptByWeek.get(r.grain_week) ?? 0) + (r.ktonnes ?? 0)
    );
  }

  // Sum exports by week across terminal ports
  const exportByWeek = new Map<number, number>();
  for (const e of exports ?? []) {
    exportByWeek.set(
      e.grain_week,
      (exportByWeek.get(e.grain_week) ?? 0) + (e.ktonnes ?? 0)
    );
  }

  // Sum processing by week across provinces
  const processByWeek = new Map<number, number>();
  for (const p of processing ?? []) {
    processByWeek.set(
      p.grain_week,
      (processByWeek.get(p.grain_week) ?? 0) + (p.ktonnes ?? 0)
    );
  }

  // Merge all weeks
  const allWeeks = new Set([
    ...deliveryByWeek.keys(),
    ...receiptByWeek.keys(),
    ...exportByWeek.keys(),
    ...processByWeek.keys(),
  ]);

  return Array.from(allWeeks)
    .sort((a, b) => a - b)
    .map((week) => {
      const del = deliveryByWeek.get(week);
      const rec = receiptByWeek.get(week) ?? 0;
      const exp = exportByWeek.get(week) ?? 0;
      const proc = processByWeek.get(week) ?? 0;
      return {
        grain_week: week,
        week_ending_date: del?.date ?? "",
        producer_deliveries_kt: del?.total ?? 0,
        terminal_receipts_kt: rec,
        exports_kt: exp,
        processing_kt: proc,
        domestic_disappearance_kt: exp + proc, // kept for backward compat
      };
    });
}
