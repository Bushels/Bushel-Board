import { readFileSync, writeFileSync } from "node:fs";

import {
  MARKET_READ_CUTOFF_PROOFS,
  buildCanolaMarketReadSourceRows,
  type MarketReadCutoffProof,
} from "../lib/forecast-experiments/canola-market-read-source-rows";

interface CliOptions {
  help: boolean;
  dryRun: boolean;
  inputPath?: string;
  outputPath?: string;
  asOfDate?: string;
  sourceCutoffAt?: string;
  cutoffProof?: MarketReadCutoffProof;
  createdAt?: string;
}

const USAGE = `export-canola-market-read-source-rows

Export a saved deterministic Canola market-read JSON into forecast source rows.

Usage:
  tsx scripts/export-canola-market-read-source-rows.ts --input <path> --as-of <YYYY-MM-DD> --source-cutoff-at <ISO timestamp> --cutoff-proof <frozen_forward_artifact|current_table_replay>

Options:
  --help, -h                         Show this help text.
  --input <path>                     Saved JSON from generate-canola-market-read.ts.
  --output <path>                    Optional local output file for source rows.
  --as-of <YYYY-MM-DD>               Forecast as-of date.
  --source-cutoff-at <ISO timestamp> Exact source cutoff timestamp with timezone offset.
  --cutoff-proof <proof>             frozen_forward_artifact or current_table_replay.
  --created-at <ISO timestamp>       Optional export creation timestamp.
  --dry-run                          Build and print summary but do not write --output.

This command is local-file only after --input is created. It does not read Supabase,
write sidecar tables, call models, execute SQL, or start Hermes.
`;

main(process.argv.slice(2));

function main(argv: string[]): void {
  try {
    const options = parseArgs(argv);

    if (options.help) {
      process.stdout.write(USAGE);
      return;
    }

    const output = buildCanolaMarketReadSourceRows({
      market_read: readJsonFile(options.inputPath),
      as_of_date: requireDefined(options.asOfDate, "as_of"),
      source_cutoff_at: requireDefined(options.sourceCutoffAt, "source_cutoff_at"),
      cutoff_proof: requireDefined(options.cutoffProof, "cutoff_proof"),
      created_at: options.createdAt,
    });
    const json = `${JSON.stringify(output, null, 2)}\n`;

    if (options.outputPath && !options.dryRun) {
      writeFileSync(options.outputPath, json, "utf8");
      process.stderr.write(`market-read source rows built: ${output.rows.length}\n`);
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          output_path: options.outputPath,
          rows: output.rows.length,
          omitted_sources: output.omitted_sources,
          snapshot_mode: output.snapshot_mode,
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
          rows: output.rows.length,
          omitted_sources: output.omitted_sources,
          snapshot_mode: output.snapshot_mode,
        })}\n`,
      );
      return;
    }

    process.stderr.write(`market-read source rows built: ${output.rows.length}\n`);
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
      case "--as-of":
        options.asOfDate = readValue(argv, index, arg);
        index += 1;
        break;
      case "--source-cutoff-at":
        options.sourceCutoffAt = readValue(argv, index, arg);
        index += 1;
        break;
      case "--cutoff-proof":
        options.cutoffProof = parseCutoffProof(readValue(argv, index, arg));
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

function readJsonFile(path: string | undefined): unknown {
  if (!path) {
    throw new Error("--input is required.");
  }

  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function parseCutoffProof(value: string): MarketReadCutoffProof {
  if (MARKET_READ_CUTOFF_PROOFS.includes(value as MarketReadCutoffProof)) {
    return value as MarketReadCutoffProof;
  }

  throw new Error(`Unsupported cutoff proof: ${value}.`);
}

function readValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${arg} requires a value.`);
  }

  return value;
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
