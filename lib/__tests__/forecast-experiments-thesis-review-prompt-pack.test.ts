import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CANOLA_FORECAST_SCHEMA_VERSION } from "../forecast-experiments/schema";
import { runCanolaForecastLocalWorkflow } from "../forecast-experiments/local-workflow";
import {
  CANOLA_THESIS_REVIEW_PROMPT_PACK_SCHEMA_VERSION,
  buildCanolaThesisReviewPromptPack,
} from "../forecast-experiments/thesis-review-prompt-pack";

const sourceRows = () => [
  {
    source_key: "cgc_weekly",
    record_type: "fact" as const,
    observed_period: "2026-2027 week 1 ending 2026-08-02",
    published_at: "2026-08-06T13:00:00-06:00",
    available_at: "2026-08-06T13:05:00-06:00",
    imported_at: "2026-08-06T13:10:00-06:00",
    payload: {
      worksheet: "Primary",
      metric: "Deliveries",
      grain: "Canola",
      region: "Saskatchewan",
      unit: "Ktonnes",
      value: 123.4,
      week_ending_date: "2026-08-02",
    },
  },
];

const forecast = () => ({
  schema_version: CANOLA_FORECAST_SCHEMA_VERSION,
  grain: "Canola",
  crop_year: "2026-2027",
  grain_week: 1,
  as_of_date: "2026-08-07",
  source_cutoff_at: "2026-08-07T14:30:00-06:00",
  model_training_cutoff: "2026-04-30",
  pretraining_taint_status: "untainted",
  horizon_days: 28,
  price_contract: {
    exchange: "ICE",
    commodity: "Canola",
    contract_code: "RSX26",
    contract_month: "2026-11",
    roll_policy: "fixed_contract_no_roll",
  },
  direction: "bullish",
  stance_score: 35,
  confidence_pct: 62,
  expected_move_pct_range: {
    low: 1,
    high: 3,
  },
  recommendation: "SCALE_IN",
  top_drivers: [
    {
      driver: "Export demand improved versus the prior weekly snapshot.",
      directional_effect: "bullish",
      evidence_source: "cgc_weekly",
      evidence_clock: "2026-08-07T14:30:00-06:00",
      confidence: "medium",
    },
  ],
  invalidating_triggers: ["Next CGC report shows deliveries and exports fading."],
  known_blind_spots: ["No full price tape is available in this experiment."],
  source_warnings: [
    {
      source: "grain_prices",
      warning: "Price history is incomplete; use thesis evidence first.",
    },
  ],
});

const runArtifact = () =>
  runCanolaForecastLocalWorkflow({
    source_rows: sourceRows(),
    forecast: forecast(),
    crop_year: "2026-2027",
    grain_week: 1,
    as_of_date: "2026-08-07",
    source_cutoff_at: "2026-08-07T14:30:00-06:00",
    snapshot_mode: "strict_artifact_mode",
    horizon_days: 28,
    price_contract: {
      exchange: "ICE",
      commodity: "Canola",
      contract_code: "RSX26",
      contract_month: "2026-11",
      roll_policy: "fixed_contract_no_roll",
    },
    model_training_cutoff: "2026-04-30",
    provider: "manual",
    model: "gemini-3.1-pro-preview",
    runner_mode: "manual_model_output",
    prompt_version: "canola-forecast-prompt-v1",
    created_at: "2026-08-07T14:36:00-06:00",
  }).run_artifact;

const acceptedEvidence = () => ({
  evidence_key: "cgc-week-2",
  source_key: "cgc_weekly",
  evidence_type: "official_data" as const,
  observed_period: "2026-2027 week 2 ending 2026-08-09",
  published_at: "2026-08-13T13:00:00-06:00",
  available_at: "2026-08-13T13:10:00-06:00",
  summary: "Next CGC release kept Canola deliveries ahead of the prior pace.",
  directional_effect: "bullish" as const,
  materiality: "high" as const,
  payload: {
    worksheet: "Primary",
    metric: "Deliveries",
    grain: "Canola",
    week_ending_date: "2026-08-09",
    direction_vs_thesis: "supportive",
  },
});

const promptInput = () => ({
  run_artifact: runArtifact(),
  review_as_of_date: "2026-08-14",
  review_cutoff_at: "2026-08-14T16:30:00-06:00",
  next_week_evidence: [acceptedEvidence()],
  reviewer: "codex",
  created_at: "2026-08-14T16:31:00-06:00",
  prompt_version: "canola-thesis-review-prompt-v1",
});

