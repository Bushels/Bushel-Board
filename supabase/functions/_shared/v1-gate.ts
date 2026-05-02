/**
 * Retired Grok/xAI analysis gate.
 *
 * This used to allow emergency re-enabling with ALLOW_V1_GROK=1. That escape
 * hatch is intentionally gone. Market thesis writing now belongs to
 * Claude/Codex workflows. X/Twitter source gathering will be rebuilt as a
 * direct X API v2 data lane, not as Grok reasoning.
 */

export function requireV1Enabled(functionName: string): Response {
  console.warn(
    `[v1-gate] ${functionName} invocation blocked: Grok/xAI analysis workflow is deprecated.`,
  );

  return new Response(
    JSON.stringify({
      error: "grok_workflow_deprecated",
      function: functionName,
      detail:
        "This function is part of the retired Grok/xAI analysis workflow. " +
        "It cannot be re-enabled with ALLOW_V1_GROK. Use Claude/Codex for " +
        "analysis and the future direct X API v2 lane for X signal collection.",
      pipeline_version_in_use: "codex-cgc-plus-claude-codex-analysis",
    }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  );
}
