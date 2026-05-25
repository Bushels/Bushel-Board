import { readFileSync, writeFileSync } from "node:fs";

import {
  FORECAST_RUNNER_MODES,
  buildCanolaForecastRunArtifact,
  type ForecastRunnerMode,
  type ForecastRunMetadata,
} from "../lib/forecast-experiments/run-artifact";

interface CliOptions {
  help: boolean;
  dryRun: boolean;
  snapshotPath?: string;
  forecastPath?: string;
  outputPath?: string;
  provider?: string;
  model?: string;
  runnerMode?: ForecastRunnerMode;
  promptVersion?: string;
  promptHash?: string;
  modelTrainingCutoff?: string;
  createdAt?: string;
}

const USAGE = `build-canola-forecast-run-artifact

Build a local Canola forecast run artifact from a snapshot JSON and forecast JSON.

Usage:
  tsx scripts/build-canola-forecast-run-artifact.ts --snapshot <path> --forecast <path> --provider <name> --model <name> --runner-mode <manual_model_output|dry_run_model_output> --created-at <ISO timestamp>

Options:
  --help, -h                         Show this help text.
  --snapshot <path>                  Local snapshot JSON from build-canola-forecast-snapshot.
  --forecast <path>                  Local forecast JSON matching canola-forecast-v1.
  --output <path>                    Optional local output file for the run artifact JSON.
  --provider <name>                  Model/provider label used outside this CLI.
  --model <name>                     Model label used outside this CLI.
  --runner-mode <mode>               manual_model_output or dry_run_model_output.
  --prompt-version <name>            Optional prompt/version label.
  --prompt-hash <sha256:...>         Optional prompt hash.
  --model-training-cutoff <date>     Optional model training cutoff date copied into metadata.
  --created-at <ISO timestamp>       Artifact creation timestamp with timezone offset.
  --dry-run                          Build and print the artifact but do not write --output.

This command is local-only. It does not call models, read Supabase, write sidecar tables, or start Hermes.
`;

main(process.argv.slice(2));

function main(argv: string[]): void {
  try {
    const options = parseArgs(argv);

    if (options.help) {
      process.stdout.write(USAGE);
      return;
    }

    const snapshot = readJsonFile(options.snapshotPath, "--snapshot");
    const forecast = readJsonFile(options.forecastPath, "--forecast");
    const artifact = buildCanolaForecastRunArtifact({
      snapshot,
      forecast,
      metadata: resolveMetadata(options),
    });
    const json = `${JSON.stringify(artifact, null, 2)}\n`;

    if (options.outputPath && !options.dryRun) {
      writeFileSync(options.outputPath, json, "utf8");
      process.stderr.write(`run artifact built: ${artifact.run_hash}\n`);
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          output_path: options.outputPath,
          run_hash: artifact.run_hash,
          snapshot_hash: artifact.snapshot_hash,
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
          run_hash: artifact.run_hash,
          snapshot_hash: artifact.snapshot_hash,
        })}\n`,
      );
      return;
    }

    process.stderr.write(`run artifact built: ${artifact.run_hash}\n`);
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
      case "--snapshot":
        options.snapshotPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--forecast":
        options.forecastPath = readValue(argv, index, arg);
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
      case "--prompt-version":
        options.promptVersion = readValue(argv, index, arg);
        index += 1;
        break;
      case "--prompt-hash":
        options.promptHash = readValue(argv, index, arg);
        index += 1;
        break;
      case "--model-training-cutoff":
        options.modelTrainingCutoff = readValue(argv, index, arg);
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

function resolveMetadata(options: CliOptions): ForecastRunMetadata {
  const missing = [
    ["provider", options.provider],
    ["model", options.model],
    ["runner_mode", options.runnerMode],
    ["created_at", options.createdAt],
  ].flatMap(([field, value]) => (value === undefined ? [field] : []));

  if (missing.length > 0) {
    throw new Error(`Missing required run metadata field(s): ${missing.join(", ")}.`);
  }

  return {
    provider: requireDefined(options.provider, "provider"),
    model: requireDefined(options.model, "model"),
    runner_mode: requireDefined(options.runnerMode, "runner_mode"),
    prompt_version: options.promptVersion,
    prompt_hash: options.promptHash,
    model_training_cutoff: options.modelTrainingCutoff,
    created_at: requireDefined(options.createdAt, "created_at"),
  };
}

function readJsonFile(path: string | undefined, label: string): unknown {
  if (!path) {
    throw new Error(`${label} is required.`);
  }

  return JSON.parse(readFileSync(path, "utf8")) as unknown;
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
