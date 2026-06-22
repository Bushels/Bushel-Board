import { NextRequest } from "next/server";
import { z } from "zod";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const conditionSchema = z.enum([
  "normal",
  "too_wet",
  "standing_water",
  "access_blocked",
  "dry_topsoil",
  "drought_stress",
]);

const requestSchema = z.object({
  condition: conditionSchema,
  location: z.string().trim().min(2).max(140),
  crop: z.string().trim().max(80).optional().default(""),
  note: z.string().trim().max(600).optional().default(""),
  eventLabel: z.string().trim().max(180),
  eventStart: z.string().trim().max(40),
  eventEnd: z.string().trim().max(40),
  website: z.string().trim().max(120).optional().default(""),
});

const CONDITION_DETAILS: Record<
  z.infer<typeof conditionSchema>,
  {
    label: string;
    moistureAxis: "normal" | "wet" | "dry";
    feedbackType: "praise" | "correction";
    severity: "low" | "medium" | "high";
  }
> = {
  normal: {
    label: "Normal",
    moistureAxis: "normal",
    feedbackType: "praise",
    severity: "low",
  },
  too_wet: {
    label: "Too wet",
    moistureAxis: "wet",
    feedbackType: "correction",
    severity: "medium",
  },
  standing_water: {
    label: "Standing water",
    moistureAxis: "wet",
    feedbackType: "correction",
    severity: "high",
  },
  access_blocked: {
    label: "Access blocked",
    moistureAxis: "wet",
    feedbackType: "correction",
    severity: "high",
  },
  dry_topsoil: {
    label: "Dry topsoil",
    moistureAxis: "dry",
    feedbackType: "correction",
    severity: "medium",
  },
  drought_stress: {
    label: "Drought stress",
    moistureAxis: "dry",
    feedbackType: "correction",
    severity: "high",
  },
};

async function getOptionalUserId(): Promise<string | null> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Check the field report details and try again." }, { status: 400 });
  }

  const report = parsed.data;

  // Honeypot: real users never fill this hidden field. Return success to avoid
  // teaching bots which field tripped the filter.
  if (report.website) {
    return Response.json({ ok: true });
  }

  const details = CONDITION_DETAILS[report.condition];
  const userId = await getOptionalUserId();
  const message = [
    `Environmental moisture field report: ${details.label}`,
    `Location: ${report.location}`,
    report.crop ? `Crop: ${report.crop}` : null,
    report.note ? `Note: ${report.note}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const context = [
    "environmental_moisture_report_v0.1",
    "source=public_form",
    `event=${report.eventLabel}`,
    `start=${report.eventStart}`,
    `end=${report.eventEnd}`,
    `condition=${report.condition}`,
    `moisture_axis=${details.moistureAxis}`,
    "review_status=unreviewed",
  ].join("|");

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("feedback_log").insert({
      user_id: userId,
      feedback_type: details.feedbackType,
      farmer_message: message,
      bushy_context: context,
      severity: details.severity,
      user_role: userId ? "farmer" : "public",
    });

    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Environmental field report save error:", error);
    return Response.json({ error: "Field report was not saved." }, { status: 500 });
  }
}
