"use server";

import { getAuthenticatedUserContext } from "@/lib/auth/role-guard";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import { z } from "zod";

const metricVoteSchema = z.object({
  grain: z.string().min(1),
  grainWeek: z.coerce.number().int().min(1).max(52),
  metric: z.enum(["deliveries", "processing", "exports", "stocks"]),
  sentiment: z.enum(["bullish", "bearish"]),
});

const METRIC_SENTIMENT_RATE_LIMIT = {
  limit: 20,
  windowSeconds: 300,
  errorMessage: "You are voting on metric sentiment too quickly.",
} as const;

export async function voteMetricSentiment(
  grain: string,
  grainWeek: number,
  metric: string,
  sentiment: string
) {
  const supabase = await createClient();
  const { user, role } = await getAuthenticatedUserContext();
  if (!user) return { error: "Unauthorized" };
  if (role !== "farmer")
    return { error: "Observer accounts cannot vote on metric sentiment" };

  const parsed = metricVoteSchema.safeParse({
    grain,
    grainWeek,
    metric,
    sentiment,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const rateLimit = await consumeRateLimit(supabase, {
    actionKey: `metric_sentiment:${parsed.data.grain}:${parsed.data.grainWeek}`,
    ...METRIC_SENTIMENT_RATE_LIMIT,
  });

  if (!rateLimit.allowed) {
    return {
      error: rateLimit.error ?? METRIC_SENTIMENT_RATE_LIMIT.errorMessage,
      rateLimited: true,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }

  const { error } = await supabase.from("metric_sentiment_votes").upsert(
    {
      user_id: user.id,
      grain: parsed.data.grain,
      crop_year: CURRENT_CROP_YEAR,
      grain_week: parsed.data.grainWeek,
      metric: parsed.data.metric,
      sentiment: parsed.data.sentiment,
      voted_at: new Date().toISOString(),
    },
    { onConflict: "user_id,grain,crop_year,grain_week,metric" }
  );

  if (error) return { error: error.message };

  revalidatePath("/grain");
  return { success: true };
}
