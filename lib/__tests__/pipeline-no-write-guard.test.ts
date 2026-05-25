import { describe, expect, it } from "vitest";

import {
  assertLocalWorkflowOutputFilename,
  assertNoForbiddenWriteIntents,
  NO_WRITE_GUARD,
} from "../forecast-experiments/no-write-guard";

describe("pipeline no-write guard", () => {
  it("blocks payloads containing production write intent tokens", () => {
    const payloadWithForbiddenIntent = {
      note: "insert into market_analysis values (...)",
    };

    expect(() => assertNoForbiddenWriteIntents(payloadWithForbiddenIntent)).toThrow(
      /No-write guard blocked forbidden write intent token/,
    );
  });

  it("allows clean payloads without write-intent markers", () => {
    const safePayload = {
      schema_version: "canola-forecast-local-workflow-v1",
      run_hash: "sha256:abc",
      notes: ["local only", "no sidecar write"],
    };

    expect(() => assertNoForbiddenWriteIntents(safePayload)).not.toThrow();
  });

  it("enforces output file allowlist", () => {
    expect(() => assertLocalWorkflowOutputFilename("workflow.json")).not.toThrow();
    expect(() => assertLocalWorkflowOutputFilename("market_analysis.sql")).toThrow(
      /outside allowlist/,
    );
    expect(NO_WRITE_GUARD.localOutputFileAllowlist).toContain("workflow.json");
  });
});
