/**
 * CompressionScheduler — daily/weekly memory compression cron
 *
 * Schedules two jobs using node-cron:
 *   - Daily:  0 5 * * *   (10 PM MST = 5 AM UTC)
 *   - Weekly: 0 4 * * 6   (Friday 9 PM MST = 4 AM UTC Saturday)
 *
 * Both are skeleton implementations that log counts and write audit
 * records to compression_summaries. Real compression logic (LLM-powered
 * deduplication, promotion, supersession) will be built in future tasks.
 *
 * Idempotency: checks compression_summaries for today's date + period
 * before running, to prevent duplicate runs.
 */

import cron from "node-cron";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Supabase service client
// ---------------------------------------------------------------------------

function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Get today's date in YYYY-MM-DD format (UTC) */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// CompressionScheduler
// ---------------------------------------------------------------------------

export class CompressionScheduler {
  private supabase: SupabaseClient;
  private dailyTask: cron.ScheduledTask | null = null;
  private weeklyTask: cron.ScheduledTask | null = null;

  constructor() {
    this.supabase = getServiceClient();
  }

  /**
   * Start the cron jobs.
   */
  start(): void {
    // Daily: 5 AM UTC (10 PM MST)
    this.dailyTask = cron.schedule("0 5 * * *", () => {
      this.runDaily().catch((err) => {
        console.error("[hermes:compression] Daily run failed:", err);
      });
    });

    // Weekly: 4 AM UTC Saturday (Friday 9 PM MST)
    this.weeklyTask = cron.schedule("0 4 * * 6", () => {
      this.runWeekly().catch((err) => {
        console.error("[hermes:compression] Weekly run failed:", err);
      });
    });

    console.log("[hermes:compression] Scheduler started");
  }

  /**
   * Stop the cron jobs (for graceful shutdown).
   */
  stop(): void {
    this.dailyTask?.stop();
    this.weeklyTask?.stop();
    console.log("[hermes:compression] Scheduler stopped");
  }

  /**
   * Daily compression — skeleton implementation.
   *
   * Checks for unprocessed chat_extractions, counts active knowledge_state,
   * logs summary, and writes audit record to compression_summaries.
   */
  async runDaily(): Promise<void> {
    const today = todayUTC();
    console.log(`[hermes:compression] Starting daily compression for ${today}`);

    // Idempotency: skip if already run today
    const alreadyRun = await this.hasRunToday("daily", today);
    if (alreadyRun) {
      console.log(
        `[hermes:compression] Daily compression already completed for ${today}, skipping`
      );
      return;
    }

    // Count unprocessed extractions
    const { count: extractionsCount, error: extErr } = await this.supabase
      .from("chat_extractions")
      .select("id", { count: "exact", head: true })
      .eq("promoted", false)
      .eq("discarded", false);

    if (extErr) {
      console.error(
        `[hermes:compression] Failed to count extractions: ${extErr.message}`
      );
    }

    const totalExtractions = extractionsCount ?? 0;

    // Count active knowledge state entries
    const { count: knowledgeCount, error: ksErr } = await this.supabase
      .from("knowledge_state")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");

    if (ksErr) {
      console.error(
        `[hermes:compression] Failed to count knowledge: ${ksErr.message}`
      );
    }

    const activeKnowledge = knowledgeCount ?? 0;

    console.log(
      `[hermes:compression] Daily stats: ` +
        `${totalExtractions} unprocessed extractions, ` +
        `${activeKnowledge} active knowledge entries`
    );

    // Write skeleton summary
    const { error: insertErr } = await this.supabase
      .from("compression_summaries")
      .insert({
        period: "daily",
        compression_date: today,
        conversations_processed: 0,
        extractions_total: totalExtractions,
        promoted: 0,
        corroborated: 0,
        superseded: 0,
        discarded: 0,
        deferred: totalExtractions, // All deferred in skeleton
        summary: {
          status: "skeleton",
          note: "Daily compression skeleton — no LLM processing yet",
          active_knowledge_count: activeKnowledge,
        },
        patterns_detected: 0,
        flags_for_review: 0,
      });

    if (insertErr) {
      throw new Error(
        `Failed to write daily compression summary: ${insertErr.message}`
      );
    }

    console.log(
      `[hermes:compression] Daily compression complete for ${today}`
    );
  }

  /**
   * Weekly compression — skeleton implementation.
   *
   * Writes a placeholder summary. Future tasks will implement
   * cross-area pattern detection, knowledge graph pruning,
   * and macro/micro alignment analysis.
   */
  async runWeekly(): Promise<void> {
    const today = todayUTC();
    console.log(
      `[hermes:compression] Starting weekly compression for ${today}`
    );

    // Idempotency: skip if already run this week
    const alreadyRun = await this.hasRunToday("weekly", today);
    if (alreadyRun) {
      console.log(
        `[hermes:compression] Weekly compression already completed for ${today}, skipping`
      );
      return;
    }

    // Write skeleton summary
    const { error: insertErr } = await this.supabase
      .from("compression_summaries")
      .insert({
        period: "weekly",
        compression_date: today,
        conversations_processed: 0,
        extractions_total: 0,
        promoted: 0,
        corroborated: 0,
        superseded: 0,
        discarded: 0,
        deferred: 0,
        summary: {
          status: "not_yet_implemented",
          note: "Weekly compression skeleton — cross-area patterns, knowledge graph pruning, macro/micro alignment not yet built",
        },
        patterns_detected: 0,
        flags_for_review: 0,
        macro_micro_alignment: null,
      });

    if (insertErr) {
      throw new Error(
        `Failed to write weekly compression summary: ${insertErr.message}`
      );
    }

    console.log(
      `[hermes:compression] Weekly compression complete for ${today}`
    );
  }

  // ─── Private helpers ───────────────────────────────

  /**
   * Check if a compression run has already been recorded for the given
   * period and date.
   */
  private async hasRunToday(
    period: "daily" | "weekly",
    date: string
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("compression_summaries")
      .select("id")
      .eq("period", period)
      .eq("compression_date", date)
      .limit(1);

    if (error) {
      console.error(
        `[hermes:compression] Failed to check idempotency: ${error.message}`
      );
      // Fail open — allow the run rather than silently skipping
      return false;
    }

    return (data?.length ?? 0) > 0;
  }
}
