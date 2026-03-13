"use server";

import { getAuthenticatedUserContext } from "@/lib/auth/role-guard";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import { submitSentimentVote } from "@/lib/queries/sentiment";
import { z } from "zod";

const voteSchema = z.object({
  grain: z.string().min(1),
  sentiment: z.coerce.number().int().min(1).max(5),
  grainWeek: z.coerce.number().int().min(1).max(52),
});

const SENTIMENT_RATE_LIMIT = {
  limit: 12,
  windowSeconds: 300,
  errorMessage: "You are voting on sentiment too quickly.",
} as const;

export async function voteSentiment(
  grain: string,
  sentiment: number,
  grainWeek: number
) {
  const supabase = await createClient();
  const { user, role } = await getAuthenticatedUserContext();
  if (!user) return { error: "Unauthorized" };
  if (role !== "farmer") return { error: "Observer accounts cannot submit sentiment votes" };

  const parsed = voteSchema.safeParse({ grain, sentiment, grainWeek });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const rateLimit = await consumeRateLimit(supabase, {
    actionKey: `sentiment_vote:${parsed.data.grain}:${parsed.data.grainWeek}`,
    ...SENTIMENT_RATE_LIMIT,
  });

  if (!rateLimit.allowed) {
    return {
      error: rateLimit.error ?? SENTIMENT_RATE_LIMIT.errorMessage,
      rateLimited: true,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }

  const result = await submitSentimentVote(
    supabase,
    user.id,
    parsed.data.grain,
    CURRENT_CROP_YEAR,
    parsed.data.grainWeek,
    parsed.data.sentiment
  );

  if (result.error) return { error: result.error };

  revalidatePath(`/grain`);
  return { success: true };
}
