#!/usr/bin/env npx tsx
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";
import { US_MARKETS, type UsMarketName } from "@/lib/constants/us-markets";
import { normalizeUsCropYear, normalizeUsThesis } from "@/lib/us-thesis-normalization";

type MarketName = UsMarketName;

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
loadEnvFile(resolve(process.env.HOME || "", ".hermes/.env"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const XAI_API_KEY = process.env.XAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !XAI_API_KEY) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and XAI_API_KEY are required.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const publish = args.includes("--publish");
const marketFlag = args.indexOf("--markets");
const requestedMarkets = marketFlag >= 0 ? args[marketFlag + 1]?.split(",").map((s) => s.trim()).filter(Boolean) as MarketName[] : null;
const defaultMarkets: MarketName[] = ["Corn", "Soybeans", "Wheat", "Oats"];
const markets: MarketName[] = requestedMarkets && requestedMarkets.length > 0 ? requestedMarkets : defaultMarkets;
const marketYear = Number(args.includes("--market-year") ? args[args.indexOf("--market-year") + 1] : 2025);

const MARKET_CONFIG = Object.fromEntries(
  US_MARKETS.map((market) => [market.name, market]),
) as Record<MarketName, (typeof US_MARKETS)[number]>;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    market: { type: "string" },
    crop_year: { type: "string" },
    market_year: { type: "integer" },
    stance_score: { type: "integer" },
    confidence_score: { type: "integer" },
    recommendation: { type: "string", enum: ["WATCH", "PATIENCE", "SCALE_IN", "ACCELERATE", "HOLD_FIRM", "PRICE"] },
    initial_thesis: { type: "string" },
    bull_case: { type: "string" },
    bear_case: { type: "string" },
    final_assessment: { type: "string" },
    key_signals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          signal: { type: "string", enum: ["bullish", "bearish", "watch"] },
          title: { type: "string" },
          body: { type: "string" },
          source: { type: "string" },
        },
        required: ["signal", "title", "body", "source"],
        additionalProperties: false,
      },
    },
  },
  required: ["market", "crop_year", "market_year", "stance_score", "confidence_score", "recommendation", "initial_thesis", "bull_case", "bear_case", "final_assessment", "key_signals"],
  additionalProperties: false,
};

function latest<T extends Record<string, unknown>>(rows: T[], sorters: Array<(row: T) => number>): T | null {
  if (rows.length === 0) return null;
  const copy = [...rows];
  copy.sort((a, b) => {
    for (const sorter of sorters) {
      const av = sorter(a);
      const bv = sorter(b);
      if (bv !== av) return bv - av;
    }
    return 0;
  });
  return copy[0] ?? null;
}

