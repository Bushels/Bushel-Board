import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { buildCanolaForecastScorePackage } from "../lib/forecast-experiments/score-package";

interface CliOptions {
  help: boolean;
  dryRun: boolean;
  sidecarPackagePath?: string;
  baselineResultsPath?: string;
  outputPath?: string;
  evalWindowDays?: 7 | 28;
  startPrice?: number;
  endPrice?: number;
  startPriceAt?: string;
  endPriceAt?: string;
  marketCloseAt?: string;
  evaluatedAt?: string;
  scoreNotes?: string;
}

const USAGE = `score-canola-forecast-outcome

Build a local no-write score package for a Canola forecast sidecar package.

Usage:
  tsx scripts/score-canola-forecast-outcome.ts --sidecar-package <path> --eval-window-days <7|28> --start-price <number> --end-price <number> --start-price-at <ISO timestamp> --end-price-at <ISO timestamp> --market-close-at <ISO timestamp> --evaluated-at <ISO timestamp> [--baseline-results <path>] [--score-notes <text>] [--output <path>] [--dry-run]

Options:
  --help, -h                         Show this help text.
  --sidecar-package <path>           Local sidecar package JSON.
  --eval-window-days <7|28>          Evaluation window matching a package prediction.
  --start-price <number>             Starting futures price.
  --end-price <number>               Ending futures price.
  --start-price-at <ISO timestamp>   Starting price timestamp with timezone offset.
  --end-price-at <ISO timestamp>     Ending price timestamp with timezone offset.
  --market-close-at <ISO timestamp>  Forecast-day market close timestamp.
  --evaluated-at <ISO timestamp>     Score evaluation timestamp.
  --baseline-results <path>          Optional local JSON object for baseline comparisons.
  --score-notes <text>               Optional local score note.
  --output <path>                    Optional local output JSON path.
  --dry-run                          Build package but do not write --output.

This command is local-only. It does not read Supabase, write sidecar tables, write production tables, execute SQL, call models, or start Hermes.
`;

main(process.argv.slice(2));

function main(argv: string[]): void {
  try {
    const options = parseArgs(argv);

    if (options.help) {
      process.stdout.write(USAGE);
      return;
    }

    const scorePackage = buildCanolaForecastScorePackage({
      sidecar_package: readJsonFile(options.sidecarPackagePath, "--sidecar-package"),
      eval_window_days: requireDefined(options.evalWindowDays, "eval_window_days"),
      start_price: requireDefined(options.startPrice, "start_price"),
      end_price: requireDefined(options.endPrice, "end_price"),
      start_price_at: requireDefined(options.startPriceAt, "start_price_at"),
      end_price_at: requireDefined(options.endPriceAt, "end_price_at"),
      market_close_at: requireDefined(options.marketCloseAt, "market_close_at"),
      evaluated_at: requireDefined(options.evaluatedAt, "evaluated_at"),
      baseline_results: options.baselineResultsPath
        ? readBaselineResults(options.baselineResultsPath)
        : {},
      score_notes: options.scoreNotes,
    });

    if (options.outputPath && !options.dryRun) {
      mkdirSync(dirname(options.outputPath), { recursive: true });
      writeFileSync(
        options.outputPath,
        `${JSON.stringify(scorePackage, null, 2)}\n`,
        "utf8",
      );
      process.stderr.write(`score package built: ${scorePackage.score_hash}\n`);
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          output_path: options.outputPath,
          score_hash: scorePackage.score_hash,
          sidecar_package_hash: scorePackage.sidecar_package_hash,
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
          score_hash: scorePackage.score_hash,
          sidecar_package_hash: scorePackage.sidecar_package_hash,
        })}\n`,
      );
      return;
    }

    process.stderr.write(`score package built: ${scorePackage.score_hash}\n`);
    process.stdout.write(`${JSON.stringify(scorePackage, null, 2)}\n`);
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
      case "--sidecar-package":
        options.sidecarPackagePath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--baseline-results":
        options.baselineResultsPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--output":
        options.outputPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--eval-window-days":
        options.evalWindowDays = parseEvalWindowDays(readValue(argv, index, arg));
        index += 1;
        break;
      case "--start-price":
        options.startPrice = parseFiniteNumber(readValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--end-price":
        options.endPrice = parseFiniteNumber(readValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--start-price-at":
        options.startPriceAt = readValue(argv, index, arg);
        index += 1;
        break;
      case "--end-price-at":
        options.endPriceAt = readValue(argv, index, arg);
        index += 1;
        break;
      case "--market-close-at":
        options.marketCloseAt = readValue(argv, index, arg);
        index += 1;
        break;
      case "--evaluated-at":
        options.evaluatedAt = readValue(argv, index, arg);
        index += 1;
        break;
      case "--score-notes":
        options.scoreNotes = readValue(argv, index, arg);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readJsonFile(path: string | undefined, label: string): unknown {
  if (!path) {
    throw new Error(`${label} is required.`);
  }

  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function readBaselineResults(path: string): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--baseline-results must contain a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

function readValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${arg} requires a value.`);
  }

  return value;
}

function parseEvalWindowDays(value: string): 7 | 28 {
  const parsed = Number(value);

  if (parsed === 7 || parsed === 28) {
    return parsed;
  }

  throw new Error("--eval-window-days must be 7 or 28.");
}

function parseFiniteNumber(value: string, arg: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${arg} must be a finite number.`);
  }

  return parsed;
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
