/**
 * Hermes Chat Server — GCP VM Backend
 *
 * Persistent HTTP server that handles farmer conversations, replacing the
 * stateless chat-completion Edge Function. ALL persistent state lives in
 * Supabase — if Hermes crashes, it recovers by reading the database.
 *
 * Endpoints:
 *   POST /chat     — farmer message → SSE response stream
 *   GET  /health   — health check JSON
 *   POST /compress — manual compression trigger
 *
 * Auth: x-bushel-internal-secret header on POST endpoints
 * Port: HERMES_PORT env var or 3002
 */

import http from "node:http";
import { ConversationManager } from "./conversation-manager.js";
import { CompressionScheduler } from "./compression-scheduler.js";

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "BUSHEL_INTERNAL_FUNCTION_SECRET",
  "XAI_API_KEY",
] as const;

const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(
    `FATAL: Missing required environment variables: ${missing.join(", ")}`
  );
  process.exit(1);
}

const INTERNAL_SECRET = process.env.BUSHEL_INTERNAL_FUNCTION_SECRET!;
const PORT = parseInt(process.env.HERMES_PORT ?? "3002", 10);

// ---------------------------------------------------------------------------
// CORS headers
// ---------------------------------------------------------------------------

function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-bushel-internal-secret"
  );
}

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

function requireAuth(req: http.IncomingMessage): string | null {
  const provided = req.headers["x-bushel-internal-secret"];
  if (typeof provided !== "string" || provided !== INTERNAL_SECRET) {
    return "Unauthorized";
  }
  return null;
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

function jsonResponse(
  res: http.ServerResponse,
  body: Record<string, unknown>,
  status = 200
): void {
  setCorsHeaders(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// SSE writer
// ---------------------------------------------------------------------------

export interface SSEWriter {
  sendEvent(event: string, data: unknown): void;
  close(): void;
}

function createSSEWriter(res: http.ServerResponse): SSEWriter {
  setCorsHeaders(res);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  return {
    sendEvent(event: string, data: unknown): void {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close(): void {
      res.end();
    },
  };
}

// ---------------------------------------------------------------------------
// Chat message payload type
// ---------------------------------------------------------------------------

export interface ChatPayload {
  userId: string;
  threadId?: string;
  message: string;
  grain?: string;
  fsaCode: string;
  role: string;
}

function validateChatPayload(
  body: Record<string, unknown>
): ChatPayload | string {
  const { userId, message, fsaCode, role } = body;

  if (typeof userId !== "string" || userId.length === 0) {
    return "userId is required";
  }
  if (typeof message !== "string" || message.length === 0) {
    return "message is required";
  }
  if (typeof fsaCode !== "string" || fsaCode.length === 0) {
    return "fsaCode is required";
  }
  if (typeof role !== "string" || role.length === 0) {
    return "role is required";
  }

  return {
    userId,
    threadId:
      typeof body.threadId === "string" ? body.threadId : undefined,
    message,
    grain: typeof body.grain === "string" ? body.grain : undefined,
    fsaCode,
    role,
  };
}

// ---------------------------------------------------------------------------
// Boot services
// ---------------------------------------------------------------------------

const conversationManager = new ConversationManager();
const compressionScheduler = new CompressionScheduler();

// Start the compression cron jobs
compressionScheduler.start();

// ---------------------------------------------------------------------------
// Request router
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const method = req.method ?? "GET";

  // CORS preflight
  if (method === "OPTIONS") {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // ─── GET /health ─────────────────────────────────
  if (method === "GET" && url.pathname === "/health") {
    jsonResponse(res, {
      status: "ok",
      uptime: process.uptime(),
      activeConversations: conversationManager.activeCount,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // ─── POST /chat ──────────────────────────────────
  if (method === "POST" && url.pathname === "/chat") {
    const authErr = requireAuth(req);
    if (authErr) {
      jsonResponse(res, { error: authErr }, 401);
      return;
    }

    let body: Record<string, unknown>;
    try {
      const raw = await readBody(req);
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      jsonResponse(res, { error: "Invalid JSON body" }, 400);
      return;
    }

    const payloadOrError = validateChatPayload(body);
    if (typeof payloadOrError === "string") {
      jsonResponse(res, { error: payloadOrError }, 400);
      return;
    }

    const sse = createSSEWriter(res);

    try {
      await conversationManager.handleMessage(payloadOrError, sse);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error";
      sse.sendEvent("error", { error: message });
    } finally {
      sse.sendEvent("done", {});
      sse.close();
    }
    return;
  }

  // ─── POST /compress ──────────────────────────────
  if (method === "POST" && url.pathname === "/compress") {
    const authErr = requireAuth(req);
    if (authErr) {
      jsonResponse(res, { error: authErr }, 401);
      return;
    }

    try {
      await compressionScheduler.runDaily();
      jsonResponse(res, { status: "compression_complete" });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error";
      jsonResponse(res, { error: message }, 500);
    }
    return;
  }

  // ─── 404 ─────────────────────────────────────────
  jsonResponse(res, { error: "Not found" }, 404);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
  console.log(`[hermes] Server listening on port ${PORT}`);
  console.log(`[hermes] Health check: http://localhost:${PORT}/health`);
  console.log(
    `[hermes] Compression scheduler: daily @ 05:00 UTC, weekly @ 04:00 UTC Sat`
  );
});

// Graceful shutdown
function shutdown(signal: string): void {
  console.log(`[hermes] Received ${signal}, shutting down...`);
  compressionScheduler.stop();
  server.close(() => {
    console.log("[hermes] Server closed");
    process.exit(0);
  });
  // Force exit after 10s if graceful close hangs
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
