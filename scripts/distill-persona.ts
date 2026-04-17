#!/usr/bin/env npx tsx
/**
 * WS5 Task 5.7 — Persona distillation pipeline orchestrator
 *
 * Runs the six-phase pipeline end-to-end. Each phase lives in
 * scripts/distill-persona/{01-06}-*.ts and can be run standalone; this
 * script wires them together with the right CLI flags, prints a cost
 * estimate up front, and pauses on Phase-5 REVISE verdicts so the operator
 * can review before a second Phase-3 revision pass.
 *
 * Usage:
 *   npm run distill-persona -- --all              Run all six phases
 *   npm run distill-persona -- --book <slug>      Re-run one book (Phase 1-2, then 3-6 since topic synthesis is cross-book)
 *   npm run distill-persona -- --phase N          Debug: run a single phase
 *   npm run distill-persona -- --revise           Rerun Phase 3 (--revise) then 4, 5, 6
 *   npm run distill-persona -- --help
 *
 * Cost safeguard:
 *   Full pipeline is ~$5 (Sonnet chapter + topic + L0 passes plus Opus
 *   verification). The script prints the estimate and exits unless
 *   --confirm-spend is passed.
 */
import { spawnSync } from "child_process";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SCRIPTS_DIR = resolve(__dirname, "distill-persona");

const PHASE_SCRIPTS: Record<number, string> = {
  1: resolve(SCRIPTS_DIR, "01-extract.ts"),
  2: resolve(SCRIPTS_DIR, "02-chapters.ts"),
  3: resolve(SCRIPTS_DIR, "03-topics.ts"),
  4: resolve(SCRIPTS_DIR, "04-l0.ts"),
  5: resolve(SCRIPTS_DIR, "05-verify.ts"),
  6: resolve(SCRIPTS_DIR, "06-emit.ts"),
};

const BOOK_SLUGS = [
  "carnegie-how-to-win-friends",
  "voss-never-split-the-difference",
  "patterson-crucial-conversations",
  "cabane-charisma-myth",
] as const;

// Cost estimate displayed at pipeline start. Order-of-magnitude only — the
// exact number depends on how chatty Sonnet gets with each book. Based on
// WS5 design doc §5: four chapter summaries (~$2), seven topic syntheses
// (~$1.50), one L0 unification (~$0.25), one Opus verification pass over
// eight chunks (~$1.25). Total ~$5.
const COST_ESTIMATE_USD = 5;

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Persona Distillation Pipeline Orchestrator

Usage:
  npm run distill-persona -- --all                 Full rebuild (Phases 1-6)
  npm run distill-persona -- --book <slug>         Re-run one book (Phases 1-2 for that book, then 3-6 for everything)
  npm run distill-persona -- --phase <N>           Run a single phase (debugging)
  npm run distill-persona -- --revise              Phase 3 --revise, then 4, 5, 6
  npm run distill-persona -- --help

Required for full/book runs:
  --confirm-spend   Acknowledges the ~\$${COST_ESTIMATE_USD} LLM spend. Without this the pipeline
                    prints the estimate and exits with code 1.

Book slugs:
  ${BOOK_SLUGS.join("\n  ")}

