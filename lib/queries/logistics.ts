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
// Supabase queries
// ---------------------------------------------------------------------------

/**
 * Fetch the logistics snapshot for a given crop year and grain week.
 * Calls the `get_logistics_snapshot` RPC function.
 */
export async function getLogisticsSnapshot(
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
      console.error("getLogisticsSnapshot error:", error.message);
      return null;
    }

    return data as LogisticsSnapshot | null;
  } catch (err) {
    console.error("getLogisticsSnapshot failed:", err);
    return null;
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
