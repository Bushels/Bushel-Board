import {
  KALSHI_COMMODITY_SERIES,
  buildKalshiCalibrationRows,
  fetchKalshiCommoditySnapshot,
  type KalshiCalibrationRow,
  type KalshiCommodityMarket,
} from "@/lib/kalshi/commodity-markets";
import type { ThesisComparisonRow } from "@/lib/queries/thesis-board";

export interface KalshiCommodityCalibrationData {
  capturedAt: string;
  sourceStatus: "live" | "no_active_markets" | "fetch_error";
  watchedSeriesCount: number;
  marketCount: number;
  latestMarketCount: number;
  markets: KalshiCommodityMarket[];
  rows: KalshiCalibrationRow[];
  warnings: string[];
}

export async function getKalshiCommodityCalibrationData(
  comparisonRows: ThesisComparisonRow[],
): Promise<KalshiCommodityCalibrationData> {
  const snapshot = await fetchKalshiCommoditySnapshot();
  const rows = buildKalshiCalibrationRows(
    comparisonRows,
    snapshot.markets,
    snapshot.latestMarkets,
  );
  const sourceStatus =
    snapshot.markets.length > 0
      ? "live"
      : snapshot.latestMarkets.length === 0 && snapshot.warnings.length > 0
        ? "fetch_error"
        : "no_active_markets";

  return {
    capturedAt: snapshot.capturedAt,
    sourceStatus,
    watchedSeriesCount: KALSHI_COMMODITY_SERIES.length,
    marketCount: snapshot.markets.length,
    latestMarketCount: snapshot.latestMarkets.length,
    markets: snapshot.markets,
    rows,
    warnings: snapshot.warnings,
  };
}
