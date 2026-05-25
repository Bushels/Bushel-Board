import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  PRICE_ROLL_POLICIES,
  type PriceContract,
  type PriceRollPolicy,
} from "../lib/forecast-experiments/schema";
import {
  SNAPSHOT_MODES,
  type SnapshotMode,
} from "../lib/forecast-experiments/snapshot";
import type { ApprovedForecastSourceRow } from "../lib/forecast-experiments/source-records";
import {
  FORECAST_RUNNER_MODES,
  type ForecastRunnerMode,
} from "../lib/forecast-experiments/run-artifact";
import { runCanolaForecastLocalWorkflow } from "../lib/forecast-experiments/local-workflow";
import {
  assertLocalWorkflowOutputFilename,
  assertNoForbiddenWriteIntents,
} from "../lib/forecast-experiments/no-write-guard";

interface CliOptions {
  help: boolean;
  dryRun: boolean;
  sourceRowsPath?: string;
  forecastPath?: string;
  outputDir?: string;
  cropYear?: string;
  grainWeek?: number;
  asOfDate?: string;
  sourceCutoffAt?: string;
  snapshotMode?: SnapshotMode;
  horizonDays?: 7 | 28;
  exchange?: string;
  contractCode?: string;
  contractMonth?: string;
  rollPolicy?: PriceRollPolicy;
  modelTrainingCutoff?: string;
  provider?: string;
  model?: string;
  runnerMode?: ForecastRunnerMode;
  promptVersion?: string;
  createdAt?: string;
}

const USAGE = `run-canola-forecast-local-workflow

Run the local Canola forecast harness from source rows and forecast JSON.

Usage:
  tsx scripts/run-canola-forecast-local-workflow.ts --source-rows <path> --forecast <path> --crop-year <YYYY-YYYY> --grain-week <1-53> --as-of <YYYY-MM-DD> --source-cutoff-at <ISO timestamp> --horizon-days <7|28> --exchange ICE --contract-code RSX26 --contract-month 2026-11 --roll-policy fixed_contract_no_roll --model-training-cutoff <date> --provider manual --model <name> --runner-mode manual_model_output --created-at <ISO timestamp>

Options:
  --help, -h                         Show this help text.
  --source-rows <path>               Local JSON source rows file, either rows array or object with rows.
  --forecast <path>                  Local forecast JSON matching canola-forecast-v1.
  --output-dir <path>                Optional local directory for workflow artifacts.
  --dry-run                          Build workflow but do not write --output-dir files.

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

    const workflow = runCanolaForecastLocalWorkflow({
      source_rows: readSourceRows(options.sourceRowsPath),
      forecast: readJsonFile(options.forecastPath, "--forecast"),
      crop_year: requireDefined(options.cropYear, "crop_year"),
      grain_week: requireDefined(options.grainWeek, "grain_week"),
      as_of_date: requireDefined(options.asOfDate, "as_of_date"),
      source_cutoff_at: requireDefined(options.sourceCutoffAt, "source_cutoff_at"),
      snapshot_mode: options.snapshotMode ?? "strict_artifact_mode",
      horizon_days: requireDefined(options.horizonDays, "horizon_days"),
      price_contract: resolvePriceContract(options),
      model_training_cutoff: requireDefined(
        options.modelTrainingCutoff,
        "model_training_cutoff",
      ),
      provider: requireDefined(options.provider, "provider"),
      model: requireDefined(options.model, "model"),
      runner_mode: requireDefined(options.runnerMode, "runner_mode"),
      prompt_version: options.promptVersion ?? "canola-forecast-prompt-v1",
      created_at: requireDefined(options.createdAt, "created_at"),
    });
    const json = `${JSON.stringify(workflow, null, 2)}\n`;
    assertNoForbiddenWriteIntents(workflow);

    if (options.outputDir && !options.dryRun) {
      writeWorkflowFiles(options.outputDir, workflow);
      process.stderr.write(`local workflow built: ${workflow.workflow_hash}\n`);
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          output_dir: options.outputDir,
          workflow_hash: workflow.workflow_hash,
          snapshot_hash: workflow.snapshot.snapshot_hash,
          prompt_hash: workflow.prompt_pack.prompt_hash,
          run_hash: workflow.run_artifact.run_hash,
        })}\n`,
      );
      return;
    }

    if (options.outputDir && options.dryRun) {
      process.stderr.write("dry-run: output directory not written\n");
      process.stdout.write(
        `${JSON.stringify({
          dry_run: true,
          output_dir: options.outputDir,
          workflow_hash: workflow.workflow_hash,
          snapshot_hash: workflow.snapshot.snapshot_hash,
          prompt_hash: workflow.prompt_pack.prompt_hash,
          run_hash: workflow.run_artifact.run_hash,
        })}\n`,
      );
      return;
    }

    process.stderr.write(`local workflow built: ${workflow.workflow_hash}\n`);
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
      case "--source-rows":
        options.sourceRowsPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--forecast":
        options.forecastPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--output-dir":
        options.outputDir = readValue(argv, index, arg);
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
      case "--horizon-days":
        options.horizonDays = parseHorizonDays(readValue(argv, index, arg));
        index += 1;
        break;
      case "--exchange":
        options.exchange = readValue(argv, index, arg);
        index += 1;
        break;
      case "--contract-code":
        options.contractCode = readValue(argv, index, arg);
        index += 1;
        break;
      case "--contract-month":
        options.contractMonth = readValue(argv, index, arg);
        index += 1;
        break;
      case "--roll-policy":
        options.rollPolicy = parseRollPolicy(readValue(argv, index, arg));
        index += 1;
        break;
      case "--model-training-cutoff":
        options.modelTrainingCutoff = readValue(argv, index, arg);
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

