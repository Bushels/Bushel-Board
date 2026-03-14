import { createClient } from "@/lib/supabase/server";

export interface CotPosition {
  report_date: string;
  commodity: string;
  managed_money_net: number;
  managed_money_net_pct: number;
  commercial_net: number;
  commercial_net_pct: number;
  open_interest: number;
  wow_net_change: number;
  spec_commercial_divergence: boolean;
  grain_week: number;
}

export interface CotPositioningResult {
  positions: CotPosition[];
  latest: CotPosition | null;
  hasDivergence: boolean;
}

/**
 * Fetches CFTC COT positioning data for a grain.
 * Uses the existing get_cot_positioning RPC.
 */
export async function getCotPositioning(
  grain: string,
  cropYear: string,
  weeksBack: number = 8
): Promise<CotPositioningResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_cot_positioning", {
      p_grain: grain,
      p_crop_year: cropYear,
      p_weeks_back: weeksBack,
    });

    if (error || !data || !Array.isArray(data) || data.length === 0) {
      return { positions: [], latest: null, hasDivergence: false };
    }

    const positions: CotPosition[] = (
      data as Array<Record<string, unknown>>
    ).map((row) => ({
      report_date: row.report_date as string,
      commodity: row.commodity as string,
      managed_money_net: Number(row.managed_money_net) || 0,
      managed_money_net_pct: Number(row.managed_money_net_pct) || 0,
      commercial_net: Number(row.commercial_net) || 0,
      commercial_net_pct: Number(row.commercial_net_pct) || 0,
      open_interest: Number(row.open_interest) || 0,
      wow_net_change: Number(row.wow_net_change) || 0,
      spec_commercial_divergence: Boolean(row.spec_commercial_divergence),
      grain_week: Number(row.grain_week) || 0,
    }));

    const latest = positions[0] ?? null;
    const hasDivergence = latest?.spec_commercial_divergence ?? false;

    return { positions, latest, hasDivergence };
  } catch (err) {
    console.error("getCotPositioning failed:", err);
    return { positions: [], latest: null, hasDivergence: false };
  }
}
