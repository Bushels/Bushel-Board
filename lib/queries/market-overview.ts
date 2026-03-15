import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import { getLatestImportedWeek } from "@/lib/queries/data-freshness";

interface NumericRow {
  ktonnes: number | string | null;
}

interface DeliveryRow {
  grain_week: number;
  period: string;
  total_kt: number | string | null;
  week_ending_date?: string | null;
}

interface ExportRow extends NumericRow {
  grain_week: number;
  worksheet: string;
  metric: string;
  region: string;
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
    const previousWeek = grainWeek > 1 ? grainWeek - 1 : null;
    const currentAndPreviousWeeks = previousWeek ? [grainWeek, previousWeek] : [grainWeek];

    const [
      deliveryResult,
      receiptCurrentResult,
      receiptCropYearResult,
      exportCurrentResult,
      exportCropYearResult,
      stocksResult,
      weekDateResult,
    ] = await Promise.all([
      supabase
        .from("v_country_producer_deliveries")
        .select("grain_week, period, total_kt, week_ending_date")
        .eq("crop_year", CURRENT_CROP_YEAR)
        .in("grain_week", currentAndPreviousWeeks)
        .in("period", ["Current Week", "Crop Year"]),
      supabase
        .from("cgc_observations")
        .select("grain_week, ktonnes")
        .eq("crop_year", CURRENT_CROP_YEAR)
        .eq("worksheet", "Terminal Receipts")
        .eq("metric", "Receipts")
        .eq("period", "Current Week")
        .in("grain_week", currentAndPreviousWeeks),
      supabase
        .from("cgc_observations")
        .select("ktonnes")
        .eq("crop_year", CURRENT_CROP_YEAR)
        .eq("grain_week", grainWeek)
        .eq("worksheet", "Terminal Receipts")
        .eq("metric", "Receipts")
        .eq("period", "Crop Year"),
      supabase
        .from("cgc_observations")
        .select("grain_week, worksheet, metric, region, ktonnes")
        .eq("crop_year", CURRENT_CROP_YEAR)
        .eq("period", "Current Week")
        .in("grain_week", currentAndPreviousWeeks)
        .in("worksheet", [
          "Terminal Exports",
          "Primary Shipment Distribution",
          "Producer Cars",
        ]),
      supabase
        .from("cgc_observations")
        .select("worksheet, metric, region, ktonnes")
        .eq("crop_year", CURRENT_CROP_YEAR)
        .eq("grain_week", grainWeek)
        .eq("period", "Crop Year")
        .in("worksheet", [
          "Terminal Exports",
          "Primary Shipment Distribution",
          "Producer Cars",
        ]),
      supabase
        .from("cgc_observations")
        .select("grain_week, ktonnes")
        .eq("crop_year", CURRENT_CROP_YEAR)
        .eq("worksheet", "Summary")
        .eq("metric", "Stocks")
        .eq("period", "Current Week")
        .eq("grade", "")
        .in("grain_week", currentAndPreviousWeeks),
      supabase
        .from("cgc_observations")
        .select("week_ending_date")
        .eq("crop_year", CURRENT_CROP_YEAR)
        .eq("grain_week", grainWeek)
        .limit(1)
        .maybeSingle(),
    ]);

    if (
      deliveryResult.error ||
      receiptCurrentResult.error ||
      receiptCropYearResult.error ||
      exportCurrentResult.error ||
      exportCropYearResult.error ||
      stocksResult.error
    ) {
      console.error("getMarketOverviewSnapshot query error", {
        delivery: deliveryResult.error?.message,
        receiptCurrent: receiptCurrentResult.error?.message,
        receiptCropYear: receiptCropYearResult.error?.message,
        exportCurrent: exportCurrentResult.error?.message,
        exportCropYear: exportCropYearResult.error?.message,
        stocks: stocksResult.error?.message,
      });
      return null;
    }

