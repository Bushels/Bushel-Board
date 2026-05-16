import { describe, expect, it } from "vitest";

import {
  buildRoundtableRolePromptPack,
  ROUNDTABLE_DEFAULT_ROLES,
} from "../thesis/roundtable/build-role-prompt-pack";

describe("roundtable role prompt pack", () => {
  const baseInput = {
    artifact_hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    source_cutoff_at: "2026-05-15T18:00:00Z",
    region: "CA" as const,
    market_key: "canola",
    crop_year: "2025-2026",
    grain_week: 38,
    evidence_summary: [
      "CGC deliveries week-over-week improved.",
      "Carryout remains elevated versus prior season.",
    ],
  };

  it("builds one prompt per default role with shared artifact_hash and cutoff", () => {
    const pack = buildRoundtableRolePromptPack(baseInput);

    expect(pack.roles.map((r) => r.role)).toEqual(ROUNDTABLE_DEFAULT_ROLES);

    for (const rolePack of pack.roles) {
      expect(rolePack.artifact_hash).toBe(baseInput.artifact_hash);
      expect(rolePack.source_cutoff_at).toBe(baseInput.source_cutoff_at);
      expect(rolePack.prompt_text).toContain(baseInput.artifact_hash);
      expect(rolePack.prompt_text).toContain(baseInput.source_cutoff_at);
    }
  });

  it("produces deterministic pack_hash for identical input", () => {
    const first = buildRoundtableRolePromptPack(baseInput);
    const second = buildRoundtableRolePromptPack(baseInput);

    expect(first.pack_hash).toBe(second.pack_hash);
    expect(first.pack_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("includes viking context and loads L0/L1 topics", () => {
    const pack = buildRoundtableRolePromptPack(baseInput);

    expect(pack.viking.loadedTopics.length).toBeGreaterThan(0);
    expect(pack.viking.contextText).toContain("Grain Analyst Knowledge Card");
  });
});
