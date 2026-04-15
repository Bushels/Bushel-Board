/**
 * ConversationManager — per-farmer conversation state
 *
 * Handles the full message lifecycle:
 *   1. Ensure thread exists (create or verify ownership)
 *   2. Save user message to chat_messages
 *   3. Load context in parallel (farmerCard, workingMemory, recentHistory)
 *   4. Build system prompt (skeleton for now)
 *   5. Stream response (skeleton for now)
 *   6. Save assistant message to chat_messages
 *
 * ALL persistent state lives in Supabase. The activeConversations Map only
 * tracks in-flight requests for the /health endpoint — it is NOT durable.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ChatPayload, SSEWriter } from "./server.js";

// ---------------------------------------------------------------------------
// Supabase service client (singleton)
// ---------------------------------------------------------------------------

function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FarmerCard {
  id: string;
  full_name: string | null;
  fsa_code: string | null;
  role: string;
  crop_plans: CropPlan[];
}

interface CropPlan {
  grain: string;
  crop_year: string;
  total_acres: number | null;
  expected_yield_bu_ac: number | null;
  contracted_kt: number | null;
  uncontracted_kt: number | null;
}

interface KnowledgeEntry {
  id: string;
  fsa_code: string;
  category: string;
  data_type: string;
  grain: string | null;
  value_numeric: number | null;
  value_text: string | null;
  confidence_level: string;
  last_updated_at: string;
}

interface ChatMessage {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// ConversationManager
// ---------------------------------------------------------------------------

export class ConversationManager {
  private activeConversations = new Map<string, { startedAt: number }>();
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = getServiceClient();
  }

  /** Number of currently in-flight conversations */
  get activeCount(): number {
    return this.activeConversations.size;
  }

  /**
   * Main message handler — called by the /chat endpoint.
   * Orchestrates the full request lifecycle.
   */
  async handleMessage(payload: ChatPayload, sse: SSEWriter): Promise<void> {
    const { userId, message, grain, fsaCode } = payload;

    // Track active conversation
    this.activeConversations.set(userId, { startedAt: Date.now() });

    try {
      // 1. Ensure thread exists
      const threadId = payload.threadId
        ? await this.verifyThreadOwnership(payload.threadId, userId)
        : await this.createThread(userId, grain);

      // 2. Save user message
      await this.saveMessage(threadId, userId, "user", message);

      // 3. Load context in parallel
      const [farmerCard, workingMemory, recentHistory] = await Promise.all([
        this.loadFarmerCard(userId),
        this.loadWorkingMemory(fsaCode, grain),
        this.loadRecentHistory(threadId),
      ]);

      // 4. Build system prompt (skeleton)
      const systemPrompt = this.buildSystemPrompt(
        farmerCard,
        workingMemory,
        recentHistory
      );

      // 5. Stream skeleton response
      const responseText =
        "Hermes chat coming soon — server skeleton active.";

      // Stream character-by-character to simulate SSE delta pattern
      for (const char of responseText) {
        sse.sendEvent("response.output_text.delta", { delta: char });
      }

      // 6. Save assistant message
      await this.saveMessage(threadId, userId, "assistant", responseText);

      // Log context summary (diagnostic)
      console.log(
        `[hermes] Chat handled: user=${userId.slice(0, 8)}… ` +
          `thread=${threadId.slice(0, 8)}… ` +
          `history=${recentHistory.length} msgs ` +
          `memory=${workingMemory.length} entries ` +
          `prompt=${systemPrompt.length} chars`
      );
    } finally {
      this.activeConversations.delete(userId);
    }
  }

  // ─── Private helpers ───────────────────────────────

  /**
   * Create a new chat thread for the user.
   */
  private async createThread(
    userId: string,
    grain?: string
  ): Promise<string> {
    const grainContext = grain ? [grain] : [];

    const { data, error } = await this.supabase
      .from("chat_threads")
      .insert({
        user_id: userId,
        grain_context: grainContext,
        title: grain ? `${grain} discussion` : "General discussion",
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Failed to create thread: ${error.message}`);
    }

    return data.id as string;
  }

  /**
   * Verify the caller owns the thread. Returns the thread ID if valid.
   */
  private async verifyThreadOwnership(
    threadId: string,
    userId: string
  ): Promise<string> {
    const { data, error } = await this.supabase
      .from("chat_threads")
      .select("id, user_id")
      .eq("id", threadId)
      .single();

    if (error || !data) {
      throw new Error(`Thread not found: ${threadId}`);
    }

    if (data.user_id !== userId) {
      throw new Error("Thread does not belong to this user");
    }

    return data.id as string;
  }

  /**
   * Save a message to chat_messages.
   */
  private async saveMessage(
    threadId: string,
    userId: string,
    role: "user" | "assistant" | "system" | "tool",
    content: string
  ): Promise<string> {
    const { data, error } = await this.supabase
      .from("chat_messages")
      .insert({
        thread_id: threadId,
        user_id: userId,
        role,
        content,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Failed to save message: ${error.message}`);
    }

    // Bump thread's message count and updated_at
    await this.supabase
      .from("chat_threads")
      .update({
        message_count: await this.getMessageCount(threadId),
        updated_at: new Date().toISOString(),
      })
      .eq("id", threadId);

    return data.id as string;
  }

  /**
   * Get total message count for a thread.
   */
  private async getMessageCount(threadId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", threadId);

    if (error) {
      console.error(`[hermes] Failed to count messages: ${error.message}`);
      return 0;
    }

    return count ?? 0;
  }

  /**
   * Load farmer profile with crop plans.
   */
  private async loadFarmerCard(userId: string): Promise<FarmerCard> {
    const { data: profile, error: profileErr } = await this.supabase
      .from("profiles")
      .select("id, full_name, fsa_code, role")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      // Return a minimal card if profile not found
      return {
        id: userId,
        full_name: null,
        fsa_code: null,
        role: "farmer",
        crop_plans: [],
      };
    }

    const { data: plans } = await this.supabase
      .from("crop_plans")
      .select(
        "grain, crop_year, total_acres, expected_yield_bu_ac, contracted_kt, uncontracted_kt"
      )
      .eq("user_id", userId)
      .order("crop_year", { ascending: false });

    return {
      id: profile.id as string,
      full_name: profile.full_name as string | null,
      fsa_code: profile.fsa_code as string | null,
      role: (profile.role as string) ?? "farmer",
      crop_plans: (plans ?? []) as CropPlan[],
    };
  }

  /**
   * Load active working memory entries for the farmer's FSA area.
   */
  private async loadWorkingMemory(
    fsaCode: string,
    grain?: string
  ): Promise<KnowledgeEntry[]> {
    let query = this.supabase
      .from("knowledge_state")
      .select(
        "id, fsa_code, category, data_type, grain, value_numeric, value_text, confidence_level, last_updated_at"
      )
      .eq("fsa_code", fsaCode)
      .eq("status", "active")
      .order("last_updated_at", { ascending: false })
      .limit(50);

    if (grain) {
      // Include entries for this grain OR grain-agnostic entries
      query = query.or(`grain.eq.${grain},grain.is.null`);
    }

    const { data, error } = await query;

    if (error) {
      console.error(
        `[hermes] Failed to load working memory: ${error.message}`
      );
      return [];
    }

    return (data ?? []) as KnowledgeEntry[];
  }

  /**
   * Load the last 20 messages from a thread, reversed to chronological order.
   */
  private async loadRecentHistory(
    threadId: string
  ): Promise<ChatMessage[]> {
    const { data, error } = await this.supabase
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error(
        `[hermes] Failed to load history: ${error.message}`
      );
      return [];
    }

    // Reverse to chronological order (oldest first)
    return ((data ?? []) as ChatMessage[]).reverse();
  }

  /**
   * Build the system prompt. Skeleton implementation — just returns the
   * base persona. Future tasks will inject farmerCard, workingMemory,
   * market context, and Viking knowledge.
   */
  private buildSystemPrompt(
    _farmerCard: FarmerCard,
    _workingMemory: KnowledgeEntry[],
    _recentHistory: ChatMessage[]
  ): string {
    return "You are Bushy, a prairie grain market intelligence assistant.";
  }
}
