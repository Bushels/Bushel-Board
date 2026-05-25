import { describe, expect, it } from "vitest";

import { isThesisArtifactV1, parseThesisArtifactV1 } from "@/lib/thesis/artifact-contract";

describe("thesis artifact contract v1", () => {
  const validArtifact = {
    region: "CA",
    market_key: "canola",
    crop_year: "2025-2026",
    grain_week: 38,
    source_cutoff_at: "2026-05-15T18:00:00Z",
    artifact_hash: "sha256:abc123",
    bull_points: ["Export pace is above seasonal average."],
    bear_points: ["Carryout remains heavy versus prior year."],
    confidence: "medium",
    stance_score: 12,
    dissent_notes: ["One role flagged logistics softness as unresolved."],
    model_metadata: {
      generator_model: "openai/gpt-5.3-codex",
      judge_model: "anthropic/claude-sonnet-4",
      generated_at: "2026-05-15T18:05:00Z",
    },
  };

  it("parses a valid artifact", () => {
    const parsed = parseThesisArtifactV1(validArtifact);
    expect(parsed.market_key).toBe("canola");
    expect(parsed.region).toBe("CA");
  });

  it("rejects payloads missing required fields", () => {
    const missingRequired = {
      ...validArtifact,
      artifact_hash: undefined,
    };

    expect(() => parseThesisArtifactV1(missingRequired)).toThrow();
    expect(isThesisArtifactV1(missingRequired)).toBe(false);
  });

  it("rejects artifacts when source cutoff is after generated_at", () => {
    const invalidOrder = {
      ...validArtifact,
      source_cutoff_at: "2026-05-15T18:10:00Z",
      model_metadata: {
        ...validArtifact.model_metadata,
        generated_at: "2026-05-15T18:05:00Z",
      },
    };

    expect(() => parseThesisArtifactV1(invalidOrder)).toThrow(
      /source_cutoff_at must be earlier than or equal to model_metadata\.generated_at/,
    );
  });
});
