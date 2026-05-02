// app/api/advisor/chat/route.ts

import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserContext } from "@/lib/auth/role-guard";

export const runtime = "nodejs";
export const maxDuration = 20;

const HERMES_URL = process.env.HERMES_URL;
const INTERNAL_SECRET = process.env.BUSHEL_INTERNAL_FUNCTION_SECRET;

export async function POST(request: Request) {
  const { user, role } = await getAuthenticatedUserContext();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (role === "observer") {
    return Response.json(
      { error: "Chat is available for farmers. Sign up to access the advisor." },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { message, threadId, grain } = body as {
    message: string;
    threadId?: string;
    grain?: string;
  };

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  if (message.length > 2000) {
    return Response.json(
      { error: "Message too long (max 2000 characters)" },
      { status: 400 }
    );
  }

  if (HERMES_URL) {
    const supabaseForProxy = await createClient();
    const { data: profile } = await supabaseForProxy
      .from("profiles")
      .select("postal_code, role")
      .eq("id", user.id)
      .maybeSingle();

    const hermesResponse = await fetch(`${HERMES_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bushel-internal-secret": INTERNAL_SECRET ?? "",
      },
      body: JSON.stringify({
        userId: user.id,
        threadId,
        message,
        grain,
        fsaCode: profile?.postal_code?.substring(0, 3) || "",
        role: profile?.role || role,
      }),
    });

    if (hermesResponse.ok) {
      return new Response(hermesResponse.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    console.error(
      `[Hermes proxy] Error ${hermesResponse.status}; Grok fallback is retired.`
    );
  }

  return Response.json(
    {
      error:
        "Advisor Claude path is not configured yet. Grok/xAI fallback has been retired.",
    },
    { status: 503 }
  );
}
