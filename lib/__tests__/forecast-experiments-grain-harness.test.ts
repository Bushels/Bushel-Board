import { describe, expect, it } from "vitest";

import {
  CANOLA_FORECAST_SCHEMA_VERSION,
  GRAIN_FORECAST_SCHEMA_VERSION,
  canolaForecastSchema,
  grainForecastSchema,
} from "../forecast-experiments/schema";
import {
  GRAIN_FORECAST_SNAPSHOT_SCHEMA_VERSION,
  buildGrainForecastSnapshot,
} from "../forecast-experiments/snapshot";
import {
  GRAIN_FORECAST_PROMPT_PACK_SCHEMA_VERSION,
  buildGrainForecastPromptPack,
} from "../forecast-experiments/prompt-pack";
import {
  GRAIN_FORECAST_RUN_ARTIFACT_SCHEMA_VERSION,
  buildGrainForecastRunArtifact,
} from "../forecast-experiments/run-artifact";
import {
  GRAIN_FORECAST_LOCAL_WORKFLOW_SCHEMA_VERSION,
  runGrainForecastLocalWorkflow,
} from "../forecast-experiments/local-workflow";
import {
  GRAIN_THESIS_REVIEW_PACKAGE_SCHEMA_VERSION,
  buildGrainThesisReviewPackage,
} from "../forecast-experiments/thesis-review";
import {
  FORECAST_GRAIN_NAMES,
  FORECAST_GRAIN_PROFILES,
} from "../forecast-experiments/grain-profiles";

const sourceCutoffAt = "2026-08-07T14:30:00-06:00";
const reviewCutoffAt = "2026-08-14T14:30:00-06:00";

const sourceRow = (grain = "Barley") => ({
  source_key: "cgc_weekly",
  record_type: "fact" as const,
  observed_period: "2026-2027 week 1 ending 2026-08-02",
  published_at: "2026-08-06T13:00:00-06:00",
  available_at: "2026-08-06T13:05:00-06:00",
  imported_at: "2026-08-06T13:15:00-06:00",
  payload: {
    worksheet: "Primary",
    metric: "Deliveries",
    grain,
    region: "Saskatchewan",
    unit: "Ktonnes",
    value: 123.4,
  },
});

const grainForecast = (grain = "Barley") => ({
  schema_version: GRAIN_FORECAST_SCHEMA_VERSION,
  grain,
  crop_year: "2026-2027",
  grain_week: 1,
  as_of_date: "2026-08-07",
  source_cutoff_at: sourceCutoffAt,
  model_training_cutoff: "2026-04-30",
  pretraining_taint_status: "untainted",
  horizon_days: 7,
  price_contract: null,
  direction: "neutral",
  stance_score: 4,
  confidence_pct: 54,
  expected_move_pct_range: {
    low: -1,
    high: 1,
  },
  recommendation: "WATCH",
  top_drivers: [
    {
      driver: "CGC deliveries were available before the forecast cutoff.",
      directional_effect: "neutral",
      evidence_source: "cgc_weekly",
      evidence_clock: "2026-08-06T13:05:00-06:00",
      confidence: "medium",
    },
  ],
  invalidating_triggers: ["Next-week CGC exports break materially higher."],
  known_blind_spots: ["No validated cash-price benchmark in this local test."],
  source_warnings: [],
});

