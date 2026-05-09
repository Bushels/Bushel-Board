import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  FORECAST_RUNNER_MODES,
  type ForecastRunnerMode,
} from "../lib/forecast-experiments/run-artifact";
import { buildCanolaForecastManualRunResult } from "../lib/forecast-experiments/manual-runner";

interface CliOptions {
  help: boolean;
  dryRun: boolean;
  snapshotPath?: string;
  promptPackPath?: string;
  rawOutputPath?: string;
  outputPath?: string;
  provider?: string;
  model?: string;
  runnerMode?: ForecastRunnerMode;
  createdAt?: string;
}

const USAGE = `run-canola-forecast-manual-output

Parse a local raw model output file into a Canola forecast run artifact.

Usage:
  tsx scripts/run-canola-forecast-manual-output.ts --snapshot <path> --prompt-pack <path> --raw-output <path> --provider manual --model <name> --runner-mode manual_model_output --created-at <ISO timestamp> [--output <path>] [--dry-run]

Options:
  --help, -h                         Show this help text.
  --snapshot <path>                  Local snapshot JSON.
  --prompt-pack <path>               Local prompt-pack JSON used for the model call.
  --raw-output <path>                Local raw model-output text. Must be one JSON object.
  --provider <name>                  Provider label recorded in the run artifact.
  --model <name>                     Model label recorded in the run artifact.
  --runner-mode <mode>               manual_model_output or dry_run_model_output.
  --created-at <ISO timestamp>       Run creation timestamp with timezone offset.
  --output <path>                    Optional local output JSON path.
  --dry-run                          Build result but do not write --output.

This command is local-only. It does not call models, read Supabase, write sidecar tables, execute SQL, or start Hermes.
`;

main(process.argv.slice(2));

function main(argv: string[]): void {
  try {
    const options = parseArgs(argv);

    if (options.help) {
      process.stdout.write(USAGE);
      return;
    }

    const result = buildCanolaForecastManualRunResult({
      snapshot: readJsonFile(options.snapshotPath, "--snapshot"),
      prompt_pack: readJsonFile(options.promptPackPath, "--prompt-pack"),
      raw_model_output: readTextFile(options.rawOutputPath, "--raw-output"),
      provider: requireDefined(options.provider, "provider"),
      model: requireDefined(options.model, "model"),
      runner_mode: requireDefined(options.runnerMode, "runner_mode"),
      created_at: requireDefined(options.createdAt, "created_at"),
    });

    if (options.outputPath && !options.dryRun) {
      mkdirSync(dirname(options.outputPath), { recursive: true });
      writeFileSync(options.outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
      process.stderr.write(
        `manual run artifact built: ${result.run_artifact.run_hash}\n`,
      );
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          output_path: options.outputPath,
          result_hash: result.result_hash,
          run_hash: result.run_artifact.run_hash,
          raw_output_hash: result.raw_output_hash,
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
          result_hash: result.result_hash,
          run_hash: result.run_artifact.run_hash,
          raw_output_hash: result.raw_output_hash,
        })}\n`,
      );
      return;
    }

    process.stderr.write(`manual run artifact built: ${result.run_artifact.run_hash}\n`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
      case "--snapshot":
        options.snapshotPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--prompt-pack":
        options.promptPackPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--raw-output":
        options.rawOutputPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--output":
        options.outputPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--provider":
        options.provider = readValue(argv, index, arg);
        index += 1;
        break;
      case "--model":
        options.model = readValue(argv, index, arg);
        index += 1;
        break;
      case "--runner-mode":
        options.runnerMode = parseRunnerMode(readValue(argv, index, arg));
        index += 1;
        break;
      case "--created-at":
        options.createdAt = readValue(argv, index, arg);
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

function readTextFile(path: string | undefined, label: string): string {
  if (!path) {
    throw new Error(`${label} is required.`);
  }

  return readFileSync(path, "utf8");
}

function readValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${arg} requires a value.`);
  }

  return value;
}

function parseRunnerMode(value: string): ForecastRunnerMode {
  if (FORECAST_RUNNER_MODES.includes(value as ForecastRunnerMode)) {
    return value as ForecastRunnerMode;
  }

  throw new Error(`Unsupported runner mode: ${value}`);
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
