// lib/queries/seeding-progress.ts
// Server-only Supabase RPC wrapper. Re-exports utils for convenient single-import.

import { createClient } from "@/lib/supabase/server";
import type { SeismographRow } from "@/lib/queries/seeding-progress-utils";

export type { SeismographRow, SeismographByState } from "@/lib/queries/seeding-progress-utils";
export { groupByState, conditionStrokeColor } from "@/lib/queries/seeding-progress-utils";

/**
 * Fetch the full per-state, per-week seismograph dataset for one commodity.
 * Returns ~480 rows (15 grain-belt states x ~32 weeks). PostgREST safe.
 */
export async function getSeedingSeismograph(
  commodity: string,
  marketYear: number,
): Promise<SeismographRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_seeding_seismograph", {
    p_commodity: commodity.toUpperCase(),
    p_market_year: marketYear,
  });
  if (error) {
    console.error("getSeedingSeismograph RPC error:", error);
    return [];
  }
  return (data ?? []) as SeismographRow[];
}
