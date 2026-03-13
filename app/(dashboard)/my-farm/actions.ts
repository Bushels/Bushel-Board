"use server";

import { getAuthenticatedUserContext } from "@/lib/auth/role-guard";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import {
  convertToMetricTonnes,
  convertTonnesToKt,
  getDefaultBushelWeightLbs,
  type GrainAmountUnit,
} from "@/lib/utils/grain-units";
import { z } from "zod";

const addCropPlanSchema = z.object({
  grain: z.string().min(1, "Grain is required"),
  acres: z.coerce.number().int().positive("Acres must be a positive integer"),
  starting: z.coerce.number().positive("Estimated starting grain amount must be greater than 0"),
  volume: z.coerce.number().nonnegative("Volume cannot be negative"),
  contracted: z.coerce.number().nonnegative("Contracted volume cannot be negative").default(0),
  inventory_unit: z.enum(["metric_tonnes", "bushels", "pounds"]).default("metric_tonnes"),
  bushel_weight_lbs: z.coerce.number().positive("Bushel weight must be greater than 0").optional(),
}).superRefine((data, ctx) => {
  if (data.inventory_unit === "bushels" && !data.bushel_weight_lbs) {
    ctx.addIssue({
      code: "custom",
      message: "Bushel weight is required when entering bushels",
      path: ["bushel_weight_lbs"],
    });
  }
});

const logDeliverySchema = z.object({
  grain: z.string().min(1, "Grain is required"),
  submission_id: z.string().uuid("Invalid submission id"),
  amount_kt: z.coerce.number().positive("Delivery amount must be positive"),
  date: z.string().date("Invalid date format"),
  destination: z.string().optional(),
  marketing_type: z.enum(["contracted", "open"], {
    message: "Choose whether this load was contracted or open market",
  }),
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
    starting: formData.get("starting"),
    volume: formData.get("volume"),
    contracted: formData.get("contracted") || 0,
    inventory_unit: formData.get("inventory_unit") || "metric_tonnes",
    bushel_weight_lbs: formData.get("bushel_weight_lbs") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const {
    grain,
    acres,
    starting,
    volume,
    contracted,
    inventory_unit,
    bushel_weight_lbs,
  } = parsed.data;
  const bushelWeightLbs = bushel_weight_lbs ?? getDefaultBushelWeightLbs(grain);

  const startingTonnes = convertToMetricTonnes(
    starting,
    inventory_unit as GrainAmountUnit,
    bushelWeightLbs
  );
  const volumeTonnes = convertToMetricTonnes(
    volume,
    inventory_unit as GrainAmountUnit,
    bushelWeightLbs
  );
  const contractedTonnes = convertToMetricTonnes(
    contracted,
    inventory_unit as GrainAmountUnit,
    bushelWeightLbs
  );

  if (volumeTonnes > startingTonnes) {
    return { error: "Grain left to sell cannot exceed estimated starting grain amount" };
  }
  if (contractedTonnes > volumeTonnes) {
    return { error: "Contracted volume cannot exceed grain left to sell" };
  }

  const { data: existingPlan } = await supabase
    .from("crop_plans")
    .select("deliveries")
    .eq("user_id", user.id)
    .eq("crop_year", CURRENT_CROP_YEAR)
    .eq("grain", grain)
    .maybeSingle();

  const existingLoggedDeliveriesKt = (existingPlan?.deliveries ?? []).reduce(
    (sum: number, delivery: { amount_kt?: number }) =>
      sum + Number(delivery.amount_kt ?? 0),
    0
  );

  if (convertTonnesToKt(startingTonnes) < existingLoggedDeliveriesKt + convertTonnesToKt(volumeTonnes)) {
    return {
      error:
        "Estimated starting grain amount must cover current grain left to sell plus logged deliveries",
    };
  }

  const contractedKt = convertTonnesToKt(contractedTonnes);
  const volumeKt = convertTonnesToKt(volumeTonnes);
  const uncontractedKt = Math.max(0, volumeKt - contractedKt);

  const { error } = await supabase.from("crop_plans").upsert({
    user_id: user.id,
    crop_year: CURRENT_CROP_YEAR,
    grain,
    acres_seeded: acres,
    starting_grain_kt: convertTonnesToKt(startingTonnes),
    bushel_weight_lbs: bushelWeightLbs,
    inventory_unit_preference: inventory_unit,
    volume_left_to_sell_kt: volumeKt,
    contracted_kt: contractedKt,
    uncontracted_kt: uncontractedKt,
    updated_at: new Date().toISOString(),
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
    marketing_type: formData.get("marketing_type"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { grain, submission_id, amount_kt, date, destination, marketing_type } = parsed.data;
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
    .select("id, volume_left_to_sell_kt, contracted_kt, uncontracted_kt")
    .eq("user_id", user.id)
    .eq("crop_year", CURRENT_CROP_YEAR)
    .eq("grain", grain)
    .single();

  if (!plan) {
    return { error: "No crop plan for this grain" };
  }

  const remainingToSellKt = Number(plan.volume_left_to_sell_kt ?? 0);
  const contractedKt = Number(plan.contracted_kt ?? 0);
  const openKt = Number(plan.uncontracted_kt ?? Math.max(remainingToSellKt - contractedKt, 0));

  if (amount_kt > remainingToSellKt) {
    return { error: "Delivery amount cannot exceed grain left to sell" };
  }

  if (marketing_type === "contracted" && amount_kt > contractedKt) {
    return { error: "Contracted delivery amount cannot exceed remaining contracted tonnes" };
  }

  if (marketing_type === "open" && amount_kt > openKt) {
    return { error: "Open-market delivery amount cannot exceed remaining open tonnes" };
  }

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
      marketing_type,
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
