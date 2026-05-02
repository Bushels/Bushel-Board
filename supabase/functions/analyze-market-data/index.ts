/**
 * Tombstone: retired Grok/xAI round-1 market analysis.
 *
 * Kept only to return a deterministic 410 to any stale scheduler, pg_net
 * request, or manual caller.
 */

import { requireInternalRequest } from "../_shared/internal-auth.ts";
import { requireV1Enabled } from "../_shared/v1-gate.ts";

Deno.serve((req) => {
  const authError = requireInternalRequest(req);
  if (authError) return authError;
  return requireV1Enabled("analyze-market-data");
});
