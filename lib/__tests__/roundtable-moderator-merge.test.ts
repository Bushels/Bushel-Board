import { describe, expect, it } from "vitest";

import {
  mergeRoundtableOutputsToThesisDraft,
  type ModeratorMergeInput,
} from "../thesis/roundtable/moderator-merge";

function buildInput(overrides: Partial<ModeratorMergeInput> = {}): ModeratorMergeInput {
  return {
    region: "CA",
    market_key: "canola",
    crop_year: "2026/2027",
    grain_week: 20,
    source_cutoff_at: "2026-05-15T18:00:00.000Z",
    artifact_hash: "artifact-abc",
    generated_at: "2026-05-15T18:30:00.000Z",
    generator_model: "gpt-5.3-codex",
    judge_model: "gpt-5.3-codex",
    role_outputs: [
      {
        role: "bull",
        signals: ["Exports improving"],
        bull_claims: ["Canola crush demand is rising", "Canola crush demand is rising"],
        bear_claims: ["Basis remains weak"],
        confidence: "high",
        evidence_refs: ["statscan:2026-05", "statscan:2026-05"],
        risk_flags: ["Policy surprise"],
      },
      {
        role: "bear",
        signals: ["Large South American supplies"],
        bull_claims: ["Canola crush demand is rising"],
        bear_claims: ["Canola exports could slow"],
        confidence: "medium",
        evidence_refs: ["usda:wasde-2026-05"],
        risk_flags: ["FX volatility"],
      },
      {
        role: "risk",
        signals: ["Volatility elevated"],
        bull_claims: ["Canola crush demand is rising"],
        bear_claims: ["Canola exports could slow"],
        confidence: "low",
        evidence_refs: ["ice:futures-curve"],
        risk_flags: ["Weather regime shift"],
      },
    ],
    ...overrides,
  };
}

describe("mergeRoundtableOutputsToThesisDraft", () => {
  it("dedupes repeated claims and keeps deterministic ordering", () => {
    const merged = mergeRoundtableOutputsToThesisDraft(buildInput());

    expect(merged.bull_points).toEqual(["Canola crush demand is rising"]);
    expect(merged.bear_points).toEqual(["Basis remains weak", "Canola exports could slow"]);
  });

  it("requires evidence refs and drops claims from outputs missing evidence", () => {
    const merged = mergeRoundtableOutputsToThesisDraft(
      buildInput({
        role_outputs: [
          ...buildInput().role_outputs,
          {
            role: "moderator",
            signals: ["No references"],
            bull_claims: ["This should be dropped"],
            bear_claims: ["This should also be dropped"],
            confidence: "high",
            evidence_refs: [],
            risk_flags: [],
          } as never,
        ],
      }),
    );

    expect(merged.bull_points).not.toContain("This should be dropped");
    expect(merged.bear_points).not.toContain("This should also be dropped");
  });

  it("preserves minority/conflict view in dissent notes", () => {
    const merged = mergeRoundtableOutputsToThesisDraft(buildInput());

    expect(merged.dissent_notes.some((note) => note.includes("Canola crush demand is rising"))).toBe(true);
    expect(merged.dissent_notes.some((note) => note.includes("Risk flag: FX volatility"))).toBe(true);
    expect(merged.dissent_notes.some((note) => note.includes("Risk flag: Policy surprise"))).toBe(true);
  });
});
