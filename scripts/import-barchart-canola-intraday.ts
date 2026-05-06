#!/usr/bin/env npx tsx
/**
 * Import intraday ICE Canola quotes from Barchart OnDemand.
 *
 * Writes timestamped quotes to grain_price_intraday. This is separate from
 * grain_prices because intraday quotes are not final daily settlements.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

import { getIceCanolaFrontMonthSymbol } from "@/lib/canola-contracts";
import { writeSourceRun } from "./source-run";

type BarchartQuote = {
  symbol?: string;
  name?: string;
  mode?: string;
  serverTimestamp?: string;
  tradeTimestamp?: string;
  tradeDate?: string;
  lastPrice?: number | string;
  bid?: number | string;
  ask?: number | string;
  netChange?: number | string;
  percentChange?: number | string;
  open?: number | string;
  high?: number | string;
  low?: number | string;
  previousClose?: number | string;
  settlement?: number | string;
  volume?: number | string;
  openInterest?: number | string;
  flag?: string;
  unitCode?: string;
};

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    [
      "Barchart Canola Intraday Import",
      "",
      "Usage:",
      "  npx tsx scripts/import-barchart-canola-intraday.ts",
      "  npx tsx scripts/import-barchart-canola-intraday.ts --symbol RSK26",
      "  npx tsx scripts/import-barchart-canola-intraday.ts --dry-run",
      "",
      "Environment:",
      "  BARCHART_ONDEMAND_API_KEY      Barchart OnDemand API key",
      "  BARCHART_CANOLA_SYMBOL         Optional fixed contract override",
      "  NEXT_PUBLIC_SUPABASE_URL       Supabase project URL",
      "  SUPABASE_SERVICE_ROLE_KEY      Supabase service-role key",
      "",
      "Writes:",
      "  grain_price_intraday timestamped quote rows",
      "  source_runs collector summary",
    ].join("\n"),
  );
  process.stdout.write("\n");
  process.exit(0);
}

const DRY_RUN = args.includes("--dry-run");
const symbolIndex = args.indexOf("--symbol");
const CLI_SYMBOL = symbolIndex >= 0 && args[symbolIndex + 1] ? args[symbolIndex + 1] : null;

function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // Environment may already be provided by the runner.
  }
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(value: unknown): number | null {
  const parsed = toNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function normalizeTimestamp(quote: BarchartQuote): string {
  const timestamp = quote.tradeTimestamp ?? quote.serverTimestamp;
  if (!timestamp) return new Date().toISOString();

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function normalizeTradeDate(quote: BarchartQuote, quoteTimestamp: string): string {
  if (quote.tradeDate && /^\d{4}-\d{2}-\d{2}$/.test(quote.tradeDate)) {
    return quote.tradeDate;
  }
  return quoteTimestamp.slice(0, 10);
}

async function fetchBarchartQuote(apiKey: string, symbol: string): Promise<BarchartQuote> {
  const url = new URL("https://ondemand.websol.barchart.com/getQuote.json");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("symbols", symbol);
  url.searchParams.set(
    "fields",
    [
      "bid",
      "ask",
      "previousClose",
      "settlement",
      "openInterest",
      "volume",
      "open",
      "high",
      "low",
      "flag",
    ].join(","),
  );

  const response = await fetch(url, {
    headers: { "User-Agent": "BushelBoard/1.0" },
  });

  if (!response.ok) {
    throw new Error(`Barchart getQuote failed: HTTP ${response.status}`);
  }

  const body = (await response.json()) as {
    status?: { code?: number; message?: string };
    results?: BarchartQuote[];
  };

  if (body.status?.code && body.status.code >= 400) {
    throw new Error(`Barchart getQuote failed: ${body.status.message ?? body.status.code}`);
  }

  const quote = body.results?.[0];
  if (!quote) {
    throw new Error(`Barchart getQuote returned no result for ${symbol}`);
  }

  return quote;
}

async function main() {
  loadEnvFile(resolve(__dirname, "../.env.local"));

  const apiKey = process.env.BARCHART_ONDEMAND_API_KEY;
  const symbol = CLI_SYMBOL ?? process.env.BARCHART_CANOLA_SYMBOL ?? getIceCanolaFrontMonthSymbol();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const startedAt = new Date().toISOString();

  if (!apiKey) {
    throw new Error("Missing BARCHART_ONDEMAND_API_KEY");
  }
  if (!DRY_RUN && (!supabaseUrl || !serviceKey)) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const quote = await fetchBarchartQuote(apiKey, symbol);
  const lastPrice = toNumber(quote.lastPrice);
  if (lastPrice === null) {
    throw new Error(`Barchart quote for ${symbol} did not include lastPrice`);
  }

  const quoteTimestamp = normalizeTimestamp(quote);
  const row = {
    grain: "Canola",
    contract: symbol,
    exchange: "ICE",
    quote_timestamp: quoteTimestamp,
    trade_date: normalizeTradeDate(quote, quoteTimestamp),
    last_price: lastPrice,
    bid: toNumber(quote.bid),
    ask: toNumber(quote.ask),
    net_change: toNumber(quote.netChange),
    percent_change: toNumber(quote.percentChange),
    open_price: toNumber(quote.open),
    high_price: toNumber(quote.high),
    low_price: toNumber(quote.low),
    previous_close: toNumber(quote.previousClose),
    settlement: toNumber(quote.settlement),
    volume: toInteger(quote.volume),
    open_interest: toNumber(quote.openInterest),
    mode: quote.mode ?? null,
    flag: quote.flag ?? null,
    currency: "CAD",
    unit: "$/tonne",
    source: "barchart-ondemand:getQuote",
    raw_payload: quote,
  };

  if (DRY_RUN) {
    process.stdout.write(JSON.stringify({ dry_run: true, row }, null, 2));
    process.stdout.write("\n");
    return;
  }

  const supabase = createClient(supabaseUrl!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await supabase
    .from("grain_price_intraday")
    .upsert(row, { onConflict: "grain,contract,quote_timestamp,source" });

  if (error) {
    throw new Error(`Could not upsert grain_price_intraday: ${error.message}`);
  }

  const sourceRun = await writeSourceRun(supabase, {
    source_name: "grain_price_intraday",
    source_lane: "cross_border",
    collector_name: "import-barchart-canola-intraday",
    status: "success",
    source_period_start: row.trade_date,
    source_period_end: row.trade_date,
    latest_source_label: `${row.contract} ${row.quote_timestamp}`,
    rows_inserted: 1,
    rows_updated: 0,
    rows_skipped: 0,
    source_url: "https://www.barchart.com/ondemand/api/getQuote",
    started_at: startedAt,
    metadata: {
      symbol,
      mode: row.mode,
      flag: row.flag,
      last_price: row.last_price,
      net_change: row.net_change,
      percent_change: row.percent_change,
    },
  });

  process.stdout.write(
    JSON.stringify(
      {
        dry_run: false,
        rows_upserted: 1,
        quote: row,
        source_run: sourceRun,
      },
      null,
      2,
    ),
  );
  process.stdout.write("\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