    const deliveryRows = (deliveryResult.data ?? []) as DeliveryRow[];
    const receiptCurrentRows = (receiptCurrentResult.data ?? []) as Array<NumericRow & { grain_week: number }>;
    const receiptCropYearRows = (receiptCropYearResult.data ?? []) as NumericRow[];
    const exportCurrentRows = (exportCurrentResult.data ?? []) as ExportRow[];
    const exportCropYearRows = (exportCropYearResult.data ?? []) as ExportRow[];
    const stocksRows = (stocksResult.data ?? []) as Array<NumericRow & { grain_week: number }>;

    const producerDeliveriesCurrentWeek = sumValues(
      deliveryRows.filter((row) => row.grain_week === grainWeek && row.period === "Current Week"),
      (row) => row.total_kt
    );
    const producerDeliveriesPreviousWeek = sumValues(
      deliveryRows.filter((row) => row.grain_week === previousWeek && row.period === "Current Week"),
      (row) => row.total_kt
    );
    const producerDeliveriesCropYear = sumValues(
      deliveryRows.filter((row) => row.grain_week === grainWeek && row.period === "Crop Year"),
      (row) => row.total_kt
    );

    const terminalReceiptsCurrentWeek = sumValues(
      receiptCurrentRows.filter((row) => row.grain_week === grainWeek),
      (row) => row.ktonnes
    );
    const terminalReceiptsPreviousWeek = sumValues(
      receiptCurrentRows.filter((row) => row.grain_week === previousWeek),
      (row) => row.ktonnes
    );
    const terminalReceiptsCropYear = sumValues(receiptCropYearRows, (row) => row.ktonnes);

    const exportsCurrentWeek = sumExportRows(
      exportCurrentRows.filter((row) => row.grain_week === grainWeek)
    );
    const exportsPreviousWeek = sumExportRows(
      exportCurrentRows.filter((row) => row.grain_week === previousWeek)
    );
    const exportsCropYear = sumExportRows(exportCropYearRows);

    const commercialStocksCurrentWeek = sumValues(
      stocksRows.filter((row) => row.grain_week === grainWeek),
      (row) => row.ktonnes
    );
    const commercialStocksPreviousWeek = sumValues(
      stocksRows.filter((row) => row.grain_week === previousWeek),
      (row) => row.ktonnes
    );

    const weekEndingDate =
      weekDateResult.data?.week_ending_date ??
      deliveryRows.find((row) => row.grain_week === grainWeek)?.week_ending_date ??
      null;

    return {
      cropYear: CURRENT_CROP_YEAR,
      grainWeek,
      weekEndingDate,
      producerDeliveries: buildMetric(
        producerDeliveriesCurrentWeek,
        producerDeliveriesPreviousWeek,
        producerDeliveriesCropYear
      ),
      terminalReceipts: buildMetric(
        terminalReceiptsCurrentWeek,
        terminalReceiptsPreviousWeek,
        terminalReceiptsCropYear
      ),
      exports: buildMetric(exportsCurrentWeek, exportsPreviousWeek, exportsCropYear),
      commercialStocks: buildMetric(
        commercialStocksCurrentWeek,
        commercialStocksPreviousWeek,
        null
      ),
    };
  } catch (error) {
    console.error("getMarketOverviewSnapshot failed:", error);
    return null;
  }
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

function sumValues<T>(rows: T[], getValue: (row: T) => number | string | null | undefined): number {
  return rows.reduce((sum, row) => sum + Number(getValue(row) ?? 0), 0);
}

function sumExportRows(rows: ExportRow[]): number {
  return rows
    .filter(
      (row) =>
        (row.worksheet === "Terminal Exports" && row.metric === "Exports") ||
        (row.worksheet === "Primary Shipment Distribution" &&
          row.metric === "Shipment Distribution" &&
          row.region === "Export Destinations") ||
        (row.worksheet === "Producer Cars" &&
          row.metric === "Shipment Distribution" &&
          row.region === "Export")
    )
    .reduce((sum, row) => sum + Number(row.ktonnes ?? 0), 0);
}
