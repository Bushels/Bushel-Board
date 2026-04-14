#!/usr/bin/env npx tsx
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // ignore
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const XAI_API_KEY = process.env.XAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}
if (!XAI_API_KEY) {
  console.error("ERROR: XAI_API_KEY must be set.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const cropYear = "2025-2026";
const grainWeek = 35;
const grains = ["Wheat", "Canola", "Barley", "Oats", "Peas", "Soybeans"] as const;

type Grain = (typeof grains)[number];

type AnchorRow = {
  grain: Grain;
  stance_score: number;
  final_assessment: string;
  initial_thesis: string;
  bull_case: string;
  bear_case: string;
  confidence_score: number | null;
  generated_at: string;
};

type YoyRow = {
  grain: Grain;
  cy_deliveries_kt: number;
  cw_deliveries_kt: number;
  cy_exports_kt: number;
  cy_crush_kt: number;
  commercial_stocks_kt: number;
  cw_terminal_receipts_kt: number;
  wow_deliveries_pct: number;
  wow_stocks_change_kt: number;
  wow_terminal_receipts_pct: number;
  yoy_deliveries_pct: number;
  yoy_exports_pct: number;
  yoy_crush_pct: number;
};

type PriceRow = {
  grain: string;
  contract: string;
  price_date: string;
  settlement_price: number;
  change_pct: number | null;
  currency: string;
  source: string;
};

type CotRow = {
  commodity: string;
  report_date: string;
  managed_money_long: number;
  managed_money_short: number;
  change_managed_money_long: number;
  change_managed_money_short: number;
};

type UsdaRow = {
  commodity: string;
  cgc_grain: string;
  week_ending: string;
  net_sales_mt: number;
  exports_mt: number;
  outstanding_mt: number;
  total_commitments_mt: number;
};

type DebateVerdict = {
  grain: Grain;
  anchor_score: number;
  grok_position: "agree" | "challenge";
  grok_score: number;
  score_delta: number;
  recommendation: "WATCH" | "PATIENCE" | "SCALE_IN" | "ACCELERATE" | "HOLD_FIRM" | "PRICE";
  helpful: boolean;
  why_helpful: string;
  evidence_found: string[];
  farmer_action: string;
};

function priceMapGrain(grain: Grain): string {
  return grain;
}

function cotCommodity(grain: Grain): string | null {
  switch (grain) {
    case "Wheat": return "WHEAT";
    case "Canola": return "CANOLA  AND PRODUCTS";
    case "Oats": return "OATS";
    case "Soybeans": return "SOYBEANS";
    default: return null;
  }
}

function usdaCommodity(grain: Grain): string | null {
  switch (grain) {
    case "Wheat": return "ALL WHEAT";
    case "Canola": return "SOYBEANS";
    case "Oats": return "OATS";
    default: return null;
  }
}

async function fetchData() {
  const [anchorRes, yoyRes, priceRes, cotRes, usdaRes] = await Promise.all([
    supabase
      .from("market_analysis")
      .select("grain,stance_score,final_assessment,initial_thesis,bull_case,bear_case,confidence_score,generated_at")
      .eq("crop_year", cropYear)
      .eq("grain_week", grainWeek)
      .eq("model_used", "hermes_week35_anchor_manual")
      .in("grain", [...grains])
      .order("grain", { ascending: true }),
    supabase
      .from("v_grain_yoy_comparison")
      .select("grain,cy_deliveries_kt,cw_deliveries_kt,cy_exports_kt,cy_crush_kt,commercial_stocks_kt,cw_terminal_receipts_kt,wow_deliveries_pct,wow_stocks_change_kt,wow_terminal_receipts_pct,yoy_deliveries_pct,yoy_exports_pct,yoy_crush_pct")
      .eq("crop_year", cropYear)
      .in("grain", [...grains]),
    supabase
      .from("grain_prices")
      .select("grain,contract,price_date,settlement_price,change_pct,currency,source")
      .in("grain", [...grains.map(priceMapGrain)])
      .gte("price_date", "2026-04-07")
      .order("grain", { ascending: true })
      .order("price_date", { ascending: false }),
    supabase
      .from("cftc_cot_positions")
      .select("commodity,report_date,managed_money_long,managed_money_short,change_managed_money_long,change_managed_money_short")
      .gte("report_date", "2026-03-24")
      .in("commodity", ["WHEAT", "CANOLA  AND PRODUCTS", "OATS", "SOYBEANS"])
      .order("commodity", { ascending: true })
      .order("report_date", { ascending: false }),
    supabase
      .from("usda_export_sales")
      .select("commodity,cgc_grain,week_ending,net_sales_mt,exports_mt,outstanding_mt,total_commitments_mt")
      .eq("market_year", cropYear)
      .in("commodity", ["ALL WHEAT", "SOYBEANS", "OATS"])
      .order("commodity", { ascending: true })
      .order("week_ending", { ascending: false }),
  ]);

  for (const res of [anchorRes, yoyRes, priceRes, cotRes, usdaRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  return {
    anchors: anchorRes.data as AnchorRow[],
    yoy: yoyRes.data as YoyRow[],
    prices: priceRes.data as PriceRow[],
    cot: cotRes.data as CotRow[],
    usda: usdaRes.data as UsdaRow[],
  };
}

function buildBrief(data: Awaited<ReturnType<typeof fetchData>>): string {
  const parts: string[] = [];
  parts.push(`Week 35 anchor review for crop year ${cropYear}.`);
  parts.push(`Data freshness: CGC week 35 ending 2026-04-05, prices through 2026-04-13, COT through 2026-04-07, USDA export sales through 2026-04-02.`);

  for (const grain of grains) {
    const anchor = data.anchors.find((r) => r.grain === grain);
    const yoy = data.yoy.find((r) => r.grain === grain);
    const price = data.prices.find((r) => r.grain === grain);
    const cotCommodityName = cotCommodity(grain);
    const cot = cotCommodityName ? data.cot.find((r) => r.commodity === cotCommodityName) : null;
    const usdaCommodityName = usdaCommodity(grain);
    const usda = usdaCommodityName ? data.usda.find((r) => r.commodity === usdaCommodityName) : null;

    if (!anchor || !yoy) continue;

    const mmNet = cot ? cot.managed_money_long - cot.managed_money_short : null;
    const mmNetChange = cot ? cot.change_managed_money_long - cot.change_managed_money_short : null;

    parts.push(`
## ${grain}
Anchor score: ${anchor.stance_score}
Anchor final assessment: ${anchor.final_assessment}
Anchor thesis: ${anchor.initial_thesis}
Bull case: ${anchor.bull_case}
Bear case: ${anchor.bear_case}

Week 35 CGC data:
- CW deliveries: ${yoy.cw_deliveries_kt} tonnes (WoW ${yoy.wow_deliveries_pct}%)
- CW terminal receipts: ${yoy.cw_terminal_receipts_kt} tonnes (WoW ${yoy.wow_terminal_receipts_pct}%)
- Commercial stocks: ${yoy.commercial_stocks_kt} tonnes (WoW change ${yoy.wow_stocks_change_kt} tonnes)
- CY deliveries: ${yoy.cy_deliveries_kt} tonnes (${yoy.yoy_deliveries_pct}% YoY)
- CY exports: ${yoy.cy_exports_kt} tonnes (${yoy.yoy_exports_pct}% YoY)
- CY processing/crush: ${yoy.cy_crush_kt} tonnes (${yoy.yoy_crush_pct}% YoY)

Latest price snapshot:
- ${price ? `${price.price_date} ${price.settlement_price} ${price.currency} (${price.change_pct ?? "n/a"}% day change, source ${price.source})` : "missing"}

Latest COT snapshot:
- ${cot ? `${cot.report_date} managed money net ${mmNet}, weekly net change ${mmNetChange}` : "not mapped or unavailable"}

Latest USDA export sales snapshot:
- ${usda ? `${usda.week_ending} net sales ${usda.net_sales_mt} MT, exports ${usda.exports_mt} MT, outstanding ${usda.outstanding_mt} MT` : "not mapped or unavailable"}`);
  }

  return parts.join("\n");
}

const schema = {
  type: "object",
  properties: {
    overall_feedback: { type: "string" },
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          grain: { type: "string", enum: [...grains] },
          anchor_score: { type: "integer" },
          grok_position: { type: "string", enum: ["agree", "challenge"] },
          grok_score: { type: "integer" },
          score_delta: { type: "integer" },
          recommendation: { type: "string", enum: ["WATCH", "PATIENCE", "SCALE_IN", "ACCELERATE", "HOLD_FIRM", "PRICE"] },
          helpful: { type: "boolean" },
          why_helpful: { type: "string" },
          evidence_found: { type: "array", items: { type: "string" } },
          farmer_action: { type: "string" }
        },
        required: ["grain", "anchor_score", "grok_position", "grok_score", "score_delta", "recommendation", "helpful", "why_helpful", "evidence_found", "farmer_action"],
        additionalProperties: false
      }
    }
  },
  required: ["overall_feedback", "verdicts"],
  additionalProperties: false
};

async function runDebate(brief: string) {
  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "grok-4-1-fast-reasoning",
      instructions: [
        "You are the counter-analyst in a prairie grain debate.",
        "Use web_search and x_search to challenge or confirm the published Week 35 anchor for six grains.",
        "Do not be polite. Be useful.",
        "For each grain decide whether the anchor is directionally right or needs to move.",
        "Helpful=true only if your debate adds something material beyond the published anchor."
      ].join(" "),
      input: [
        {
          role: "user",
          content: `${brief}

Task:
For each grain, either agree with the Week 35 anchor or challenge it with a new score. Use current web/X evidence when useful, but keep Canadian prairie farmer usefulness first.
Then judge whether your debate actually added value beyond the existing anchor.`
        }
      ],
      tools: [{ type: "web_search" }, { type: "x_search" }],
      text: {
        format: {
          type: "json_schema",
          name: "week35_debate_review",
          strict: true,
          schema,
        },
      },
      max_output_tokens: 5000,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`xAI API failed: ${response.status} ${text.slice(0, 500)}`);
  }

  const data = await response.json();
  const items = data.output ?? [];
  const toolCalls = items.filter((item: { type?: string }) => ["web_search_call", "x_search_call"].includes(item.type ?? "")).length;
  const message = items.find((item: { type?: string }) => item.type === "message");
  const text = message?.content?.find((c: { type?: string }) => c.type === "output_text")?.text ?? "";
  return {
    parsed: JSON.parse(text) as { overall_feedback: string; verdicts: DebateVerdict[] },
    toolCalls,
    requestId: data.id,
    usage: data.usage,
  };
}

async function main() {
  const data = await fetchData();
  const brief = buildBrief(data);
  const debate = await runDebate(brief);

  console.log(JSON.stringify({
    crop_year: cropYear,
    grain_week: grainWeek,
    request_id: debate.requestId,
    tool_calls: debate.toolCalls,
    usage: debate.usage,
    overall_feedback: debate.parsed.overall_feedback,
    verdicts: debate.parsed.verdicts,
  }, null, 2));
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
