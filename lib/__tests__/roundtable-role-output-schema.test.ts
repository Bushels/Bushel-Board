import { describe, expect, it } from "vitest";

import {
  parseAndNormalizeRoundtableRoleOutput,
  parseRoundtableRoleOutput,
} from "../thesis/roundtable/types";

describe("roundtable role output schema", () => {
  const validPayload = {
    role: "bull",
    signals: [" Export pace improved week-over-week "],
    bull_claims: ["Demand trend supports upside bias"],
    bear_claims: ["Carryout remains historically heavy"],
    confidence: "medium",
    evidence_refs: ["cgc_weekly:2026w38", " wasde:2026-05 "],
    risk_flags: ["volatility_high", " weather_uncertainty "],
  };

  it("parses valid role output", () => {
    const parsed = parseRoundtableRoleOutput(validPayload);
    expect(parsed.role).toBe("bull");
    expect(parsed.confidence).toBe("medium");
  });

  it("rejects malformed output missing required fields", () => {
    const malformed = {
      ...validPayload,
      evidence_refs: undefined,
    };

    expect(() => parseRoundtableRoleOutput(malformed)).toThrow();
  });

  it("normalizes array values deterministically", () => {
    const normalized = parseAndNormalizeRoundtableRoleOutput({
      ...validPayload,
      evidence_refs: ["wasde:2026-05", "cgc_weekly:2026w38", "wasde:2026-05"],
      risk_flags: ["weather_uncertainty", "volatility_high", "volatility_high"],
      bull_claims: ["B", "A", "B"],
      bear_claims: ["Z", "Y", "Y"],
    });

    expect(normalized.evidence_refs).toEqual(["cgc_weekly:2026w38", "wasde:2026-05"]);
    expect(normalized.risk_flags).toEqual(["volatility_high", "weather_uncertainty"]);
    expect(normalized.bull_claims).toEqual(["A", "B"]);
    expect(normalized.bear_claims).toEqual(["Y", "Z"]);
  });
});
