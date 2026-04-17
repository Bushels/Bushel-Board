// WS5 Task 5.9 — Bushy chat harness
// System prompt composer. Takes conversation context + runtime data and
// builds the full system prompt the LLM adapter receives.
//
// Token budget (design doc §5 target: 3,500-5,000 tokens):
//   voice kernel (~200) + persona L0 (~500) + persona L1×1-2 (~800-1600)
//   + viking L0 (~420) + viking L1×0-2 (~800-1600)
//   + lessons (variable) + farmer card (~200) + area intel (~300)
//   + tool descriptions (variable)
//
// Cache strategy: static content comes first (voice kernel → viking L0)
// so the prompt-cache hit survives across turns even when tool lists
// change. Farmer-specific content (card, lessons, area intel) goes last.

import type { ChatMessage } from "../adapters/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUSHY_VOICE } from "./voice-kernel";
import { PERSONA_L0 } from "./persona-l0";
import { PERSONA_L1, type PersonaTopic } from "./persona-l1";
import { detectIntent } from "./detect-intent";
import { VIKING_L0 } from "@/lib/knowledge/viking-l0";
import {
  VIKING_L1,
  VIKING_INTENT_PATTERNS,
  type VikingTopic,
} from "@/lib/knowledge/viking-l1";

// ─── Public surface ──────────────────────────────────────────────────────

export interface FarmerCard {
  name?: string;
  fsaCode?: string | null;
  cropPlan?: {
    crop_year?: string;
    crops?: Array<{ grain: string; acres: number }>;
  } | null;
  contractedPosition?: {
    grain: string;
    contractedKt?: number;
    uncontractedKt?: number;
  }[] | null;
}

export interface ToolDescriptor {
  name: string;
  description: string;
}

export interface SystemPromptContext {
  supabase: SupabaseClient;
  userId: string;
  fsaCode: string | null;
  currentMessage: string;
  history: ChatMessage[];
  toolRegistry: ToolDescriptor[];
  farmerCard: FarmerCard;
}

/**
 * Assemble the system prompt for a single turn. All sections that might
 * be empty (placeholder persona-L0, missing area intel) are filtered out
 * before joining so the prompt stays tight.
 */
export async function buildSystemPrompt(
  ctx: SystemPromptContext,
): Promise<string> {
  // Intent detection for both persona (how to talk) and viking (what to
  // know). Runs synchronously — pure functions.
  const personaTopics = detectIntent(ctx.currentMessage, ctx.history);
  const vikingTopics = detectVikingTopics(ctx.currentMessage);

  // Async loads — parallelized where possible.
  const [lessons, areaIntel] = await Promise.all([
    getActiveLessons(ctx.supabase),
    getAreaIntelligence(ctx.supabase, ctx.fsaCode),
  ]);

  // Compose in cache-friendly order: static → semi-static → dynamic.
  const sections = [
    BUSHY_VOICE, // STATIC
    nonEmpty(PERSONA_L0), // STATIC (placeholder-safe)
    ...personaTopics.map((t) => nonEmpty(PERSONA_L1[t])), // STATIC per turn
    VIKING_L0, // STATIC
    ...vikingTopics.map((t) => VIKING_L1[t]), // STATIC per turn
    formatLessons(lessons), // semi-static (updates nightly)
    formatFarmerCard(ctx.farmerCard), // per-user static
    formatAreaIntel(areaIntel), // per-turn
    formatToolDescriptions(ctx.toolRegistry), // per-request
  ];

  return sections.filter((s): s is string => !!s).join("\n\n");
}

// ─── Intent → Viking topics ──────────────────────────────────────────────
// Reuses VIKING_INTENT_PATTERNS from lib/knowledge. Cap at 2 topics to
// respect the token budget.

const MAX_VIKING_TOPICS = 2;

