import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Push Notification Dispatch Edge Function
 *
 * Sends APNs push notifications to iOS devices via HTTP/2 Provider API.
 * Every notification is a conversation starter — carries a deep_link_prompt
 * that opens Bushels chat with a pre-filled message.
 *
 * Auth: Internal-only (x-bushel-internal-secret header).
 * Called by: analyze-grain-market, chat-completion, scan-signals Edge Functions.
 *
 * Request body:
 * {
 *   "user_ids": ["uuid1", "uuid2"],   // Target users (or "all" for broadcast)
 *   "title": "Canola basis is tightening",
 *   "body": "Looks like a haul week. Want a quick read?",
 *   "deep_link_prompt": "Give me a canola update",
 *   "notification_type": "grain_intelligence",  // for analytics
 *   "badge_count": 1  // optional
 * }
 */

// APNs configuration
const APNS_HOST = Deno.env.get("APNS_USE_SANDBOX") === "true"
  ? "api.sandbox.push.apple.com"
  : "api.push.apple.com";
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") ?? "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") ?? "";
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") ?? "com.bushels.bushelboard";
const APNS_PRIVATE_KEY = Deno.env.get("APNS_PRIVATE_KEY") ?? "";

const INTERNAL_SECRET = Deno.env.get("BUSHEL_INTERNAL_FUNCTION_SECRET") ?? "";

interface PushRequest {
  user_ids: string[] | "all";
  title: string;
  body: string;
  deep_link_prompt: string;
  notification_type: string;
  badge_count?: number;
}

interface DeviceToken {
  device_token: string;
  user_id: string;
}

Deno.serve(async (req: Request) => {
  // Auth: internal-only
  const secret = req.headers.get("x-bushel-internal-secret");
  if (secret !== INTERNAL_SECRET || !INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const payload: PushRequest = await req.json();
    const { user_ids, title, body, deep_link_prompt, notification_type, badge_count } = payload;

    if (!title || !body || !deep_link_prompt) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: title, body, deep_link_prompt" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Supabase client with service role for reading all push tokens
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch device tokens
    let tokens: DeviceToken[];
    if (user_ids === "all") {
      const { data, error } = await supabase
        .from("push_tokens")
        .select("device_token, user_id")
        .eq("platform", "ios");

      if (error) throw new Error(`Failed to fetch tokens: ${error.message}`);
      tokens = data ?? [];
    } else {
      const { data, error } = await supabase
        .from("push_tokens")
        .select("device_token, user_id")
        .in("user_id", user_ids)
        .eq("platform", "ios");

      if (error) throw new Error(`Failed to fetch tokens: ${error.message}`);
      tokens = data ?? [];
    }

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: "No device tokens found" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Build APNs JWT
    const apnsJwt = await generateApnsJwt();

    // Build APNs payload
    const apnsPayload = JSON.stringify({
      aps: {
        alert: { title, body },
        sound: "default",
        badge: badge_count ?? 1,
        "mutable-content": 1,
      },
      deep_link_prompt,
      notification_type: notification_type ?? "general",
    });

    // Send to each device
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const token of tokens) {
      try {
        const response = await fetch(
          `https://${APNS_HOST}/3/device/${token.device_token}`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apnsJwt}`,
              "apns-topic": APNS_BUNDLE_ID,
              "apns-push-type": "alert",
              "apns-priority": "10",
              "apns-expiration": "0",
              "Content-Type": "application/json",
            },
            body: apnsPayload,
          }
        );

        if (response.ok) {
          sent++;
        } else {
          failed++;
          const errorBody = await response.text();
          errors.push(`Token ${token.device_token.substring(0, 8)}...: ${response.status} ${errorBody}`);

          // If token is invalid, remove it
          if (response.status === 410 || response.status === 400) {
            await supabase
              .from("push_tokens")
              .delete()
              .eq("device_token", token.device_token)
              .eq("user_id", token.user_id);
          }
        }
      } catch (e) {
        failed++;
        errors.push(`Token ${token.device_token.substring(0, 8)}...: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({ sent, failed, total: tokens.length, errors: errors.slice(0, 5) }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

/**
 * Generate a JWT for APNs Provider Authentication.
 * Uses ES256 (P-256 / prime256v1) as required by Apple.
 */
async function generateApnsJwt(): Promise<string> {
  const header = btoa(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const now = Math.floor(Date.now() / 1000);
  const claims = btoa(JSON.stringify({ iss: APNS_TEAM_ID, iat: now }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const signingInput = `${header}.${claims}`;

  // Import the P-256 private key
  const keyData = pemToArrayBuffer(APNS_PRIVATE_KEY);
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  // Sign
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(signingInput)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${signingInput}.${signatureB64}`;
}

/** Convert PEM-encoded key to ArrayBuffer */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const lines = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binaryString = atob(lines);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
