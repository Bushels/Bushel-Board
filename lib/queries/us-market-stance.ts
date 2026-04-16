import { createClient } from "@/lib/supabase/server";
import { US_OVERVIEW_MARKETS, toUsMarketSlug } from "@/lib/constants/us-markets";
import type { BulletPoint, GrainStanceData } from "@/components/dashboard/market-stance-chart";

interface RawSignal {
  signal?: string;
  title?: string;
  body?: string;
  source?: string;
}

export function normalizeUsKeySignals(
  signals: RawSignal[] | null | undefined,
): { bullPoints: BulletPoint[]; bearPoints: BulletPoint[] } {
  const bullPoints: BulletPoint[] = [];
  const bearPoints: BulletPoint[] = [];
  if (!Array.isArray(signals)) return { bullPoints, bearPoints };

  for (const entry of signals) {
    if (!entry || typeof entry !== "object") continue;
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    const body = typeof entry.body === "string" ? entry.body.trim() : "";
    if (!title || !body) continue;

    const bullet: BulletPoint = { fact: title, reasoning: body };
    if (entry.signal === "bullish") bullPoints.push(bullet);
    else if (entry.signal === "bearish") bearPoints.push(bullet);
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

  // Prior score from second-most-recent entry per market (simple approach: not stored as weekly anchor on this table)
  // For MVP: priorScore = null. Trajectory lives in us_score_trajectory and is out of scope for this task.

  // Latest prices keyed by futures grain
  const { data: prices } = await supabase
    .from("grain_prices")
    .select("grain, settlement_price")
    .order("price_date", { ascending: false })
    .limit(30);

  const priceMap = new Map(
    (prices ?? []).map((p) => [p.grain, `$${Number(p.settlement_price).toFixed(2)}`]),
  );

  return US_OVERVIEW_MARKETS.flatMap((market) => {
    const row = latest.find((r) => r.market_name === market.name);
    if (!row) return []; // omit markets with no analysis yet (e.g. US Barley today)

    const { bullPoints, bearPoints } = normalizeUsKeySignals(row.key_signals as RawSignal[] | null);

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
