#!/usr/bin/env npx tsx
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;
const IS_CLI = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

export interface DailyThesisReviewPacket {
  schema_version: "daily_thesis_review_packet_v1";
  built_at: string;
  source_freshness: JsonRecord[];
  price_rows: JsonRecord[];
  x_signal_input_audit: {
    scanned_rows: number;
    sealed_accepted_rows: number;
    rejected_rows: number;
    rejection_reason_counts: Record<string, number>;
  };
  accepted_x_signals: JsonRecord[];
  thesis_cache: JsonRecord[];
  current_anchors: {
    canada: JsonRecord[];
    us: JsonRecord[];
  };
  trajectory: {
    canada: JsonRecord[];
    us: JsonRecord[];
  };
  guardrails: {
    stance_delta_min: -3;
    stance_delta_max: 3;
    confidence_delta_min: -5;
    confidence_delta_max: 5;
    x_signals_are_watch_only: true;
    friday_thesis_tables_are_read_only: true;
  };
}

function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] ||= value;
    }
  } catch {
    // Env may already be supplied.
  }
}

export function createAdminClient(): SupabaseClient {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function safeSelect(
  supabase: SupabaseClient,
  table: string,
  select: string,
  order: { column: string; ascending?: boolean },
  limit: number,
): Promise<JsonRecord[]> {
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .order(order.column, { ascending: order.ascending ?? false })
    .limit(limit);
  if (error) {
    console.error(`${table} query skipped: ${error.message}`);
    return [];
  }
  return (data ?? []) as unknown as JsonRecord[];
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function textValue(row: JsonRecord, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value.trim() : "";
}

function stringArrayValue(row: JsonRecord, key: string): string[] {
  const value = row[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function hasCorroborationSeal(value: unknown): boolean {
  const record = asRecord(value);
  return (
    typeof record.same_claim_count === "number" &&
    Array.isArray(record.independent_sources) &&
    typeof record.official_source_match === "boolean"
  );
}

export function dailyThesisAcceptedXSignalSealRejectionReasons(signal: JsonRecord): string[] {
  const metadata = asRecord(signal.signal_metadata);
  const sourceTier = textValue(signal, "source_cred_tier") || textValue(metadata, "source_tier");
  const reasons: string[] = [];
  if (textValue(signal, "scout_run_id").length === 0) reasons.push("missing_scout_run_id");
  if (textValue(signal, "signal_hash").length === 0) reasons.push("missing_signal_hash");
  if (textValue(signal, "post_url").length === 0) reasons.push("missing_post_url");
  if (metadata.schema_version !== "x_signal_metadata_v1") reasons.push("missing_metadata_schema");
  if (sourceTier.length === 0) reasons.push("missing_source_tier");
  if (stringArrayValue(metadata, "allowed_claims").length === 0) reasons.push("missing_allowed_claims");
  if (!Array.isArray(metadata.blocked_claims)) reasons.push("missing_blocked_claims_array");
  if (typeof metadata.needs_official_verification !== "boolean") reasons.push("missing_needs_official_verification");
  if (!hasCorroborationSeal(metadata.corroboration)) reasons.push("missing_corroboration_seal");
  return reasons;
}

export function hasDailyThesisAcceptedXSignalSeal(signal: JsonRecord): boolean {
  return dailyThesisAcceptedXSignalSealRejectionReasons(signal).length === 0;
}

export function buildDailyThesisXSignalInputAudit(rows: JsonRecord[]): DailyThesisReviewPacket["x_signal_input_audit"] {
  const rejectionReasonCounts: Record<string, number> = {};
  let sealedRows = 0;
  let rejectedRows = 0;

  for (const row of rows) {
    const reasons = dailyThesisAcceptedXSignalSealRejectionReasons(row);
    if (reasons.length === 0) {
      sealedRows += 1;
      continue;
    }
    rejectedRows += 1;
    for (const reason of reasons) {
      rejectionReasonCounts[reason] = (rejectionReasonCounts[reason] ?? 0) + 1;
    }
  }

  return {
    scanned_rows: rows.length,
    sealed_accepted_rows: sealedRows,
    rejected_rows: rejectedRows,
    rejection_reason_counts: rejectionReasonCounts,
  };
}

export async function buildDailyThesisReviewPacket(
  supabase = createAdminClient(),
): Promise<DailyThesisReviewPacket> {
  const [
    sourceFreshness,
    priceRows,
    acceptedXSignals,
    thesisCache,
    canadaAnchors,
    usAnchors,
    canadaTrajectory,
    usTrajectory,
  ] = await Promise.all([
    safeSelect(supabase, "v_source_freshness", "*", { column: "source_name", ascending: true }, 80),
    safeSelect(supabase, "grain_prices", "*", { column: "price_date" }, 40),
    safeSelect(supabase, "x_market_signals", "*", { column: "created_at" }, 40),
    safeSelect(supabase, "thesis_packet_cache", "lane,item_name,crop_year,grain_week,market_year,packet_generated_at,source_run_watermark,refreshed_at", { column: "refreshed_at" }, 20),
    safeSelect(supabase, "market_analysis", "grain,crop_year,grain_week,stance_score,confidence_score,final_assessment,generated_at", { column: "generated_at" }, 20),
    safeSelect(supabase, "us_market_analysis", "market_name,crop_year,market_year,stance_score,confidence_score,recommendation,final_assessment,generated_at", { column: "generated_at" }, 20),
    safeSelect(supabase, "score_trajectory", "grain,crop_year,grain_week,scan_type,stance_score,conviction_pct,recommendation,recorded_at,evidence", { column: "recorded_at" }, 50),
    safeSelect(supabase, "us_score_trajectory", "market_name,crop_year,market_year,scan_type,stance_score,conviction_pct,recommendation,recorded_at,evidence", { column: "recorded_at" }, 50),
  ]);

  return {
    schema_version: "daily_thesis_review_packet_v1",
    built_at: new Date().toISOString(),
    source_freshness: sourceFreshness,
    price_rows: priceRows,
    x_signal_input_audit: buildDailyThesisXSignalInputAudit(acceptedXSignals),
    accepted_x_signals: acceptedXSignals.filter(hasDailyThesisAcceptedXSignalSeal),
    thesis_cache: thesisCache,
    current_anchors: {
      canada: canadaAnchors,
      us: usAnchors,
    },
    trajectory: {
      canada: canadaTrajectory,
      us: usTrajectory,
    },
    guardrails: {
      stance_delta_min: -3,
      stance_delta_max: 3,
      confidence_delta_min: -5,
      confidence_delta_max: 5,
      x_signals_are_watch_only: true,
      friday_thesis_tables_are_read_only: true,
    },
  };
}

if (IS_CLI) {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.error(`
Daily Thesis Review Packet

Usage:
  npm run daily-thesis-review:packet

Outputs a JSON packet containing source freshness, prices, accepted X signals, thesis cache anchors, and trajectory context.
`);
    process.exit(0);
  }

  buildDailyThesisReviewPacket()
    .then((packet) => {
      console.log(JSON.stringify(packet, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
