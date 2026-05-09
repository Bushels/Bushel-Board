import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  buildCanolaThesisReviewPackage,
  type CanolaThesisReviewPackageInput,
} from "../lib/forecast-experiments/thesis-review";

interface CliOptions {
  help: boolean;
  dryRun: boolean;
  runArtifactPath?: string;
  reviewPath?: string;
  outputPath?: string;
}

const USAGE = `review-canola-thesis-week

Build a local no-write weekly review package for a frozen Canola bull/bear thesis.

Usage:
  tsx scripts/review-canola-thesis-week.ts --run-artifact <path> --review <path> [--output <path>] [--dry-run]

Options:
  --help, -h                Show this help text.
  --run-artifact <path>     Local canola-forecast-run-artifact-v1 JSON.
  --review <path>           Local review JSON with next-week evidence and labels.
  --output <path>           Optional local output JSON path.
  --dry-run                 Build package but do not write --output.

The review JSON supplies review_as_of_date, review_cutoff_at, reviewer, thesis_verdict, verdict_notes, next_week_evidence, driver_reviews, missed_signals, adjustments_for_next_week, and created_at.

This command is local-only. It does not require grain prices, call models, read Supabase, write sidecar tables, write production tables, import dashboard code, or start Hermes.
`;

main(process.argv.slice(2));

function main(argv: string[]): void {
  try {
    const options = parseArgs(argv);

    if (options.help) {
      process.stdout.write(USAGE);
      return;
    }

    const reviewInput = readReviewInput(options.reviewPath);
    const reviewPackage = buildCanolaThesisReviewPackage({
      ...reviewInput,
      run_artifact: readJsonFile(options.runArtifactPath, "--run-artifact"),
    });

    if (options.outputPath && !options.dryRun) {
      mkdirSync(dirname(options.outputPath), { recursive: true });
      writeFileSync(
        options.outputPath,
        `${JSON.stringify(reviewPackage, null, 2)}\n`,
        "utf8",
      );
      process.stderr.write(`thesis review package built: ${reviewPackage.package_hash}\n`);
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          output_path: options.outputPath,
          package_hash: reviewPackage.package_hash,
          run_hash: reviewPackage.run_hash,
          learning_candidate: reviewPackage.learning_candidate,
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
          package_hash: reviewPackage.package_hash,
          run_hash: reviewPackage.run_hash,
          learning_candidate: reviewPackage.learning_candidate,
        })}\n`,
      );
      return;
    }

    process.stderr.write(`thesis review package built: ${reviewPackage.package_hash}\n`);
    process.stdout.write(`${JSON.stringify(reviewPackage, null, 2)}\n`);
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
      case "--run-artifact":
        options.runArtifactPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--review":
        options.reviewPath = readValue(argv, index, arg);
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

function readReviewInput(
  path: string | undefined,
): Omit<CanolaThesisReviewPackageInput, "run_artifact"> {
  const parsed = readJsonFile(path, "--review");

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--review must contain a JSON object.");
  }

  return parsed as Omit<CanolaThesisReviewPackageInput, "run_artifact">;
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

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `error: ${error.message}`;
  }

  return `error: ${String(error)}`;
}
