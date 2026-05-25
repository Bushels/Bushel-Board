import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  buildCanolaThesisReviewPromptPack,
  type CanolaThesisReviewPromptPackInput,
} from "../lib/forecast-experiments/thesis-review-prompt-pack";
import type { ThesisReviewEvidenceRecord } from "../lib/forecast-experiments/thesis-review";

interface CliOptions {
  help: boolean;
  dryRun: boolean;
  runArtifactPath?: string;
  evidencePath?: string;
  outputPath?: string;
  reviewAsOfDate?: string;
  reviewCutoffAt?: string;
  reviewer?: string;
  createdAt?: string;
  promptVersion?: string;
}

const USAGE = `build-canola-thesis-review-prompt-pack

Build a local no-write prompt pack for reviewing a frozen Canola bull/bear thesis against next-week evidence.

Usage:
  tsx scripts/build-canola-thesis-review-prompt-pack.ts --run-artifact <path> --evidence <path> --review-as-of <YYYY-MM-DD> --review-cutoff-at <ISO timestamp> --created-at <ISO timestamp> [--reviewer <name>] [--prompt-version <name>] [--output <path>] [--dry-run]

Options:
  --help, -h                   Show this help text.
  --run-artifact <path>        Local canola-forecast-run-artifact-v1 JSON.
  --evidence <path>            Local JSON evidence array, {evidence: [...]}, or {next_week_evidence: [...]}.
  --review-as-of <date>        Review date as YYYY-MM-DD.
  --review-cutoff-at <ISO>     Latest allowed evidence availability timestamp.
  --reviewer <name>            Optional reviewer label, defaults to manual.
  --prompt-version <name>      Optional prompt/version label.
  --created-at <ISO>           Prompt pack creation timestamp with timezone offset.
  --output <path>              Optional local output JSON path.
  --dry-run                    Build package but do not write --output.

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

    const promptPack = buildCanolaThesisReviewPromptPack({
      run_artifact: readJsonFile(options.runArtifactPath, "--run-artifact"),
      review_as_of_date: requireDefined(
        options.reviewAsOfDate,
        "review_as_of_date",
      ),
      review_cutoff_at: requireDefined(
        options.reviewCutoffAt,
        "review_cutoff_at",
      ),
      next_week_evidence: readEvidence(options.evidencePath),
      reviewer: options.reviewer,
      created_at: requireDefined(options.createdAt, "created_at"),
      prompt_version: options.promptVersion,
    } satisfies CanolaThesisReviewPromptPackInput);

    if (options.outputPath && !options.dryRun) {
      mkdirSync(dirname(options.outputPath), { recursive: true });
      writeFileSync(
        options.outputPath,
        `${JSON.stringify(promptPack, null, 2)}\n`,
        "utf8",
      );
      process.stderr.write(`thesis review prompt pack built: ${promptPack.prompt_hash}\n`);
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          output_path: options.outputPath,
          prompt_hash: promptPack.prompt_hash,
          run_hash: promptPack.run_hash,
          accepted_evidence_count: promptPack.accepted_evidence.length,
          blocked_evidence_count: promptPack.blocked_evidence.length,
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
          run_hash: promptPack.run_hash,
          accepted_evidence_count: promptPack.accepted_evidence.length,
          blocked_evidence_count: promptPack.blocked_evidence.length,
        })}\n`,
      );
      return;
    }

    process.stderr.write(`thesis review prompt pack built: ${promptPack.prompt_hash}\n`);
    process.stdout.write(`${JSON.stringify(promptPack, null, 2)}\n`);
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
      case "--evidence":
        options.evidencePath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--output":
        options.outputPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--review-as-of":
        options.reviewAsOfDate = readValue(argv, index, arg);
        index += 1;
        break;
      case "--review-cutoff-at":
        options.reviewCutoffAt = readValue(argv, index, arg);
        index += 1;
        break;
      case "--reviewer":
        options.reviewer = readValue(argv, index, arg);
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

function readEvidence(path: string | undefined): ThesisReviewEvidenceRecord[] {
  const parsed = readJsonFile(path, "--evidence");

  if (Array.isArray(parsed)) {
    return parsed as ThesisReviewEvidenceRecord[];
  }

  if (parsed && typeof parsed === "object") {
    const candidate = parsed as {
      evidence?: unknown;
      next_week_evidence?: unknown;
    };

    if (Array.isArray(candidate.next_week_evidence)) {
      return candidate.next_week_evidence as ThesisReviewEvidenceRecord[];
    }

    if (Array.isArray(candidate.evidence)) {
      return candidate.evidence as ThesisReviewEvidenceRecord[];
    }
  }

  throw new Error("--evidence must contain an array, evidence array, or next_week_evidence array.");
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
