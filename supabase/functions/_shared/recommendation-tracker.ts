/**
 * Recommendation Memory — tracks the analyst's last recommendation per grain per user.
 *
 * Stored in farmer_memory with key pattern "last_rec_{grain_lower}".
 * When the analyst's stance changes between conversations, the chat-completion
 * Edge Function injects "what changed since last time" context into the system prompt
 * so the LLM can naturally explain the shift.
 *
 * Value format: JSON string with { stance, recommendation, grain_week, date }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface LastRecommendation {
  stance: string;          // "Bullish +20", "Bearish -10", "Neutral"
  recommendation: string;  // "haul some this week", "hold for now"
  grainWeek: number | null;
  date: string;            // ISO date when recommendation was given
}

/**
 * Load the last recommendation for a specific grain for this user.
 * Returns null if no prior recommendation exists.
 */
export async function getLastRecommendation(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  grain: string
): Promise<{ rec: LastRecommendation; updatedAt: string } | null> {
  const memoryKey = `last_rec_${grain.toLowerCase().replace(/\s+/g, "_")}`;

  const { data, error } = await supabase
    .from("farmer_memory")
    .select("memory_value, updated_at")
    .eq("user_id", userId)
    .eq("memory_key", memoryKey)
    .eq("grain", grain)
    .maybeSingle();

  if (error || !data) return null;

  try {
    const rec = JSON.parse(data.memory_value) as LastRecommendation;
    return { rec, updatedAt: data.updated_at };
  } catch {
    // Legacy or malformed value — treat as no prior rec
    return null;
  }
}

/**
 * Save the current recommendation for future comparison.
 * Called after the LLM response is complete, extracting stance from the response.
 */
export async function saveRecommendation(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  grain: string,
  stance: string,
  recommendation: string,
  threadId: string,
  grainWeek: number | null
): Promise<void> {
  const memoryKey = `last_rec_${grain.toLowerCase().replace(/\s+/g, "_")}`;

  const value: LastRecommendation = {
    stance,
    recommendation,
    grainWeek,
    date: new Date().toISOString(),
  };

  const { error } = await supabase.from("farmer_memory").upsert(
    {
      user_id: userId,
      memory_key: memoryKey,
      memory_value: JSON.stringify(value),
      grain,
      updated_at: new Date().toISOString(),
      source_thread_id: threadId,
    },
    { onConflict: "user_id,memory_key,grain" }
  );

  if (error) {
    console.error("saveRecommendation error:", error);
  }
}

/**
 * Build "what changed since last time" context for the system prompt.
 * Returns null if no prior recommendation or if the grain wasn't mentioned.
 */
export async function buildRecommendationContext(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  mentionedGrains: string[]
): Promise<string | null> {
  if (mentionedGrains.length === 0) return null;

  const sections: string[] = [];

  for (const grain of mentionedGrains.slice(0, 3)) {
    const last = await getLastRecommendation(supabase, userId, grain);
    if (!last) continue;

    const daysSince = Math.floor(
      (Date.now() - new Date(last.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSince > 30) continue; // Too old to be relevant

    const timeAgo =
      daysSince === 0 ? "earlier today" :
      daysSince === 1 ? "yesterday" :
      `${daysSince} days ago`;

    sections.push(
      `RECOMMENDATION MEMORY (${grain}): Last check was ${timeAgo}. ` +
      `Stance was "${last.rec.stance}". Recommendation was: "${last.rec.recommendation}". ` +
      `If your current analysis differs, explain what changed. ` +
      `If the recommendation flipped (e.g., hold → haul), make that prominent.`
    );
  }

  return sections.length > 0
    ? "## What You Said Last Time\n" + sections.join("\n")
    : null;
}
