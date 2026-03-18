import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import type { GrainStanceData } from "@/components/dashboard/market-stance-chart";

// Map of grains we show on overview → their slugs + display order
const OVERVIEW_GRAINS = [
  { grain: "Wheat", slug: "wheat" },
  { grain: "Canola", slug: "canola" },
  { grain: "Barley", slug: "barley" },
  { grain: "Oats", slug: "oats" },
  { grain: "Peas", slug: "peas" },
  { grain: "Corn", slug: "corn" },
  { grain: "Flaxseed", slug: "flaxseed" },
  { grain: "Soybeans", slug: "soybeans" },
  { grain: "Amber Durum", slug: "amber-durum" },
  { grain: "Lentils", slug: "lentils" },
] as const;

// Bunge Moose Jaw cash price labels → grain mapping
const CASH_PRICE_MAP: Record<string, string> = {
  Wheat: "$276.25",
  Canola: "$662.33",
  Barley: "$232.01",
  Oats: "$142.00",
  Peas: "$298.06",
  Corn: "$4.54",
  Flaxseed: "$670.54",
  Soybeans: "$11.57",
  "Amber Durum": "$278.59",
  Lentils: "$547.50",
};

/**
 * Get the latest AI market stances for the overview chart.
 *
 * Pulls current and prior grain_week stances from market_analysis,
 * joining with latest grain_prices where available.
 */
export async function getMarketStances(
  grainWeek: number
): Promise<GrainStanceData[]> {
  const supabase = await createClient();

  // Get current week stances
  const { data: currentStances, error: currentErr } = await supabase
    .from("market_analysis")
    .select("grain, grain_week, stance_score, data_confidence, generated_at")
    .eq("grain_week", grainWeek)
    .in(
      "grain",
      OVERVIEW_GRAINS.map((g) => g.grain)
    )
    .not("stance_score", "is", null)
    .order("generated_at", { ascending: false });

  if (currentErr) {
    console.error("Failed to fetch market stances:", currentErr);
    return [];
  }

  // Get prior week stances for delta calculation
  const { data: priorStances } = await supabase
    .from("market_analysis")
    .select("grain, stance_score")
    .eq("grain_week", grainWeek - 1)
    .in(
      "grain",
      OVERVIEW_GRAINS.map((g) => g.grain)
    )
    .not("stance_score", "is", null);

  // Get latest prices from our grain_prices table
  const { data: prices } = await supabase
    .from("grain_prices")
    .select("grain, settlement_price, change_amount")
    .order("price_date", { ascending: false })
    .limit(10);

  // Build lookup maps
  const priorMap = new Map(
    (priorStances ?? []).map((p) => [p.grain, p.stance_score])
  );

  const priceMap = new Map(
    (prices ?? []).map((p) => [
      p.grain,
      {
        price: `$${Number(p.settlement_price).toFixed(2)}`,
        change: p.change_amount
          ? `${Number(p.change_amount) >= 0 ? "+" : ""}$${Number(p.change_amount).toFixed(2)}`
          : null,
      },
    ])
  );

  // Deduplicate (take latest generated_at per grain)
  const seenGrains = new Set<string>();
  const deduped = (currentStances ?? []).filter((s) => {
    if (seenGrains.has(s.grain)) return false;
    seenGrains.add(s.grain);
    return true;
  });

  // Map to chart data
  return OVERVIEW_GRAINS.map((g) => {
    const current = deduped.find((s) => s.grain === g.grain);
    const priceData = priceMap.get(g.grain);
    // Use DB price if available, otherwise fall back to hardcoded cash prices
    const cashPrice = priceData?.price ?? CASH_PRICE_MAP[g.grain] ?? null;

    return {
      grain: g.grain,
      slug: g.slug,
      score: current?.stance_score ?? 0,
      priorScore: priorMap.get(g.grain) ?? null,
      confidence: (current?.data_confidence as "high" | "medium" | "low") ?? "low",
      cashPrice,
      priceChange: priceData?.change ?? null,
    };
  });
}
