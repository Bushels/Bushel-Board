/**
 * V1 Grok pipeline kill switch — fail-closed.
 *
 * The legacy single-pass Grok / xAI chain (search-x-intelligence →
 * analyze-grain-market → generate-farm-summary, plus the older v1.5 pair
 * analyze-market-data + generate-intelligence) is retained only as a
 * recovery fallback per CLAUDE.md:
 *
 *   > V1 pipeline (legacy Grok) is retained only as a recovery fallback;
 *   > all new desk output is Claude-only.
 *
 * This guard is called at the top of every V1 Edge Function, after
 * `requireInternalRequest`. Unless the `ALLOW_V1_GROK` env var is set to
 * the string `"1"`, the function returns HTTP 410 Gone without touching
 * xAI. The guard also refuses any pg_net self-chain: if the whole V1 chain
 * ever gets kicked off, the FIRST blocked node stops the cascade because
 * the chain trigger is fire-and-forget (`enqueueInternalFunction` does not
 * await the chained EF's body — it just enqueues it — so the 410 from a
 * downstream call blocks the work without breaking the caller).
 *
 * To resurrect V1 during an incident (see `docs/lessons-learned/issues.md`
 * "V1 Grok kill switch — 2026-04-24"):
 *
 *   supabase secrets set ALLOW_V1_GROK=1
 *   # ...run V1 recovery EFs...
 *   supabase secrets unset ALLOW_V1_GROK
 *
 * Never set this flag through the dashboard without a written go-ahead
 * from the desk owner — accidental V1 writes to `market_analysis` are
 * expensive to clean up because they carry the `weekly_debate`
 * `scan_type` into `score_trajectory` and get mistaken for the Friday
 * anchor.
 */

export function requireV1Enabled(functionName: string): Response | null {
  const allow = Deno.env.get("ALLOW_V1_GROK");
  if (allow === "1") {
    console.warn(
      `[v1-gate] ALLOW_V1_GROK=1 — running ${functionName} in RECOVERY MODE. ` +
        `Grok-backed output will be written to production tables. ` +
        `Confirm this was intentional (see lessons-learned/issues.md).`
    );
    return null;
  }

  console.warn(
    `[v1-gate] ${functionName} invocation BLOCKED — V1 Grok pipeline retired. ` +
      `V2 Claude Agent Desk is the production source. ` +
      `Set ALLOW_V1_GROK=1 for manual recovery only.`
  );

  return new Response(
    JSON.stringify({
      error: "v1_pipeline_retired",
      function: functionName,
      detail:
        "This Edge Function is part of the legacy V1 Grok chain, retained " +
        "only as a recovery fallback. Set ALLOW_V1_GROK=1 in Supabase " +
        "secrets to enable. Production analysis comes from the V2 Claude " +
        "Agent Desk swarm (grain-desk-weekly / us-desk-weekly routines).",
      pipeline_version_in_use: "v2-claude-agent-desk",
      unblock_instructions:
        "supabase secrets set ALLOW_V1_GROK=1   # run V1 recovery, then unset",
    }),
    { status: 410, headers: { "Content-Type": "application/json" } }
  );
}
