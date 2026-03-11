"use server";

import { getAuthenticatedUserContext } from "@/lib/auth/role-guard";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import { z } from "zod";

const feedbackSchema = z.object({
  signalId: z.string().uuid(),
  relevant: z.boolean(),
  grain: z.string().min(1),
  cropYear: z.string().min(1),
  grainWeek: z.coerce.number().int().min(1).max(52),
});

const SIGNAL_FEEDBACK_RATE_LIMIT = {
  limit: 40,
  windowSeconds: 600,
  errorMessage: "You are rating signals too quickly.",
} as const;

export async function voteSignalRelevance(
  signalId: string,
  relevant: boolean,
  grain: string,
  cropYear: string,
  grainWeek: number
) {
  const supabase = await createClient();
  const { user, role } = await getAuthenticatedUserContext();
  if (!user) return { error: "Unauthorized" };
  if (role !== "farmer") return { error: "Observer accounts cannot vote on signal relevance" };

  const parsed = feedbackSchema.safeParse({
    signalId,
    relevant,
    grain,
    cropYear,
    grainWeek,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const rateLimit = await consumeRateLimit(supabase, {
    actionKey: `signal_feedback:${parsed.data.grain}:${parsed.data.grainWeek}`,
    ...SIGNAL_FEEDBACK_RATE_LIMIT,
  });

  if (!rateLimit.allowed) {
    return {
      error: rateLimit.error ?? SIGNAL_FEEDBACK_RATE_LIMIT.errorMessage,
      rateLimited: true,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }

  // Snapshot user context at vote time
  const { data: profile } = await supabase
    .from("profiles")
    .select("province")
    .eq("id", user.id)
    .single();

  const { data: crops } = await supabase
    .from("crop_plans")
    .select("grain")
    .eq("user_id", user.id)
    .eq("crop_year", CURRENT_CROP_YEAR);

  const { error } = await supabase.from("signal_feedback").upsert(
    {
      user_id: user.id,
      signal_id: parsed.data.signalId,
      relevant: parsed.data.relevant,
      user_province: profile?.province ?? null,
      user_crops: crops?.map((c) => c.grain) ?? [],
      grain: parsed.data.grain,
      crop_year: parsed.data.cropYear,
      grain_week: parsed.data.grainWeek,
      voted_at: new Date().toISOString(),
    },
    { onConflict: "user_id,signal_id" }
  );

  if (error) return { error: error.message };

  revalidatePath("/grain");
  return { success: true };
}
