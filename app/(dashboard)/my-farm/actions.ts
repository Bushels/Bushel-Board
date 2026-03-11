"use server";

import { getAuthenticatedUserContext } from "@/lib/auth/role-guard";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import { z } from "zod";

const addCropPlanSchema = z.object({
  grain: z.string().min(1, "Grain is required"),
  acres: z.coerce.number().int().positive("Acres must be a positive integer"),
  volume: z.coerce.number().nonnegative("Volume cannot be negative"),
  contracted: z.coerce.number().nonnegative("Contracted volume cannot be negative").default(0),
});

const logDeliverySchema = z.object({
  grain: z.string().min(1, "Grain is required"),
  submission_id: z.string().uuid("Invalid submission id"),
  amount_kt: z.coerce.number().positive("Delivery amount must be positive"),
  date: z.string().date("Invalid date format"),
  destination: z.string().optional(),
});

const DELIVERY_RATE_LIMIT = {
  limit: 30,
  windowSeconds: 600,
  errorMessage: "You are logging deliveries too quickly.",
} as const;

export async function addCropPlan(formData: FormData) {
  const supabase = await createClient();
  const { user, role } = await getAuthenticatedUserContext();
  if (!user) throw new Error("Unauthorized");
  if (role !== "farmer") return { error: "Observer accounts cannot edit crop plans" };

  const parsed = addCropPlanSchema.safeParse({
    grain: formData.get("grain"),
    acres: formData.get("acres"),
    volume: formData.get("volume"),
    contracted: formData.get("contracted") || 0,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { grain, acres, volume, contracted } = parsed.data;
  if (contracted > volume) {
    return { error: "Contracted volume cannot exceed remaining volume to sell" };
  }

  const contractedKt = contracted / 1000;
  const uncontractedKt = Math.max(0, volume / 1000 - contractedKt);

  const { error } = await supabase.from("crop_plans").upsert({
    user_id: user.id,
    crop_year: CURRENT_CROP_YEAR,
    grain,
    acres_seeded: acres,
    volume_left_to_sell_kt: volume / 1000, // input is tonnes, store as kt
    contracted_kt: contractedKt,
    uncontracted_kt: uncontractedKt,
  }, {
    onConflict: "user_id,crop_year,grain",
  });

  if (error) {
    console.error("Error upserting crop plan:", error);
    return { error: error.message };
  }

  revalidatePath("/my-farm");
  revalidatePath("/overview");

  return { success: true };
}

export async function logDelivery(formData: FormData) {
  const supabase = await createClient();
  const { user, role } = await getAuthenticatedUserContext();
  if (!user) throw new Error("Not authenticated");
  if (role !== "farmer") return { error: "Observer accounts cannot log deliveries" };

  const parsed = logDeliverySchema.safeParse({
    grain: formData.get("grain"),
    submission_id: formData.get("submission_id"),
    amount_kt: formData.get("amount_kt"),
    date: formData.get("date"),
    destination: formData.get("destination") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { grain, submission_id, amount_kt, date, destination } = parsed.data;
  const rateLimit = await consumeRateLimit(supabase, {
    actionKey: `log_delivery:${CURRENT_CROP_YEAR}:${grain}`,
    ...DELIVERY_RATE_LIMIT,
  });

  if (!rateLimit.allowed) {
    return {
      error: rateLimit.error ?? DELIVERY_RATE_LIMIT.errorMessage,
      rateLimited: true,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }

  const { data: plan } = await supabase
    .from("crop_plans")
    .select("id")
    .eq("user_id", user.id)
    .eq("crop_year", CURRENT_CROP_YEAR)
    .eq("grain", grain)
    .single();

  if (!plan) throw new Error("No crop plan for this grain");

  const { error } = await supabase
    .from("crop_plan_deliveries")
    .insert({
      crop_plan_id: plan.id,
      user_id: user.id,
      crop_year: CURRENT_CROP_YEAR,
      grain,
      submission_id,
      delivery_date: date,
      amount_kt,
      destination: destination ?? null,
    });

  if (error) {
    if (error.code === "23505") {
      revalidatePath("/my-farm");
      revalidatePath("/overview");
      return { success: true, duplicate: true };
    }
    return { error: error.message };
  }

  revalidatePath("/my-farm");
  revalidatePath("/overview");

  return { success: true };
}

export async function removeCropPlan(grain: string) {
  const supabase = await createClient();
  const { user, role } = await getAuthenticatedUserContext();
  if (!user) return { error: "Unauthorized" };
  if (role !== "farmer") return { error: "Observer accounts cannot edit crop plans" };

  if (!grain || typeof grain !== "string") {
    return { error: "Invalid grain name" };
  }

  const { error } = await supabase
    .from("crop_plans")
    .delete()
    .eq("user_id", user.id)
    .eq("crop_year", CURRENT_CROP_YEAR)
    .eq("grain", grain);

  if (error) return { error: error.message };

  revalidatePath("/my-farm");
  revalidatePath("/overview");

  return { success: true };
}
