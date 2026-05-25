import { readFileSync } from "node:fs";

import {
  extractCurrentCgcCsvUrl,
  writeCgcWeeklySnapshot,
} from "../lib/cgc/weekly-snapshot";

interface CliOptions {
  help: boolean;
  dryRun: boolean;
  outputDir: string;
  capturedAt?: string;
  pageUrl: string;
  origin: string;
  csvUrl?: string;
  inputCsvPath?: string;
  inputPagePath?: string;
}

const DEFAULT_PAGE_URL =
  "https://www.grainscanada.gc.ca/en/grain-research/statistics/grain-statistics-weekly/";
const DEFAULT_ORIGIN = "https://www.grainscanada.gc.ca";
const DEFAULT_OUTPUT_DIR = "data\\CGC Weekly Snapshots";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; BushelBoardBot/1.0; +https://bushel-board-app.vercel.app)",
  Accept: "text/html,application/xhtml+xml,text/csv,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const USAGE = `capture-cgc-weekly-snapshot

Capture the current public CGC weekly CSV as a local point-in-time source artifact.

Usage:
  tsx scripts/capture-cgc-weekly-snapshot.ts [--output-dir <path>] [--dry-run]

Options:
  --help, -h             Show this help text.
  --output-dir <path>    Local snapshot root. Default: data\\CGC Weekly Snapshots.
  --captured-at <ISO>    Override capture timestamp with timezone offset.
  --page-url <url>       CGC weekly statistics page URL.
  --csv-url <url>        Direct CSV URL, bypassing page extraction.
  --input-page <path>    Local page HTML for offline tests.
  --input-csv <path>     Local CSV for offline tests.
  --dry-run              Fetch/build metadata but do not write files.

This command writes local files only. It does not read Supabase, write Supabase, write sidecar tables, call models, import dashboard code, or start Hermes.
`;

main(process.argv.slice(2));

async function main(argv: string[]): Promise<void> {
  try {
    const options = parseArgs(argv);

    if (options.help) {
      process.stdout.write(USAGE);
      return;
    }

    const capturedAt = options.capturedAt ?? new Date().toISOString();
    const pageHtml = options.inputPagePath
      ? readFileSync(options.inputPagePath, "utf8")
      : options.csvUrl
        ? null
        : await fetchText(options.pageUrl);
    const csvUrl =
      options.csvUrl ??
      extractCurrentCgcCsvUrl(requireDefined(pageHtml, "page HTML"), options.origin);
    const csvText = options.inputCsvPath
      ? readFileSync(options.inputCsvPath, "utf8")
      : await fetchText(csvUrl);

    if (options.dryRun) {
      const tempDir = options.outputDir;
      const result = writeCgcWeeklySnapshot({
        csvText,
        csvUrl,
        pageUrl: options.pageUrl,
        capturedAt,
        outputDir: tempDir,
        writeFiles: false,
      });
      process.stderr.write("dry-run: output not written\n");
      process.stdout.write(
        `${JSON.stringify({
          dry_run: true,
          status: result.status,
          output_dir: options.outputDir,
          csv_url: csvUrl,
          crop_year: result.metadata.crop_year,
          grain_week: result.metadata.grain_week,
          week_ending_date: result.metadata.week_ending_date,
          csv_sha256: result.metadata.csv_sha256,
          csv_hash_basis: result.metadata.csv_hash_basis,
          csv_gzip_sha256: result.metadata.csv_gzip_sha256,
          csv_gzip_path: result.csvGzipPath,
          metadata_path: result.metadataPath,
        })}\n`,
      );
      return;
    }

    const result = writeCgcWeeklySnapshot({
      csvText,
      csvUrl,
      pageUrl: options.pageUrl,
      capturedAt,
      outputDir: options.outputDir,
    });

    process.stderr.write(`CGC snapshot ${result.status}: ${result.metadata.csv_sha256}\n`);
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        status: result.status,
        output_dir: options.outputDir,
        csv_url: csvUrl,
        crop_year: result.metadata.crop_year,
        grain_week: result.metadata.grain_week,
        week_ending_date: result.metadata.week_ending_date,
        csv_sha256: result.metadata.csv_sha256,
        csv_hash_basis: result.metadata.csv_hash_basis,
        csv_gzip_sha256: result.metadata.csv_gzip_sha256,
        csv_gzip_path: result.csvGzipPath,
        metadata_path: result.metadataPath,
      })}\n`,
    );
  } catch (error) {
    process.stderr.write(`${formatError(error)}\n`);
    process.exit(1);
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    help: false,
    dryRun: false,
    outputDir: DEFAULT_OUTPUT_DIR,
    pageUrl: DEFAULT_PAGE_URL,
    origin: DEFAULT_ORIGIN,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--output-dir":
        options.outputDir = readValue(argv, index, arg);
        index += 1;
        break;
      case "--captured-at":
        options.capturedAt = readValue(argv, index, arg);
        index += 1;
        break;
      case "--page-url":
        options.pageUrl = readValue(argv, index, arg);
        index += 1;
        break;
      case "--origin":
        options.origin = readValue(argv, index, arg);
        index += 1;
        break;
      case "--csv-url":
        options.csvUrl = readValue(argv, index, arg);
        index += 1;
        break;
      case "--input-csv":
        options.inputCsvPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--input-page":
        options.inputPagePath = readValue(argv, index, arg);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: BROWSER_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function readValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${arg} requires a value.`);
  }

  return value;
}

function requireDefined<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`${label} is required.`);
  }

  return value;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `error: ${error.message}`;
  }

  return `error: ${String(error)}`;
}
