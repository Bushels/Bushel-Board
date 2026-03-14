import { createClient } from "@/lib/supabase/server";

export interface GrainMonitorData {
  vessels_vancouver: number | null;
  vessels_thunder_bay: number | null;
  vessels_churchill: number | null;
  out_of_car_time_pct: number | null;
  port_throughput_kt: number | null;
  storage_capacity_pct: number | null;
  report_date: string | null;
}

export interface ProducerCarData {
  grain: string;
  cy_cars_total: number;
  week_cars: number;
  dest_united_states: number | null;
  dest_mexico: number | null;
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
          vessels_thunder_bay: numOrNull(rawMonitor.vessels_thunder_bay),
          vessels_churchill: numOrNull(rawMonitor.vessels_churchill),
          out_of_car_time_pct: numOrNull(rawMonitor.out_of_car_time_pct),
          port_throughput_kt: numOrNull(rawMonitor.port_throughput_kt),
          storage_capacity_pct: numOrNull(rawMonitor.storage_capacity_pct),
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
          dest_mexico: numOrNull(car.dest_mexico),
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
