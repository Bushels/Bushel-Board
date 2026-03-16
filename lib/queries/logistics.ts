import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";

// Re-export types and pure functions so existing server-side imports still work.
// Client components should import from "@/lib/queries/logistics-utils" directly.
export type {
  WeeklyTerminalFlow,
  LogisticsSnapshot,
  HeadlineInput,
  LogisticsHeadline,
  PillSentiment,
} from "./logistics-utils";
export {
  generateLogisticsHeadline,
  vesselSentiment,
  octSentiment,
  shipmentYoySentiment,
} from "./logistics-utils";

import type { WeeklyTerminalFlow, LogisticsSnapshot } from "./logistics-utils";

// ---------------------------------------------------------------------------
// Types for the LogisticsCard component (kitchen-table-advisor grain page)
// ---------------------------------------------------------------------------

export interface GrainMonitorData {
  vessels_vancouver: number | null;
  vessels_prince_rupert: number | null;
  out_of_car_time_pct: number | null;
  country_stocks_kt: number | null;
  country_capacity_pct: number | null;
  terminal_stocks_kt: number | null;
  ytd_shipments_total_kt: number | null;
  report_date: string | null;
}

export interface ProducerCarData {
  grain: string;
  cy_cars_total: number;
  week_cars: number;
  dest_united_states: number | null;
}

export interface LogisticsResult {
  grainMonitor: GrainMonitorData | null;
  producerCars: ProducerCarData[];
}

// ---------------------------------------------------------------------------
// Supabase queries
// ---------------------------------------------------------------------------

/** Convert a value to number or null, handling PostgREST numeric-as-string. */
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/**
 * Fetches logistics snapshot in the raw RPC shape (LogisticsSnapshot).
 * Used by LogisticsBanner on overview page which needs the full grain_monitor fields.
 */
export async function getLogisticsSnapshotRaw(
  cropYear: string,
  grainWeek: number
): Promise<LogisticsSnapshot | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_logistics_snapshot", {
      p_crop_year: cropYear,
      p_grain_week: grainWeek,
    });

    if (error) {
      console.error("getLogisticsSnapshotRaw error:", error.message);
      return null;
    }

    return (typeof data === "string" ? JSON.parse(data) : data) as LogisticsSnapshot | null;
  } catch (err) {
    console.error("getLogisticsSnapshotRaw failed:", err);
    return null;
  }
}

/**
 * Fetches logistics snapshot for the LogisticsCard component.
 * Returns a structured result with grainMonitor + producerCars.
 */
export async function getLogisticsSnapshot(
  cropYear: string,
  grainWeek: number
): Promise<LogisticsResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_logistics_snapshot", {
      p_crop_year: cropYear,
      p_grain_week: grainWeek,
    });

    if (error || !data) {
      return { grainMonitor: null, producerCars: [] };
    }

    // The RPC returns a JSON object with grain_monitor and producer_cars fields
    const parsed = typeof data === "string" ? JSON.parse(data) : data;

    const rawMonitor = parsed?.grain_monitor;
    const grainMonitor: GrainMonitorData | null = rawMonitor
      ? {
          vessels_vancouver: numOrNull(rawMonitor.vessels_vancouver),
          vessels_prince_rupert: numOrNull(rawMonitor.vessels_prince_rupert),
          out_of_car_time_pct: numOrNull(rawMonitor.out_of_car_time_pct),
          country_stocks_kt: numOrNull(rawMonitor.country_stocks_kt),
          country_capacity_pct: numOrNull(rawMonitor.country_capacity_pct),
          terminal_stocks_kt: numOrNull(rawMonitor.terminal_stocks_kt),
          ytd_shipments_total_kt: numOrNull(rawMonitor.ytd_shipments_total_kt),
          report_date: rawMonitor.report_date ?? null,
        }
      : null;

    const rawCars = parsed?.producer_cars;
    const producerCars: ProducerCarData[] = Array.isArray(rawCars)
      ? rawCars.map((car: Record<string, unknown>) => ({
          grain: car.grain as string,
          cy_cars_total: Number(car.cy_cars_total) || 0,
          week_cars: Number(car.week_cars) || 0,
          dest_united_states: numOrNull(car.dest_united_states),
        }))
      : [];

    return { grainMonitor, producerCars };
  } catch (err) {
    console.error("getLogisticsSnapshot failed:", err);
    return { grainMonitor: null, producerCars: [] };
  }
}

/**
 * Fetch weekly terminal flow data for a specific grain.
 * Calls the `get_weekly_terminal_flow` RPC function.
 */
export async function getWeeklyTerminalFlow(
  grain: string,
  cropYear?: string
): Promise<WeeklyTerminalFlow[]> {
  try {
    const supabase = await createClient();
    const year = cropYear ?? CURRENT_CROP_YEAR;

    const { data, error } = await supabase.rpc("get_weekly_terminal_flow", {
      p_grain: grain,
      p_crop_year: year,
    });

    if (error) {
      console.error("getWeeklyTerminalFlow error:", error.message);
      return [];
    }

    return (data as WeeklyTerminalFlow[]) ?? [];
  } catch (err) {
    console.error("getWeeklyTerminalFlow failed:", err);
    return [];
  }
}

/**
 * Fetch aggregate terminal flow across all grains.
 * Calls the `get_aggregate_terminal_flow` RPC function.
 */
export async function getAggregateTerminalFlow(
  cropYear?: string
): Promise<WeeklyTerminalFlow[]> {
  try {
    const supabase = await createClient();
    const year = cropYear ?? CURRENT_CROP_YEAR;

    const { data, error } = await supabase.rpc("get_aggregate_terminal_flow", {
      p_crop_year: year,
    });

    if (error) {
      console.error("getAggregateTerminalFlow error:", error.message);
      return [];
    }

    return (data as WeeklyTerminalFlow[]) ?? [];
  } catch (err) {
    console.error("getAggregateTerminalFlow failed:", err);
    return [];
  }
}
