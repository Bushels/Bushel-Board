#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import {
  normalizeCropYearInput,
  parseWeeklyReportFromPages,
  type ParsedWeeklyReportRow,
  type WeeklyReportMetadata,
} from "./grain-monitor/parsers";

const GRAIN_MONITOR_BASE_URL = "https://grainmonitor.ca/";
const WEEKLY_REPORTS_PATH = "Downloads/WeeklyReports";
const CURRENT_REPORT_URL = new URL("current_report.html", GRAIN_MONITOR_BASE_URL).toString();
const __dirname = dirname(fileURLToPath(import.meta.url));
const PDF_PARSE_MODULE_URL = pathToFileURL(
  join(__dirname, "..", "node_modules", "pdf-parse", "dist", "pdf-parse", "esm", "index.js"),
).href;

const HEARTBEAT_CLI = join(__dirname, "write-collector-heartbeat.py");
const TRAJECTORY_SCAN_TYPE = "collector_grain_monitor";
const TRAJECTORY_TRIGGER = "Government Grain Monitor weekly refresh";
const CAD_GRAINS_CANONICAL = [
  "Amber Durum",
  "Barley",
  "Beans",
  "Canaryseed",
  "Canola",
  "Chick Peas",
  "Corn",
  "Flaxseed",
  "Lentils",
  "Mustard Seed",
  "Oats",
  "Peas",
  "Rye",
  "Soybeans",
  "Sunflower",
  "Wheat",
] as const;

let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
let SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

loadLocalEnvFile();
SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type GrainMonitorSnapshotRow = ParsedWeeklyReportRow & {
  crop_year: string;
  source_notes: string;
};

type CliOptions = {
  cropYear?: string;
  grainWeek?: number;
  pdfUrl?: string;
  dryRun: boolean;
  help: boolean;
};

type DiscoveryResult = {
  url: string;
  filename: string;
  strategy: "explicit-url" | "direct-pattern" | "current-report";
  attemptedUrls: string[];
  discoveredCropYear?: string;
  discoveredGrainWeek?: number;
};

type PdfParserInstance = {
  getText(options: { partial: number[] }): Promise<{ text: string }>;
  destroy(): Promise<void>;
};

type PdfParseConstructor = new (options: { data: ArrayBuffer }) => PdfParserInstance;

function loadLocalEnvFile() {
  const envPath = join(__dirname, "..", ".env.local");
  if (!existsSync(envPath)) {
    return;
  }

  const envContents = readFileSync(envPath, "utf8");
  for (const line of envContents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key]) {
      continue;
    }

    process.env[key] = rawValue.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }
}

function printHelp() {
  process.stdout.write(
    [
      "Usage: npx tsx scripts/import-grain-monitor-weekly.ts [options]",
      "",
      "Primary weekly Grain Monitor importer.",
      "Discovers the latest Quorum weekly PDF, parses deterministic logistics metrics,",
      "and upserts one canonical row into grain_monitor_snapshots.",
      "",
      "Options:",
      "  --crop-year 2025-2026   Target crop year (default: current crop year)",
      "  --grain-week 35         Target a specific Grain Monitor week",
      "  --pdf-url <pdf-url>     Import a specific weekly PDF URL",
      "  --url <pdf-url>         Legacy alias for --pdf-url",
      "  --dry-run               Parse and validate without writing to Supabase",
      "  --help                  Show this help",
      "",
      "Examples:",
      "  npx tsx scripts/import-grain-monitor-weekly.ts --dry-run",
      "  npx tsx scripts/import-grain-monitor-weekly.ts --pdf-url https://grainmonitor.ca/Downloads/WeeklyReports/GMPGOCWeek202535.pdf",
      "  npx tsx scripts/import-grain-monitor-weekly.ts --crop-year 2025-2026 --grain-week 35",
    ].join("\n"),
  );
}

