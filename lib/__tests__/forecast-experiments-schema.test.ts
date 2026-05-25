import { describe, expect, it } from "vitest";

import {
  CANOLA_FORECAST_SCHEMA_VERSION,
  canolaForecastSchema,
} from "../forecast-experiments/schema";

const validForecast = () => ({
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
    low: 1.25,
    high: 4.5,
  },
  recommendation: "SCALE_IN",
  top_drivers: [
    {
      driver: "Export demand improved versus the prior weekly snapshot.",
      directional_effect: "bullish",
      evidence_source: "local-weekly-snapshot",
      evidence_clock: "2026-08-07T14:30:00-06:00",
      confidence: "medium",
    },
  ],
  invalidating_triggers: ["Next settlement closes below the prior weekly low."],
  known_blind_spots: ["No live intraday order-flow data in this experiment."],
  source_warnings: [
    {
      source: "llm",
      warning: "Do not trust commodity history from model memory.",
    },
  ],
});

describe("canola forecast experiment schema", () => {
  it("accepts the v1 Canola forecast contract", () => {
    expect(canolaForecastSchema.safeParse(validForecast()).success).toBe(true);
  });

  it("rejects malformed forecast JSON before scoring", () => {
    const parsed = canolaForecastSchema.safeParse({
      ...validForecast(),
      grain: "Wheat",
      confidence_pct: 114,
      known_blind_spots: [],
    });

    expect(parsed.success).toBe(false);
  });

  it("requires pretraining taint to be explicit when the forecast date predates model training cutoff", () => {
    const parsed = canolaForecastSchema.safeParse({
      ...validForecast(),
      as_of_date: "2025-03-14",
      source_cutoff_at: "2025-03-14T14:30:00-06:00",
      model_training_cutoff: "2026-04-30",
      pretraining_taint_status: "untainted",
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts an explicitly tainted historical forecast for backtest logging", () => {
    const parsed = canolaForecastSchema.safeParse({
      ...validForecast(),
      as_of_date: "2025-03-14",
      source_cutoff_at: "2025-03-14T14:30:00-06:00",
      model_training_cutoff: "2026-04-30",
      pretraining_taint_status: "tainted",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects 28-day forecasts without a declared contract and roll policy", () => {
    const parsed = canolaForecastSchema.safeParse({
      ...validForecast(),
      price_contract: {
        exchange: "ICE",
        commodity: "Canola",
        contract_month: "2026-11",
      },
    });

    expect(parsed.success).toBe(false);
  });
});
