// WS3 Task 3.5 — Bushy chat harness
// Data tools. Read-only lookups over existing app data, each with a
// fire-and-forget auto-extraction side effect so nightly reflection has
// evidence of what Bushy looked up (category='market', confidence='inferred').
//
// Three tools:
//   query_market_thesis     — latest market_analysis row for a grain
//   query_posted_prices     — calls get_area_prices RPC (unified pricing board)
//   query_area_intelligence — combines get_area_knowledge + get_area_patterns
//
// Auto-extraction pattern: after a successful read we insert an inferred
// extraction so the nightly reflection job sees "Bushy looked up X for
// user Y in area Z" as evidence. If the auto-extraction insert fails
// (missing FSA, etc.), we log but don't fail the read — the read is
// still useful to the model. Auto-extractions use reasoning that names
// the tool so Kyle can filter them out of morning review if desired.

import { z } from "zod";
import type { BushyTool, ToolContext } from "./types";

const FsaCodeSchema = z
  .string()
  .regex(/^[A-Z][0-9][A-Z]$/, "fsa_code must match ^[A-Z][0-9][A-Z]$");

/**
 * Fire-and-forget auto-extraction. Silently returns on failure so the
 * primary read result always reaches the model.
 */
async function logAutoExtraction(
  ctx: ToolContext,
  params: {
    fsaCode: string | null;
    dataType: string;
    grain: string | null;
    valueText: string;
    reasoningTool: string;
  },
): Promise<void> {
  if (!params.fsaCode) return; // chat_extractions.fsa_code is NOT NULL
  try {
    await ctx.supabase.from("chat_extractions").insert({
      user_id: ctx.userId,
      thread_id: ctx.threadId,
      message_id: ctx.messageId,
      fsa_code: params.fsaCode,
      category: "market",
      data_type: params.dataType,
      grain: params.grain,
      value_text: params.valueText.slice(0, 1000), // guard against huge inserts
      confidence: "inferred",
      reasoning: `Auto-captured from ${params.reasoningTool} tool call`,
    });
  } catch {
    // Swallow — auto-extraction is best-effort.
  }
}

// ─── query_market_thesis ──────────────────────────────────────────────────

const MarketThesisArgs = z.object({
  grain: z.string().min(1),
});

export const queryMarketThesisTool: BushyTool = {
  name: "query_market_thesis",
  description:
    "Look up the most recent bull/bear thesis and market analysis for a grain. " +
    "Use before answering questions about price direction, fundamentals, or " +
    "what the desk thinks about a market. Returns thesis summary, bull/bear cases, " +
    "data confidence, and the week the analysis was generated for.",
  parameters: MarketThesisArgs,
  source: "native",
  rateLimit: { perTurn: 3, perConversation: 10 },
  async execute(args, ctx) {
    const start = Date.now();
    const parsed = MarketThesisArgs.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        error: `query_market_thesis validation failed: ${parsed.error.message}`,
        latencyMs: Date.now() - start,
      };
    }

    const { data, error } = await ctx.supabase
      .from("market_analysis")
      .select(
        "grain, crop_year, grain_week, initial_thesis, bull_case, bear_case, data_confidence, key_signals, generated_at",
      )
      .eq("grain", parsed.data.grain)
      .order("grain_week", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        error: `query_market_thesis read failed: ${error.message}`,
        latencyMs: Date.now() - start,
      };
    }

    if (!data) {
      return {
        ok: true,
        data: { found: false, grain: parsed.data.grain },
        latencyMs: Date.now() - start,
      };
    }

    // Fire-and-forget auto-extraction.
    await logAutoExtraction(ctx, {
      fsaCode: ctx.fsaCode,
      dataType: "thesis_lookup",
      grain: parsed.data.grain,
      valueText: data.initial_thesis ?? "",
      reasoningTool: "query_market_thesis",
    });

    return {
      ok: true,
      data: { found: true, ...data },
      latencyMs: Date.now() - start,
    };
  },
};

// ─── query_posted_prices ──────────────────────────────────────────────────

const PostedPricesArgs = z.object({
  grain: z.string().nullable().optional(),
  business_type: z
    .enum([
      "elevator",
      "crusher",
      "mill",
      "terminal",
      "seed",
      "fertilizer",
      "chemical",
    ])
    .nullable()
    .optional(),
  fsa_code: FsaCodeSchema.optional(),
});

