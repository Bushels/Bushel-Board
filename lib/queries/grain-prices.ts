import { createClient } from "@/lib/supabase/server";

export interface GrainPrice {
  price_date: string;
  settlement_price: number;
  change_amount: number;
  change_pct: number;
  contract: string;
  exchange: string;
  currency: string;
}

export async function getRecentPrices(
  grainName: string,
  days = 10
): Promise<GrainPrice[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("grain_prices")
    .select("price_date, settlement_price, change_amount, change_pct, contract, exchange, currency")
    .eq("grain", grainName)
    .order("price_date", { ascending: false })
    .limit(days);

  if (error) {
    console.error("getRecentPrices error:", error.message);
    return [];
  }

  return (data ?? []).map((r) => ({
    price_date: String(r.price_date),
    settlement_price: Number(r.settlement_price),
    change_amount: Number(r.change_amount),
    change_pct: Number(r.change_pct),
    contract: String(r.contract),
    exchange: String(r.exchange),
    currency: String(r.currency),
  }));
}
