import { describe, expect, it } from "vitest";

import {
  evaluateRoundtableThesis,
  freezeRoundtableThesis,
  type JudgeGateInput,
} from "../thesis/roundtable/judge-gate";

function buildInput(overrides: Partial<JudgeGateInput> = {}): JudgeGateInput {
  return {
    thesis_draft: {
      region: "CA",
      market_key: "canola",
      crop_year: "2026/2027",
      grain_week: 20,
      source_cutoff_at: "2026-05-15T18:00:00.000Z",
      artifact_hash: "artifact-draft",
      bull_points: ["Crush margins improved"],
      bear_points: ["Export pace remains uneven"],
      confidence: "medium",
      stance_score: 10,
      dissent_notes: ["Risk flag: rail congestion"],
      model_metadata: {
        generator_model: "gpt-5.3-codex",
        judge_model: "gpt-5.3-codex",
        generated_at: "2026-05-15T18:30:00.000Z",
      },
    },
    evidence_refs: ["statscan:2026-05", "usda:wasde-2026-05"],
    review_now_iso: "2026-05-15T18:35:00.000Z",
    immutable_now_iso: "2026-05-15T18:36:00.000Z",
    ...overrides,
  };
}

describe("evaluateRoundtableThesis", () => {
  it("rejects when evidence refs are missing", () => {
    const verdict = evaluateRoundtableThesis(buildInput({ evidence_refs: [] }));

    expect(verdict.status).toBe("reject");
    expect(verdict.reasons.some((reason) => reason.includes("evidence refs"))).toBe(true);
  });

  it("rejects overclaim language", () => {
    const verdict = evaluateRoundtableThesis(
      buildInput({
        thesis_draft: {
          ...buildInput().thesis_draft,
          bull_points: ["Guaranteed rally in canola prices"],
        },
      }),
    );

    expect(verdict.status).toBe("reject");
    expect(verdict.reasons.some((reason) => reason.toLowerCase().includes("overclaim"))).toBe(true);
  });

  it("rejects when generated timestamp is before source cutoff", () => {
    const verdict = evaluateRoundtableThesis(
      buildInput({
        thesis_draft: {
          ...buildInput().thesis_draft,
          model_metadata: {
            ...buildInput().thesis_draft.model_metadata,
            generated_at: "2026-05-15T17:00:00.000Z",
          },
        },
      }),
    );

    expect(verdict.status).toBe("reject");
    expect(verdict.reasons.some((reason) => reason.includes("source cutoff"))).toBe(true);
  });

  it("accepts valid draft and freezes immutable hash/timestamp", () => {
    const verdict = evaluateRoundtableThesis(buildInput());
    expect(verdict.status).toBe("accept");

    const frozen = freezeRoundtableThesis(buildInput(), verdict);

    expect(frozen.should_publish).toBe(true);
    expect(frozen.immutable_generated_at).toBe("2026-05-15T18:36:00.000Z");
    expect(frozen.final_artifact_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("never produces publishable artifact for reject verdicts", () => {
    const rejected = evaluateRoundtableThesis(buildInput({ evidence_refs: [] }));
    const frozen = freezeRoundtableThesis(buildInput({ evidence_refs: [] }), rejected);

    expect(rejected.status).toBe("reject");
    expect(frozen.should_publish).toBe(false);
    expect(frozen.final_artifact_hash).toBeNull();
    expect(frozen.immutable_generated_at).toBeNull();
  });
});
