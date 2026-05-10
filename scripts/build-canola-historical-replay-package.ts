import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  buildCanolaHistoricalReplayPackage,
  type CanolaHistoricalReplayPackageInput,
} from "../lib/forecast-experiments/historical-replay";

interface CliOptions {
  help: boolean;
  dryRun: boolean;
  inputPath?: string;
  outputPath?: string;
}

const USAGE = `build-canola-historical-replay-package

Build a local no-write historical replay package for Canola training candidates.

Usage:
  tsx scripts/build-canola-historical-replay-package.ts --input <path> [--output <path>] [--dry-run]

Options:
  --help, -h             Show this help text.
  --input <path>         Local JSON replay input with replay_set_name, review_window_days, weeks, and created_at.
  --output <path>        Optional local output JSON path.
  --dry-run              Build package but do not write --output.

This command is local-only. It builds historical replay training candidates from provided artifacts. It does not call models, read Supabase, write sidecar tables, write production tables, import dashboard code, or start Hermes.
`;

main(process.argv.slice(2));

function main(argv: string[]): void {
  try {
    const options = parseArgs(argv);

    if (options.help) {
      process.stdout.write(USAGE);
      return;
    }

    const replayPackage = buildCanolaHistoricalReplayPackage(
      readInput(options.inputPath),
    );

    if (options.outputPath && !options.dryRun) {
      mkdirSync(dirname(options.outputPath), { recursive: true });
      writeFileSync(
        options.outputPath,
        `${JSON.stringify(replayPackage, null, 2)}\n`,
        "utf8",
      );
      process.stderr.write(
        `historical replay package built: ${replayPackage.package_hash}\n`,
      );
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          output_path: options.outputPath,
          package_hash: replayPackage.package_hash,
          candidate_weeks: replayPackage.summary.candidate_weeks,
          review_only_weeks: replayPackage.summary.review_only_weeks,
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
          package_hash: replayPackage.package_hash,
          candidate_weeks: replayPackage.summary.candidate_weeks,
          review_only_weeks: replayPackage.summary.review_only_weeks,
        })}\n`,
      );
      return;
    }

    process.stderr.write(
      `historical replay package built: ${replayPackage.package_hash}\n`,
    );
    process.stdout.write(`${JSON.stringify(replayPackage, null, 2)}\n`);
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
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readInput(
  inputPath: string | undefined,
): CanolaHistoricalReplayPackageInput {
  if (!inputPath) {
    throw new Error("--input is required.");
  }

  return JSON.parse(readFileSync(inputPath, "utf8")) as CanolaHistoricalReplayPackageInput;
}

function readValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${arg} requires a value.`);
  }

  return value;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `error: ${error.message}`;
  }

  return `error: ${String(error)}`;
}
