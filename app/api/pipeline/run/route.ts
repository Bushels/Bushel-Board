/**
 * POST /api/pipeline/run
 *
 * Tombstone route. The Grok/xAI thesis-writing pipeline has been retired.
 *
 * Current production shape:
 * - CGC source data: `npm run import-cgc` / Codex automation.
 * - Weekly thesis writing: Claude/Codex desk workflows.
 * - X data: future direct X API v2 lane, not Grok `x_search`.
 */

export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json(
    {
      error: "grok_workflow_deprecated",
      route: "/api/pipeline/run",
      detail:
        "The legacy Grok/xAI analysis orchestrator has been retired and cannot be re-enabled. " +
        "Use the Codex CGC importer for source-table refreshes and Claude/Codex workflows for thesis writing.",
      cgc_import_command: "npm run import-cgc",
      pipeline_version_in_use: "codex-cgc-plus-claude-codex-analysis",
    },
    { status: 410 },
  );
}

export async function GET() {
  return Response.json(
    {
      error: "grok_workflow_deprecated",
      route: "/api/pipeline/run",
      detail: "This route is intentionally unavailable.",
    },
    { status: 410 },
  );
}
