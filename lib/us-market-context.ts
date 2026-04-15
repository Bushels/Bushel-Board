/**
 * US Market Context — Pre-computed USDA signals for analyst prompt injection.
 *
 * Queries usda_export_sales, usda_wasde_estimates, and usda_crop_progress
 * tables and formats a markdown section for the analyst data brief.
 *
 * This is a server-only module (imports Supabase server client).
 */

import { createClient } from "@supabase/supabase-js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UsExportContext {
  commodity: string;
  mappingType: string;
  weekEnding: string;
  netSalesMt: number | null;
  exportsMt: number | null;
  outstandingMt: number | null;
  cumulativeExportsMt: number | null;
  exportPacePct: number | null;
  topBuyers: Array<{ country: string; mt: number }> | null;
}

export interface UsWasdeContext {
  commodity: string;
  country: string;
  reportDate: string;
  endingStocksMmt: number | null;
  stocksToUsePct: number | null;
  revisionDirection: string | null;
  stocksChangeMmt: number | null;
  productionMmt: number | null;
  exportsMmt: number | null;
}

export interface UsCropCondition {
  commodity: string;
  weekEnding: string;
  goodExcellentPct: number | null;
  conditionIndex: number | null;
  gePctYoyChange: number | null;
  plantedPct: number | null;
  plantedPctVsAvg: number | null;
}

export interface UsMarketContext {
  exports: UsExportContext[];
  wasde: UsWasdeContext[];
  cropConditions: UsCropCondition[];
  promptSection: string;
}

// ─── CGC ↔ USDA Grain Mapping ──────────────────────────────────────────────

export const CGC_TO_USDA_MAP: Record<
  string,
  { commodities: string[]; mappingNote: string }
