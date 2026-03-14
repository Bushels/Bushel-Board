import { createClient } from "@/lib/supabase/server";

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

/**
 * Fetches logistics snapshot (port + railcar data) for a grain week.
 * Uses the existing get_logistics_snapshot RPC which returns JSON.
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

/** Convert a value to number or null, handling PostgREST numeric-as-string. */
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
