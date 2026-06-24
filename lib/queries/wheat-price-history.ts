import { createClient } from "@/lib/supabase/server";

export type WheatPriceHistoryLeg = "Spring Wheat" | "HRW Wheat" | "SRW Wheat";

export interface WheatPriceHistoryRow {
  leg: WheatPriceHistoryLeg;
  grain: string | null;
  contract: string | null;
  exchange: string | null;
  priceDate: string;
  settlementPrice: number;
  changePct: number | null;
  currency: string | null;
  unit: string | null;
  source: string | null;
}

type WheatPriceHistoryRpcRow = {
  price_leg: string | null;
  grain: string | null;
  contract: string | null;
  exchange: string | null;
  price_date: string | null;
  settlement_price: number | string | null;
  change_pct: number | string | null;
  currency: string | null;
  unit: string | null;
  source: string | null;
};

const WHEAT_PRICE_HISTORY_LEGS = new Set<WheatPriceHistoryLeg>([
  "Spring Wheat",
  "HRW Wheat",
  "SRW Wheat",
]);

function isWheatPriceHistoryLeg(value: string | null): value is WheatPriceHistoryLeg {
  return value !== null && WHEAT_PRICE_HISTORY_LEGS.has(value as WheatPriceHistoryLeg);
}

function numberOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeWheatPriceHistoryRows(rows: WheatPriceHistoryRpcRow[]): WheatPriceHistoryRow[] {
  return rows
    .map((row) => {
      const settlementPrice = numberOrNull(row.settlement_price);
      if (!isWheatPriceHistoryLeg(row.price_leg) || !row.price_date || settlementPrice === null) {
        return null;
      }
      return {
        leg: row.price_leg,
        grain: row.grain,
        contract: row.contract,
        exchange: row.exchange,
        priceDate: row.price_date,
        settlementPrice,
        changePct: numberOrNull(row.change_pct),
        currency: row.currency,
        unit: row.unit,
        source: row.source,
      };
    })
    .filter((row): row is WheatPriceHistoryRow => row !== null);
}

export async function getWheatPriceHistory(days = 60): Promise<WheatPriceHistoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_wheat_price_history", {
    p_days: Math.max(7, Math.min(days, 180)),
  });

  if (error || !Array.isArray(data)) {
    console.error("getWheatPriceHistory error:", error?.message ?? "Unexpected response");
    return [];
  }

  return normalizeWheatPriceHistoryRows(data as WheatPriceHistoryRpcRow[]);
}
