import { describe, expect, it } from "vitest";
import {
  assertTrack54WriteApproval,
  getTrack54WriteApproval,
  hasTrack54WriteApproval,
  TRACK54_WRITE_APPROVAL_PHRASE,
} from "@/lib/x-api/track54-write-approval";

function testEnv(values: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values };
}

describe("Track 54 write approval", () => {
  it("accepts the exact approval phrase from a CLI flag", () => {
    const args = ["--write", "--approval-phrase", TRACK54_WRITE_APPROVAL_PHRASE];

    expect(getTrack54WriteApproval(args, testEnv())).toBe(TRACK54_WRITE_APPROVAL_PHRASE);
    expect(hasTrack54WriteApproval(args, testEnv())).toBe(true);
    expect(() => assertTrack54WriteApproval(args, testEnv(), "test write mode")).not.toThrow();
  });

  it("accepts the exact approval phrase from the environment", () => {
    expect(hasTrack54WriteApproval(["--write"], testEnv({
      TRACK54_WRITE_APPROVAL: TRACK54_WRITE_APPROVAL_PHRASE,
    }))).toBe(true);
  });

  it("accepts npm-forwarded approval flags on Windows runners", () => {
    expect(hasTrack54WriteApproval(["--write"], testEnv({
      npm_config_approval_phrase: TRACK54_WRITE_APPROVAL_PHRASE,
    }))).toBe(true);
  });

  it("rejects missing or drifted approval phrases", () => {
    expect(() => assertTrack54WriteApproval(["--write"], testEnv(), "test write mode")).toThrow(
      /disabled until the Grok X scout artifact-week review/,
    );
    expect(() => assertTrack54WriteApproval([
      "--write",
      "--approval-phrase",
      "approved",
    ], testEnv(), "test write mode")).toThrow(/set TRACK54_WRITE_APPROVAL/);
  });
});
