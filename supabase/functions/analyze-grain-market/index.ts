/**
 * Tombstone: retired Grok/xAI thesis writer.
 *
 * Canadian market analysis is now produced by Claude/Codex desk workflows.
 * This function remains only so deployed callers receive an explicit 410
 * instead of silently writing stale Grok output to market_analysis.
 */

import { requireInternalRequest } from "../_shared/internal-auth.ts";
import { requireV1Enabled } from "../_shared/v1-gate.ts";

Deno.serve((req) => {
  const authError = requireInternalRequest(req);
  if (authError) return authError;
  return requireV1Enabled("analyze-grain-market");
});