describe("Canola thesis review prompt pack", () => {
  it("builds a deterministic reviewer prompt from a frozen thesis and next-week evidence", () => {
    const first = buildCanolaThesisReviewPromptPack(promptInput());
    const second = buildCanolaThesisReviewPromptPack(promptInput());

    expect(first.schema_version).toBe(
      CANOLA_THESIS_REVIEW_PROMPT_PACK_SCHEMA_VERSION,
    );
    expect(first.prompt_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(second.prompt_hash).toBe(first.prompt_hash);
    expect(first.response_contract.allowed_evidence_keys).toEqual([
      "cgc-week-2",
    ]);
    expect(first.response_contract.required_driver_indexes).toEqual([0]);
    expect(first.system_prompt).toContain("Do not claim model training occurred");
    expect(first.system_prompt).toContain("price-only logic");
    expect(first.user_prompt).toContain("Accepted next-week evidence");
    expect(first.user_prompt).toContain("review-canola-thesis-week --review");
  });

  it("filters blocked evidence out of allowed evidence keys", () => {
    const promptPack = buildCanolaThesisReviewPromptPack({
      ...promptInput(),
      next_week_evidence: [
        acceptedEvidence(),
        {
          ...acceptedEvidence(),
          evidence_key: "already-known",
          available_at: "2026-08-07T13:00:00-06:00",
        },
        {
          ...acceptedEvidence(),
          evidence_key: "too-late",
          available_at: "2026-08-15T13:00:00-06:00",
        },
        {
          ...acceptedEvidence(),
          evidence_key: "private-chat",
          source_key: "private_chat_data",
        },
      ],
    });

    expect(promptPack.response_contract.allowed_evidence_keys).toEqual([
      "cgc-week-2",
    ]);
    expect(promptPack.blocked_evidence.map((record) => record.reason).sort()).toEqual([
      "already_available_at_forecast_cutoff",
      "available_after_review_cutoff",
      "forbidden_source",
    ]);
  });

  it("rejects prompt packs with no accepted next-week evidence", () => {
    expect(() =>
      buildCanolaThesisReviewPromptPack({
        ...promptInput(),
        next_week_evidence: [
          {
            ...acceptedEvidence(),
            available_at: "2026-08-07T13:00:00-06:00",
          },
        ],
      }),
    ).toThrow(/At least one next-week evidence record/i);
  });
});

describe("Canola thesis review prompt-pack CLI", () => {
  it("prints help without touching external systems", () => {
    const result = runPromptPackCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("build-canola-thesis-review-prompt-pack");
    expect(result.stdout).toContain("--run-artifact");
  });

  it("emits machine-readable prompt pack JSON to stdout", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "canola-review-prompt-cli-"));

    try {
      const runArtifactPath = join(tempDir, "run-artifact.json");
      const evidencePath = join(tempDir, "evidence.json");
      writeFileSync(runArtifactPath, JSON.stringify(runArtifact()));
      writeFileSync(
        evidencePath,
        JSON.stringify({ next_week_evidence: [acceptedEvidence()] }),
      );

      const result = runPromptPackCli([
        "--run-artifact",
        runArtifactPath,
        "--evidence",
        evidencePath,
        ...baseCliArgs(),
      ]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain("thesis review prompt pack built");
      expect(JSON.parse(result.stdout).schema_version).toBe(
        CANOLA_THESIS_REVIEW_PROMPT_PACK_SCHEMA_VERSION,
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not write output files during dry-run", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "canola-review-prompt-dry-"));

    try {
      const runArtifactPath = join(tempDir, "run-artifact.json");
      const evidencePath = join(tempDir, "evidence.json");
      const outputPath = join(tempDir, "prompt-pack.json");
      writeFileSync(runArtifactPath, JSON.stringify(runArtifact()));
      writeFileSync(evidencePath, JSON.stringify([acceptedEvidence()]));

      const result = runPromptPackCli([
        "--run-artifact",
        runArtifactPath,
        "--evidence",
        evidencePath,
        "--output",
        outputPath,
        "--dry-run",
        ...baseCliArgs(),
      ]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain("dry-run: output not written");
      expect(JSON.parse(result.stdout)).toMatchObject({
        dry_run: true,
        output_path: outputPath,
      });
      expect(existsSync(outputPath)).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

function baseCliArgs(): string[] {
  return [
    "--review-as-of",
    "2026-08-14",
    "--review-cutoff-at",
    "2026-08-14T16:30:00-06:00",
    "--reviewer",
    "codex",
    "--prompt-version",
    "canola-thesis-review-prompt-v1",
    "--created-at",
    "2026-08-14T16:31:00-06:00",
  ];
}

function runPromptPackCli(args: string[]) {
  return spawnSync(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/build-canola-thesis-review-prompt-pack.ts",
      ...args,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
}
