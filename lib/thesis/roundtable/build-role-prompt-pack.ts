import { createHash } from "node:crypto";

import { stableStringify } from "../../forecast-experiments/snapshot";
import { buildVikingPipelineContext } from "../../knowledge/viking-retrieval";

import type { RoundtableRole } from "./types";

export const ROUNDTABLE_DEFAULT_ROLES: RoundtableRole[] = ["bull", "bear", "risk", "moderator"];

export interface RoundtablePromptPackInput {
  artifact_hash: string;
  source_cutoff_at: string;
  region: "CA" | "US";
  market_key: string;
  crop_year: string;
  grain_week: number;
  evidence_summary: string[];
}

export interface RoundtableRolePrompt {
  role: RoundtableRole;
  artifact_hash: string;
  source_cutoff_at: string;
  prompt_text: string;
}

export interface RoundtableRolePromptPack {
  schema_version: "roundtable-role-prompt-pack-v1";
  artifact_hash: string;
  source_cutoff_at: string;
  pack_hash: string;
  viking: ReturnType<typeof buildVikingPipelineContext>;
  roles: RoundtableRolePrompt[];
}

export function buildRoundtableRolePromptPack(input: RoundtablePromptPackInput): RoundtableRolePromptPack {
  const viking = buildVikingPipelineContext(input.market_key);
  const roles = ROUNDTABLE_DEFAULT_ROLES.map((role) => ({
    role,
    artifact_hash: input.artifact_hash,
    source_cutoff_at: input.source_cutoff_at,
    prompt_text: buildRolePromptText({ ...input, role, viking_context: viking.contextText }),
  }));

  const packWithoutHash = {
    schema_version: "roundtable-role-prompt-pack-v1" as const,
    artifact_hash: input.artifact_hash,
    source_cutoff_at: input.source_cutoff_at,
    viking,
    roles,
  };

  return {
    ...packWithoutHash,
    pack_hash: `sha256:${sha256(stableStringify(packWithoutHash))}`,
  };
}

function buildRolePromptText(input: RoundtablePromptPackInput & { role: RoundtableRole; viking_context: string }): string {
  return [
    "You are a structured market thesis roundtable role.",
    `Role: ${input.role}`,
    `Region: ${input.region}`,
    `Market: ${input.market_key}`,
    `Crop year: ${input.crop_year}`,
    `Grain week: ${input.grain_week}`,
    `Artifact hash: ${input.artifact_hash}`,
    `Source cutoff: ${input.source_cutoff_at}`,
    "Evidence summary:",
    ...input.evidence_summary.map((line) => `- ${line}`),
    "",
    "Viking context:",
    input.viking_context,
    "",
    "Output strictly as JSON matching roundtable-role-output-v1.",
  ].join("\n");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
