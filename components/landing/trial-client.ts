"use client";

// Client-side twin of trial-actions.ts. Bypasses the Next.js server-action
// machinery (which re-renders the entire RSC tree on every submission) and
// talks to Supabase directly from the browser using the anon key. The RPCs
// `submit_bio_trial_signup` and `get_bio_trial_acres` are security-definer
// functions intended for public callers.

import { createClient } from "@/lib/supabase/client";
import { z } from "zod";

const trialPayloadSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  farm_name: z.string().min(1, "Farm name is required").max(160),
  email: z.string().email("Valid email is required").max(180),
  phone: z.string().max(40).optional().default(""),
  province_state: z.string().min(1, "Province or state is required").max(80),
  rm_county: z.string().max(120).optional().default(""),
  crops: z.array(z.string().max(60)).min(1, "Pick at least one crop").max(16),
  crops_other: z.string().max(120).optional().default(""),
  acres: z.coerce.number().int().min(1, "Acres must be at least 1").max(999_999),
  logistics_method: z.enum(["pickup_fob_calgary", "ship"], {
    message: "Choose pickup or shipping",
  }),
  delivery_street: z.string().max(200).optional().default(""),
  delivery_city: z.string().max(120).optional().default(""),
  delivery_postal: z.string().max(20).optional().default(""),
}).superRefine((data, ctx) => {
  if (data.logistics_method === "ship") {
    if (!data.delivery_street) ctx.addIssue({ code: "custom", message: "Delivery street is required for shipping", path: ["delivery_street"] });
    if (!data.delivery_city) ctx.addIssue({ code: "custom", message: "Delivery city is required for shipping", path: ["delivery_city"] });
    if (!data.delivery_postal) ctx.addIssue({ code: "custom", message: "Delivery postal code is required for shipping", path: ["delivery_postal"] });
  }
});

export type TrialSubmitResult =
  | { success: true; newTotal: number }
  | { success: false; error: string };

export async function submitTrialSignupClient(input: unknown): Promise<TrialSubmitResult> {
  const parsed = trialPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc("submit_bio_trial_signup", {
    payload: { ...parsed.data, source: "landing_page" },
  });

  if (error) {
    console.error("[trial-client] submit_bio_trial_signup failed:", error);
    return { success: false, error: "Something went wrong saving your signup. Please try again, or email info@buperac.com." };
  }

  const newTotal = Number.parseInt(String(data ?? "0"), 10) || 0;
  return { success: true, newTotal };
}

export async function getEnrolledAcresClient(): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_bio_trial_acres");
  if (error) {
    console.warn("[trial-client] get_bio_trial_acres failed:", error);
    return 0;
  }
  return Number.parseInt(String(data ?? "0"), 10) || 0;
}