describe("multi-grain forecast harness", () => {
  it("defines profiles for exactly the canonical 16 dashboard grains", () => {
    expect(FORECAST_GRAIN_NAMES).toHaveLength(16);
    expect(Object.keys(FORECAST_GRAIN_PROFILES).sort()).toEqual(
      [...FORECAST_GRAIN_NAMES].sort(),
    );
    expect(FORECAST_GRAIN_PROFILES["Amber Durum"].notes[0]).toContain(
      "Wheat",
    );
  });

  it("accepts canonical grains and rejects near-duplicate grain labels", () => {
    expect(grainForecastSchema.safeParse(grainForecast("Canaryseed")).success).toBe(
      true,
    );
    expect(grainForecastSchema.safeParse(grainForecast("Canary Seed")).success).toBe(
      false,
    );
  });

  it("keeps the Canola compatibility schema strict", () => {
    const parsed = canolaForecastSchema.safeParse({
      ...grainForecast("Canola"),
      schema_version: CANOLA_FORECAST_SCHEMA_VERSION,
      price_contract: {
        exchange: "CBOT",
        commodity: "Wheat",
        contract_code: "ZWZ26",
        contract_month: "2026-12",
        roll_policy: "fixed_contract_no_roll",
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("builds a generic point-in-time snapshot without allowing future rows", () => {
    const snapshot = buildGrainForecastSnapshot({
      grain: "Wheat",
      crop_year: "2026-2027",
      grain_week: 1,
      as_of_date: "2026-08-07",
      source_cutoff_at: sourceCutoffAt,
      snapshot_mode: "strict_artifact_mode",
      records: [
        sourceRow("Wheat"),
        {
          ...sourceRow("Wheat"),
          source_key: "future_report",
          published_at: "2026-08-07T15:00:00-06:00",
          available_at: "2026-08-07T15:01:00-06:00",
        },
      ],
    });

    expect(snapshot.schema_version).toBe(GRAIN_FORECAST_SNAPSHOT_SCHEMA_VERSION);
    expect(snapshot.grain).toBe("Wheat");
    expect(snapshot.records).toHaveLength(1);
    expect(snapshot.blocked_sources[0]?.reason).toBe(
      "available_after_source_cutoff",
    );
  });

  it("builds prompt, run, workflow, and review packages for a non-Canola grain with no price contract", () => {
    const workflow = runGrainForecastLocalWorkflow({
      grain: "Barley",
      source_rows: [sourceRow("Barley")],
      forecast: grainForecast("Barley"),
      crop_year: "2026-2027",
      grain_week: 1,
      as_of_date: "2026-08-07",
      source_cutoff_at: sourceCutoffAt,
      snapshot_mode: "strict_artifact_mode",
      horizon_days: 7,
      price_contract: null,
      model_training_cutoff: "2026-04-30",
      provider: "fixture",
      model: "fixture",
      runner_mode: "dry_run_model_output",
      prompt_version: "grain-forecast-prompt-v1",
      created_at: "2026-08-07T14:36:00-06:00",
    });

    expect(workflow.schema_version).toBe(GRAIN_FORECAST_LOCAL_WORKFLOW_SCHEMA_VERSION);
    expect(workflow.prompt_pack.schema_version).toBe(
      GRAIN_FORECAST_PROMPT_PACK_SCHEMA_VERSION,
    );
    expect(workflow.run_artifact.schema_version).toBe(
      GRAIN_FORECAST_RUN_ARTIFACT_SCHEMA_VERSION,
    );
    expect(workflow.prompt_pack.user_prompt).toContain(
      "No validated price contract is supplied",
    );

    const promptPack = buildGrainForecastPromptPack({
      snapshot: workflow.snapshot,
      horizon_days: 7,
      price_contract: null,
      model_training_cutoff: "2026-04-30",
      created_at: "2026-08-07T14:36:00-06:00",
    });
    const runArtifact = buildGrainForecastRunArtifact({
      snapshot: workflow.snapshot,
      forecast: grainForecast("Barley"),
      metadata: {
        provider: "fixture",
        model: "fixture",
        runner_mode: "dry_run_model_output",
        prompt_version: promptPack.prompt_version,
        prompt_hash: promptPack.prompt_hash,
        model_training_cutoff: "2026-04-30",
        created_at: "2026-08-07T14:36:00-06:00",
      },
    });
    const review = buildGrainThesisReviewPackage({
      run_artifact: runArtifact,
      review_as_of_date: "2026-08-14",
      review_cutoff_at: reviewCutoffAt,
      reviewer: "codex",
      thesis_verdict: "held",
      verdict_notes: "Next-week evidence did not contradict the neutral thesis.",
      next_week_evidence: [
        {
          evidence_key: "cgc-week-2-barley",
          source_key: "cgc_weekly",
          evidence_type: "official_data",
          observed_period: "2026-2027 week 2 ending 2026-08-09",
          published_at: "2026-08-13T13:00:00-06:00",
          available_at: "2026-08-13T13:05:00-06:00",
          summary: "Barley CGC flow remained mixed in the next weekly release.",
          directional_effect: "neutral",
          materiality: "medium",
          payload: {
            grain: "Barley",
            unit: "Ktonnes",
          },
        },
      ],
      driver_reviews: [
        {
          driver_index: 0,
          verdict: "supported",
          evidence_keys: ["cgc-week-2-barley"],
          notes: "The one supplied driver stayed consistent with next-week CGC flow.",
        },
      ],
      missed_signals: [],
      adjustments_for_next_week: [],
      created_at: "2026-08-14T15:00:00-06:00",
    });

    expect(review.schema_version).toBe(GRAIN_THESIS_REVIEW_PACKAGE_SCHEMA_VERSION);
    expect(review.grain).toBe("Barley");
    expect(review.learning_candidate.allowed).toBe(false);
    expect(review.learning_candidate.mode).toBe("review_only_fixture");
  });
});
