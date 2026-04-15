/**
 * Chat context builder — assembles per-turn context for the grain analyst.
 * Parallel data loading for speed. Keeps total context under budget.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildVikingPipelineContext } from "./viking-knowledge.ts";

export interface ChatContext {
  farmerCard: string;
  nationalStances: string;
  areaContext: string;
  postedPrices: string;
  seasonalFocus: string;
  vikingKnowledge: string;
  dataFreshness: DataFreshness;
}

export interface DataFreshness {
  cgcLatestWeek: number | null;
  cgcImportedAt: string | null;
  futuresLatestDate: string | null;
  localReportCount: number;
  localLatestAt: string | null;
  postedPriceCount: number;
}

export async function buildChatContext(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  fsaCode: string | null,
  mentionedGrains: string[]
): Promise<ChatContext> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const cropYear = currentCropYear();
  // Load area intel for ALL mentioned grains (up to 3), not just the primary
  const grainsToCheck = mentionedGrains.slice(0, 3);
  if (grainsToCheck.length === 0) grainsToCheck.push("Wheat");

  // Parallel data loading — all independent queries at once
  const [
    profile,
    cropPlans,
    farmerMemory,
    nationalStances,
    ...areaIntelResults
  ] = await Promise.all([
    loadProfile(supabase, userId),
    loadCropPlans(supabase, userId, cropYear),
    loadFarmerMemory(supabase, userId),
    loadNationalStances(supabase, cropYear),
    ...grainsToCheck.map((grain) =>
      fsaCode ? loadAreaIntel(supabase, fsaCode, grain) : Promise.resolve(null)
    ),
  ]);

  // Also load freshness data + posted prices (separate promise group to keep types clean)
  const [cgcFreshness, futuresFreshness, postedPrices] = await Promise.all([
    loadCgcFreshness(supabase),
    loadFuturesFreshness(supabase),
    fsaCode ? loadPostedPrices(supabase, fsaCode) : Promise.resolve([]),
  ]);

  // Merge area intel — primary grain for trust footer, all grains for context
  const areaIntelMap = new Map<string, Awaited<ReturnType<typeof loadAreaIntel>>>();
  grainsToCheck.forEach((grain, i) => {
    if (areaIntelResults[i]) areaIntelMap.set(grain, areaIntelResults[i]!);
  });
  const primaryGrain = grainsToCheck[0];
  const areaIntel = areaIntelMap.get(primaryGrain) ?? null;

  // Build farmer card
  const farmerCard = buildFarmerCard(profile, cropPlans, farmerMemory);

  // Build national stances summary
  const stanceLines = nationalStances.map(
    (s: { grain: string; stance_score: number; data_confidence: number }) =>
      `${s.grain}: stance ${s.stance_score > 0 ? "+" : ""}${s.stance_score}, confidence ${s.data_confidence}%`
  );

  // Build area context — include all mentioned grains
  let areaContext = "No postal area on file.";
  if (fsaCode) {
    const contextLines: string[] = [];
    for (const [grain, intel] of areaIntelMap) {
      if (!intel) continue;
      const count = intel.reportCount;
      if (count === 0) {
        contextLines.push(`${grain} in ${fsaCode}: No local reports yet.`);
      } else if (count < 3) {
        contextLines.push(`${grain} in ${fsaCode}: ${count} report(s). Not enough for area stance (need 3+).`);
      } else {
        contextLines.push(`${grain} in ${fsaCode}: ${count} reports. Latest basis: ${intel.latestBasis ?? "unknown"}. Trend: ${intel.basisTrend ?? "unknown"}.`);
      }
    }
    if (contextLines.length === 0) {
      areaContext = `Area ${fsaCode}: No local reports yet. This area is fresh — the farmer would be among the first to share local intel.`;
    } else {
      areaContext = contextLines.join("\n");
    }
  }

  // Build unified posted prices context (grain prices first, then input prices)
  let postedPricesContext = "No posted prices in your area.";
  if (postedPrices.length > 0) {
    const GRAIN_TYPES = new Set(["elevator", "crusher", "mill", "terminal"]);
    const grainPrices = postedPrices.filter((p: any) => GRAIN_TYPES.has(p.business_type));
    const inputPrices = postedPrices.filter((p: any) => !GRAIN_TYPES.has(p.business_type));

    const formatPrice = (p: any) => {
      const priceStr = p.price_per_tonne
        ? `$${Number(p.price_per_tonne).toFixed(2)}/t`
        : p.price_per_bushel
          ? `$${Number(p.price_per_bushel).toFixed(2)}/bu`
          : "";
      const basisStr = p.basis != null ? ` (basis ${Number(p.basis) > 0 ? "+" : ""}${Number(p.basis).toFixed(0)})` : "";
      const hoursAgo = Math.round(Number(p.hours_since_posted));
      const freshness = hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.round(hoursAgo / 24)}d ago`;
      const capacityStr = p.capacity_notes ? ` — ${p.capacity_notes}` : "";
      const deliveryStr = p.delivery_notes ? ` — ${p.delivery_notes}` : "";
      const statusStr = p.facility_status ? ` [${p.facility_status}]` : "";
      const specialStr = p.special_offer ? ` DEAL: ${p.special_offer}` : "";
      const sponsoredTag = p.is_sponsored ? " [sponsored]" : "";
      return `- ${p.facility_name} (${p.business_type}): ${p.grain}${p.grade ? ` ${p.grade}` : ""} — ${priceStr}${basisStr}${capacityStr}${deliveryStr}${specialStr} [${p.delivery_period}, posted ${freshness}]${statusStr}${sponsoredTag} [posted pricing]`;
    };

    const sections: string[] = [];
    if (grainPrices.length > 0) {
      sections.push(`### Grain Prices (${fsaCode})\n${grainPrices.map(formatPrice).join("\n")}`);
    }
    if (inputPrices.length > 0) {
      sections.push(`### Input Prices (${fsaCode})\n${inputPrices.map(formatPrice).join("\n")}`);
    }
    postedPricesContext = `## Posted Prices\n${sections.join("\n\n")}`;
  }

  // Data freshness for trust footer
  const dataFreshness: DataFreshness = {
    cgcLatestWeek: cgcFreshness?.grain_week ?? null,
    cgcImportedAt: cgcFreshness?.imported_at ?? null,
    futuresLatestDate: futuresFreshness?.price_date ?? null,
    localReportCount: areaIntel?.reportCount ?? 0,
    localLatestAt: areaIntel?.latestAt ?? null,
    postedPriceCount: postedPrices.length,
  };

  return {
    farmerCard,
    nationalStances: stanceLines.length > 0 ? stanceLines.join("\n") : "No national stances available.",
    areaContext,
    postedPrices: postedPricesContext,
    seasonalFocus: getSeasonalFocus(),
    vikingKnowledge: buildVikingPipelineContext(primaryGrain),
    dataFreshness,
  };
}

// ─── Data Loaders ────────────────────────────────────

async function loadProfile(supabase: any, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("farmer_name, farm_name, role, postal_code, province")
    .eq("id", userId)
    .single();
  return data;
}

async function loadCropPlans(supabase: any, userId: string, cropYear: string) {
  const { data } = await supabase
    .from("crop_plans")
    .select("grain, production_estimate_kt, contracted_kt, uncontracted_kt")
    .eq("user_id", userId)
    .eq("crop_year", cropYear);
  return data ?? [];
}

async function loadFarmerMemory(supabase: any, userId: string) {
  const { data } = await supabase
    .from("farmer_memory")
    .select("memory_key, memory_value, grain")
    .eq("user_id", userId);
  return data ?? [];
}

async function loadNationalStances(supabase: any, cropYear: string) {
  const { data } = await supabase
    .from("market_analysis")
    .select("grain, stance_score, data_confidence")
    .eq("crop_year", cropYear)
    .order("generated_at", { ascending: false });

  // Deduplicate — keep latest per grain
  const seen = new Set<string>();
  return (data ?? []).filter((row: { grain: string }) => {
    if (seen.has(row.grain)) return false;
    seen.add(row.grain);
    return true;
  });
}

async function loadAreaIntel(supabase: any, fsaCode: string, grain: string) {
  const { data, count } = await supabase
    .from("local_market_intel")
    .select("value_numeric, data_type, reported_at", { count: "exact" })
    .eq("fsa_code", fsaCode)
    .eq("grain", grain)
    .gt("expires_at", new Date().toISOString())
    .order("reported_at", { ascending: false })
    .limit(10);

  const reports = data ?? [];
  const basisReports = reports.filter((r: { data_type: string }) => r.data_type === "basis");

  return {
    reportCount: count ?? 0,
    latestBasis: basisReports.length > 0 ? basisReports[0].value_numeric : null,
    basisTrend: computeBasisTrend(basisReports),
    latestAt: reports.length > 0 ? reports[0].reported_at : null,
  };
}

async function loadPostedPrices(supabase: any, fsaCode: string) {
  // Load all unexpired posted prices for the farmer's area (all types, max 15)
  const { data } = await supabase.rpc("get_area_prices", {
    p_fsa_code: fsaCode,
    p_grain: null,
    p_business_type: null,
  });

  if (!data || data.length === 0) return [];

  // Cap at 15 to keep context budget reasonable
  return data.slice(0, 15);
}

async function loadCgcFreshness(supabase: any) {
  const { data } = await supabase
    .from("cgc_imports")
    .select("grain_week, imported_at")
    .order("imported_at", { ascending: false })
    .limit(1)
    .single();
  return data;
}

async function loadFuturesFreshness(supabase: any) {
  const { data } = await supabase
    .from("grain_prices")
    .select("price_date")
    .order("price_date", { ascending: false })
    .limit(1)
    .single();
  return data;
}

// ─── Builders ────────────────────────────────────────

function buildFarmerCard(
  profile: Record<string, string> | null,
  cropPlans: Array<Record<string, unknown>>,
  memory: Array<{ memory_key: string; memory_value: string; grain: string | null }>
): string {
  const lines: string[] = ["## Farmer Profile"];

  if (profile) {
    if (profile.farmer_name) lines.push(`Name: ${profile.farmer_name}`);
    if (profile.farm_name) lines.push(`Farm: ${profile.farm_name}`);
    if (profile.province) lines.push(`Province: ${profile.province}`);
    if (profile.postal_code) lines.push(`Area: ${profile.postal_code.substring(0, 3)}`);
  }

  if (cropPlans.length > 0) {
    lines.push("\n### Crop Plan");
    for (const cp of cropPlans) {
      const contracted = cp.contracted_kt ? `, ${cp.contracted_kt}kt contracted` : "";
      const uncontracted = cp.uncontracted_kt ? `, ${cp.uncontracted_kt}kt open` : "";
      lines.push(`- ${cp.grain}: ${cp.production_estimate_kt ?? "?"}kt production${contracted}${uncontracted}`);
    }
  }

  if (memory.length > 0) {
    lines.push("\n### Things I Remember");
    for (const m of memory) {
      const scope = m.grain ? ` (${m.grain})` : "";
      lines.push(`- ${m.memory_key}${scope}: ${m.memory_value}`);
    }
  }

  return lines.join("\n");
}

function computeBasisTrend(
  basisReports: Array<{ value_numeric: number; reported_at: string }>
): string | null {
  if (basisReports.length < 2) return null;
  const latest = Number(basisReports[0].value_numeric);
  const previous = Number(basisReports[1].value_numeric);
  if (latest > previous) return "narrowing";
  if (latest < previous) return "widening";
  return "flat";
}

function getSeasonalFocus(): string {
  const month = new Date().getMonth() + 1;
  if (month >= 4 && month <= 5) {
    return "SEASONAL FOCUS: Seeding season. Emphasize input costs, seed availability, fertilizer pricing, seeding progress, soil moisture. Old-crop marketing still relevant if farmer has uncontracted grain.";
  }
  if (month >= 6 && month <= 7) {
    return "SEASONAL FOCUS: Growing season. Emphasize crop conditions, weather impact, pest/disease risk, growing degree days. Watch for quality concerns.";
  }
  if (month >= 8 && month <= 10) {
    return "SEASONAL FOCUS: Harvest season. Emphasize yield estimates, quality reports, harvest progress, basis opportunities, delivery logistics and wait times.";
  }
  return "SEASONAL FOCUS: Marketing season (Nov-Mar). Emphasize basis levels, carry vs cash, export demand, storage costs, contract opportunities. This is when most marketing decisions happen.";
}

// ─── Helpers ─────────────────────────────────────────

function currentCropYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 8) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}

// ─── Trust Footer Computation ────────────────────────

export function computeTrustFooter(freshness: DataFreshness): {
  cgcFreshness: string;
  futuresFreshness: string;
  localReportCount: number;
  localReportFreshness: string;
  postedPrices: string | null;
  confidence: "Early read" | "Solid read" | "Strong read";
} {
  const now = Date.now();

  // CGC freshness
  let cgcFresh = "unknown";
  if (freshness.cgcImportedAt) {
    const days = Math.floor((now - new Date(freshness.cgcImportedAt).getTime()) / (1000 * 60 * 60 * 24));
    cgcFresh = days === 0 ? "today" : `${days}d`;
  }

  // Futures freshness
  let futuresFresh = "unknown";
  if (freshness.futuresLatestDate) {
    const days = Math.floor((now - new Date(freshness.futuresLatestDate).getTime()) / (1000 * 60 * 60 * 24));
    futuresFresh = days === 0 ? "today" : `${days}d`;
  }

  // Local freshness
  let localFresh = "";
  if (freshness.localLatestAt) {
    const days = Math.floor((now - new Date(freshness.localLatestAt).getTime()) / (1000 * 60 * 60 * 24));
    localFresh = days === 0 ? "today" : `last ${days}d`;
  }

  // Confidence
  let confidence: "Early read" | "Solid read" | "Strong read" = "Early read";
  const cgcDays = freshness.cgcImportedAt
    ? Math.floor((now - new Date(freshness.cgcImportedAt).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  if (freshness.localReportCount >= 8 && cgcDays <= 3) {
    confidence = "Strong read";
  } else if (freshness.localReportCount >= 3 && cgcDays <= 7) {
    confidence = "Solid read";
  }

  const postedPricesLabel = freshness.postedPriceCount > 0
    ? `${freshness.postedPriceCount} posted`
    : null;

  return {
    cgcFreshness: cgcFresh,
    futuresFreshness: futuresFresh,
    localReportCount: freshness.localReportCount,
    localReportFreshness: localFresh,
    postedPrices: postedPricesLabel,
    confidence,
  };
}
