import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import { getLatestImportedWeek } from "@/lib/queries/data-freshness";

interface MarketOverviewSnapshotRow {
  grain_week: number | string;
  week_ending_date: string | null;
  producer_deliveries_current_week_kt: number | string | null;
  producer_deliveries_previous_week_kt: number | string | null;
  producer_deliveries_crop_year_kt: number | string | null;
  terminal_receipts_current_week_kt: number | string | null;
  terminal_receipts_previous_week_kt: number | string | null;
  terminal_receipts_crop_year_kt: number | string | null;
  exports_current_week_kt: number | string | null;
  exports_previous_week_kt: number | string | null;
  exports_crop_year_kt: number | string | null;
  commercial_stocks_current_week_kt: number | string | null;
  commercial_stocks_previous_week_kt: number | string | null;
}

export interface MarketSnapshotMetric {
  currentWeekKt: number;
  previousWeekKt: number;
  cropYearKt: number | null;
  wowChangeKt: number;
  wowChangePct: number | null;
}

export interface MarketOverviewSnapshot {
  cropYear: string;
  grainWeek: number;
  weekEndingDate: string | null;
  producerDeliveries: MarketSnapshotMetric;
  terminalReceipts: MarketSnapshotMetric;
  exports: MarketSnapshotMetric;
  commercialStocks: MarketSnapshotMetric;
}

export async function getMarketOverviewSnapshot(): Promise<MarketOverviewSnapshot | null> {
  try {
    const supabase = await createClient();
    const grainWeek = await getLatestImportedWeek();
    const { data, error } = await supabase.rpc("get_market_overview_snapshot", {
      p_crop_year: CURRENT_CROP_YEAR,
      p_grain_week: grainWeek,
    });

    if (error) {
      console.error("getMarketOverviewSnapshot query error", {
        marketOverviewSnapshot: error.message,
      });
      return null;
    }

    const row = Array.isArray(data)
      ? ((data[0] as MarketOverviewSnapshotRow | undefined) ?? null)
      : null;

    if (!row) return null;

    return {
      cropYear: CURRENT_CROP_YEAR,
      grainWeek: Number(row.grain_week) || grainWeek,
      weekEndingDate: row.week_ending_date,
      producerDeliveries: buildMetric(
        toNumber(row.producer_deliveries_current_week_kt),
        toNumber(row.producer_deliveries_previous_week_kt),
        toNumber(row.producer_deliveries_crop_year_kt)
      ),
      terminalReceipts: buildMetric(
        toNumber(row.terminal_receipts_current_week_kt),
        toNumber(row.terminal_receipts_previous_week_kt),
        toNumber(row.terminal_receipts_crop_year_kt)
      ),
      exports: buildMetric(
        toNumber(row.exports_current_week_kt),
        toNumber(row.exports_previous_week_kt),
        toNumber(row.exports_crop_year_kt)
      ),
      commercialStocks: buildMetric(
        toNumber(row.commercial_stocks_current_week_kt),
        toNumber(row.commercial_stocks_previous_week_kt),
        null
      ),
    };
  } catch (error) {
    console.error("getMarketOverviewSnapshot failed:", error);
    return null;
  }
}

function toNumber(value: number | string | null | undefined): number {
  return Number(value ?? 0) || 0;
}

function buildMetric(
  currentWeekKt: number,
  previousWeekKt: number,
  cropYearKt: number | null
): MarketSnapshotMetric {
  const wowChangeKt = currentWeekKt - previousWeekKt;
  const wowChangePct =
    previousWeekKt > 0 ? Number((((currentWeekKt - previousWeekKt) / previousWeekKt) * 100).toFixed(1)) : null;

  return {
    currentWeekKt,
    previousWeekKt,
    cropYearKt,
    wowChangeKt,
    wowChangePct,
  };
}

