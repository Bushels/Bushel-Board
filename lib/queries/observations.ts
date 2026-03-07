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

export interface CumulativeWeekRow {
  grain_week: number;
  week_ending_date: string;
  producer_deliveries_kt: number;
  domestic_disappearance_kt: number;
  exports_kt: number;
  processing_kt: number;
}

export async function getCumulativeTimeSeries(
  grainName: string,
  cropYear?: string
): Promise<CumulativeWeekRow[]> {
  const supabase = await createClient();
  const year = cropYear ?? (await getLatestCropYear(supabase));

  // Cumulative producer deliveries (Primary worksheet, all prairie provinces)
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
    ...exportByWeek.keys(),
    ...processByWeek.keys(),
  ]);

  return Array.from(allWeeks)
    .sort((a, b) => a - b)
    .map((week) => {
      const del = deliveryByWeek.get(week);
      const exp = exportByWeek.get(week) ?? 0;
      const proc = processByWeek.get(week) ?? 0;
      return {
        grain_week: week,
        week_ending_date: del?.date ?? "",
        producer_deliveries_kt: del?.total ?? 0,
        domestic_disappearance_kt: exp + proc,
        exports_kt: exp,
        processing_kt: proc,
      };
    });
}