export function detectVikingTopics(message: string): VikingTopic[] {
  const matched = new Set<VikingTopic>();
  for (const { topic, pattern } of VIKING_INTENT_PATTERNS) {
    if (pattern.test(message)) matched.add(topic);
    if (matched.size >= MAX_VIKING_TOPICS) break;
  }
  return Array.from(matched);
}

// ─── Dynamic-content loaders ─────────────────────────────────────────────

async function getActiveLessons(
  supabase: SupabaseClient,
): Promise<Array<{ lesson_text: string; category_scope: string | null }>> {
  const { data, error } = await supabase.rpc(
    "get_active_extraction_lessons",
    { p_category: null },
  );
  if (error) return [];
  return (data as Array<{
    lesson_text: string;
    category_scope: string | null;
  }>) ?? [];
}

interface AreaIntelRow {
  category: string;
  data_type: string;
  value_text: string | null;
  value_numeric: number | null;
  grain: string | null;
}

async function getAreaIntelligence(
  supabase: SupabaseClient,
  fsaCode: string | null,
): Promise<AreaIntelRow[]> {
  if (!fsaCode) return [];
  const { data, error } = await supabase.rpc("get_area_knowledge", {
    p_fsa_code: fsaCode,
    p_grain: null,
    p_category: null,
  });
  if (error) return [];
  // Keep only the top 10 most relevant (RPC already orders by last_updated_at).
  return ((data as AreaIntelRow[]) ?? []).slice(0, 10);
}

// ─── Formatters ──────────────────────────────────────────────────────────

function formatLessons(
  lessons: Array<{ lesson_text: string; category_scope: string | null }>,
): string {
  if (lessons.length === 0) return "";
  const lines = lessons.map(
    (l) =>
      `- [${l.category_scope ?? "general"}] ${l.lesson_text}`,
  );
  return `### Active extraction lessons\n${lines.join("\n")}`;
}

function formatFarmerCard(card: FarmerCard): string {
  if (!card.name && !card.cropPlan && !card.fsaCode) return "";
  const parts: string[] = ["### Farmer card"];
  if (card.name) parts.push(`- Name: ${card.name}`);
  if (card.fsaCode) parts.push(`- Area (FSA): ${card.fsaCode}`);
  if (card.cropPlan?.crops && card.cropPlan.crops.length > 0) {
    const cropsLine = card.cropPlan.crops
      .map((c) => `${c.grain} ${c.acres}ac`)
      .join(", ");
    parts.push(
      `- Crop plan (${card.cropPlan.crop_year ?? "current year"}): ${cropsLine}`,
    );
  }
  if (card.contractedPosition && card.contractedPosition.length > 0) {
    const posLine = card.contractedPosition
      .map(
        (p) =>
          `${p.grain} contracted ${p.contractedKt ?? 0}kt / uncontracted ${p.uncontractedKt ?? 0}kt`,
      )
      .join("; ");
    parts.push(`- Positions: ${posLine}`);
  }
  return parts.join("\n");
}

function formatAreaIntel(rows: AreaIntelRow[]): string {
  if (rows.length === 0) return "";
  const lines = rows.map((r) => {
    const value =
      r.value_text ??
      (r.value_numeric !== null ? String(r.value_numeric) : "(no value)");
    const grain = r.grain ? ` (${r.grain})` : "";
    return `- [${r.category}] ${r.data_type}${grain}: ${value}`;
  });
  return `### Current area beliefs (Tier-2 memory)\n${lines.join("\n")}`;
}

function formatToolDescriptions(tools: ToolDescriptor[]): string {
  if (tools.length === 0) return "";
  const lines = tools.map((t) => `- **${t.name}** — ${t.description}`);
  return `### Available tools\n${lines.join("\n")}`;
}

/** Helper: return the string only if non-empty, else undefined. Filters
 * out placeholder empties (pre-pipeline PERSONA_L0, skipped PERSONA_L1). */
function nonEmpty(s: string): string | undefined {
  return s.length > 0 ? s : undefined;
}

// Re-export for tests + external callers that want direct access.
export type { PersonaTopic, VikingTopic };
