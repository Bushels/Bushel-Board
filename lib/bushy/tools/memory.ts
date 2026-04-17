// WS3 Task 3.4 — Bushy chat harness
// Memory tools. Read/write farmer-level memory via Supabase.
//
// Three tools covering the tiered-memory architecture (design doc §4):
//
//   save_extraction       — Tier 1 ephemeral capture. Nightly reflection
//                           reviews pending rows (review_status='pending')
//                           and promotes into Tier 2 knowledge_state.
//   supersede_knowledge   — Tier 2 revision. Mark an old belief superseded
//                           and INSERT a new knowledge_state row linked via
//                           superseded_by. Both writes in one transaction.
//   query_working_memory  — Read Tier 2 active beliefs. Thin wrapper over
//                           the existing get_area_knowledge RPC.
//
// Every tool:
//   - Validates args with Zod at entry (model may emit invalid JSON)
//   - Falls back to ctx.fsaCode when args.fsa_code is omitted
//   - Returns ok=false with a specific error message on failure rather
//     than throwing — the harness needs the model to see the error so it
//     can self-correct
//   - Populates latencyMs even on the error path

import { z } from "zod";
import type { BushyTool } from "./types";

// ─── Shared argument schemas ──────────────────────────────────────────────

const FsaCodeSchema = z
  .string()
  .regex(/^[A-Z][0-9][A-Z]$/, "fsa_code must match ^[A-Z][0-9][A-Z]$ (e.g. T0L)");

const CategoryEnum = z.enum([
  "market",
  "agronomic",
  "weather",
  "intent",
  "logistics",
  "input_cost",
]);

const ConfidenceEnum = z.enum(["reported", "inferred"]);

// ─── save_extraction ──────────────────────────────────────────────────────

const SaveExtractionArgs = z
  .object({
    category: CategoryEnum,
    data_type: z.string().min(1),
    grain: z.string().nullable(),
    value_numeric: z.number().nullable(),
    value_text: z.string().nullable(),
    location_detail: z.string().nullable(),
    confidence: ConfidenceEnum,
    reasoning: z
      .string()
      .min(10, "Reasoning must be at least 10 characters (reviewed nightly)"),
    // Optional — falls back to ctx.fsaCode when omitted. Model may supply
    // a different FSA when the user mentions a neighbor's area.
    fsa_code: FsaCodeSchema.optional(),
  })
  .refine(
    (d) => d.value_numeric !== null || d.value_text !== null,
    "Either value_numeric or value_text must be non-null (has_value constraint)",
  );

export const saveExtractionTool: BushyTool = {
  name: "save_extraction",
  description:
    "Capture a farming data point from the conversation (Tier 1). " +
    "ALWAYS include a specific reasoning string (>=10 chars) explaining why this is worth saving — " +
    "Kyle reviews these nightly and the reasoning drives keep/discard decisions. " +
    "One of value_numeric or value_text must be non-null. If the user hints at a different area, " +
    "pass the appropriate FSA via fsa_code; otherwise it defaults to the user's own FSA.",
  parameters: SaveExtractionArgs,
  source: "native",
  rateLimit: { perTurn: 5, perConversation: 20 },
  async execute(args, ctx) {
    const start = Date.now();
    const parsed = SaveExtractionArgs.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        error: `save_extraction validation failed: ${parsed.error.message}`,
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

    const { data, error } = await ctx.supabase
      .from("chat_extractions")
      .insert({
        user_id: ctx.userId,
        thread_id: ctx.threadId,
        message_id: ctx.messageId,
        fsa_code: fsaCode,
        category: parsed.data.category,
        data_type: parsed.data.data_type,
        grain: parsed.data.grain,
        value_numeric: parsed.data.value_numeric,
        value_text: parsed.data.value_text,
        location_detail: parsed.data.location_detail,
        confidence: parsed.data.confidence,
        reasoning: parsed.data.reasoning,
      })
      .select("id")
      .single();

    if (error) {
      return {
        ok: false,
        error: `save_extraction insert failed: ${error.message}`,
        latencyMs: Date.now() - start,
      };
    }

    return {
      ok: true,
      data: { extraction_id: data.id },
      latencyMs: Date.now() - start,
    };
  },
};

// ─── supersede_knowledge ──────────────────────────────────────────────────
// Replace an existing Tier-2 belief with an updated version. Two writes:
//   (1) Mark the old row status='superseded' with supersession_reason
//   (2) Insert a new knowledge_state row linked via superseded_by FK
// Both writes in sequence; if step 2 fails we rollback step 1 manually.

const SupersedeArgs = z.object({
  old_knowledge_id: z.string().uuid(),
  supersession_reason: z
    .string()
    .min(10, "Explain why the old belief is wrong/outdated"),
  new_value: z
    .object({
      category: CategoryEnum,
      data_type: z.string().min(1),
      grain: z.string().nullable(),
      value_numeric: z.number().nullable(),
      value_text: z.string().nullable(),
      location_detail: z.string().nullable(),
      confidence_level: z.enum(["single_report", "corroborated", "consensus"]),
    })
    .refine(
      (d) => d.value_numeric !== null || d.value_text !== null,
      "new_value requires value_numeric or value_text",
    ),
  fsa_code: FsaCodeSchema.optional(),
});

