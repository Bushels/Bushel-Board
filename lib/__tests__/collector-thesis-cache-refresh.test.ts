import { describe, expect, it } from "vitest";

import {
  buildRefreshCommand,
  parseWrapperArgs,
  shouldSkipRefresh,
} from "../../scripts/run-collector-with-thesis-cache-refresh";

describe("collector-triggered thesis cache refresh", () => {
  it("force-refreshes after successful collectors so stale cache watermarks cannot skip new source data", () => {
    expect(buildRefreshCommand()).toEqual({
      command: "npx",
      args: ["tsx", "scripts/refresh-thesis-packet-cache.ts", "--force"],
    });
  });

  it("still skips thesis cache refresh for dry-run collectors", () => {
    const parsed = parseWrapperArgs([
      "--name",
      "collect-export-sales",
      "python3",
      "scripts/import-usda-export-sales.py",
      "--dry-run",
    ]);

    expect(shouldSkipRefresh(parsed.options, parsed.collectorCommand)).toBe(true);
  });

  it("keeps wrapper options separate from the collector command", () => {
    const parsed = parseWrapperArgs([
      "--name",
      "collect-cgc",
      "node",
      "scripts/import-cgc-weekly-codex.mjs",
    ]);

    expect(parsed.options).toEqual({ name: "collect-cgc", skipRefresh: false, help: false });
    expect(parsed.collectorCommand).toEqual(["node", "scripts/import-cgc-weekly-codex.mjs"]);
    expect(shouldSkipRefresh(parsed.options, parsed.collectorCommand)).toBe(false);
  });
});
