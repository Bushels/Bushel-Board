import {
  buildCotPositioningResult,
  type CotPosition,
  type CotPositioningResult,
  type CotRawRow,
} from "@/lib/cot-market-structure";
import { createClient } from "@/lib/supabase/server";

export type { CotPosition, CotPositioningResult };

/**
 * Fetches CFTC COT positioning data for a grain and reshapes it into a
 * farmer-friendly market structure view.
 */
export async function getCotPositioning(
  grain: string,
  cropYear: string,
  weeksBack: number = 8,
  maxGrainWeek?: number
): Promise<CotPositioningResult> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("cftc_cot_positions")
      .select(
        [
          "report_date",
          "commodity",
          "exchange",
          "mapping_type",
          "open_interest",
          "change_open_interest",
          "managed_money_long",
          "managed_money_short",
          "change_managed_money_long",
          "change_managed_money_short",
          "prod_merc_long",
          "prod_merc_short",
          "change_prod_merc_long",
          "change_prod_merc_short",
          "grain_week",
        ].join(",")
      )
      .eq("cgc_grain", grain)
      .eq("crop_year", cropYear)
      .order("report_date", { ascending: false })
      .limit(Math.max(weeksBack * 3, 156));

    if (typeof maxGrainWeek === "number") {
      query = query.lte("grain_week", maxGrainWeek);
    }

    const { data, error } = await query;

    if (error || !Array.isArray(data) || data.length === 0) {
      return buildCotPositioningResult([], grain, weeksBack);
    }

    const rawRows = data as unknown as Array<Record<string, unknown>>;
    const rows: CotRawRow[] = rawRows.map((row) => ({
      report_date: String(row.report_date),
      commodity: String(row.commodity),
      exchange: String(row.exchange),
      mapping_type: row.mapping_type === "secondary" ? "secondary" : "primary",
      open_interest: Number(row.open_interest) || 0,
      change_open_interest:
        row.change_open_interest == null ? null : Number(row.change_open_interest),
      managed_money_long: Number(row.managed_money_long) || 0,
      managed_money_short: Number(row.managed_money_short) || 0,
      change_managed_money_long:
        row.change_managed_money_long == null
          ? null
          : Number(row.change_managed_money_long),
      change_managed_money_short:
        row.change_managed_money_short == null
          ? null
          : Number(row.change_managed_money_short),
      prod_merc_long: Number(row.prod_merc_long) || 0,
      prod_merc_short: Number(row.prod_merc_short) || 0,
      change_prod_merc_long:
        row.change_prod_merc_long == null ? null : Number(row.change_prod_merc_long),
      change_prod_merc_short:
        row.change_prod_merc_short == null ? null : Number(row.change_prod_merc_short),
      grain_week: Number(row.grain_week) || 0,
    }));

    return buildCotPositioningResult(rows, grain, weeksBack);
  } catch (err) {
    console.error("getCotPositioning failed:", err);
    return buildCotPositioningResult([], grain, weeksBack);
  }
}
