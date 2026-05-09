import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { buildCanolaForecastSidecarPackage } from "../lib/forecast-experiments/sidecar-package";

interface CliOptions {
  help: boolean;
  dryRun: boolean;
  workflowPath?: string;
  outputPath?: string;
  experimentSlug?: string;
  repoCommit?: string;
  rawModelOutputPath?: string;
}

const USAGE = `build-canola-forecast-sidecar-package

Build a local JSON package that maps a Canola workflow artifact to reviewable sidecar rows.

Usage:
  tsx scripts/build-canola-forecast-sidecar-package.ts --workflow <path> --experiment-slug <slug> [--repo-commit <hash>] [--raw-model-output <path>] [--output <path>] [--dry-run]

Options:
  --help, -h                         Show this help text.
  --workflow <path>                  Local workflow JSON from run-canola-forecast-local-workflow.
  --experiment-slug <slug>           Stable experiment slug for sidecar run identity.
  --repo-commit <hash>               Optional repository commit recorded in the run row.
  --raw-model-output <path>          Optional local raw model-output text for review/audit.
  --output <path>                    Optional local output JSON path.
  --dry-run                          Build package but do not write --output.

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

    const sidecarPackage = buildCanolaForecastSidecarPackage({
      workflow: readJsonFile(options.workflowPath, "--workflow"),
      experiment_slug: requireDefined(options.experimentSlug, "experiment_slug"),
      repo_commit: options.repoCommit,
      raw_model_output: options.rawModelOutputPath
        ? readFileSync(options.rawModelOutputPath, "utf8")
        : null,
    });

    if (options.outputPath && !options.dryRun) {
      mkdirSync(dirname(options.outputPath), { recursive: true });
      writeFileSync(
        options.outputPath,
        `${JSON.stringify(sidecarPackage, null, 2)}\n`,
        "utf8",
      );
      process.stderr.write(
        `sidecar package built: ${sidecarPackage.package_hash}\n`,
      );
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          output_path: options.outputPath,
          package_hash: sidecarPackage.package_hash,
          workflow_hash: sidecarPackage.workflow_hash,
          target_tables: sidecarPackage.guardrails.target_tables,
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
          package_hash: sidecarPackage.package_hash,
          workflow_hash: sidecarPackage.workflow_hash,
          target_tables: sidecarPackage.guardrails.target_tables,
        })}\n`,
      );
      return;
    }

    process.stderr.write(`sidecar package built: ${sidecarPackage.package_hash}\n`);
    process.stdout.write(`${JSON.stringify(sidecarPackage, null, 2)}\n`);
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
      case "--workflow":
        options.workflowPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--output":
        options.outputPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--experiment-slug":
        options.experimentSlug = readValue(argv, index, arg);
        index += 1;
        break;
      case "--repo-commit":
        options.repoCommit = readValue(argv, index, arg);
        index += 1;
        break;
      case "--raw-model-output":
        options.rawModelOutputPath = readValue(argv, index, arg);
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
