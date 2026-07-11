import { createClient } from "@/lib/supabase/server";

export type WheatExportHistoryCountry = "Canada" | "United States";

export interface WheatExportHistoryRow {
  country: WheatExportHistoryCountry;
  sourceName: string | null;
  seasonLabel: string | null;
  weekEnding: string;
  weekIndex: number | null;
  weeklyExportsKt: number | null;
  cumulativeExportsKt: number | null;
  weeklyProducerDeliveriesKt: number | null;
  cumulativeProducerDeliveriesKt: number | null;
  exportDeliveryRatioPct: number | null;
  netSalesKt: number | null;
  outstandingSalesKt: number | null;
  totalCommitmentsKt: number | null;
  exportPacePct: number | null;
  usdaProjectionKt: number | null;
  projectionAdmitted: boolean;
  freshnessStatus: string | null;
  sourcePeriodEnd: string | null;
}

type WheatExportHistoryRpcRow = {
  country: string | null;
  source_name: string | null;
  season_label: string | null;
  week_ending: string | null;
  week_index: number | string | null;
  weekly_exports_kt: number | string | null;
  cumulative_exports_kt: number | string | null;
  weekly_producer_deliveries_kt: number | string | null;
  cumulative_producer_deliveries_kt: number | string | null;
  export_delivery_ratio_pct: number | string | null;
  net_sales_kt: number | string | null;
  outstanding_sales_kt: number | string | null;
  total_commitments_kt: number | string | null;
  export_pace_pct: number | string | null;
  usda_projection_kt: number | string | null;
  projection_admitted: boolean | null;
  freshness_status: string | null;
  source_period_end: string | null;
};

const WHEAT_EXPORT_COUNTRIES = new Set<WheatExportHistoryCountry>([
  "Canada",
  "United States",
]);

function isWheatExportCountry(value: string | null): value is WheatExportHistoryCountry {
  return value !== null && WHEAT_EXPORT_COUNTRIES.has(value as WheatExportHistoryCountry);
}

function numberOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeWheatExportHistoryRows(rows: WheatExportHistoryRpcRow[]): WheatExportHistoryRow[] {
  return rows
    .map((row) => {
      if (!isWheatExportCountry(row.country) || !row.week_ending) return null;
      return {
        country: row.country,
        sourceName: row.source_name,
        seasonLabel: row.season_label,
        weekEnding: row.week_ending,
        weekIndex: numberOrNull(row.week_index),
        weeklyExportsKt: numberOrNull(row.weekly_exports_kt),
        cumulativeExportsKt: numberOrNull(row.cumulative_exports_kt),
        weeklyProducerDeliveriesKt: numberOrNull(row.weekly_producer_deliveries_kt),
        cumulativeProducerDeliveriesKt: numberOrNull(row.cumulative_producer_deliveries_kt),
        exportDeliveryRatioPct: numberOrNull(row.export_delivery_ratio_pct),
        netSalesKt: numberOrNull(row.net_sales_kt),
        outstandingSalesKt: numberOrNull(row.outstanding_sales_kt),
        totalCommitmentsKt: numberOrNull(row.total_commitments_kt),
        exportPacePct: numberOrNull(row.export_pace_pct),
        usdaProjectionKt: numberOrNull(row.usda_projection_kt),
        projectionAdmitted: row.projection_admitted === true,
        freshnessStatus: row.freshness_status,
        sourcePeriodEnd: row.source_period_end,
      };
    })
    .filter((row): row is WheatExportHistoryRow => row !== null);
}

export async function getWheatExportHistory(weeks = 16): Promise<WheatExportHistoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_wheat_export_history", {
    p_weeks: Math.max(4, Math.min(weeks, 52)),
  });

  if (error || !Array.isArray(data)) {
    console.error("getWheatExportHistory error:", error?.message ?? "Unexpected response");
    return [];
  }

  return normalizeWheatExportHistoryRows(data as WheatExportHistoryRpcRow[]);
}
