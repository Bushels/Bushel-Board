"use server";

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

export async function voteSentiment(
  grain: string,
  sentiment: number,
  grainWeek: number
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const parsed = voteSchema.safeParse({ grain, sentiment, grainWeek });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
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
