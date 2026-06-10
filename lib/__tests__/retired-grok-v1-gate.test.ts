import { afterEach, describe, expect, it, vi } from "vitest";
import { requireV1Enabled } from "@/supabase/functions/_shared/v1-gate";

describe("retired Grok/xAI v1 gate", () => {
  afterEach(() => {
    delete process.env.ALLOW_V1_GROK;
    vi.restoreAllMocks();
  });

  it("returns a deterministic 410 tombstone for stale Edge Function callers", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = requireV1Enabled("search-x-intelligence");
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(body).toMatchObject({
      error: "grok_workflow_deprecated",
      function: "search-x-intelligence",
      pipeline_version_in_use: "codex-cgc-plus-claude-codex-analysis",
    });
    expect(body.detail).toContain("cannot be re-enabled with ALLOW_V1_GROK");
  });

  it("does not honor the removed ALLOW_V1_GROK escape hatch", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env.ALLOW_V1_GROK = "1";

    const response = requireV1Enabled("generate-intelligence");
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body).toMatchObject({
      error: "grok_workflow_deprecated",
      function: "generate-intelligence",
    });
  });
});