Each phase also accepts its own --help for phase-specific details.
`);
  process.exit(0);
}

function getArgValue(flag: string): string | null {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

const RUN_ALL = args.includes("--all");
const RUN_REVISE = args.includes("--revise");
const BOOK_SLUG = getArgValue("--book");
const PHASE_RAW = getArgValue("--phase");
const CONFIRM_SPEND = args.includes("--confirm-spend");

const PHASE_NUM = PHASE_RAW ? Number(PHASE_RAW) : null;
if (PHASE_NUM !== null && (Number.isNaN(PHASE_NUM) || !(PHASE_NUM in PHASE_SCRIPTS))) {
  console.error(`ERROR: --phase must be 1-6. Got: ${PHASE_RAW}`);
  process.exit(1);
}

if (BOOK_SLUG && !BOOK_SLUGS.includes(BOOK_SLUG as (typeof BOOK_SLUGS)[number])) {
  console.error(
    `ERROR: --book ${BOOK_SLUG} not recognized. Valid: ${BOOK_SLUGS.join(", ")}`,
  );
  process.exit(1);
}

const ACTIONS = [RUN_ALL, RUN_REVISE, BOOK_SLUG !== null, PHASE_NUM !== null].filter(
  Boolean,
).length;
if (ACTIONS === 0) {
  console.error(
    "ERROR: specify one of --all, --book <slug>, --phase <N>, or --revise. See --help.",
  );
  process.exit(1);
}
if (ACTIONS > 1) {
  console.error(
    "ERROR: --all, --book, --phase, and --revise are mutually exclusive.",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Cost gate
// ---------------------------------------------------------------------------

// Phases 2-5 make LLM calls. --phase 1 and --phase 6 are free (extract +
// emit) so we skip the gate for those. --book runs Phase 2 which does cost.
const IS_PAID_RUN =
  RUN_ALL ||
  RUN_REVISE ||
  BOOK_SLUG !== null ||
  (PHASE_NUM !== null && PHASE_NUM >= 2 && PHASE_NUM <= 5);

if (IS_PAID_RUN && !CONFIRM_SPEND) {
  console.error(
    `\nThis run will make live LLM calls (Sonnet 4.6 and/or Opus 4.7).\n` +
      `Estimated cost: ~\$${COST_ESTIMATE_USD} USD for a full --all run.\n` +
      `Single-phase or single-book runs cost less, but still non-zero.\n\n` +
      `Re-run with --confirm-spend to proceed. Example:\n` +
      `  npm run distill-persona -- --all --confirm-spend\n`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

interface PhaseInvocation {
  phase: number;
  extraArgs: string[];
}

function runPhase(phase: number, extraArgs: string[] = []): void {
  const script = PHASE_SCRIPTS[phase];
  console.error(`\n─── Phase ${phase} ─── ${script}`);
  if (extraArgs.length > 0) {
    console.error(`    args: ${extraArgs.join(" ")}`);
  }

  // Pipe stdio straight through so stderr progress from the child script
  // reaches the operator's terminal immediately.
  const result = spawnSync("npx", ["tsx", script, ...extraArgs], {
    stdio: "inherit",
    shell: true,
  });

  if (result.status !== 0) {
    console.error(`\nPhase ${phase} failed with exit code ${result.status}.`);
    process.exit(result.status ?? 1);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  let plan: PhaseInvocation[];

  if (PHASE_NUM !== null) {
    plan = [{ phase: PHASE_NUM, extraArgs: [] }];
  } else if (BOOK_SLUG) {
    // --book: re-extract that book, regenerate its chapter summary, then
    // re-synthesize topics (which are cross-book) and downstream phases.
    plan = [
      { phase: 1, extraArgs: [] },
      { phase: 2, extraArgs: ["--book", BOOK_SLUG] },
      { phase: 3, extraArgs: [] },
      { phase: 4, extraArgs: [] },
      { phase: 5, extraArgs: [] },
      { phase: 6, extraArgs: [] },
    ];
  } else if (RUN_REVISE) {
    plan = [
      { phase: 3, extraArgs: ["--revise"] },
      { phase: 4, extraArgs: [] },
      { phase: 5, extraArgs: [] },
      { phase: 6, extraArgs: [] },
    ];
  } else {
    // --all
    plan = [
      { phase: 1, extraArgs: [] },
      { phase: 2, extraArgs: [] },
      { phase: 3, extraArgs: [] },
      { phase: 4, extraArgs: [] },
      { phase: 5, extraArgs: [] },
      { phase: 6, extraArgs: [] },
    ];
  }

  console.error(
    `\nPersona Distillation Pipeline — plan: ${plan.map((p) => `Phase ${p.phase}`).join(" → ")}`,
  );

  for (const step of plan) {
    runPhase(step.phase, step.extraArgs);

    // After Phase 5, stop before Phase 6 if the report shows any REVISE
    // verdicts. The operator should review them before we overwrite the
    // production TS files.
    if (step.phase === 5) {
      const reportPath = resolve(
        __dirname,
        "..",
        "data",
        "Knowledge",
        "processed",
        "Personality",
        "verification-report.json",
      );
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require("fs") as typeof import("fs");
        const report = JSON.parse(fs.readFileSync(reportPath, "utf-8")) as {
          revise_count?: number;
          chunks?: Array<{ file: string; status: string }>;
        };
        if ((report.revise_count ?? 0) > 0) {
          const reviseFiles =
            report.chunks
              ?.filter((c) => c.status === "REVISE")
              .map((c) => `  - ${c.file}`)
              .join("\n") ?? "";
          console.error(
            `\nVerification found ${report.revise_count} REVISE chunk(s):\n${reviseFiles}\n\n` +
              `Review ${reportPath}, then re-run:\n` +
              `  npm run distill-persona -- --revise --confirm-spend\n\n` +
              `Halting before Phase 6 emission.`,
          );
          process.exit(2);
        }
      } catch (err) {
        console.error(
          `Warning: could not read verification-report.json (${String(err)}). Proceeding to Phase 6 anyway.`,
        );
      }
    }
  }

  console.error(`\nPipeline complete.`);
}

main();