function logDiagnostic(message: string, details?: Record<string, unknown>) {
  if (details && Object.keys(details).length > 0) {
    console.error(`[grain-monitor-weekly] ${message} ${JSON.stringify(details)}`);
    return;
  }

  console.error(`[grain-monitor-weekly] ${message}`);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--crop-year":
        options.cropYear = argv[index + 1];
        index += 1;
        break;
      case "--grain-week":
        options.grainWeek = Number.parseInt(argv[index + 1] ?? "", 10);
        index += 1;
        break;
      case "--pdf-url":
      case "--url":
        options.pdfUrl = argv[index + 1];
        index += 1;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.cropYear) {
    options.cropYear = normalizeCropYearInput(options.cropYear);
  }

  if (options.grainWeek != null) {
    if (!Number.isInteger(options.grainWeek) || options.grainWeek < 1 || options.grainWeek > 53) {
      throw new Error("--grain-week must be an integer between 1 and 53");
    }
  }

  if (options.pdfUrl && options.grainWeek != null) {
    throw new Error("Use either --pdf-url/--url or --grain-week, not both");
  }

  return options;
}

function getCurrentCropYear(now = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth();
  if (month >= 7) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

function getReportCropYear(cropYear: string): string {
  const [startYear] = cropYear.split("-");
  const endYearSuffix = cropYear.slice(-2);
  return `${startYear}-${endYearSuffix}`;
}

function getStartYear(cropYear: string): number {
  return Number.parseInt(cropYear.slice(0, 4), 10);
}

function buildWeeklyPdfUrl(cropYear: string, grainWeek: number): string {
  const startYear = getStartYear(cropYear);
  return new URL(
    `${WEEKLY_REPORTS_PATH}/GMPGOCWeek${startYear}${String(grainWeek).padStart(2, "0")}.pdf`,
    GRAIN_MONITOR_BASE_URL,
  ).toString();
}

function getApproximateGrainWeek(cropYear: string, now = new Date()): number {
  const startYear = getStartYear(cropYear);
  const cropStart = Date.UTC(startYear, 7, 1);
  const currentDate = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((currentDate - cropStart) / 86_400_000);
  return Math.max(1, Math.min(53, Math.floor(diffDays / 7) + 1));
}

function buildCandidateWeeks(cropYear: string, explicitWeek?: number): number[] {
  if (explicitWeek != null) {
    return [explicitWeek];
  }

  const currentCropYear = getCurrentCropYear();
  if (cropYear !== currentCropYear) {
    return Array.from({ length: 53 }, (_, index) => 53 - index);
  }

  const approxWeek = getApproximateGrainWeek(cropYear);
  const candidates = new Set<number>();
  for (let week = approxWeek + 1; week >= Math.max(1, approxWeek - 10); week -= 1) {
    if (week >= 1 && week <= 53) {
      candidates.add(week);
    }
  }

  return [...candidates];
}

async function urlExists(url: string): Promise<boolean> {
  try {
    const headResponse = await fetch(url, { method: "HEAD" });
    if (headResponse.ok) {
      return true;
    }

    if (![403, 405].includes(headResponse.status)) {
      return false;
    }

    const rangeResponse = await fetch(url, {
      headers: {
        Range: "bytes=0-16",
      },
    });
    return rangeResponse.ok;
  } catch {
    return false;
  }
}

function parseFilenameDetails(filename: string): { cropYear: string; grainWeek: number } | null {
  const match = filename.match(/GMPGOCWeek(\d{4})(\d{2})\.pdf$/i);
  if (!match) {
    return null;
  }

  const startYear = Number.parseInt(match[1], 10);
  const grainWeek = Number.parseInt(match[2], 10);
  return {
    cropYear: `${startYear}-${startYear + 1}`,
    grainWeek,
  };
}

async function discoverWeeklyReport(options: CliOptions, cropYear: string): Promise<DiscoveryResult> {
  if (options.pdfUrl) {
    const filename = new URL(options.pdfUrl).pathname.split("/").pop();
    if (!filename) {
      throw new Error(`Could not determine filename from URL: ${options.pdfUrl}`);
    }

    return {
      url: options.pdfUrl,
      filename,
      strategy: "explicit-url",
      attemptedUrls: [options.pdfUrl],
      discoveredCropYear: parseFilenameDetails(filename)?.cropYear,
      discoveredGrainWeek: parseFilenameDetails(filename)?.grainWeek,
    };
  }

  const attemptedUrls: string[] = [];
  for (const grainWeek of buildCandidateWeeks(cropYear, options.grainWeek)) {
    const url = buildWeeklyPdfUrl(cropYear, grainWeek);
    attemptedUrls.push(url);
    if (await urlExists(url)) {
      return {
        url,
        filename: url.split("/").pop() ?? `GMPGOCWeek${getStartYear(cropYear)}${String(grainWeek).padStart(2, "0")}.pdf`,
        strategy: "direct-pattern",
        attemptedUrls,
        discoveredCropYear: cropYear,
        discoveredGrainWeek: grainWeek,
      };
    }
  }

  if (options.grainWeek != null) {
    throw new Error(
      `Weekly PDF not found for crop year ${cropYear}, grain week ${options.grainWeek}. Tried ${attemptedUrls.length} direct URL(s).`,
    );
  }

  const currentReportResponse = await fetch(CURRENT_REPORT_URL);
  if (!currentReportResponse.ok) {
    throw new Error(`Could not fetch current report page: HTTP ${currentReportResponse.status}`);
  }

  const currentReportHtml = await currentReportResponse.text();
  const linkMatches = [
    ...currentReportHtml.matchAll(/Downloads\/WeeklyReports\/(GMPGOCWeek\d{6}\.pdf)/gi),
  ].map((match) => match[1]);

  if (linkMatches.length === 0) {
    throw new Error(
      `Could not discover a weekly PDF from ${CURRENT_REPORT_URL}; direct URL attempts also failed.`,
    );
  }

  const matchingLink = linkMatches.find((filename) => {
    const details = parseFilenameDetails(filename);
    return details?.cropYear === cropYear;
  }) ?? linkMatches[0];

  const discoveredUrl = new URL(`${WEEKLY_REPORTS_PATH}/${matchingLink}`, GRAIN_MONITOR_BASE_URL).toString();
  const details = parseFilenameDetails(matchingLink);

  return {
    url: discoveredUrl,
    filename: matchingLink,
    strategy: "current-report",
    attemptedUrls,
    discoveredCropYear: details?.cropYear,
    discoveredGrainWeek: details?.grainWeek,
  };
}

async function fetchPdfData(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF ${url}: HTTP ${response.status}`);
  }
  return await response.arrayBuffer();
}

async function loadPdfParseConstructor(): Promise<PdfParseConstructor> {
  const module = (await import(PDF_PARSE_MODULE_URL)) as { PDFParse: PdfParseConstructor };
  return module.PDFParse;
}

async function getPageTexts(pdfData: ArrayBuffer, pages: number[]): Promise<Record<number, string>> {
  const PDFParse = await loadPdfParseConstructor();
  const parser = new PDFParse({ data: pdfData });
  try {
    const pageTexts: Record<number, string> = {};
    for (const page of pages) {
      const text = await parser.getText({ partial: [page] });
      pageTexts[page] = text.text;
    }

    return pageTexts;
  } finally {
    await parser.destroy();
  }
}

function formatLagNote(grainMonitorWeek: number, latestCgcWeek: number | null): string | null {
  if (latestCgcWeek == null) {
    return null;
  }

  const delta = latestCgcWeek - grainMonitorWeek;
  if (delta === 0) {
    return `CGC lag check: latest imported CGC week ${latestCgcWeek}; Grain Monitor week ${grainMonitorWeek} is aligned`;
  }

  if (delta > 0) {
    return `CGC lag check: latest imported CGC week ${latestCgcWeek}; Grain Monitor week ${grainMonitorWeek} lags by ${delta} week${delta === 1 ? "" : "s"}`;
  }

  const lead = Math.abs(delta);
  return `CGC lag check: latest imported CGC week ${latestCgcWeek}; Grain Monitor week ${grainMonitorWeek} leads by ${lead} week${lead === 1 ? "" : "s"}`;
}

function buildSourceNotes(input: {
  filename: string;
  strategy: DiscoveryResult["strategy"];
  metadata: WeeklyReportMetadata;
  vesselTimingNote: string | null;
  latestCgcWeek: number | null;
  missingFields: string[];
}): string {
  const parts = [
    "Quorum Corporation Weekly Performance Update",
    `grain week ${input.metadata.grainWeek}`,
    `crop year ${input.metadata.canonicalCropYear}`,
    `report date ${input.metadata.reportDate}`,
    `period covered ${input.metadata.coveredPeriodStart} to ${input.metadata.coveredPeriodEnd}`,
    `source PDF ${input.filename}`,
    `discovery ${input.strategy}`,
  ];

  if (input.metadata.vesselWeek != null) {
    parts.push(
      `vessel lineup and cleared metrics reference Week ${input.metadata.vesselWeek}${
        input.metadata.vesselAsOfDate ? ` as at ${input.metadata.vesselAsOfDate}` : ""
      }`,
    );
  }

  if (input.metadata.inboundWeek != null && input.metadata.inboundPeriod) {
    parts.push(`inbound vessels cover ${input.metadata.inboundPeriod} (Week ${input.metadata.inboundWeek})`);
  }

  const lagNote = formatLagNote(input.metadata.grainWeek, input.latestCgcWeek);
  if (lagNote) {
    parts.push(lagNote);
  }

  if (input.vesselTimingNote) {
    parts.push(`vessel timing note: ${input.vesselTimingNote}`);
  }

  if (input.missingFields.length > 0) {
    parts.push(`parser gaps: ${input.missingFields.join(", ")}`);
  }

  return parts.join("; ");
}

async function getLatestWeeks(cropYear: string) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return {
      latestImportedGrainMonitorWeek: null as number | null,
      latestCgcWeek: null as number | null,
    };
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const [{ data: grainMonitorRows, error: grainMonitorError }, { data: cgcRows, error: cgcError }] =
    await Promise.all([
      supabase
        .from("grain_monitor_snapshots")
        .select("grain_week")
        .eq("crop_year", cropYear)
        .order("grain_week", { ascending: false })
        .limit(1),
      supabase
        .from("cgc_observations")
        .select("grain_week")
        .eq("crop_year", cropYear)
        .order("grain_week", { ascending: false })
        .limit(1),
    ]);

  if (grainMonitorError) {
    throw new Error(`Could not query grain_monitor_snapshots: ${grainMonitorError.message}`);
  }

  if (cgcError) {
    throw new Error(`Could not query cgc_observations: ${cgcError.message}`);
  }

  return {
    latestImportedGrainMonitorWeek: grainMonitorRows?.[0]?.grain_week ?? null,
    latestCgcWeek: cgcRows?.[0]?.grain_week ?? null,
  };
}

async function upsertSnapshot(row: GrainMonitorSnapshotRow) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await supabase
    .from("grain_monitor_snapshots")
    .upsert(row, { onConflict: "crop_year,grain_week" });

  if (error) {
    throw new Error(`Upsert failed: ${error.message}`);
  }

  const { data: verifyRows, error: verifyError } = await supabase
    .from("grain_monitor_snapshots")
    .select(
      "crop_year, grain_week, report_date, country_stocks_kt, total_unloads_cars, out_of_car_time_pct, ytd_shipments_total_kt, vessels_vancouver, source_notes, created_at",
    )
    .eq("crop_year", row.crop_year)
    .eq("grain_week", row.grain_week)
    .limit(1);

  if (verifyError) {
    throw new Error(`Verification query failed: ${verifyError.message}`);
  }

  return verifyRows?.[0] ?? null;
}

export async function runImport(options: CliOptions) {
  const targetCropYear = options.cropYear ?? getCurrentCropYear();
  const discovery = await discoverWeeklyReport(options, targetCropYear);

  logDiagnostic("weekly report discovered", {
    url: discovery.url,
    strategy: discovery.strategy,
    discovered_crop_year: discovery.discoveredCropYear,
    discovered_grain_week: discovery.discoveredGrainWeek,
  });

  const pdfData = await fetchPdfData(discovery.url);
  const pageTexts = await getPageTexts(pdfData, [1, 2, 3, 5]);
  const parseResult = parseWeeklyReportFromPages(pageTexts);

  if (options.cropYear && parseResult.metadata.canonicalCropYear !== targetCropYear) {
    throw new Error(
      `Discovered PDF crop year ${parseResult.metadata.canonicalCropYear} does not match requested crop year ${targetCropYear}`,
    );
  }

  if (options.grainWeek != null && parseResult.metadata.grainWeek !== options.grainWeek) {
    throw new Error(
      `Discovered PDF grain week ${parseResult.metadata.grainWeek} does not match requested grain week ${options.grainWeek}`,
    );
  }

  const latestWeeks = await getLatestWeeks(parseResult.metadata.canonicalCropYear);
  const sourceNotes = buildSourceNotes({
    filename: discovery.filename,
    strategy: discovery.strategy,
    metadata: parseResult.metadata,
    vesselTimingNote: parseResult.vesselTimingNote,
    latestCgcWeek: latestWeeks.latestCgcWeek,
    missingFields: parseResult.missingFields,
  });

  const row: GrainMonitorSnapshotRow = {
    crop_year: parseResult.metadata.canonicalCropYear,
    ...parseResult.row,
    source_notes: sourceNotes,
  };

  const verification = options.dryRun ? null : await upsertSnapshot(row);

  const heartbeatPreview = deriveGrainMonitorSignal(row);
  let trajectory: Record<string, unknown> = {
    preview: {
      severity: heartbeatPreview.severity,
      signal_note: heartbeatPreview.signalNote,
      source_week_ending: heartbeatPreview.sourceWeekEnding,
      grains: CAD_GRAINS_CANONICAL.length,
    },
  };
  const warnings: string[] = [];
  if (!options.dryRun) {
    try {
      trajectory = { ...trajectory, ...writeAllHeartbeats(row) };
    } catch (exc) {
      warnings.push(`heartbeat_write_failed: ${(exc as Error).message}`.slice(0, 500));
    }
  }

  return {
    action: options.dryRun ? "dry_run" : "upserted",
    report: {
      crop_year: row.crop_year,
      grain_week: row.grain_week,
      report_date: row.report_date,
      report_crop_year: parseResult.metadata.reportCropYear,
      covered_period: parseResult.metadata.coveredPeriod,
      covered_period_start: parseResult.metadata.coveredPeriodStart,
      covered_period_end: parseResult.metadata.coveredPeriodEnd,
      pdf_url: discovery.url,
      pdf_filename: discovery.filename,
      discovery_strategy: discovery.strategy,
      attempted_urls: discovery.attemptedUrls,
      latest_imported_grain_monitor_week: latestWeeks.latestImportedGrainMonitorWeek,
      latest_cgc_week: latestWeeks.latestCgcWeek,
      lag_vs_latest_cgc_week:
        latestWeeks.latestCgcWeek == null ? null : latestWeeks.latestCgcWeek - row.grain_week,
      missing_fields: parseResult.missingFields,
      weather_notes: row.weather_notes,
      row,
      verification,
      trajectory,
      ...(warnings.length > 0 ? { warnings } : {}),
    },
  };
}

type HeartbeatSeverity = "critical" | "elevated" | "normal" | "unknown";

type HeartbeatPreview = {
  severity: HeartbeatSeverity;
  signalNote: string;
  sourceWeekEnding: string;
};

function deriveGrainMonitorSignal(row: GrainMonitorSnapshotRow): HeartbeatPreview {
  const oct = row.out_of_car_time_pct;
  const vessels = row.vessels_vancouver;
  const deliveriesYoy = row.country_deliveries_yoy_pct;

  const rank: Record<HeartbeatSeverity, number> = {
    unknown: -1,
    normal: 0,
    elevated: 1,
    critical: 2,
  };
  let severity: HeartbeatSeverity = "normal";
  const escalate = (next: HeartbeatSeverity) => {
    if (rank[next] > rank[severity]) severity = next;
  };
  const notes: string[] = [];

  if (oct != null) {
    notes.push(`OCT ${oct.toFixed(1)}%`);
    if (oct >= 30) escalate("critical");
    else if (oct >= 20) escalate("elevated");
  }
  if (vessels != null) {
    notes.push(`${vessels} vessels YVR`);
    if (vessels >= 30) escalate("critical");
    else if (vessels >= 20) escalate("elevated");
  }
  if (deliveriesYoy != null) {
    notes.push(`deliveries ${deliveriesYoy >= 0 ? "+" : ""}${deliveriesYoy.toFixed(1)}% YoY`);
  }

  const signalNote =
    notes.length > 0
      ? `Grain Monitor week ${row.grain_week}: ${notes.join(", ")}`
      : `Grain Monitor week ${row.grain_week} refreshed`;

  return {
    severity,
    signalNote,
    sourceWeekEnding: row.report_date,
  };
}

function invokeHeartbeat(
  grain: string,
  preview: HeartbeatPreview,
  row: GrainMonitorSnapshotRow,
): { grain: string; ok: boolean; stderr?: string } {
  const evidence = {
    collector: "import-grain-monitor-weekly",
    grain_week: row.grain_week,
    report_date: row.report_date,
    out_of_car_time_pct: row.out_of_car_time_pct,
    vessels_vancouver: row.vessels_vancouver,
    country_deliveries_yoy_pct: row.country_deliveries_yoy_pct,
  };
  const result = spawnSync(
    "python",
    [
      HEARTBEAT_CLI,
      "--side",
      "cad",
      "--market",
      grain,
      "--scan-type",
      TRAJECTORY_SCAN_TYPE,
      "--trigger",
      TRAJECTORY_TRIGGER,
      "--severity",
      preview.severity,
      "--signal-note",
      preview.signalNote,
      "--source-week-ending",
      preview.sourceWeekEnding,
      "--grain-week",
      String(row.grain_week),
      "--evidence-json",
      JSON.stringify(evidence),
      "--quiet",
    ],
    { encoding: "utf8", timeout: 60_000 },
  );
  const ok = result.status === 0;
  return {
    grain,
    ok,
    stderr: ok ? undefined : (result.stderr || String(result.error || "")).slice(0, 500),
  };
}

function writeAllHeartbeats(row: GrainMonitorSnapshotRow): {
  written: number;
  total: number;
  severity: HeartbeatSeverity;
  signal_note: string;
  results: { grain: string; ok: boolean; stderr?: string }[];
} {
  const preview = deriveGrainMonitorSignal(row);
  const results = CAD_GRAINS_CANONICAL.map((grain) => invokeHeartbeat(grain, preview, row));
  const written = results.filter((r) => r.ok).length;
  return {
    written,
    total: results.length,
    severity: preview.severity,
    signal_note: preview.signalNote,
    results,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.dryRun && (!SUPABASE_URL || !SERVICE_ROLE_KEY)) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const result = await runImport(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isDirectRun =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    process.stderr.write(
      `${JSON.stringify(
        {
          error: message,
          stack,
        },
        null,
        2,
      )}\n`,
    );
    process.exit(1);
  });
}
