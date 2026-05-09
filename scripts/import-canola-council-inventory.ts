#!/usr/bin/env npx tsx
/**
 * Inventory Canola Council Markets & Stats pages.
 *
 * This is intentionally inventory-only. It records table titles, source labels,
 * update dates, units, and small row samples so a later admission step can
 * decide which values deserve source-truth storage.
 *
 * Usage:
 *   npm run import-canola-council:inventory
 *   npm run import-canola-council:inventory -- --dry-run
 *   npm run import-canola-council:inventory -- --help
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { resolve } from "path";

import { writeSourceRun } from "./source-run";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Canola Council Markets & Stats Inventory

Usage:
  npm run import-canola-council:inventory              Fetch and store inventory
  npm run import-canola-council:inventory -- --dry-run Fetch and print only
  npm run import-canola-council:inventory -- --help    Show this help

Writes:
  canola_council_market_stats_inventory rows
  source_runs collector summary
`);
  process.exit(0);
}

const DRY_RUN = args.includes("--dry-run");

const PAGES = [
  ["production", "https://www.canolacouncil.org/markets-stats/production/"],
  ["supply-disposition", "https://www.canolacouncil.org/markets-stats/supply-disposition/"],
  ["processing", "https://www.canolacouncil.org/markets-stats/processing/"],
  ["exports", "https://www.canolacouncil.org/markets-stats/exports/"],
  ["top-markets", "https://www.canolacouncil.org/markets-stats/top-markets/"],
] as const;

type InventoryRow = {
  page_slug: string;
  page_url: string;
  page_title: string;
  table_index: number;
  table_title: string;
  upstream_source: string | null;
  update_date: string | null;
  period_hint: string | null;
  unit_hint: string | null;
  row_count: number;
  column_headers: string[];
  sample_rows: string[];
  ingestion_status: "inventory_only";
  source_hash: string;
};

function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] ||= value;
    }
  } catch {
    // Env may already be provided by the runner.
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&ndash;/g, "-")
    .replace(/&mdash;/g, "-")
    .replace(/&#x2011;/g, "-")
    .replace(/&#038;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<h[1-6][^>]*>/gi, "\n### ")
      .replace(/<\/(h[1-6]|p|div|li|tr|table|section)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function pageTitle(text: string, fallback: string): string {
  const headings = [...text.matchAll(/^###\s+(.+)$/gm)]
    .map((match) => match[1].trim())
    .filter((line) => {
      const lower = line.toLowerCase();
      return Boolean(line) && !["main navigation", "search", "connect"].includes(lower);
    });
  const contentHeading = headings.find((line) =>
    ["Production", "Supply & Disposition", "Domestic Processing", "Exports", "Top Markets"].includes(line),
  );
  if (contentHeading) return contentHeading;
  return headings.find((line) => line.length < 80 && !line.includes("Search")) ?? fallback;
}

function humanizePageSlug(pageSlug: string): string {
  return pageSlug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function unitHint(title: string): string | null {
  const lower = title.toLowerCase();
  if (lower.includes("bushels/acre")) return "bushels/acre";
  if (lower.includes("tonnes/acre")) return "tonnes/acre";
  if (lower.includes("acres")) return "acres";
  if (lower.includes("tonnes") || lower.includes("production")) return "tonnes";
  if (lower.includes("price") || lower.includes("value")) return "CAD or source currency";
  if (lower.includes("share") || lower.includes("percent")) return "percent";
  return null;
}

function periodHint(title: string, rows: string[]): string | null {
  if (rows.some((row) => /^\d{4}\s/.test(row))) return "calendar_year";
  if (rows.some((row) => /\d{4}[-/]\d{2}/.test(row))) return "crop_year";
  if (title.toLowerCase().includes("month")) return "monthly";
  return null;
}

function splitHeaders(headerLine: string): string[] {
  return headerLine
    .split(/\s{2,}|\t| {1}(?=[A-Z][a-z]+(?:\s|$))/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function inventoryFromText(pageSlug: string, pageUrl: string, text: string): InventoryRow[] {
  const title = pageTitle(text, humanizePageSlug(pageSlug));
  const headingPattern = /^###\s+(.+)$/gm;
  const matches = [...text.matchAll(headingPattern)];
  const rows: InventoryRow[] = [];
  let lastExplicitSource: string | null = null;

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const tableTitle = match[1].trim();
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[i + 1]?.index ?? text.length;
    const section = text.slice(start, end);
    const sourceMatch = section.match(/Source:\s*([^\n]+?)(?:\n|Updated:)/i);
    const updatedMatch = section.match(/Updated:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
    const normalizedSection = section.replace(/\s(?=(?:19|20)\d{2}(?:\s|[-/]|\b))/g, "\n");
    const lines = normalizedSection
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const yearRows = [
      ...normalizedSection.matchAll(
        /(?:^|\s)((?:19|20)\d{2}(?:\/\d{2})?\s+[-0-9,.]+(?:\s+[-0-9,.]+){0,12})/g,
      ),
    ].map((row) => row[1].trim());
    const headerLine = lines.find((line) => /\bYEAR\b|\bCANADA TOTAL\b|\bCountry\b|\bMarket\b|\bProduct\b/i.test(line));
    const explicitSource = sourceMatch?.[1]?.replace(/\s+/g, " ").trim() ?? null;
    if (explicitSource) lastExplicitSource = explicitSource;
    const upstreamSource =
      explicitSource ??
      (yearRows.length > 0 && lastExplicitSource
        ? `Inferred from adjacent Canola Council table source: ${lastExplicitSource}`
        : null);

    if (!upstreamSource && yearRows.length === 0) continue;

    const sourceHash = createHash("sha256")
      .update(JSON.stringify({ pageSlug, tableTitle, upstreamSource, updated: updatedMatch?.[1] ?? null, rows: yearRows.slice(0, 5) }))
      .digest("hex");

    rows.push({
      page_slug: pageSlug,
      page_url: pageUrl,
      page_title: title,
      table_index: rows.length + 1,
      table_title: tableTitle,
      upstream_source: upstreamSource,
      update_date: parseDate(updatedMatch?.[1] ?? null),
      period_hint: periodHint(tableTitle, yearRows),
      unit_hint: unitHint(tableTitle),
      row_count: yearRows.length,
      column_headers: headerLine ? splitHeaders(headerLine) : [],
      sample_rows: yearRows.slice(0, 3),
      ingestion_status: "inventory_only",
      source_hash: sourceHash,
    });
  }

  return rows;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; BushelBoard/1.0)",
      Accept: "text/html",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.text();
}

async function buildInventory(): Promise<InventoryRow[]> {
  const allRows: InventoryRow[] = [];
  for (const [slug, url] of PAGES) {
    const html = await fetchText(url);
    const pageRows = inventoryFromText(slug, url, htmlToText(html));
    allRows.push(...pageRows);
  }
  return allRows;
}

async function main() {
  loadEnvFile(resolve(__dirname, "../.env.local"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const startedAt = new Date().toISOString();
  const rows = await buildInventory();

  if (DRY_RUN) {
    console.log(JSON.stringify({ dry_run: true, rows_built: rows.length, rows }, null, 2));
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await supabase
    .from("canola_council_market_stats_inventory")
    .upsert(rows, { onConflict: "page_slug,table_index" });

  if (error) {
    await writeSourceRun(supabase, {
      source_name: "canola_council_market_stats_inventory",
      source_lane: "canada",
      collector_name: "import-canola-council-inventory",
      status: "failed",
      rows_skipped: rows.length,
      error_message: error.message,
      source_url: "https://www.canolacouncil.org/markets-stats/",
      started_at: startedAt,
      metadata: { pages: PAGES.map(([slug, url]) => ({ slug, url })) },
    });
    throw new Error(`inventory upsert failed: ${error.message}`);
  }

  const newestUpdateDate = rows
    .map((row) => row.update_date)
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1);

  const sourceRun = await writeSourceRun(supabase, {
    source_name: "canola_council_market_stats_inventory",
    source_lane: "canada",
    collector_name: "import-canola-council-inventory",
    status: rows.length > 0 ? "success" : "skipped",
    source_period_end: newestUpdateDate ?? null,
    latest_source_label: newestUpdateDate
      ? `Canola Council inventory updated through ${newestUpdateDate}`
      : "Canola Council inventory",
    rows_inserted: rows.length,
    source_url: "https://www.canolacouncil.org/markets-stats/",
    started_at: startedAt,
    metadata: {
      pages: PAGES.map(([slug, url]) => ({ slug, url })),
      rows_by_page: Object.fromEntries(
        PAGES.map(([slug]) => [slug, rows.filter((row) => row.page_slug === slug).length]),
      ),
      admission_boundary: "inventory_only_no_value_ingestion",
    },
  });

  console.log(
    JSON.stringify(
      {
        dry_run: false,
        rows_upserted: rows.length,
        newest_update_date: newestUpdateDate ?? null,
        source_run: sourceRun,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
