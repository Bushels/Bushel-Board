/**
 * Tombstone: retired Grok/xAI grain_intelligence writer.
 *
 * `grain_intelligence` remains readable as legacy/display history, but this
 * function must not create new Grok-backed records.
 */

import { requireInternalRequest } from "../_shared/internal-auth.ts";
import { requireV1Enabled } from "../_shared/v1-gate.ts";

Deno.serve((req) => {
  const authError = requireInternalRequest(req);
  if (authError) return authError;
  return requireV1Enabled("generate-intelligence");
});
