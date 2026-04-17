// WS6 Task 6.5 — Bushy chat harness
// POST /api/bushy/chat — Server-Sent Events stream endpoint.
//
// Request body:
//   { threadId?: string, message: string, grain?: string, grainWeek?: number }
//
// Response: SSE stream of JSON events. Shape (discriminated by `type`):
//   - { type: 'delta', text: string }     streaming token chunk
//   - { type: 'tool_call', tool: string } UI indicator ("Bushy is looking up…")
//   - { type: 'done', turnId: string }    terminal success
//   - { type: 'error', error: string }    terminal failure
//
// Auth: cookie-scoped Supabase client validates identity via
// getAuthenticatedUserContext. Observers (read-only accounts) are rejected.
// After auth, runChatTurn uses a service-role admin client internally —
// the cookie client never leaves this file.
//
// Runtime: Node.js (harness imports node:crypto). maxDuration=300s for
// multi-round tool conversations.

import { getAuthenticatedUserContext } from "@/lib/auth/role-guard";
import { runChatTurn } from "@/lib/bushy/harness";
import { sseFormat, type SseEvent } from "@/lib/bushy/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface RequestBody {
  threadId?: string;
  message?: string;
  grain?: string;
  grainWeek?: number;
}

const MAX_MESSAGE_LENGTH = 2000;

export async function POST(request: Request): Promise<Response> {
  const { user, role } = await getAuthenticatedUserContext();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (role === "observer") {
    return Response.json(
      {
        error: "Chat is for farmers. Sign up to access Bushy.",
      },
      { status: 403 },
    );
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message : "";
  if (message.length === 0) {
    return Response.json(
      { error: "Message is required" },
      { status: 400 },
    );
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return Response.json(
      { error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` },
      { status: 400 },
    );
  }

  const grainContext =
    typeof body.grain === "string" && typeof body.grainWeek === "number"
      ? { grain: body.grain, grainWeek: body.grainWeek }
      : undefined;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const writeSse = (event: SseEvent) => {
        try {
          controller.enqueue(encoder.encode(sseFormat(event)));
        } catch {
          // Controller may be closed if the client disconnected mid-stream.
          // Swallow silently — harness will still complete + audit.
        }
      };

      try {
        await runChatTurn(
          {
            threadId: body.threadId,
            message,
            grainContext,
          },
          { id: user.id },
          writeSse,
        );
      } catch (e) {
        // The harness already catches its own errors and writes an SSE
        // 'error' event internally. This catch handles anything that
        // escapes — fallback safety net.
        const msg = e instanceof Error ? e.message : String(e);
        writeSse({ type: "error", error: `Harness failure: ${msg}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      // Required for some edge proxies / Nginx to not buffer the stream
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
