import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

export type DailyThesisUpdateSide = "canada" | "us";

export interface DailyThesisUpdateCorroboration {
  sameClaimCount: number;
  independentSources: string[];
  officialSourceMatch: boolean;
}

export interface DailyThesisUpdateSummary {
  side: DailyThesisUpdateSide;
  market: string;
  cropYear: string | null;
  grainWeek: number | null;
  marketYear: number | null;
  recordedAt: string | null;
  stanceScore: number;
  confidenceScore: number | null;
  recommendation: string | null;
  trigger: string | null;
  modelSource: string | null;
  signalNote: string | null;
  reasoning: string | null;
  stanceDelta: number | null;
  confidenceDelta: number | null;
  priorStance: number | null;
  priorConfidence: number | null;
  newStance: number | null;
  newConfidence: number | null;
  sourcePostUrl: string | null;
  sourceScoutRunId: string | null;
  affectedDecisions: string[];
  allowedClaims: string[];
  blockedClaims: string[];
  needsOfficialVerification: boolean;
  corroboration: DailyThesisUpdateCorroboration;
}

const DAILY_PULSE_SCAN_TYPE = "opus_review_daily_pulse";

async function getClient(client?: SupabaseClient): Promise<SupabaseClient> {
  if (client) return client;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createAdminClient();
  }
  return createClient();
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function parseEvidence(value: unknown): JsonRecord {
  if (typeof value === "string" && value.trim()) {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return asRecord(value);
}

function textValue(row: JsonRecord, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(row: JsonRecord, key: string): number | null {
  const value = row[key];
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanValue(row: JsonRecord, key: string): boolean {
  return row[key] === true;
}

function stringArrayValue(row: JsonRecord, key: string): string[] {
  const value = row[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeCorroboration(value: unknown): DailyThesisUpdateCorroboration {
  const record = asRecord(value);
  return {
    sameClaimCount: numberValue(record, "same_claim_count") ?? 0,
    independentSources: stringArrayValue(record, "independent_sources"),
    officialSourceMatch: booleanValue(record, "official_source_match"),
  };
}

function normalizeDailyThesisUpdateRow(
  side: DailyThesisUpdateSide,
  row: JsonRecord,
): DailyThesisUpdateSummary {
  const evidence = parseEvidence(row.evidence);
  return {
    side,
    market: side === "canada" ? textValue(row, "grain") ?? "unknown" : textValue(row, "market_name") ?? "unknown",
    cropYear: textValue(row, "crop_year"),
    grainWeek: numberValue(row, "grain_week"),
    marketYear: numberValue(row, "market_year"),
    recordedAt: textValue(row, "recorded_at"),
    stanceScore: numberValue(row, "stance_score") ?? 0,
    confidenceScore: numberValue(row, "conviction_pct"),
    recommendation: textValue(row, "recommendation"),
    trigger: textValue(row, "trigger"),
    modelSource: textValue(row, "model_source"),
    signalNote: textValue(evidence, "signal_note"),
    reasoning: textValue(evidence, "reasoning"),
    stanceDelta: numberValue(evidence, "stance_delta_applied"),
    confidenceDelta: numberValue(evidence, "confidence_delta_applied"),
    priorStance: numberValue(evidence, "prior_stance"),
    priorConfidence: numberValue(evidence, "prior_confidence"),
    newStance: numberValue(evidence, "new_stance"),
    newConfidence: numberValue(evidence, "new_confidence"),
    sourcePostUrl: textValue(evidence, "x_post_url"),
    sourceScoutRunId: textValue(evidence, "x_scout_run_id"),
    affectedDecisions: stringArrayValue(evidence, "x_affected_decisions"),
    allowedClaims: stringArrayValue(evidence, "x_allowed_claims"),
    blockedClaims: stringArrayValue(evidence, "x_blocked_claims"),
    needsOfficialVerification: booleanValue(evidence, "x_needs_official_verification"),
    corroboration: normalizeCorroboration(evidence.x_corroboration),
  };
}

async function loadCanadaDailyUpdates(
  supabase: SupabaseClient,
  limit: number,
): Promise<DailyThesisUpdateSummary[]> {
  const { data, error } = await supabase
    .from("score_trajectory")
    .select(
      "grain,crop_year,grain_week,scan_type,stance_score,conviction_pct,recommendation,recorded_at,trigger,evidence,model_source",
    )
    .eq("scan_type", DAILY_PULSE_SCAN_TYPE)
    .order("recorded_at", { ascending: false })
    .limit(limit);

  if (error || !Array.isArray(data)) {
    if (error) console.error("loadCanadaDailyUpdates error:", error.message);
    return [];
  }
  return data.map((row) => normalizeDailyThesisUpdateRow("canada", row as JsonRecord));
}

async function loadUsDailyUpdates(
  supabase: SupabaseClient,
  limit: number,
): Promise<DailyThesisUpdateSummary[]> {
  const { data, error } = await supabase
    .from("us_score_trajectory")
    .select(
      "market_name,crop_year,market_year,scan_type,stance_score,conviction_pct,recommendation,recorded_at,trigger,evidence,model_source",
    )
    .eq("scan_type", DAILY_PULSE_SCAN_TYPE)
    .order("recorded_at", { ascending: false })
    .limit(limit);

  if (error || !Array.isArray(data)) {
    if (error) console.error("loadUsDailyUpdates error:", error.message);
    return [];
  }
  return data.map((row) => normalizeDailyThesisUpdateRow("us", row as JsonRecord));
}

export function normalizeDailyThesisUpdateForTest(
  side: DailyThesisUpdateSide,
  row: JsonRecord,
): DailyThesisUpdateSummary {
  return normalizeDailyThesisUpdateRow(side, row);
}

export async function getLatestDailyThesisUpdates(
  limit = 4,
  client?: SupabaseClient,
): Promise<DailyThesisUpdateSummary[]> {
  const supabase = await getClient(client);
  const boundedLimit = Math.max(1, Math.min(20, limit));
  const [canada, us] = await Promise.all([
    loadCanadaDailyUpdates(supabase, boundedLimit),
    loadUsDailyUpdates(supabase, boundedLimit),
  ]);

  return [...canada, ...us]
    .sort((left, right) => {
      const leftTime = left.recordedAt ? new Date(left.recordedAt).getTime() : 0;
      const rightTime = right.recordedAt ? new Date(right.recordedAt).getTime() : 0;
      return rightTime - leftTime;
    })
    .slice(0, boundedLimit);
}