async function fetchMarketData(market: MarketName) {
  const cfg = MARKET_CONFIG[market];
  const [wasdeRes, exportRes, cropRes, priceRes, cotRes] = await Promise.all([
    supabase.from("usda_wasde_mapped")
      .select("*")
      .eq("market_name", market)
      .eq("market_year", String(marketYear))
      .order("calendar_year", { ascending: false })
      .order("month", { ascending: false })
      .limit(12),
    cfg.exportCommodity
      ? supabase.from("usda_export_sales")
          .select("commodity, week_ending, net_sales_mt, exports_mt, outstanding_mt, total_commitments_mt")
          .eq("commodity", cfg.exportCommodity)
          .eq("market_year", `${marketYear}-${marketYear + 1}`)
          .order("week_ending", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [], error: null }),
    cfg.cropProgressMarkets.length > 0
      ? supabase.from("usda_crop_progress")
          .select("market_name, crop_year, statisticcat_desc, unit_desc, week_ending, value_pct, reference_period_desc")
          .in("market_name", cfg.cropProgressMarkets)
          .in("crop_year", [String(marketYear), String(marketYear + 1)])
          .order("week_ending", { ascending: false })
          .limit(300)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("grain_prices")
      .select("grain, contract, price_date, settlement_price, change_pct, currency, source")
      .eq("grain", cfg.futuresGrain)
      .order("price_date", { ascending: false })
      .limit(10),
    cfg.cotCommodity
      ? supabase.from("cftc_cot_positions")
          .select("commodity, report_date, managed_money_long, managed_money_short, change_managed_money_long, change_managed_money_short")
          .eq("commodity", cfg.cotCommodity)
          .order("report_date", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const res of [wasdeRes, exportRes, cropRes, priceRes, cotRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  return {
    wasdeRows: wasdeRes.data ?? [],
    exportRows: exportRes.data ?? [],
    cropRows: cropRes.data ?? [],
    priceRows: priceRes.data ?? [],
    cotRows: cotRes.data ?? [],
  };
}

function buildDataBrief(market: MarketName, data: Awaited<ReturnType<typeof fetchMarketData>>) {
  const latestWasde = latest(data.wasdeRows, [r => Number(r.calendar_year), r => Number(r.month)]);
  const priorWasde = data.wasdeRows.find((row) => latestWasde && (Number(row.calendar_year) < Number(latestWasde.calendar_year) || (Number(row.calendar_year) === Number(latestWasde.calendar_year) && Number(row.month) < Number(latestWasde.month)))) ?? null;
  const latestExport = latest(data.exportRows, [r => Date.parse(String(r.week_ending))]);
  const latestPrice = latest(data.priceRows, [r => Date.parse(String(r.price_date))]);
  const latestCot = latest(data.cotRows, [r => Date.parse(String(r.report_date))]);

  const cropBlocks = MARKET_CONFIG[market].cropProgressMarkets.map((cropMarket) => {
    const rows = data.cropRows.filter((r) => r.market_name === cropMarket);
    const latestWeek = latest(rows, [r => Date.parse(String(r.week_ending))]);
    if (!latestWeek) return null;
    const sameWeek = rows.filter((r) => String(r.week_ending) === String(latestWeek.week_ending));
    const current = (stat: string, unit: string) => sameWeek.find((r) => r.statisticcat_desc === stat && r.unit_desc === unit)?.value_pct ?? null;
    const ge = (current("CONDITION", "PCT GOOD") ?? 0) + (current("CONDITION", "PCT EXCELLENT") ?? 0);
    return `### USDA Crop Progress / Conditions — ${cropMarket}\n- Latest week: ${latestWeek.week_ending}\n- Good+Excellent: ${ge || "N/A"}%\n- Good: ${current("CONDITION", "PCT GOOD") ?? "N/A"}%\n- Excellent: ${current("CONDITION", "PCT EXCELLENT") ?? "N/A"}%\n- Poor+Very Poor: ${((current("CONDITION", "PCT POOR") ?? 0) + (current("CONDITION", "PCT VERY POOR") ?? 0)) || "N/A"}%\n- Progress planted: ${current("PROGRESS", "PCT PLANTED") ?? "N/A"}%\n- Progress emerged: ${current("PROGRESS", "PCT EMERGED") ?? "N/A"}%\n- Progress harvested: ${current("PROGRESS", "PCT HARVESTED") ?? "N/A"}%`;
  }).filter(Boolean);

  const parts = [
    `## US Market Data for ${market}`,
    latestWasde ? `### USDA WASDE / PSD (latest monthly balance sheet)\n- Report month: ${latestWasde.calendar_year}-${String(latestWasde.month).padStart(2, "0")}\n- Area harvested: ${latestWasde.area_harvested_kha ?? "N/A"} kha\n- Beginning stocks: ${latestWasde.beginning_stocks_kt ?? "N/A"} kt\n- Production: ${latestWasde.production_kt ?? "N/A"} kt\n- Imports: ${latestWasde.imports_kt ?? "N/A"} kt\n- Total supply: ${latestWasde.total_supply_kt ?? "N/A"} kt\n- Exports: ${latestWasde.exports_kt ?? "N/A"} kt\n- Domestic consumption: ${latestWasde.domestic_consumption_kt ?? "N/A"} kt\n- Ending stocks: ${latestWasde.ending_stocks_kt ?? "N/A"} kt\n- Stocks-to-use: ${latestWasde.stocks_to_use_pct ?? "N/A"}%\n- Yield: ${latestWasde.yield ?? "N/A"}` : "### USDA WASDE / PSD\n- No mapped balance-sheet row available.",
    priorWasde && latestWasde ? `### WASDE / PSD change vs prior month\n- Ending stocks change: ${Number((Number(latestWasde.ending_stocks_kt ?? 0) - Number(priorWasde.ending_stocks_kt ?? 0)).toFixed(1))} kt\n- Stocks-to-use change: ${Number((Number(latestWasde.stocks_to_use_pct ?? 0) - Number(priorWasde.stocks_to_use_pct ?? 0)).toFixed(3))} pct pts` : null,
    latestExport ? `### USDA Export Sales\n- Week ending: ${latestExport.week_ending}\n- Net sales: ${latestExport.net_sales_mt ?? "N/A"} MT\n- Exports: ${latestExport.exports_mt ?? "N/A"} MT\n- Outstanding sales: ${latestExport.outstanding_mt ?? "N/A"} MT\n- Total commitments: ${latestExport.total_commitments_mt ?? "N/A"} MT` : null,
    cropBlocks.join("\n\n"),
    latestPrice ? `### Futures Price\n- Latest: ${latestPrice.price_date} ${latestPrice.settlement_price} ${latestPrice.currency}\n- Day change: ${latestPrice.change_pct ?? "N/A"}%\n- Source: ${latestPrice.source}` : null,
    latestCot ? `### CFTC Positioning\n- Report date: ${latestCot.report_date}\n- Managed money net: ${Number(latestCot.managed_money_long ?? 0) - Number(latestCot.managed_money_short ?? 0)}\n- Weekly net change: ${(Number(latestCot.change_managed_money_long ?? 0) - Number(latestCot.change_managed_money_short ?? 0))}` : null,
    `### Data Freshness\n- WASDE/PSD latest monthly row: ${latestWasde ? `${latestWasde.calendar_year}-${String(latestWasde.month).padStart(2, "0")}` : "missing"}\n- Export sales latest week: ${latestExport ? latestExport.week_ending : "missing"}\n- Crop progress latest week: ${data.cropRows[0]?.week_ending ?? "missing"}\n- Price latest date: ${latestPrice ? latestPrice.price_date : "missing"}\n- COT latest date: ${latestCot ? latestCot.report_date : "missing"}`,
  ].filter(Boolean);

  return parts.join("\n\n");
}

async function callXai(market: MarketName, brief: string) {
  const body = {
    model: "grok-4-1-fast-reasoning",
    instructions: [
      "You are a senior US grain market analyst.",
      "Write for US grain producers using USDA export sales, crop progress, monthly balance-sheet data, futures, and CFTC positioning.",
      "The recommendation should be a short-term marketing posture for this week.",
      "If the data is mixed, use WATCH or PATIENCE instead of forcing conviction."
    ].join(" "),
    input: [{
      role: "user",
      content: `${brief}\n\n## Task\nProduce a structured weekly US grain thesis for ${market}. Treat bull_case and bear_case as the weekly farmer summary of what is helping and hurting the producer right now.`
    }],
    tools: [{ type: "web_search" }],
    text: {
      format: {
        type: "json_schema",
        name: "us_market_thesis",
        strict: true,
        schema: OUTPUT_SCHEMA,
      },
    },
    max_output_tokens: 4000,
  };

  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${XAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`xAI failed for ${market}: ${response.status} ${err.slice(0, 300)}`);
  }

  const data = await response.json();
  const messageOutput = (data.output ?? []).find((o: { type: string }) => o.type === "message");
  const text = messageOutput?.content?.find((c: { type: string }) => c.type === "output_text")?.text ?? "";
  return {
    analysis: JSON.parse(text),
    usage: data.usage ?? {},
    requestId: data.id,
  };
}

async function publishUsThesis(
  market: MarketName,
  thesis: Record<string, unknown> | ReturnType<typeof normalizeUsThesis>,
  requestId: string,
  usage: Record<string, unknown>,
  data: Awaited<ReturnType<typeof fetchMarketData>>,
) {
  const generatedAt = new Date().toISOString();
  const latestExport = latest(data.exportRows, [r => Date.parse(String(r.week_ending))]);
  const latestPrice = latest(data.priceRows, [r => Date.parse(String(r.price_date))]);
  const latestCot = latest(data.cotRows, [r => Date.parse(String(r.report_date))]);
  const latestCrop = latest(data.cropRows, [r => Date.parse(String(r.week_ending))]);
  const latestWasde = latest(data.wasdeRows, [r => Number(r.calendar_year), r => Number(r.month)]);

  const freshness = {
    market_year: marketYear,
    wasde_month: latestWasde ? `${latestWasde.calendar_year}-${String(latestWasde.month).padStart(2, "0")}` : null,
    export_sales_week: latestExport ? latestExport.week_ending : null,
    crop_progress_week: latestCrop ? latestCrop.week_ending : null,
    price_date: latestPrice ? latestPrice.price_date : null,
    cot_report_date: latestCot ? latestCot.report_date : null,
  };

  const normalized = normalizeUsThesis(thesis, { market, marketYear });
  const recommendation = normalized.recommendation;
  const stanceScore = normalized.stance_score;
  const confidenceScore = normalized.confidence_score;
  const finalAssessment = normalized.final_assessment;
  const initialThesis = normalized.initial_thesis;
  const bullCase = normalized.bull_case;
  const bearCase = normalized.bear_case;
  const keySignals = normalized.key_signals;
  const cropYear = normalizeUsCropYear(marketYear);

  const marketAnalysisRow = {
    market_name: market,
    crop_year: cropYear,
    market_year: marketYear,
    initial_thesis: initialThesis,
    bull_case: bullCase,
    bear_case: bearCase,
    final_assessment: finalAssessment,
    stance_score: stanceScore,
    confidence_score: confidenceScore,
    recommendation,
    data_confidence: confidenceScore >= 70 ? "high" : confidenceScore >= 50 ? "medium" : "low",
    key_signals: keySignals,
    data_freshness: freshness,
    llm_metadata: { request_id: requestId, usage },
    model_used: "grok-4-1-fast-reasoning",
    generated_at: generatedAt,
  };

  const intelligenceRow = {
    market_name: market,
    crop_year: cropYear,
    market_year: marketYear,
    thesis_title: `${market} — US Week ${marketYear} Thesis`,
    thesis_body: initialThesis,
    insights: keySignals.map((s) => `${s.title}: ${s.body}`),
    kpi_data: {
      stance_score: stanceScore,
      confidence_score: confidenceScore,
      recommendation,
      freshness,
    },
    llm_metadata: { request_id: requestId, usage },
    model_used: "grok-4-1-fast-reasoning",
    generated_at: generatedAt,
  };

  const trajectoryRow = {
    market_name: market,
    crop_year: cropYear,
    market_year: marketYear,
    recorded_at: generatedAt,
    scan_type: "weekly_debate",
    stance_score: stanceScore,
    conviction_pct: confidenceScore,
    recommendation,
    trigger: "Review at next weekly USDA update or if futures and crop conditions move materially.",
    evidence: keySignals,
    data_freshness: freshness,
    model_source: "grok-4-1-fast-reasoning",
  };

  const [maRes, giRes, stRes] = await Promise.all([
    supabase.from("us_market_analysis").upsert(marketAnalysisRow, { onConflict: "market_name,crop_year,market_year" }),
    supabase.from("us_grain_intelligence").upsert(intelligenceRow, { onConflict: "market_name,crop_year,market_year" }),
    supabase.from("us_score_trajectory").insert(trajectoryRow),
  ]);

  for (const res of [maRes, giRes, stRes]) {
    if (res.error) throw new Error(res.error.message);
  }
}

async function main() {
  const results = [] as Array<Record<string, unknown>>;
  for (const market of markets) {
    const data = await fetchMarketData(market);
    const brief = buildDataBrief(market, data);
    if (dryRun) {
      results.push({ market, mode: "dry_run", data_brief: brief });
      continue;
    }
    const response = await callXai(market, brief);
    const normalizedThesis = normalizeUsThesis(response.analysis as Record<string, unknown>, { market, marketYear });
    if (publish) {
      await publishUsThesis(market, normalizedThesis, response.requestId, response.usage, data);
    }
    results.push({
      market,
      request_id: response.requestId,
      usage: response.usage,
      published: publish,
      thesis: normalizedThesis,
    });
  }

  console.log(JSON.stringify({
    market_year: marketYear,
    markets,
    dry_run: dryRun,
    publish,
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