function writeWorkflowFiles(
  outputDir: string,
  workflow: ReturnType<typeof runCanolaForecastLocalWorkflow>,
): void {
  mkdirSync(outputDir, { recursive: true });
  const writeAllowedJson = (fileName: string, value: unknown): void => {
    assertLocalWorkflowOutputFilename(fileName);
    writeFileSync(join(outputDir, fileName), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  };

  writeAllowedJson("source-records.json", workflow.source_records);
  writeAllowedJson("snapshot.json", workflow.snapshot);
  writeAllowedJson("prompt-pack.json", workflow.prompt_pack);
  writeAllowedJson("run-artifact.json", workflow.run_artifact);
  writeAllowedJson("workflow.json", workflow);
}

function readSourceRows(path: string | undefined): ApprovedForecastSourceRow[] {
  const parsed = readJsonFile(path, "--source-rows");

  if (Array.isArray(parsed)) {
    return parsed as ApprovedForecastSourceRow[];
  }

  if (parsed && typeof parsed === "object") {
    const rows = (parsed as { rows?: unknown }).rows;

    if (Array.isArray(rows)) {
      return rows as ApprovedForecastSourceRow[];
    }
  }

  throw new Error("--source-rows must contain a rows array.");
}

function readJsonFile(path: string | undefined, label: string): unknown {
  if (!path) {
    throw new Error(`${label} is required.`);
  }

  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function resolvePriceContract(options: CliOptions): PriceContract {
  return {
    exchange: requireDefined(options.exchange, "exchange"),
    commodity: "Canola",
    contract_code: requireDefined(options.contractCode, "contract_code"),
    contract_month: requireDefined(options.contractMonth, "contract_month"),
    roll_policy: requireDefined(options.rollPolicy, "roll_policy"),
  };
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

function parseHorizonDays(value: string): 7 | 28 {
  const parsed = Number(value);

  if (parsed === 7 || parsed === 28) {
    return parsed;
  }

  throw new Error("--horizon-days must be 7 or 28.");
}

function parseRollPolicy(value: string): PriceRollPolicy {
  if (PRICE_ROLL_POLICIES.includes(value as PriceRollPolicy)) {
    return value as PriceRollPolicy;
  }

  throw new Error(`Unsupported roll policy: ${value}`);
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
