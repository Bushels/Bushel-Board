/**
 * Viking Knowledge Retrieval — Unified L0/L1/L2 tiered context system.
 *
 * Replaces both the static commodity-knowledge.ts blob (7K tokens, 3 books)
 * and the flat RAG approach with a deterministic tiered architecture:
 *
 *   L0 (always loaded, ~420 tokens) — Core analyst worldview from all 8 books
 *   L1 (intent-loaded, ~750 tokens/topic) — Topic summaries loaded by regex
 *   L2 (query-specific, via RPC) — PostgreSQL full-text search for specific chunks
 *
 * Zero extra LLM calls at query time. All summarization happened at ingestion.
 *
 * Usage:
 *   // Pipeline (Edge Function) — no L2 needed, L0+L1 is sufficient
 *   const context = buildVikingPipelineContext(grain);
 *
 *   // Advisor chat — full L0+L1+L2 with user query
 *   const context = await buildVikingAdvisorContext({ messageText, grain, supabase });
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";

import { VIKING_L0 } from "./viking-l0";
import {
  type VikingTopic,
  detectVikingIntents,
  getVikingL1Context,
  VIKING_TOPIC_LABELS,
} from "./viking-l1";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VikingContextResult {
  /** Concatenated context string ready for prompt injection */
  contextText: string;
  /** Which L1 topics were loaded */
  loadedTopics: VikingTopic[];
  /** Whether L2 chunks were retrieved */
  hasL2: boolean;
  /** Number of L2 chunks retrieved */
  l2ChunkCount: number;
  /** Source paths of L2 chunks */
  l2SourcePaths: string[];
  /** Estimated total token count */
  estimatedTokens: number;
}

