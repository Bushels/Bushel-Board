import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  buildCanolaCgcHistoricalReplayInput,
  type CanolaCgcHistoricalReplayInputOptions,
} from "../lib/forecast-experiments/cgc-historical-replay-input";

interface CliOptions {
  help: boolean;
  dryRun: boolean;
  inputPath?: string;
  outputPath?: string;
  cropYear?: string;
  weeks?: number[];
  replaySetName?: string;
  createdAt?: string;
  publicationLagDays?: number;
  publicationTime?: string;
  sourceCutoffTime?: string;
  timezoneOffset?: string;
  pointInTimeCertified: boolean;
}

const USAGE = `build-canola-cgc-historical-replay-input

Build a local Canola historical replay input bundle from public CGC weekly CSV history.

Usage:
  tsx scripts/build-canola-cgc-historical-replay-input.ts --input <csv> --crop-year <YYYY-YYYY> --weeks <n[,n...]> --replay-set-name <name> --created-at <ISO> [--output <path>] [--dry-run]

Options:
  --help, -h                    Show this help text.
  --input <path>                Local CGC weekly CSV file.
  --crop-year <YYYY-YYYY>       Crop year to replay.
  --weeks <n[,n...]>            Forecast weeks to build. Each week requires week+1 evidence.
  --replay-set-name <name>      Replay set label.
  --created-at <ISO>            Package creation timestamp with timezone offset.
  --publication-lag-days <n>    Days after CGC week ending to assume public availability.
  --publication-time <HH:MM:SS> Assumed CGC publication time.
  --source-cutoff-time <HH:MM:SS> Forecast/review cutoff time.
  --timezone-offset <offset>    Timestamp offset.
  --point-in-time-certified     Mark source CSV as as-published point-in-time data. Without this, output is revision-tainted review-only.
  --output <path>               Optional local output JSON path.
  --dry-run                     Build bundle but do not write --output.

This command is local-only. It does not read Supabase, write Supabase, write sidecar tables, call models, import dashboard code, or start Hermes.
`;

main(process.argv.slice(2));

function main(argv: string[]): void {
  try {
    const options = parseArgs(argv);

    if (options.help) {
      process.stdout.write(USAGE);
      return;
    }

    const input = buildCanolaCgcHistoricalReplayInput(
      readFileSync(requireDefined(options.inputPath, "--input"), "utf8"),
      resolveBuildOptions(options),
    );

    if (options.outputPath && !options.dryRun) {
      mkdirSync(dirname(options.outputPath), { recursive: true });
      writeFileSync(options.outputPath, `${JSON.stringify(input, null, 2)}\n`, "utf8");
      process.stderr.write(`historical replay input built: ${input.weeks.length} week(s)\n`);
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          output_path: options.outputPath,
          weeks: input.weeks.length,
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
          weeks: input.weeks.length,
        })}\n`,
      );
      return;
    }

    process.stderr.write(`historical replay input built: ${input.weeks.length} week(s)\n`);
    process.stdout.write(`${JSON.stringify(input, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${formatError(error)}\n`);
    process.exit(1);
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    help: false,
    dryRun: false,
    pointInTimeCertified: false,
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
      case "--weeks":
        options.weeks = parseWeeks(readValue(argv, index, arg));
        index += 1;
        break;
      case "--replay-set-name":
        options.replaySetName = readValue(argv, index, arg);
        index += 1;
        break;
      case "--created-at":
        options.createdAt = readValue(argv, index, arg);
        index += 1;
        break;
      case "--publication-lag-days":
        options.publicationLagDays = parseInteger(readValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--publication-time":
        options.publicationTime = readValue(argv, index, arg);
        index += 1;
        break;
      case "--source-cutoff-time":
        options.sourceCutoffTime = readValue(argv, index, arg);
        index += 1;
        break;
      case "--timezone-offset":
        options.timezoneOffset = readValue(argv, index, arg);
        index += 1;
        break;
      case "--point-in-time-certified":
        options.pointInTimeCertified = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function resolveBuildOptions(
  options: CliOptions,
): CanolaCgcHistoricalReplayInputOptions {
  return {
    replay_set_name: requireDefined(options.replaySetName, "--replay-set-name"),
    crop_year: requireDefined(options.cropYear, "--crop-year"),
    weeks: requireDefined(options.weeks, "--weeks"),
    source_file: requireDefined(options.inputPath, "--input"),
    created_at: requireDefined(options.createdAt, "--created-at"),
    publication_lag_days: requireDefined(
      options.publicationLagDays,
      "--publication-lag-days",
    ),
    publication_time: requireDefined(options.publicationTime, "--publication-time"),
    source_cutoff_time: requireDefined(
      options.sourceCutoffTime,
      "--source-cutoff-time",
    ),
    timezone_offset: requireDefined(options.timezoneOffset, "--timezone-offset"),
    point_in_time_certified: options.pointInTimeCertified,
  };
}

function readValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${arg} requires a value.`);
  }

  return value;
}

function parseWeeks(value: string): number[] {
  const weeks = value
    .split(",")
    .map((entry) => parseInteger(entry.trim(), "--weeks"));

  if (weeks.some((week) => week < 1 || week > 52)) {
    throw new Error("--weeks entries must be between 1 and 52.");
  }

  return weeks;
}

function parseInteger(value: string, arg: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed)) {
    throw new Error(`${arg} must be an integer.`);
  }

  return parsed;
}

function requireDefined<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `error: ${error.message}`;
  }

  return `error: ${String(error)}`;
}
