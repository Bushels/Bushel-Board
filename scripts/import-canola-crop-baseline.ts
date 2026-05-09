#!/usr/bin/env npx tsx
/**
 * Import Canola crop-size baseline facts from public Statistics Canada /
 * Canola Council source pages, then attach them to the supply_disposition row
 * used by the Canada thesis packet.
 *
 * Usage:
 *   npm run import-canola-baseline
 *   npm run import-canola-baseline -- --dry-run
 *   npm run import-canola-baseline -- --help
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { resolve } from "path";

import { writeSourceRun } from "./source-run";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Canola Crop Baseline Import

Usage:
  npm run import-canola-baseline              Fetch and upsert baseline fields
  npm run import-canola-baseline -- --dry-run Fetch and verify only
  npm run import-canola-baseline -- --help    Show this help

Writes:
  supply_disposition seeded/harvested/yield/intended-acreage fields for Canola
  source_runs collector summary
`);
  process.exit(0);
}

const DRY_RUN = args.includes("--dry-run");

const FINAL_PRODUCTION_TABLE_URL =
  "https://www150.statcan.gc.ca/n1/daily-quotidien/251204/t001a-eng.htm";
const INTENTIONS_TABLE_URL =
  "https://www150.statcan.gc.ca/n1/daily-quotidien/260305/t001a-eng.htm";
const CANOLA_COUNCIL_PRODUCTION_URL =
  "https://www.canolacouncil.org/markets-stats/production/";

type Baseline = {
  productionKt: number;
  seededAreaAcres: number;
  harvestedAreaAcres: number;
  yieldBuPerAcre: number;
  intendedSeededAreaAcres: number;
  finalReleaseDate: string;
  intentionsReleaseDate: string;
  councilUpdatedDate: string | null;
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
    .replace(/&minus;/g, "-")
    .replace(/&#x2011;/g, "-");
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
      .replace(/\n{3,}/g, "\n\n"),
  );
}

function numberFromText(value: string): number {
  return Number(value.replace(/[, ]/g, ""));
}

function sectionBetween(text: string, start: string, end: string): string {
  const startIndex = text.indexOf(start);
  if (startIndex === -1) {
    throw new Error(`Could not find section start: ${start}`);
  }
  const endIndex = text.indexOf(end, startIndex + start.length);
  return text.slice(startIndex, endIndex === -1 ? undefined : endIndex);
}

function extractCanadaTotal(section: string, year: number): number {
  const match = section.match(new RegExp(`(?:^|\\n)\\s*${year}\\s+([0-9,.]+)\\b`, "m"));
  if (!match) throw new Error(`Could not find ${year} Canada total in section`);
  return numberFromText(match[1]);
}

function extractUpdatedDate(section: string): string | null {
  const match = section.match(/Updated:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
  if (!match) return null;
  const parsed = new Date(match[1]);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function extractStatCanCanolaKt(text: string): number {
  const match = text.match(/Canola\s+([0-9 ]+)\s+([0-9 ]+)\s+([0-9 ]+)\s+-?[0-9.]+\s+[0-9.]+/);
  if (!match) throw new Error("Could not find Canola production row in Statistics Canada production table");
  return numberFromText(match[3]);
}

function extractStatCanCanolaIntendedAcres(text: string): number {
  const match = text.match(/Canola\s+([0-9,]+)\s+([0-9,]+)\s+([0-9,]+)\s+-?[0-9.]+\s+[0-9.]+/);
  if (!match) throw new Error("Could not find Canola acreage row in Statistics Canada intentions table");
  return numberFromText(match[3]) * 1_000;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; BushelBoard/1.0)",
      Accept: "text/html",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  return response.text();
}

async function fetchBaseline(): Promise<{ baseline: Baseline; sourceHash: string }> {
  const [finalHtml, intentionsHtml, councilHtml] = await Promise.all([
    fetchText(FINAL_PRODUCTION_TABLE_URL),
    fetchText(INTENTIONS_TABLE_URL),
    fetchText(CANOLA_COUNCIL_PRODUCTION_URL),
  ]);

  const finalText = htmlToText(finalHtml);
  const intentionsText = htmlToText(intentionsHtml);
  const councilText = htmlToText(councilHtml);

  const seededSection = sectionBetween(councilText, "### Seeded acres", "### Harvested acres");
  const harvestedSection = sectionBetween(councilText, "### Harvested acres", "### Tonnes");
  const yieldSection = sectionBetween(councilText, "### Average yield", "### Average yield - tonnes");

  const baseline: Baseline = {
    productionKt: extractStatCanCanolaKt(finalText),
    seededAreaAcres: extractCanadaTotal(seededSection, 2025),
    harvestedAreaAcres: extractCanadaTotal(harvestedSection, 2025),
    yieldBuPerAcre: extractCanadaTotal(yieldSection, 2025),
    intendedSeededAreaAcres: extractStatCanCanolaIntendedAcres(intentionsText),
    finalReleaseDate: "2025-12-04",
    intentionsReleaseDate: "2026-03-05",
    councilUpdatedDate: extractUpdatedDate(seededSection),
  };

  return {
    baseline,
    sourceHash: createHash("sha256")
      .update(JSON.stringify({ baseline, FINAL_PRODUCTION_TABLE_URL, INTENTIONS_TABLE_URL, CANOLA_COUNCIL_PRODUCTION_URL }))
      .digest("hex"),
  };
}

async function main() {
  loadEnvFile(resolve(__dirname, "../.env.local"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const startedAt = new Date().toISOString();
  const { baseline, sourceHash } = await fetchBaseline();

  const row = {
    grain_slug: "canola",
    crop_year: "2025-2026",
    source: "AAFC_2026-02-18",
    production_kt: baseline.productionKt,
    seeded_area_acres: baseline.seededAreaAcres,
    harvested_area_acres: baseline.harvestedAreaAcres,
    yield_bu_per_acre: baseline.yieldBuPerAcre,
    intended_seeded_area_acres: baseline.intendedSeededAreaAcres,
    estimate_stage: "mixed_official_baseline",
    source_release_date: baseline.intentionsReleaseDate,
    source_url: FINAL_PRODUCTION_TABLE_URL,
    source_detail: {
      source_hash: sourceHash,
      final_production: {
        source: "Statistics Canada Table 32-10-0359-01",
        release_date: baseline.finalReleaseDate,
        url: FINAL_PRODUCTION_TABLE_URL,
        production_kt: baseline.productionKt,
        yield_bu_per_acre: baseline.yieldBuPerAcre,
      },
      final_area: {
        source: "Canola Council production page citing Statistics Canada Table 32-10-0359-01",
        updated_date: baseline.councilUpdatedDate,
        url: CANOLA_COUNCIL_PRODUCTION_URL,
        seeded_area_acres: baseline.seededAreaAcres,
        harvested_area_acres: baseline.harvestedAreaAcres,
      },
      seeding_intentions: {
        source: "Statistics Canada Table 32-10-0359-01",
        release_date: baseline.intentionsReleaseDate,
        url: INTENTIONS_TABLE_URL,
        intended_seeded_area_acres: baseline.intendedSeededAreaAcres,
        status: "preliminary",
      },
    },
  };

  if (DRY_RUN) {
    console.log(JSON.stringify({ dry_run: true, row }, null, 2));
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await supabase
    .from("supply_disposition")
    .upsert(row, { onConflict: "grain_slug,crop_year,source" });

  if (error) throw new Error(`supply_disposition upsert failed: ${error.message}`);

  const sourceRun = await writeSourceRun(supabase, {
    source_name: "supply_disposition",
    source_lane: "canada",
    collector_name: "import-canola-crop-baseline",
    status: "success",
    source_period_start: baseline.finalReleaseDate,
    source_period_end: baseline.intentionsReleaseDate,
    latest_source_label: "Canola 2025 final crop baseline / 2026 seeding intentions",
    rows_updated: 1,
    source_url: INTENTIONS_TABLE_URL,
    started_at: startedAt,
    metadata: {
      baseline,
      source_hash: sourceHash,
      source_urls: {
        final_production: FINAL_PRODUCTION_TABLE_URL,
        intentions: INTENTIONS_TABLE_URL,
        canola_council_production: CANOLA_COUNCIL_PRODUCTION_URL,
      },
    },
  });

  const { data: verification, error: verifyError } = await supabase
    .from("v_supply_disposition_current")
    .select(
      "grain_slug,crop_year,source,production_kt,seeded_area_acres,harvested_area_acres,yield_bu_per_acre,intended_seeded_area_acres,estimate_stage",
    )
    .eq("grain_slug", "canola")
    .eq("crop_year", "2025-2026")
    .maybeSingle();

  console.log(
    JSON.stringify(
      {
        dry_run: false,
        row_upserted: true,
        source_run: sourceRun,
        verification_error: verifyError?.message ?? null,
        verification,
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