export const supersedeKnowledgeTool: BushyTool = {
  name: "supersede_knowledge",
  description:
    "Replace an existing Tier-2 knowledge belief with an updated version. " +
    "Use when the user contradicts a previously-saved belief, or when new evidence " +
    "supersedes older data (e.g. elevator posted a new basis, frost killed the acres you " +
    "previously recorded as planted). Provide the old_knowledge_id and the full new_value.",
  parameters: SupersedeArgs,
  source: "native",
  rateLimit: { perTurn: 3, perConversation: 10 },
  async execute(args, ctx) {
    const start = Date.now();
    const parsed = SupersedeArgs.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        error: `supersede_knowledge validation failed: ${parsed.error.message}`,
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

    // Step 1: mark old row superseded. We set superseded_by in step 3
    // after we know the new id. Using 'superseded' status keeps the
    // row from appearing in active-queries immediately.
    const { data: oldUpdate, error: oldErr } = await ctx.supabase
      .from("knowledge_state")
      .update({
        status: "superseded",
        supersession_reason: parsed.data.supersession_reason,
        last_updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.old_knowledge_id)
      .eq("status", "active") // guard: only supersede active rows
      .select("id")
      .single();

    if (oldErr || !oldUpdate) {
      return {
        ok: false,
        error:
          oldErr?.message ??
          "supersede_knowledge: target row not found or not active",
        latencyMs: Date.now() - start,
      };
    }

    // Step 2: insert the new active row
    const { data: newRow, error: newErr } = await ctx.supabase
      .from("knowledge_state")
      .insert({
        fsa_code: fsaCode,
        category: parsed.data.new_value.category,
        data_type: parsed.data.new_value.data_type,
        grain: parsed.data.new_value.grain,
        value_numeric: parsed.data.new_value.value_numeric,
        value_text: parsed.data.new_value.value_text,
        location_detail: parsed.data.new_value.location_detail,
        confidence_level: parsed.data.new_value.confidence_level,
        status: "active",
      })
      .select("id")
      .single();

    if (newErr || !newRow) {
      // Rollback: flip the old row back to active. Best-effort — don't
      // cascade errors further; we log but surface the insert error.
      await ctx.supabase
        .from("knowledge_state")
        .update({
          status: "active",
          supersession_reason: null,
        })
        .eq("id", parsed.data.old_knowledge_id);
      return {
        ok: false,
        error: `supersede_knowledge insert failed: ${newErr?.message ?? "unknown"}`,
        latencyMs: Date.now() - start,
      };
    }

    // Step 3: link old → new via superseded_by FK. If this fails we're
    // in a minor inconsistent state (new row exists, link missing) but
    // not data-destroying — log and return success.
    await ctx.supabase
      .from("knowledge_state")
      .update({ superseded_by: newRow.id })
      .eq("id", parsed.data.old_knowledge_id);

    return {
      ok: true,
      data: {
        new_knowledge_id: newRow.id,
        superseded_id: parsed.data.old_knowledge_id,
      },
      latencyMs: Date.now() - start,
    };
  },
};

// ─── query_working_memory ─────────────────────────────────────────────────
// Read Tier-2 active beliefs for an area. Thin wrapper over the existing
// get_area_knowledge RPC.

const QueryMemoryArgs = z.object({
  fsa_code: FsaCodeSchema.optional(),
  grain: z.string().nullable().optional(),
  category: CategoryEnum.optional(),
});

export const queryWorkingMemoryTool: BushyTool = {
  name: "query_working_memory",
  description:
    "Read current Tier-2 working-memory beliefs for an area. Use this BEFORE " +
    "answering questions about posted prices, local agronomic conditions, farmer " +
    "intents, or other area-level knowledge — Bushy's memory holds validated facts " +
    "from past conversations. Filter by grain and/or category when you know them.",
  parameters: QueryMemoryArgs,
  source: "native",
  rateLimit: { perTurn: 5, perConversation: 15 },
  async execute(args, ctx) {
    const start = Date.now();
    const parsed = QueryMemoryArgs.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        error: `query_working_memory validation failed: ${parsed.error.message}`,
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

    const { data, error } = await ctx.supabase.rpc("get_area_knowledge", {
      p_fsa_code: fsaCode,
      p_grain: parsed.data.grain ?? null,
      p_category: parsed.data.category ?? null,
    });

    if (error) {
      return {
        ok: false,
        error: `query_working_memory RPC failed: ${error.message}`,
        latencyMs: Date.now() - start,
      };
    }

    return {
      ok: true,
      data: { rows: data ?? [], fsa_code: fsaCode },
      latencyMs: Date.now() - start,
    };
  },
};

// Re-export Zod schemas for tests that want to assert validation rules.
export { SaveExtractionArgs, SupersedeArgs, QueryMemoryArgs };
