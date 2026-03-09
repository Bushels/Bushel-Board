"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import { z } from "zod";

const addCropPlanSchema = z.object({
  grain: z.string().min(1, "Grain is required"),
  acres: z.coerce.number().int().positive("Acres must be a positive integer"),
  volume: z.coerce.number().nonnegative("Volume cannot be negative"),
});

const logDeliverySchema = z.object({
  grain: z.string().min(1, "Grain is required"),
  amount_kt: z.coerce.number().positive("Delivery amount must be positive"),
  date: z.string().date("Invalid date format"),
  destination: z.string().optional(),
});

export async function addCropPlan(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const parsed = addCropPlanSchema.safeParse({
    grain: formData.get("grain"),
    acres: formData.get("acres"),
    volume: formData.get("volume"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { grain, acres, volume } = parsed.data;

  const { error } = await supabase.from("crop_plans").upsert({
    user_id: user.id,
    crop_year: CURRENT_CROP_YEAR,
    grain,
    acres_seeded: acres,
    volume_left_to_sell_kt: volume / 1000, // input is tonnes, store as kt
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const parsed = logDeliverySchema.safeParse({
    grain: formData.get("grain"),
    amount_kt: formData.get("amount_kt"),
    date: formData.get("date"),
    destination: formData.get("destination") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { grain, amount_kt, date, destination } = parsed.data;

  const { data: plan } = await supabase
    .from("crop_plans")
    .select("deliveries")
    .eq("user_id", user.id)
    .eq("crop_year", CURRENT_CROP_YEAR)
    .eq("grain", grain)
    .single();

  if (!plan) throw new Error("No crop plan for this grain");

  const deliveries = [
    ...(plan.deliveries || []),
    { date, amount_kt, destination: destination ?? null },
  ];

  await supabase
    .from("crop_plans")
    .update({ deliveries })
    .eq("user_id", user.id)
    .eq("crop_year", CURRENT_CROP_YEAR)
    .eq("grain", grain);

  revalidatePath("/my-farm");
  revalidatePath("/overview");
}

export async function removeCropPlan(grain: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

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
