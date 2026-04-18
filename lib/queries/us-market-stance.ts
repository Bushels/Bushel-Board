import { createClient } from "@/lib/supabase/server";
import { US_OVERVIEW_MARKETS, toUsMarketSlug } from "@/lib/constants/us-markets";
import type { BulletPoint, GrainStanceData } from "@/components/dashboard/market-stance-chart";

/**
 * Parse markdown-bulleted text ("• Claim — reasoning\n• Claim — reasoning")
 * into BulletPoints. Tolerant of:
 *   - leading bullet markers: • · - * or no marker
 *   - fact/reasoning separators: em-dash " — ", en-dash " – ",
 *     ASCII " - ", or ": "
 *   - lines with no separator (whole line becomes the fact)
 *
 * Used as a fallback when `key_signals` is a flat string array rather than
 * the structured `{title, body, signal}` shape the overview normalizer
 * originally expected.
 */
export function parseBulletedText(text: string | null | undefined): BulletPoint[] {
  if (!text || typeof text !== "string") return [];

  const bullets: BulletPoint[] = [];
  const lines = text
    .split(/\r?\n+/)
    .map((line) => line.replace(/^\s*[•·\-*]\s*/, "").trim())
    .filter(Boolean);

  for (const line of lines) {
    // Prefer em-dash / en-dash (visually the divider the desk chief uses),
    // fall back to " - " or ": " for legacy / generic formats.
    // Regex matches the FIRST occurrence with whitespace on both sides so
    // hyphens inside tokens like "4-8 weeks" or "YoY-adjusted" aren't split.
    const match =
      line.match(/^(.+?)\s+[—–]\s+(.+)$/) ??
      line.match(/^(.+?)\s+-\s+(.+)$/) ??
      line.match(/^([^:]+):\s+(.+)$/);

    if (match) {
      const fact = match[1].trim();
      const reasoning = match[2].trim();
      if (fact) bullets.push({ fact, reasoning });
    } else {
      // No separator — whole line becomes the fact, reasoning intentionally empty.
      // The card UI tolerates empty reasoning (just renders the fact line).
      bullets.push({ fact: line, reasoning: "" });
    }
  }

  return bullets;
}

/**
 * Normalize `key_signals` into bull/bear BulletPoints.
 *
 * Priority 1: `key_signals` entries shaped `{title, body, signal: "bullish"|"bearish"}`
 * Priority 2: (fallback) parse markdown-bulleted `bull_case` / `bear_case` text.
 *
 * Neither the Grok pipeline nor the Claude desk chief has consistently written
 * the structured shape, so the fallback is the common path in practice.
 */
export function normalizeUsKeySignals(
  signals: unknown,
  fallback?: { bull_case?: string | null; bear_case?: string | null },
): { bullPoints: BulletPoint[]; bearPoints: BulletPoint[] } {
  const bullPoints: BulletPoint[] = [];
  const bearPoints: BulletPoint[] = [];

  if (Array.isArray(signals)) {
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
  }

  // Fallback: if the structured pass produced nothing, parse the analyst's
  // bull_case / bear_case text fields instead.
  if (bullPoints.length === 0 && bearPoints.length === 0 && fallback) {
    bullPoints.push(...parseBulletedText(fallback.bull_case));
    bearPoints.push(...parseBulletedText(fallback.bear_case));
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
      "market_name, stance_score, data_confidence, initial_thesis, recommendation, key_signals, bull_case, bear_case, generated_at",
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

    const { bullPoints, bearPoints } = normalizeUsKeySignals(row.key_signals, {
      bull_case: row.bull_case,
      bear_case: row.bear_case,
    });

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
