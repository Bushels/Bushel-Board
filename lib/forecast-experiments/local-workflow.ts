import { createHash } from "node:crypto";

import {
  type PriceContract,
} from "./schema";
import {
  buildCanolaForecastSnapshot,
  stableStringify,
  type CanolaForecastSnapshot,
  type SnapshotMode,
  type SnapshotSourceRecord,
} from "./snapshot";
import {
  buildSnapshotSourceRecords,
  type ApprovedForecastSourceRow,
} from "./source-records";
import {
  buildCanolaForecastPromptPack,
  type CanolaForecastPromptPack,
} from "./prompt-pack";
import {
  buildCanolaForecastRunArtifact,
  type CanolaForecastRunArtifact,
  type ForecastRunnerMode,
} from "./run-artifact";

export const CANOLA_FORECAST_LOCAL_WORKFLOW_SCHEMA_VERSION =
  "canola-forecast-local-workflow-v1" as const;

export interface CanolaForecastLocalWorkflowInput {
  source_rows: ApprovedForecastSourceRow[];
  forecast: unknown;
  crop_year: string;
  grain_week: number;
  as_of_date: string;
  source_cutoff_at: string;
  snapshot_mode: SnapshotMode;
  horizon_days: 7 | 28;
  price_contract: PriceContract;
  model_training_cutoff: string;
  provider: string;
  model: string;
  runner_mode: ForecastRunnerMode;
  prompt_version: string;
  created_at: string;
}

export interface CanolaForecastLocalWorkflow {
  schema_version: typeof CANOLA_FORECAST_LOCAL_WORKFLOW_SCHEMA_VERSION;
  grain: "Canola";
  crop_year: string;
  grain_week: number;
  as_of_date: string;
  source_cutoff_at: string;
  source_records: {
    records: SnapshotSourceRecord[];
  };
  snapshot: CanolaForecastSnapshot;
  prompt_pack: CanolaForecastPromptPack;
  run_artifact: CanolaForecastRunArtifact;
  workflow_hash: string;
}

export function runCanolaForecastLocalWorkflow(
  input: CanolaForecastLocalWorkflowInput,
): CanolaForecastLocalWorkflow {
  const sourceRecords = buildSnapshotSourceRecords(input.source_rows, {
    as_of_date: input.as_of_date,
    source_cutoff_at: input.source_cutoff_at,
    snapshot_mode: input.snapshot_mode,
  });
  const snapshot = buildCanolaForecastSnapshot({
    grain: "Canola",
    crop_year: input.crop_year,
    grain_week: input.grain_week,
    as_of_date: input.as_of_date,
    source_cutoff_at: input.source_cutoff_at,
    snapshot_mode: input.snapshot_mode,
    records: sourceRecords,
  });
  const promptPack = buildCanolaForecastPromptPack({
    snapshot,
    horizon_days: input.horizon_days,
    price_contract: input.price_contract,
    model_training_cutoff: input.model_training_cutoff,
    created_at: input.created_at,
    prompt_version: input.prompt_version,
  });
  const runArtifact = buildCanolaForecastRunArtifact({
    snapshot,
    forecast: input.forecast,
    metadata: {
      provider: input.provider,
      model: input.model,
      runner_mode: input.runner_mode,
      prompt_version: input.prompt_version,
      prompt_hash: promptPack.prompt_hash,
      model_training_cutoff: input.model_training_cutoff,
      created_at: input.created_at,
    },
  });
  const workflowWithoutHash = {
    schema_version: CANOLA_FORECAST_LOCAL_WORKFLOW_SCHEMA_VERSION,
    grain: "Canola",
    crop_year: input.crop_year,
    grain_week: input.grain_week,
    as_of_date: input.as_of_date,
    source_cutoff_at: input.source_cutoff_at,
    source_records: {
      records: sourceRecords,
    },
    snapshot,
    prompt_pack: promptPack,
    run_artifact: runArtifact,
  } satisfies Omit<CanolaForecastLocalWorkflow, "workflow_hash">;

  return {
    ...workflowWithoutHash,
    workflow_hash: `sha256:${sha256(stableStringify(workflowWithoutHash))}`,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