export const queryPostedPricesTool: BushyTool = {
  name: "query_posted_prices",
  description:
    "Look up unexpired posted prices from elevators, crushers, mills, terminals, " +
    "seed/input suppliers in the farmer's area. Filter by grain and/or business_type " +
    "when relevant. Returns facility, basis, price per tonne/bushel, delivery notes. " +
    "Defaults to the user's FSA; pass fsa_code to query a different area.",
  parameters: PostedPricesArgs,
  source: "native",
  rateLimit: { perTurn: 3, perConversation: 10 },
  async execute(args, ctx) {
    const start = Date.now();
    const parsed = PostedPricesArgs.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        error: `query_posted_prices validation failed: ${parsed.error.message}`,
        latencyMs: Date.now() - start,
      };
    }
    const fsaCode = parsed.data.fsa_code ?? ctx.fsaCode;
    if (!fsaCode) {
      return {
        ok: false,
        error:
          "No FSA available. Provide fsa_code arg or ask the user to set their farm location.",
        latencyMs: Date.now() - start,
      };
    }

    const { data, error } = await ctx.supabase.rpc("get_area_prices", {
      p_fsa_code: fsaCode,
      p_grain: parsed.data.grain ?? null,
      p_business_type: parsed.data.business_type ?? null,
    });

    if (error) {
      return {
        ok: false,
        error: `query_posted_prices RPC failed: ${error.message}`,
        latencyMs: Date.now() - start,
      };
    }

    const rows = (data as unknown[]) ?? [];
    // Auto-extraction summarizes how many rows hit, which is useful context.
    await logAutoExtraction(ctx, {
      fsaCode,
      dataType: "posted_prices_lookup",
      grain: parsed.data.grain ?? null,
      valueText: `Found ${rows.length} posted price(s) in ${fsaCode}${parsed.data.grain ? ` for ${parsed.data.grain}` : ""}${parsed.data.business_type ? ` (${parsed.data.business_type})` : ""}`,
      reasoningTool: "query_posted_prices",
    });

    return {
      ok: true,
      data: { rows, fsa_code: fsaCode, count: rows.length },
      latencyMs: Date.now() - start,
    };
  },
};

// ─── query_area_intelligence ─────────────────────────────────────────────
// Combines Tier-2 working memory (get_area_knowledge) with detected
// patterns (get_area_patterns). Separate RPC calls, union the results
// in the tool's output.

const AreaIntelligenceArgs = z.object({
  fsa_code: FsaCodeSchema.optional(),
  grain: z.string().nullable().optional(),
});

export const queryAreaIntelligenceTool: BushyTool = {
  name: "query_area_intelligence",
  description:
    "Look up what we know about a farming area: current Tier-2 beliefs (recent " +
    "prices, conditions, farmer intents) PLUS detected patterns (trends, anomalies, " +
    "area-wide shifts). Use when answering 'what's happening in [area]?' or before " +
    "making recommendations. Combines get_area_knowledge and get_area_patterns " +
    "results into one payload.",
  parameters: AreaIntelligenceArgs,
  source: "native",
  rateLimit: { perTurn: 2, perConversation: 8 },
  async execute(args, ctx) {
    const start = Date.now();
    const parsed = AreaIntelligenceArgs.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        error: `query_area_intelligence validation failed: ${parsed.error.message}`,
        latencyMs: Date.now() - start,
      };
    }
    const fsaCode = parsed.data.fsa_code ?? ctx.fsaCode;
    if (!fsaCode) {
      return {
        ok: false,
        error:
          "No FSA available. Provide fsa_code arg or ask the user to set their farm location.",
        latencyMs: Date.now() - start,
      };
    }

    const [knowledgeRes, patternsRes] = await Promise.all([
      ctx.supabase.rpc("get_area_knowledge", {
        p_fsa_code: fsaCode,
        p_grain: parsed.data.grain ?? null,
        p_category: null,
      }),
      ctx.supabase.rpc("get_area_patterns", {
        p_fsa_code: fsaCode,
        p_grain: parsed.data.grain ?? null,
      }),
    ]);

    if (knowledgeRes.error || patternsRes.error) {
      const msg = knowledgeRes.error?.message ?? patternsRes.error?.message;
      return {
        ok: false,
        error: `query_area_intelligence RPC failed: ${msg}`,
        latencyMs: Date.now() - start,
      };
    }

    const knowledge = (knowledgeRes.data as unknown[]) ?? [];
    const patterns = (patternsRes.data as unknown[]) ?? [];

    await logAutoExtraction(ctx, {
      fsaCode,
      dataType: "area_intelligence_lookup",
      grain: parsed.data.grain ?? null,
      valueText: `Retrieved ${knowledge.length} knowledge row(s) and ${patterns.length} pattern(s) for ${fsaCode}`,
      reasoningTool: "query_area_intelligence",
    });

    return {
      ok: true,
      data: {
        fsa_code: fsaCode,
        knowledge,
        patterns,
        counts: { knowledge: knowledge.length, patterns: patterns.length },
      },
      latencyMs: Date.now() - start,
    };
  },
};

export { MarketThesisArgs, PostedPricesArgs, AreaIntelligenceArgs };
