import { z } from "zod";

export const X_SCOUT_SCHEMA_VERSION = "grok_x_scout_v1";

export const xScoutModeSchema = z.enum(["daily_pulse", "friday_deep", "manual_test"]);
export const xSignalDirectionSchema = z.enum(["bullish", "bearish", "neutral"]);
export const xSignalCategorySchema = z.enum([
  "farmer_report",
  "analyst_commentary",
  "elevator_bid",
  "export_news",
  "weather",
  "policy",
  "basis",
  "logistics",
  "price",
  "other",
]);

function normalizeSignalCategory(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "planting_progress" || normalized === "crop_progress" || normalized === "seeding_progress") {
    return "farmer_report";
  }
  if (normalized === "market_commentary") return "analyst_commentary";
  if (normalized === "transport" || normalized === "rail") return "logistics";
  if (normalized === "government_policy") return "policy";
  return normalized;
}

function trimRawQuote(value: unknown): unknown {
  return typeof value === "string" ? value.slice(0, 280) : value;
}

export const xScoutSignalSchema = z.object({
  source_url: z.string().url().optional(),
  post_id: z.string().optional(),
  handle: z.string().min(1),
  posted_at: z.string().datetime(),
  raw_quote: z.preprocess(trimRawQuote, z.string().max(280).optional().default("")),
  summary: z.string().min(1).max(500),
  primary_grain: z.string().min(1),
  affected_grains: z.array(z.string()).default([]),
  affected_regions: z.array(z.string()).default([]),
  category: z.preprocess(normalizeSignalCategory, xSignalCategorySchema),
  direction: xSignalDirectionSchema,
  time_sensitivity: z.string().min(1),
  seasonal_phase: z.string().optional().default("unknown"),
  why_it_matters: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
  needs_official_verification: z.boolean().default(true),
  claimed_numbers: z
    .array(
      z.object({
        label: z.string().min(1),
        value: z.string().min(1),
        source_text: z.string().max(160),
      }),
    )
    .default([]),
});

export const xScoutOutputSchema = z.object({
  schema_version: z.literal(X_SCOUT_SCHEMA_VERSION),
  run_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: xScoutModeSchema,
  search_windows: z.array(
    z.object({
      label: z.string().min(1),
      from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  ),
  signals: z.array(xScoutSignalSchema).default([]),
  no_signal_notes: z.array(z.string()).default([]),
});

export type XScoutMode = z.infer<typeof xScoutModeSchema>;
export type XScoutSignal = z.infer<typeof xScoutSignalSchema>;
export type XScoutOutput = z.infer<typeof xScoutOutputSchema>;

export function extractGrokXScoutJsonPayload(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "schema_version" in parsed
  ) {
    return raw;
  }

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "text" in parsed &&
    typeof parsed.text === "string"
  ) {
    return parsed.text.trim();
  }

  return raw;
}

export function parseGrokXScoutJson(raw: string): XScoutOutput {
  const payload = extractGrokXScoutJsonPayload(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error("Grok X scout output was not valid JSON.");
  }

  const result = xScoutOutputSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Grok X scout output failed schema validation: ${result.error.message}`);
  }

  return result.data;
}
