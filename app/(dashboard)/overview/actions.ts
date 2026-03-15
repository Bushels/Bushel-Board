"use server";

import { getAuthenticatedUserContext } from "@/lib/auth/role-guard";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import { z } from "zod";

const voteSchema = z.object({
  signalId: z.string().uuid(),
  relevant: z.boolean(),
});

const SIGNAL_FEEDBACK_RATE_LIMIT = {
  limit: 40,
  windowSeconds: 600,
  errorMessage: "You are rating signals too quickly.",
} as const;

/**
 * Vote on a signal from the overview page.
 * Looks up the signal's grain/week from DB so the caller only needs signalId + relevant.
 */
export async function voteSignalFromOverview(
  signalId: string,
  relevant: boolean
): Promise<{ error?: string }> {
  const parsed = voteSchema.safeParse({ signalId, relevant });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { user, role } = await getAuthenticatedUserContext();
  if (!user) return { error: "Unauthorized" };
  if (role !== "farmer") return { error: "Observer accounts cannot vote" };

  // Fetch signal metadata
  const { data: signal } = await supabase
    .from("x_market_signals")
    .select("grain, grain_week, crop_year")
    .eq("id", parsed.data.signalId)
    .single();

  if (!signal) return { error: "Signal not found" };

  const rateLimit = await consumeRateLimit(supabase, {
    actionKey: `signal_feedback:${signal.grain}:${signal.grain_week}`,
    ...SIGNAL_FEEDBACK_RATE_LIMIT,
  });

  if (!rateLimit.allowed) {
    return {
      error: rateLimit.error ?? SIGNAL_FEEDBACK_RATE_LIMIT.errorMessage,
    };
  }

  // Snapshot user context
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
      grain: signal.grain,
      crop_year: signal.crop_year,
      grain_week: signal.grain_week,
      voted_at: new Date().toISOString(),
    },
    { onConflict: "user_id,signal_id" }
  );

  if (error) return { error: error.message };

  revalidatePath("/overview");
  return {};
}
