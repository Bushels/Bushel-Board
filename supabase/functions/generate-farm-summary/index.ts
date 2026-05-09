/**
 * Tombstone: retired Grok/xAI farm-summary writer.
 *
 * Farm summaries must be produced by the Claude/Codex desk workflow going
 * forward. This function remains so stale callers receive an explicit 410
 * instead of writing Grok-backed records to farm_summaries.
 */

import { requireInternalRequest } from "../_shared/internal-auth.ts";
import { requireV1Enabled } from "../_shared/v1-gate.ts";

Deno.serve((req) => {
  const authError = requireInternalRequest(req);
  if (authError) return authError;
  return requireV1Enabled("generate-farm-summary");
});