> = {
  Wheat: {
    commodities: ["Wheat"],
    mappingNote: "Direct comp: US HRW/HRS vs CWRS",
  },
  "Amber Durum": {
    commodities: ["Wheat"],
    mappingNote: "Durum subclass of wheat",
  },
  Canola: {
    commodities: ["Soybeans", "Soybean Oil", "Soybean Meal"],
    mappingNote: "Proxy: soybean complex drives canola floor",
  },
  Corn: { commodities: ["Corn"], mappingNote: "Direct comp" },
  Barley: {
    commodities: ["Barley"],
    mappingNote: "Direct comp (thin US export program)",
  },
  Oats: {
    commodities: ["Oats"],
    mappingNote: "Direct comp (90% of Canadian oats → US)",
  },
  Soybeans: { commodities: ["Soybeans"], mappingNote: "Direct comp" },
  Peas: { commodities: [], mappingNote: "No USDA equivalent — India/China driven" },
  Lentils: { commodities: [], mappingNote: "No USDA equivalent — India/China driven" },
  Flaxseed: { commodities: [], mappingNote: "No USDA equivalent — EU/China driven" },
  Rye: { commodities: [], mappingNote: "No USDA equivalent" },
  "Mustard Seed": { commodities: [], mappingNote: "No USDA equivalent" },
  "Sunflower Seed": { commodities: [], mappingNote: "Thin US export program" },
  "Canary Seed": { commodities: [], mappingNote: "No USDA equivalent" },
  Triticale: { commodities: [], mappingNote: "No USDA equivalent" },
  Chickpeas: { commodities: [], mappingNote: "Minimal US export data" },
};

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtNum(val: number | null, decimals = 0): string {
  if (val == null) return "N/A";
  return val.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtPct(val: number | null): string {
  if (val == null) return "N/A";
  const sign = val > 0 ? "+" : "";
  return `${sign}${val.toFixed(1)}%`;
}

// ─── Prompt Builder ──────────────────────────────────────────────────────────

export function buildUsMarketPromptSection(ctx: UsMarketContext): string {
  const lines: string[] = ["## US Market Context (USDA Signals)"];

  // Export Sales
  if (ctx.exports.length > 0) {
    lines.push("");
    lines.push("### Weekly Export Sales (USDA FAS)");
    for (const e of ctx.exports) {
      const buyers =
        e.topBuyers && e.topBuyers.length > 0
          ? e.topBuyers.map((b) => `${b.country} ${fmtNum(b.mt)} MT`).join(", ")
          : "N/A";
      const mapTag = e.mappingType === "proxy" ? " (PROXY)" : "";
      lines.push(
        `- ${e.commodity}${mapTag} (wk ending ${e.weekEnding}): Net sales ${fmtNum(e.netSalesMt)} MT | Shipped ${fmtNum(e.exportsMt)} MT | Outstanding ${fmtNum(e.outstandingMt)} MT | Export pace ${fmtNum(e.exportPacePct, 1)}% of USDA target | Top buyers: ${buyers}`
      );
    }
    lines.push(
      "- NOTE: USDA data is 7-8 days old at import. Use as global demand proxy, not Canadian supply indicator."
    );
  }

  // WASDE S&D
  if (ctx.wasde.length > 0) {
    lines.push("");
    lines.push("### WASDE Supply & Demand (Monthly)");
    for (const w of ctx.wasde) {
      const rev =
        w.revisionDirection && w.revisionDirection !== "unchanged"
          ? ` (${w.revisionDirection} vs prior month by ${fmtNum(Math.abs(w.stocksChangeMmt ?? 0), 1)} MMT)`
          : "";
      lines.push(
        `- ${w.commodity} (${w.country}, ${w.reportDate}): Ending stocks ${fmtNum(w.endingStocksMmt, 1)} MMT | S/U ratio ${fmtNum(w.stocksToUsePct, 1)}%${rev}`
      );
    }
    lines.push(
      "- S/U < 10% = tight (bullish). S/U > 20% = comfortable (bearish). Revision direction matters more than absolute level."
    );
  }

  // Crop Conditions
  if (ctx.cropConditions.length > 0) {
    lines.push("");
    lines.push("### Crop Progress & Condition (Weekly, Apr-Nov)");
    for (const c of ctx.cropConditions) {
      const yoy =
        c.gePctYoyChange != null ? ` (${fmtPct(c.gePctYoyChange)} YoY)` : "";
      const plant =
        c.plantedPct != null
          ? ` | Planted ${fmtNum(c.plantedPct, 0)}%${c.plantedPctVsAvg != null ? ` (${fmtPct(c.plantedPctVsAvg)} vs 5yr avg)` : ""}`
          : "";
      lines.push(
        `- ${c.commodity} (wk ending ${c.weekEnding}): G/E ${fmtNum(c.goodExcellentPct, 0)}%${yoy}${plant}`
      );
    }
    lines.push(
      "- G/E% < 50% = supply concern (bullish for prices). Weekly drop > 5 points = significant deterioration."
    );
  }

  if (ctx.exports.length === 0 && ctx.wasde.length === 0 && ctx.cropConditions.length === 0) {
    lines.push("");
    lines.push("No USDA data available for this grain. Thesis is based on Canadian data and CFTC positioning only.");
  }

  return lines.join("\n");
}

// ─── Data Fetchers ───────────────────────────────────────────────────────────

/**
 * Fetch all three USDA data sources for a given CGC grain and format
 * for injection into the analyst prompt.
 */
export async function getUsMarketContext(
  grain: string,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<UsMarketContext> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const mapping = CGC_TO_USDA_MAP[grain];
  const hasUsda = mapping && mapping.commodities.length > 0;

  // Fetch export sales (latest 2 weeks)
  let exports: UsExportContext[] = [];
  if (hasUsda) {
    const { data } = await supabase.rpc("get_usda_export_context", {
      p_cgc_grain: grain,
      p_weeks_back: 2,
    });
    if (data) {
      exports = data.map((r: any) => ({
        commodity: r.commodity,
        mappingType: r.mapping_type,
        weekEnding: r.week_ending,
        netSalesMt: r.net_sales_mt,
        exportsMt: r.exports_mt,
        outstandingMt: r.outstanding_mt,
        cumulativeExportsMt: r.cumulative_exports_mt,
        exportPacePct: r.export_pace_pct,
        topBuyers: r.top_buyers,
      }));
    }
  }

  // Fetch WASDE (latest report, US + World)
  let wasde: UsWasdeContext[] = [];
  if (hasUsda) {
    const { data } = await supabase.rpc("get_usda_wasde_context", {
      p_cgc_grain: grain,
      p_months_back: 1,
    });
    if (data) {
      wasde = data.map((r: any) => ({
        commodity: r.commodity,
        country: r.country,
        reportDate: r.report_date,
        endingStocksMmt: r.ending_stocks_mmt,
        stocksToUsePct: r.stocks_to_use_pct,
        revisionDirection: r.revision_direction,
        stocksChangeMmt: r.stocks_change_mmt,
        productionMmt: r.production_mmt,
        exportsMmt: r.exports_mmt,
      }));
    }
  }

  // Fetch crop conditions (latest 2 weeks)
  let cropConditions: UsCropCondition[] = [];
  if (hasUsda) {
    const { data } = await supabase.rpc("get_usda_crop_conditions", {
      p_cgc_grain: grain,
      p_weeks_back: 2,
    });
    if (data) {
      cropConditions = data.map((r: any) => ({
        commodity: r.commodity,
        weekEnding: r.week_ending,
        goodExcellentPct: r.good_excellent_pct,
        conditionIndex: r.condition_index,
        gePctYoyChange: r.ge_pct_yoy_change,
        plantedPct: r.planted_pct,
        plantedPctVsAvg: r.planted_pct_vs_avg,
      }));
    }
  }

  const promptSection = buildUsMarketPromptSection({
    exports,
    wasde,
    cropConditions,
    promptSection: "", // will be set below
  });

  return { exports, wasde, cropConditions, promptSection };
}
