import { readFileSync, writeFileSync } from "node:fs";

import {
  SNAPSHOT_MODES,
  type SnapshotMode,
} from "../lib/forecast-experiments/snapshot";
import {
  buildCanolaForecastSourceRecords,
  createLocalSourceRowsReadBoundary,
  type CanolaSourceRecordReadOptions,
} from "../lib/forecast-experiments/read-adapter";
import type { ApprovedForecastSourceRow } from "../lib/forecast-experiments/source-records";

interface CliOptions {
  help: boolean;
  dryRun: boolean;
  inputPath?: string;
  outputPath?: string;
  cropYear?: string;
  grainWeek?: number;
  asOfDate?: string;
  sourceCutoffAt?: string;
  snapshotMode?: SnapshotMode;
}

interface SourceRowsInputFile {
  rows?: unknown;
  crop_year?: unknown;
  grain_week?: unknown;
  as_of_date?: unknown;
  source_cutoff_at?: unknown;
  snapshot_mode?: unknown;
}

const USAGE = `build-canola-forecast-source-records

Build local Canola forecast source records from a manually provided source-row export.

Usage:
  tsx scripts/build-canola-forecast-source-records.ts --input <path> --crop-year <YYYY-YYYY> --grain-week <1-53> --as-of <YYYY-MM-DD> --source-cutoff-at <ISO timestamp>

Options:
  --help, -h                         Show this help text.
  --input <path>                     Local JSON file with a rows array.
  --output <path>                    Optional local output file for snapshot input JSON.
  --crop-year <YYYY-YYYY>            Crop year for the snapshot input.
  --grain-week <1-53>                Grain week for the snapshot input.
  --as-of <YYYY-MM-DD>               Forecast as-of date.
  --source-cutoff-at <ISO timestamp> Exact source cutoff timestamp with timezone offset.
  --snapshot-mode <mode>             strict_artifact_mode or current_table_replay_mode. Default: strict_artifact_mode.
  --dry-run                          Build and print records but do not write --output.

This command is local-export mode only. It does not read Supabase, write sidecar tables, call models, or start Hermes.
`;

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${formatError(error)}\n`);
  process.exit(1);
});

async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);

  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }

  const inputFile = readSourceRowsInputFile(options.inputPath);
  const readOptions = resolveReadOptions(options, inputFile);
  const rows = readSourceRows(inputFile.rows);
  const records = await buildCanolaForecastSourceRecords(
    createLocalSourceRowsReadBoundary(rows),
    readOptions,
  );
  const output = {
    grain: "Canola",
    crop_year: readOptions.crop_year,
    grain_week: readOptions.grain_week,
    as_of_date: readOptions.as_of_date,
    source_cutoff_at: readOptions.source_cutoff_at,
    snapshot_mode: readOptions.snapshot_mode,
    records,
  };
  const json = `${JSON.stringify(output, null, 2)}\n`;

  if (options.outputPath && !options.dryRun) {
    writeFileSync(options.outputPath, json, "utf8");
    process.stderr.write(`source records built: ${records.length}\n`);
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        output_path: options.outputPath,
        records: records.length,
      })}\n`,
    );
    return;
  }

  if (options.outputPath && options.dryRun) {
    process.stderr.write("dry-run: output not written\n");
    process.stdout.write(
      `${JSON.stringify({
        dry_run: true,
        output_path: options.outputPath,
        records: records.length,
      })}\n`,
    );
    return;
  }

  process.stderr.write(`source records built: ${records.length}\n`);
  process.stdout.write(json);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    help: false,
    dryRun: false,
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
      case "--input":
        options.inputPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--output":
        options.outputPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--crop-year":
        options.cropYear = readValue(argv, index, arg);
        index += 1;
        break;
      case "--grain-week":
        options.grainWeek = parseIntegerArg(readValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--as-of":
        options.asOfDate = readValue(argv, index, arg);
        index += 1;
        break;
      case "--source-cutoff-at":
        options.sourceCutoffAt = readValue(argv, index, arg);
        index += 1;
        break;
      case "--snapshot-mode":
        options.snapshotMode = parseSnapshotMode(readValue(argv, index, arg));
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readSourceRowsInputFile(
  inputPath: string | undefined,
): SourceRowsInputFile {
  if (!inputPath) {
    throw new Error("--input is required in local-export mode.");
  }

  const parsed = JSON.parse(readFileSync(inputPath, "utf8")) as unknown;

  if (Array.isArray(parsed)) {
    return {
      rows: parsed,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("--input must contain a JSON object or rows array.");
  }

  return parsed as SourceRowsInputFile;
}

function resolveReadOptions(
  options: CliOptions,
  inputFile: SourceRowsInputFile,
): CanolaSourceRecordReadOptions {
  const cropYear = options.cropYear ?? asOptionalString(inputFile.crop_year);
  const grainWeek = options.grainWeek ?? asOptionalNumber(inputFile.grain_week);
  const asOfDate = options.asOfDate ?? asOptionalString(inputFile.as_of_date);
  const sourceCutoffAt =
    options.sourceCutoffAt ?? asOptionalString(inputFile.source_cutoff_at);
  const snapshotMode =
    options.snapshotMode ??
    asOptionalSnapshotMode(inputFile.snapshot_mode) ??
    "strict_artifact_mode";

  const missing: string[] = [];

  if (cropYear === undefined) missing.push("crop_year");
  if (grainWeek === undefined) missing.push("grain_week");
  if (asOfDate === undefined) missing.push("as_of_date");
  if (sourceCutoffAt === undefined) missing.push("source_cutoff_at");
  if (snapshotMode === undefined) missing.push("snapshot_mode");
  if (inputFile.rows === undefined) missing.push("rows");

  if (missing.length > 0) {
    throw new Error(`Missing required source-record field(s): ${missing.join(", ")}.`);
  }

  const resolvedCropYear = requireDefined(cropYear, "crop_year");
  const resolvedGrainWeek = requireDefined(grainWeek, "grain_week");
  const resolvedAsOfDate = requireDefined(asOfDate, "as_of_date");
  const resolvedSourceCutoffAt = requireDefined(
    sourceCutoffAt,
    "source_cutoff_at",
  );
  const resolvedSnapshotMode = requireDefined(snapshotMode, "snapshot_mode");

  return {
    crop_year: resolvedCropYear,
    grain_week: resolvedGrainWeek,
    as_of_date: resolvedAsOfDate,
    source_cutoff_at: resolvedSourceCutoffAt,
    snapshot_mode: resolvedSnapshotMode,
  };
}

function readSourceRows(rows: unknown): ApprovedForecastSourceRow[] {
  if (!Array.isArray(rows)) {
    throw new Error("--input rows must be an array.");
  }

  return rows as ApprovedForecastSourceRow[];
}

function readValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${arg} requires a value.`);
  }

  return value;
}

function parseIntegerArg(value: string, arg: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    throw new Error(`${arg} must be an integer.`);
  }

  return parsed;
}

function parseSnapshotMode(value: string): SnapshotMode {
  if (SNAPSHOT_MODES.includes(value as SnapshotMode)) {
    return value as SnapshotMode;
  }

  throw new Error(`Unsupported snapshot mode: ${value}`);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    return parseIntegerArg(value, "grain_week");
  }

  return undefined;
}

function asOptionalSnapshotMode(value: unknown): SnapshotMode | undefined {
  return typeof value === "string" ? parseSnapshotMode(value) : undefined;
}

function requireDefined<T>(value: T | undefined, fieldName: string): T {
  if (value === undefined) {
    throw new Error(`${fieldName} is required.`);
  }

  return value;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `error: ${error.message}`;
  }

  return `error: ${String(error)}`;
}