interface L2ChunkRow {
  chunk_id: number;
  document_id: number;
  title: string;
  source_path: string;
  heading: string | null;
  content: string;
  grain_tags: string[];
  topic_tags: string[];
  region_tags: string[];
  source_priority: number;
  metadata: Record<string, unknown> | null;
  rank: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default L1 topics to always load for pipeline analysis (broad coverage) */
const PIPELINE_DEFAULT_TOPICS: VikingTopic[] = [
  "basis_pricing",
  "storage_carry",
  "logistics_exports",
];

/** Maximum L2 chunks to retrieve for advisor chat */
const ADVISOR_L2_LIMIT = 3;

/** Topic tags to pass to L2 RPC for different contexts */
const PIPELINE_L2_TOPICS = [
  "deliveries",
  "exports",
  "stocks",
  "basis",
  "storage",
  "hedging",
  "logistics",
  "crush",
  "seasonality",
] as const;

// ─── Pipeline Context (Edge Functions) ────────────────────────────────────────

/**
 * Build Viking context for the AI pipeline (analyze-grain-market).
 *
 * Loads L0 (always) + L1 (grain-relevant topics). No L2 — the pipeline
 * has its own data brief with specific CGC numbers, so L2 specifics
 * would be redundant.
 *
 * For grain-specific analysis, we infer topics from the grain name to
 * ensure relevant L1 sections are included (e.g., Canola always gets
 * storage_carry because crush margins matter).
 */
export function buildVikingPipelineContext(grain: string): VikingContextResult {
  // Detect topics from grain context
  const grainTopicHints = inferGrainTopics(grain);
  const topics = dedupeTopics([...PIPELINE_DEFAULT_TOPICS, ...grainTopicHints]);

  const l1Context = getVikingL1Context(topics);
  const sections = [VIKING_L0];
  if (l1Context) sections.push(l1Context);

  const estimatedTokens = 420 + (l1Context ? topics.length * 750 : 0);

  return {
    contextText: sections.join("\n\n"),
    loadedTopics: topics,
    hasL2: false,
    l2ChunkCount: 0,
    l2SourcePaths: [],
    estimatedTokens,
  };
}

// ─── Advisor Context (Chat) ──────────────────────────────────────────────────

/**
 * Build Viking context for the advisor chat.
 *
 * Full L0 + L1 (intent-detected) + L2 (query-specific RPC retrieval).
 * The L2 layer adds specific book passages relevant to the user's question.
 */
export async function buildVikingAdvisorContext(options: {
  messageText: string;
  grain: string;
  supabase?: SupabaseClient;
}): Promise<VikingContextResult> {
  const { messageText, grain } = options;
  const supabase = options.supabase ?? createAdminClient();

  // L1: Detect intents from the user's message + grain context
  const messageTopics = detectVikingIntents(messageText);
  const grainTopics = inferGrainTopics(grain);
  const topics = dedupeTopics([...messageTopics, ...grainTopics]);

  // L2: Retrieve specific chunks via existing RPC
  const l2Result = await fetchL2Chunks(supabase, messageText, grain, topics);

  // Assemble context
  const sections = [VIKING_L0];

  const l1Context = getVikingL1Context(topics);
  if (l1Context) sections.push(l1Context);

  if (l2Result.contextText) {
    sections.push(`## Specific Knowledge (from source books)\n\n${l2Result.contextText}`);
  }

  const estimatedTokens =
    420 + (l1Context ? topics.length * 750 : 0) + (l2Result.estimatedTokens ?? 0);

  return {
    contextText: sections.join("\n\n"),
    loadedTopics: topics,
    hasL2: l2Result.chunks.length > 0,
    l2ChunkCount: l2Result.chunks.length,
    l2SourcePaths: l2Result.sourcePaths,
    estimatedTokens,
  };
}

// ─── L2 Retrieval (wraps existing RPC) ───────────────────────────────────────

async function fetchL2Chunks(
  supabase: SupabaseClient,
  messageText: string,
  grain: string,
  topics: VikingTopic[],
): Promise<{
  contextText: string | null;
  chunks: L2ChunkRow[];
  sourcePaths: string[];
  estimatedTokens: number;
}> {
  // Map Viking topics to the RPC's topic tag format
  const topicTags = topics.flatMap((t) => vikingTopicToRpcTags(t));
  const dedupedTags = [...new Set(topicTags)];

  try {
    const { data, error } = await supabase.rpc("get_knowledge_context", {
      p_query: `${grain} ${messageText}`.slice(0, 500),
      p_grain: grain,
      p_topics: dedupedTags,
      p_limit: ADVISOR_L2_LIMIT,
    });

    if (error) {
      console.warn(`Viking L2 retrieval failed: ${error.message}`);
      return { contextText: null, chunks: [], sourcePaths: [], estimatedTokens: 0 };
    }

    const chunks = (Array.isArray(data) ? data : []) as L2ChunkRow[];
    if (chunks.length === 0) {
      return { contextText: null, chunks: [], sourcePaths: [], estimatedTokens: 0 };
    }

    const contextText = chunks
      .map((c) => `### ${c.title}${c.heading ? ` — ${c.heading}` : ""}\n${c.content}`)
      .join("\n\n");

    const sourcePaths = [...new Set(chunks.map((c) => c.source_path).filter(Boolean))];
    const estimatedTokens = Math.round(contextText.length / 4);

    return { contextText, chunks, sourcePaths, estimatedTokens };
  } catch (err) {
    console.warn(`Viking L2 retrieval error: ${String(err)}`);
    return { contextText: null, chunks: [], sourcePaths: [], estimatedTokens: 0 };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Infer additional L1 topics from the grain name.
 *
 * Every grain gets the pipeline defaults (basis_pricing, storage_carry,
 * logistics_exports). This function adds EXTRA topics based on the grain's
 * market characteristics. The grain_specifics topic is always added so
 * the AI has crop-specific quality, hedging, and demand context.
 */
function inferGrainTopics(grain: string): VikingTopic[] {
  const lower = grain.toLowerCase();
  const topics: VikingTopic[] = [];

  // Every grain gets crop-specific details
  topics.push("grain_specifics");

  // Major traded grains → market structure (COT, oligopoly, global anchors)
  if (
    lower.includes("wheat") ||
    lower.includes("canola") ||
    lower.includes("durum") ||
    lower.includes("barley") ||
    lower.includes("soybean") ||
    lower.includes("oat") ||
    lower.includes("corn") ||
    lower.includes("pea") ||
    lower.includes("lentil")
  ) {
    topics.push("market_structure");
  }

  // Crush/processing crops → risk management for margin calls on hedges
  if (lower.includes("canola") || lower.includes("soybean") || lower.includes("flax")) {
    topics.push("risk_management");
  }

  // Pulse crops with thin futures → risk management (low liquidity flag)
  if (
    lower.includes("pea") ||
    lower.includes("lentil") ||
    lower.includes("chickpea") ||
    lower.includes("mustard") ||
    lower.includes("canary")
  ) {
    topics.push("risk_management");
  }

  return topics;
}

function dedupeTopics(topics: VikingTopic[]): VikingTopic[] {
  return [...new Set(topics)];
}

/**
 * Map Viking topic names to the existing RPC's topic tag vocabulary.
 */
function vikingTopicToRpcTags(topic: VikingTopic): string[] {
  const mapping: Record<VikingTopic, string[]> = {
    basis_pricing: ["basis", "seasonality", "marketing"],
    storage_carry: ["storage", "stocks"],
    hedging_contracts: ["hedging", "futures", "options", "contracts"],
    logistics_exports: ["logistics", "exports", "deliveries"],
    market_structure: ["cot", "demand", "policy"],
    risk_management: ["risk", "hedging"],
    grain_specifics: ["crush", "deliveries", "exports", "storage"],
  };
  return mapping[topic] ?? [];
}

/**
 * Get a human-readable summary of what was loaded (for logging/debugging).
 */
export function describeVikingContext(result: VikingContextResult): string {
  const topicNames = result.loadedTopics.map((t) => VIKING_TOPIC_LABELS[t]);
  const parts = [`L0: loaded`, `L1: ${topicNames.join(", ") || "none"}`];
  if (result.hasL2) {
    parts.push(`L2: ${result.l2ChunkCount} chunks from ${result.l2SourcePaths.length} sources`);
  }
  parts.push(`~${result.estimatedTokens} tokens`);
  return parts.join(" | ");
}
