const INTERNAL_SECRET_HEADER = "x-bushel-internal-secret";

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function getInternalFunctionSecret(): string {
  const secret = Deno.env.get("BUSHEL_INTERNAL_FUNCTION_SECRET");
  if (!secret) {
    throw new Error("BUSHEL_INTERNAL_FUNCTION_SECRET not configured");
  }
  return secret;
}

export function requireInternalRequest(req: Request): Response | null {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let expectedSecret: string;
  try {
    expectedSecret = getInternalFunctionSecret();
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }

  const providedSecret = req.headers.get(INTERNAL_SECRET_HEADER);
  if (!providedSecret || providedSecret !== expectedSecret) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  return null;
}

export function buildInternalHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    [INTERNAL_SECRET_HEADER]: getInternalFunctionSecret(),
  };
}

