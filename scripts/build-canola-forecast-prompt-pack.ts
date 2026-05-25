import { readFileSync, writeFileSync } from "node:fs";

import {
  PRICE_ROLL_POLICIES,
  type PriceContract,
  type PriceRollPolicy,
} from "../lib/forecast-experiments/schema";
import { buildCanolaForecastPromptPack } from "../lib/forecast-experiments/prompt-pack";

interface CliOptions {
  help: boolean;
  dryRun: boolean;
  snapshotPath?: string;
  outputPath?: string;
  horizonDays?: 7 | 28;
  exchange?: string;
  contractCode?: string;
  contractMonth?: string;
  rollPolicy?: PriceRollPolicy;
  modelTrainingCutoff?: string;
  createdAt?: string;
  promptVersion?: string;
}

const USAGE = `build-canola-forecast-prompt-pack

Build a local Canola forecast prompt pack from a deterministic snapshot JSON.

Usage:
  tsx scripts/build-canola-forecast-prompt-pack.ts --snapshot <path> --horizon-days <7|28> --exchange ICE --contract-code RSX26 --contract-month 2026-11 --roll-policy fixed_contract_no_roll --created-at <ISO timestamp>

Options:
  --help, -h                         Show this help text.
  --snapshot <path>                  Local snapshot JSON from build-canola-forecast-snapshot.
  --output <path>                    Optional local output file for the prompt pack JSON.
  --horizon-days <7|28>              Forecast horizon.
  --exchange <name>                  Price contract exchange.
  --contract-code <code>             Price contract code.
  --contract-month <YYYY-MM>         Price contract month.
  --roll-policy <policy>             fixed_contract_no_roll, front_month_with_declared_roll, or continuous_adjusted_series.
  --model-training-cutoff <date>     Optional model training cutoff date.
  --prompt-version <name>            Optional prompt/version label.
  --created-at <ISO timestamp>       Prompt pack creation timestamp with timezone offset.
  --dry-run                          Build and print the prompt pack but do not write --output.

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

    const promptPack = buildCanolaForecastPromptPack({
      snapshot: readJsonFile(options.snapshotPath, "--snapshot"),
      horizon_days: requireDefined(options.horizonDays, "horizon_days"),
      price_contract: resolvePriceContract(options),
      model_training_cutoff: options.modelTrainingCutoff,
      created_at: requireDefined(options.createdAt, "created_at"),
      prompt_version: options.promptVersion,
    });
    const json = `${JSON.stringify(promptPack, null, 2)}\n`;

    if (options.outputPath && !options.dryRun) {
      writeFileSync(options.outputPath, json, "utf8");
      process.stderr.write(`prompt pack built: ${promptPack.prompt_hash}\n`);
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          output_path: options.outputPath,
          prompt_hash: promptPack.prompt_hash,
          snapshot_hash: promptPack.snapshot_hash,
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
          prompt_hash: promptPack.prompt_hash,
          snapshot_hash: promptPack.snapshot_hash,
        })}\n`,
      );
      return;
    }

    process.stderr.write(`prompt pack built: ${promptPack.prompt_hash}\n`);
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
      case "--output":
        options.outputPath = readValue(argv, index, arg);
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

function resolvePriceContract(options: CliOptions): PriceContract {
  return {
    exchange: requireDefined(options.exchange, "exchange"),
    commodity: "Canola",
    contract_code: requireDefined(options.contractCode, "contract_code"),
    contract_month: requireDefined(options.contractMonth, "contract_month"),
    roll_policy: requireDefined(options.rollPolicy, "roll_policy"),
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
