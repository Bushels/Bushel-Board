import { createClient } from "@/lib/supabase/server";
import type { BulletPoint, GrainStanceData } from "@/components/dashboard/market-stance-chart";

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

function coerceBullets(raw: unknown): BulletPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: BulletPoint[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const fact = typeof (entry as { fact?: unknown }).fact === "string"
      ? (entry as { fact: string }).fact.trim()
      : "";
    const reasoning = typeof (entry as { reasoning?: unknown }).reasoning === "string"
      ? (entry as { reasoning: string }).reasoning.trim()
      : "";
    if (fact && reasoning) out.push({ fact, reasoning });
  }
  return out;
}

export async function getMarketStances(grainWeek: number): Promise<GrainStanceData[]> {
  const supabase = await createClient();

  const { data: currentStances, error: currentErr } = await supabase
    .from("market_analysis")
    .select(
      "grain, grain_week, stance_score, data_confidence, generated_at, initial_thesis, bull_reasoning, bear_reasoning",
    )
    .eq("grain_week", grainWeek)
    .in("grain", OVERVIEW_GRAINS.map((g) => g.grain))
    .not("stance_score", "is", null)
    .order("generated_at", { ascending: false });

  if (currentErr) {
    console.error("Failed to fetch market stances:", currentErr);
    return [];
  }

  const { data: priorStances } = await supabase
    .from("market_analysis")
    .select("grain, stance_score")
    .eq("grain_week", grainWeek - 1)
    .in("grain", OVERVIEW_GRAINS.map((g) => g.grain))
    .not("stance_score", "is", null);

  const { data: prices } = await supabase
    .from("grain_prices")
    .select("grain, settlement_price, change_amount")
    .order("price_date", { ascending: false })
    .limit(10);

  const priorMap = new Map(
    (priorStances ?? []).map((p) => [p.grain, p.stance_score]),
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
    ]),
  );

  const seen = new Set<string>();
  const deduped = (currentStances ?? []).filter((s) => {
    if (seen.has(s.grain)) return false;
    seen.add(s.grain);
    return true;
  });

  return OVERVIEW_GRAINS.map((g) => {
    const current = deduped.find((s) => s.grain === g.grain);
    const priceData = priceMap.get(g.grain);
    const cashPrice = priceData?.price ?? CASH_PRICE_MAP[g.grain] ?? null;

    return {
      grain: g.grain,
      slug: g.slug,
      region: "CA" as const,
      score: current?.stance_score ?? 0,
      priorScore: priorMap.get(g.grain) ?? null,
      confidence: (current?.data_confidence as "high" | "medium" | "low") ?? "low",
      cashPrice,
      priceChange: priceData?.change ?? null,
      thesisSummary: current?.initial_thesis ?? null,
      bullPoints: coerceBullets(current?.bull_reasoning),
      bearPoints: coerceBullets(current?.bear_reasoning),
      recommendation: null,
      detailHref: `/grain/${g.slug}`,
    };
  });
}
