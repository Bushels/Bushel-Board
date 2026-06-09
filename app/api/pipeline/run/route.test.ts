import { describe, expect, it } from "vitest";
import { GET, POST } from "./route";

describe("/api/pipeline/run tombstone", () => {
  it("keeps POST unavailable for the retired Grok thesis-writing pipeline", async () => {
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body).toMatchObject({
      error: "grok_workflow_deprecated",
      route: "/api/pipeline/run",
      pipeline_version_in_use: "codex-cgc-plus-claude-codex-analysis",
    });
    expect(body.detail).toContain("legacy Grok/xAI analysis orchestrator has been retired");
  });

  it("keeps GET unavailable so stale monitors cannot treat the route as healthy", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body).toMatchObject({
      error: "grok_workflow_deprecated",
      route: "/api/pipeline/run",
    });
  });
});
