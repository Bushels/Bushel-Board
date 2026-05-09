/**
 * Tombstone: retired Grok `x_search` signal scanner.
 *
 * Future X analysis should use the direct X API v2 client/gateway, then store
 * vetted signals into `x_market_signals`. This Grok-backed scanner must not be
 * used as the replacement.
 */

import { requireInternalRequest } from "../_shared/internal-auth.ts";
import { requireV1Enabled } from "../_shared/v1-gate.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const authError = requireInternalRequest(req);
  if (authError) return authError;

  const response = requireV1Enabled("search-x-intelligence");
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
});
