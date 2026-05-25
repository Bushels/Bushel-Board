import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runCanolaForecastLocalWorkflow } from "../forecast-experiments/local-workflow";
import type { ApprovedForecastSourceRow } from "../forecast-experiments/source-records";
import {
  buildCanolaThesisReviewPackage,
  type CanolaThesisReviewPackageInput,
  type ThesisReviewEvidenceRecord,
} from "../forecast-experiments/thesis-review";
import { buildCanolaThesisReviewPromptPack } from "../forecast-experiments/thesis-review-prompt-pack";

const fixtureDir = join(
  process.cwd(),
  "docs",
  "reference",
  "forecast-experiments",
  "canola-walk-forward-week-38",
);
const outputDir = join(fixtureDir, "output");

describe("Canola walk-forward Week 38 fixture", () => {
  it("rebuilds the tracked workflow output from fixture inputs", () => {
    const workflow = runCanolaForecastLocalWorkflow({
      source_rows: readJson<{ rows: ApprovedForecastSourceRow[] }>(
        "source-rows.json",
      ).rows,
      forecast: readJson("forecast.json"),
      crop_year: "2025-2026",
      grain_week: 38,
      as_of_date: "2026-04-24",
      source_cutoff_at: "2026-04-24T16:30:00-06:00",
      snapshot_mode: "strict_artifact_mode",
      horizon_days: 7,
      price_contract: {
        exchange: "ICE",
        commodity: "Canola",
        contract_code: "RSN26",
        contract_month: "2026-07",
        roll_policy: "fixed_contract_no_roll",
      },
      model_training_cutoff: "2026-03-31",
      provider: "manual-fixture",
      model: "human-authored-fixture-v1",
      runner_mode: "manual_model_output",
      prompt_version: "canola-forecast-prompt-v1",
      created_at: "2026-04-24T16:35:00-06:00",
    });
    const trackedWorkflow = readOutput<{ workflow_hash: string }>("workflow.json");
    const trackedRunArtifact = readOutput<{ run_hash: string }>("run-artifact.json");

    expect(workflow.workflow_hash).toBe(trackedWorkflow.workflow_hash);
    expect(workflow.run_artifact.run_hash).toBe(trackedRunArtifact.run_hash);
    expect(workflow.snapshot.snapshot_mode).toBe("strict_artifact_mode");
    expect(workflow.run_artifact.forecast.source_warnings[0]?.warning).toContain(
      "price-only logic",
    );
  });

  it("rebuilds the tracked review prompt pack and preserves evidence gates", () => {
    const runArtifact = readOutput("run-artifact.json");
    const promptPack = buildCanolaThesisReviewPromptPack({
      run_artifact: runArtifact,
      review_as_of_date: "2026-05-01",
      review_cutoff_at: "2026-05-01T16:30:00-06:00",
      next_week_evidence: readJson<{
        next_week_evidence: ThesisReviewEvidenceRecord[];
      }>("next-week-evidence.json").next_week_evidence,
      reviewer: "fixture",
      prompt_version: "canola-thesis-review-prompt-v1",
      created_at: "2026-05-01T16:31:00-06:00",
    });
    const trackedPromptPack = readOutput<{
      prompt_hash: string;
      accepted_evidence: unknown[];
      blocked_evidence: Array<{ reason: string }>;
    }>("thesis-review-prompt-pack.json");

    expect(promptPack.prompt_hash).toBe(trackedPromptPack.prompt_hash);
    expect(promptPack.accepted_evidence).toHaveLength(2);
    expect(promptPack.blocked_evidence.map((record) => record.reason).sort()).toEqual([
      "already_available_at_forecast_cutoff",
      "available_after_review_cutoff",
      "forbidden_source",
    ]);
    expect(promptPack.system_prompt).toContain("price-only logic");
  });

  it("rebuilds the tracked review package as a review-only synthetic fixture", () => {
    const review = readJson<Omit<CanolaThesisReviewPackageInput, "run_artifact">>(
      "review.json",
    );
    const reviewPackage = buildCanolaThesisReviewPackage({
      ...review,
      run_artifact: readOutput("run-artifact.json"),
    });
    const trackedReviewPackage = readOutput<{
      package_hash: string;
      learning_candidate: { allowed: boolean; mode: string };
      thesis_verdict: string;
    }>("thesis-review-package.json");

    expect(reviewPackage.package_hash).toBe(trackedReviewPackage.package_hash);
    expect(reviewPackage.thesis_verdict).toBe("partly_held");
    expect(reviewPackage.learning_candidate).toEqual({
      allowed: false,
      mode: "review_only_fixture",
      reasons: ["forecast run is a synthetic fixture"],
    });
  });
});

function readJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(fixtureDir, filename), "utf8")) as T;
}

function readOutput<T>(filename: string): T {
  return JSON.parse(readFileSync(join(outputDir, filename), "utf8")) as T;
}
