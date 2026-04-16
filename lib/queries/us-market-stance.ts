import { createClient } from "@/lib/supabase/server";
import { US_OVERVIEW_MARKETS, toUsMarketSlug } from "@/lib/constants/us-markets";
import type { BulletPoint, GrainStanceData } from "@/components/dashboard/market-stance-chart";

export function normalizeUsKeySignals(
  signals: unknown,
): { bullPoints: BulletPoint[]; bearPoints: BulletPoint[] } {
  const bullPoints: BulletPoint[] = [];
  const bearPoints: BulletPoint[] = [];
  if (!Array.isArray(signals)) return { bullPoints, bearPoints };

  for (const entry of signals) {
    if (!entry || typeof entry !== "object") continue;
    const title = typeof (entry as { title?: unknown }).title === "string"
      ? (entry as { title: string }).title.trim()
      : "";
    const body = typeof (entry as { body?: unknown }).body === "string"
      ? (entry as { body: string }).body.trim()
      : "";
    if (!title || !body) continue;

    const signal = typeof (entry as { signal?: unknown }).signal === "string"
      ? (entry as { signal: string }).signal
      : "";
    const bullet: BulletPoint = { fact: title, reasoning: body };
    if (signal === "bullish") bullPoints.push(bullet);
    else if (signal === "bearish") bearPoints.push(bullet);
  }

  return { bullPoints, bearPoints };
}

export async function getUsMarketStancesForOverview(
  marketYear: number,
): Promise<GrainStanceData[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("us_market_analysis")
    .select(
      "market_name, stance_score, data_confidence, initial_thesis, recommendation, key_signals, generated_at",
    )
    .eq("market_year", marketYear)
    .order("generated_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch US market stances:", error);
    return [];
  }

  // Dedupe to latest generated_at per market
  const seen = new Set<string>();
  const latest = (data ?? []).filter((row) => {
    if (seen.has(row.market_name)) return false;
    seen.add(row.market_name);
    return true;
  });

  // TODO: wire up us_score_trajectory for US priorScore. MVP = null.

  // Latest prices filtered to grains we actually render, deduped latest-per-grain
  const futuresGrains = US_OVERVIEW_MARKETS.map((m) => m.futuresGrain);
  const { data: prices } = await supabase
    .from("grain_prices")
    .select("grain, settlement_price, price_date")
    .in("grain", futuresGrains)
    .order("price_date", { ascending: false });

  const priceMap = new Map<string, string>();
  for (const p of prices ?? []) {
    if (priceMap.has(p.grain)) continue;
    if (p.settlement_price == null) continue;
    priceMap.set(p.grain, `$${Number(p.settlement_price).toFixed(2)}`);
  }

  return US_OVERVIEW_MARKETS.flatMap((market) => {
    const row = latest.find((r) => r.market_name === market.name);
    if (!row) return []; // omit markets with no analysis yet (e.g. US Barley today)

    const { bullPoints, bearPoints } = normalizeUsKeySignals(row.key_signals);

    return [
      {
        grain: market.name,
        slug: toUsMarketSlug(market.name),
        region: "US" as const,
        score: row.stance_score ?? 0,
        priorScore: null,
        confidence: (row.data_confidence as "high" | "medium" | "low") ?? "low",
        cashPrice: priceMap.get(market.futuresGrain) ?? null,
        priceChange: null,
        thesisSummary: row.initial_thesis ?? null,
        bullPoints,
        bearPoints,
        recommendation: row.recommendation ?? null,
        detailHref: `/us/${toUsMarketSlug(market.name)}`,
      },
    ];
  });
}
