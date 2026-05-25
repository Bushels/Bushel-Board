import { readFileSync, writeFileSync } from "node:fs";

import {
  buildCanolaForecastSnapshot,
  SNAPSHOT_MODES,
  type SnapshotMode,
} from "../lib/forecast-experiments/snapshot";

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

interface SnapshotInputFile {
  grain?: unknown;
  crop_year?: unknown;
  grain_week?: unknown;
  as_of_date?: unknown;
  source_cutoff_at?: unknown;
  snapshot_mode?: unknown;
  records?: unknown;
}

const USAGE = `build-canola-forecast-snapshot

Build a local deterministic Canola forecast snapshot.

Usage:
  tsx scripts/build-canola-forecast-snapshot.ts --input <path> --crop-year <YYYY-YYYY> --grain-week <1-53> --as-of <YYYY-MM-DD> --source-cutoff-at <ISO timestamp> --snapshot-mode <strict_artifact_mode|current_table_replay_mode>

Options:
  --help, -h                         Show this help text.
  --input <path>                     Local JSON input file. It may be an object with a records array or a records array.
  --output <path>                    Optional local output file for the snapshot JSON.
  --crop-year <YYYY-YYYY>            Crop year for the snapshot.
  --grain-week <1-53>                Grain week for the snapshot.
  --as-of <YYYY-MM-DD>               Forecast as-of date.
  --source-cutoff-at <ISO timestamp> Exact source cutoff timestamp with timezone offset.
  --snapshot-mode <mode>             strict_artifact_mode or current_table_replay_mode.
  --dry-run                          Build and print the snapshot but do not write --output.
`;

main(process.argv.slice(2));

function main(argv: string[]): void {
  try {
    const options = parseArgs(argv);

    if (options.help) {
      process.stdout.write(USAGE);
      return;
    }

    const inputFile = readSnapshotInputFile(options.inputPath);
    const snapshot = buildCanolaForecastSnapshot(
      resolveSnapshotInput(options, inputFile),
    );
    const json = `${JSON.stringify(snapshot, null, 2)}\n`;

    if (options.outputPath && !options.dryRun) {
      writeFileSync(options.outputPath, json, "utf8");
      process.stderr.write(`snapshot built: ${snapshot.snapshot_hash}\n`);
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          output_path: options.outputPath,
          snapshot_hash: snapshot.snapshot_hash,
          records: snapshot.records.length,
          blocked_sources: snapshot.blocked_sources.length,
        })}\n`,
      );
      return;
    }

    if (options.outputPath && options.dryRun) {
      process.stderr.write("dry-run: output not written\n");
    }

    process.stderr.write(`snapshot built: ${snapshot.snapshot_hash}\n`);
    process.stdout.write(json);
  } catch (error) {
    process.stderr.write(`${formatError(error)}\n`);
    process.exit(1);
  }
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

function readSnapshotInputFile(inputPath: string | undefined): SnapshotInputFile {
  if (!inputPath) {
    throw new Error("--input is required.");
  }

  const parsed = JSON.parse(readFileSync(inputPath, "utf8")) as unknown;

  if (Array.isArray(parsed)) {
    return {
      records: parsed,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("--input must contain a JSON object or records array.");
  }

  return parsed as SnapshotInputFile;
}

function readValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${arg} requires a value.`);
  }

  return value;
}

function parseSnapshotMode(value: string): SnapshotMode {
  if (SNAPSHOT_MODES.includes(value as SnapshotMode)) {
    return value as SnapshotMode;
  }

  throw new Error(`Unsupported snapshot mode: ${value}`);
}

function parseIntegerArg(value: string, arg: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    throw new Error(`${arg} must be an integer.`);
  }

  return parsed;
}

function resolveSnapshotInput(
  options: CliOptions,
  inputFile: SnapshotInputFile,
) {
  const cropYear = options.cropYear ?? asOptionalString(inputFile.crop_year);
  const grainWeek = options.grainWeek ?? asOptionalNumber(inputFile.grain_week);
  const asOfDate = options.asOfDate ?? asOptionalString(inputFile.as_of_date);
  const sourceCutoffAt =
    options.sourceCutoffAt ?? asOptionalString(inputFile.source_cutoff_at);
  const snapshotMode =
    options.snapshotMode ?? asOptionalSnapshotMode(inputFile.snapshot_mode);

  const missing = [
    ["crop_year", cropYear],
    ["grain_week", grainWeek],
    ["as_of_date", asOfDate],
    ["source_cutoff_at", sourceCutoffAt],
    ["snapshot_mode", snapshotMode],
    ["records", inputFile.records],
  ].flatMap(([field, value]) => (value === undefined ? [field] : []));

  if (missing.length > 0) {
    throw new Error(`Missing required snapshot field(s): ${missing.join(", ")}.`);
  }

  return {
    grain: "Canola",
    crop_year: cropYear,
    grain_week: grainWeek,
    as_of_date: asOfDate,
    source_cutoff_at: sourceCutoffAt,
    snapshot_mode: snapshotMode,
    records: inputFile.records,
  };
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

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `error: ${error.message}`;
  }

  return `error: ${String(error)}`;
}
