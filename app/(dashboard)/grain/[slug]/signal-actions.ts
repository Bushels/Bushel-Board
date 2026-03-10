"use server";

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

export async function voteSignalRelevance(
  signalId: string,
  relevant: boolean,
  grain: string,
  cropYear: string,
  grainWeek: number
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

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
