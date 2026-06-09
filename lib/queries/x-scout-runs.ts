import { createClient } from "@/lib/supabase/server";
import { deriveAffectedDecisionsFromClassifiers } from "@/lib/x-api/x-signal-validation";
import type { SupabaseClient } from "@supabase/supabase-js";

export type XScoutMode = "daily_pulse" | "friday_deep" | "manual_test";
export type XScoutRunner = "grok_cli" | "xai_api" | "x_api_direct" | "manual";
export type XScoutStatus = "started" | "success" | "partial" | "failed" | "rejected";
export type PriceSnapshotStatus = "not_checked" | "fresh" | "stale" | "missing" | "partial";

export interface XSignalCorroborationSummary {
  sameClaimCount: number;
  independentSources: string[];
  officialSourceMatch: boolean;
}

export interface XScoutRunSummary {
  id: string;
  runDate: string;
  runStartedAt: string;
  runFinishedAt: string | null;
  mode: XScoutMode;
  runner: XScoutRunner;
  status: XScoutStatus;
  promptVersion: string;
  artifactPath: string | null;
  artifactSha256: string | null;
  rawSignalCount: number;
  acceptedSignalCount: number;
  rejectedSignalCount: number;
  priceSnapshotRequired: boolean;
  priceSnapshotStatus: PriceSnapshotStatus;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
  rejectionReasons: string[];
}

export interface XPulseSignalSummary {
  id: string;
  grain: string;
  postSummary: string;
  postUrl: string | null;
  postAuthor: string | null;
  postDate: string | null;
  sentiment: "bullish" | "bearish" | "neutral";
  category: string;
  relevanceScore: number;
  confidenceScore: number;
  sourceCredTier: string | null;
  primaryImpactGrain: string | null;
  affectedGrains: string[];
  affectedRegions: string[];
  affectedDecisions: string[];
  seasonalPhase: string | null;
  stalenessClass: string | null;
  needsOfficialVerification: boolean;
  corroboration: XSignalCorroborationSummary;
  signalMetadata: Record<string, unknown>;
}

export interface XPulseWatchSummary {
  latestRun: XScoutRunSummary | null;
  topSignals: XPulseSignalSummary[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function uniqueStringArray(value: unknown): string[] {
  return [...new Set(asStringArray(value))].sort();
}

function asNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizeCorroboration(value: unknown): XSignalCorroborationSummary {
  const record = asRecord(value);
  return {
    sameClaimCount: asNumber(record.same_claim_count),
    independentSources: asStringArray(record.independent_sources),
    officialSourceMatch: record.official_source_match === true,
  };
}

export function normalizeXScoutRunRow(row: Record<string, unknown>): XScoutRunSummary {
  const metadata = asRecord(row.metadata);
  return {
    id: String(row.id),
    runDate: String(row.run_date),
    runStartedAt: String(row.run_started_at),
    runFinishedAt: typeof row.run_finished_at === "string" ? row.run_finished_at : null,
    mode: row.mode as XScoutMode,
    runner: row.runner as XScoutRunner,
    status: row.status as XScoutStatus,
    promptVersion: String(row.prompt_version),
    artifactPath: typeof row.artifact_path === "string" ? row.artifact_path : null,
    artifactSha256: typeof row.artifact_sha256 === "string" ? row.artifact_sha256 : null,
    rawSignalCount: Number(row.raw_signal_count ?? 0),
    acceptedSignalCount: Number(row.accepted_signal_count ?? 0),
    rejectedSignalCount: Number(row.rejected_signal_count ?? 0),
    priceSnapshotRequired: row.price_snapshot_required !== false,
    priceSnapshotStatus: (row.price_snapshot_status ?? "not_checked") as PriceSnapshotStatus,
    errorMessage: typeof row.error_message === "string" ? row.error_message : null,
    metadata,
    rejectionReasons: uniqueStringArray(metadata.rejection_reasons),
  };
}

export function normalizeXPulseSignalRow(row: Record<string, unknown>): XPulseSignalSummary {
  const signalMetadata = asRecord(row.signal_metadata);
  const seasonalPhase = typeof row.seasonal_phase === "string" ? row.seasonal_phase : null;
  const storedAffectedDecisions = asStringArray(row.affected_decisions);
  const metadataAffectedDecisions = asStringArray(signalMetadata.affected_decisions);
  return {
    id: String(row.id),
    grain: String(row.grain),
    postSummary: String(row.post_summary),
    postUrl: typeof row.post_url === "string" ? row.post_url : null,
    postAuthor: typeof row.post_author === "string" ? row.post_author : null,
    postDate: typeof row.post_date === "string" ? row.post_date : null,
    sentiment: row.sentiment as "bullish" | "bearish" | "neutral",
    category: String(row.category),
    relevanceScore: Number(row.relevance_score ?? 0),
    confidenceScore: Number(row.confidence_score ?? 0),
    sourceCredTier: typeof row.source_cred_tier === "string" ? row.source_cred_tier : null,
    primaryImpactGrain:
      typeof row.primary_impact_grain === "string" ? row.primary_impact_grain : null,
    affectedGrains: asStringArray(row.affected_grains),
    affectedRegions: asStringArray(row.affected_regions),
    affectedDecisions: storedAffectedDecisions.length
      ? storedAffectedDecisions
      : metadataAffectedDecisions.length
        ? metadataAffectedDecisions
        : deriveAffectedDecisionsFromClassifiers(
            String(row.category ?? "other"),
            String(row.sentiment ?? "neutral"),
            seasonalPhase ?? undefined,
          ),
    seasonalPhase,
    stalenessClass:
      typeof signalMetadata.staleness_class === "string" ? signalMetadata.staleness_class : null,
    needsOfficialVerification: asBoolean(signalMetadata.needs_official_verification),
    corroboration: normalizeCorroboration(signalMetadata.corroboration),
    signalMetadata,
  };
}

async function getClient(client?: SupabaseClient): Promise<SupabaseClient> {
  return client ?? (await createClient());
}

function isMissingXPulseSchema(message: string): boolean {
  return (
    message.includes('relation "public.x_scout_runs" does not exist') ||
    message.includes("column x_market_signals.source_cred_tier does not exist") ||
    message.includes("column x_market_signals.scout_run_id does not exist")
  );
}

function logXPulseQueryFallback(label: string, message: string): void {
  if (isMissingXPulseSchema(message)) {
    console.warn(`${label} skipped until Track 54 migrations are applied.`);
    return;
  }
  console.error(`${label} error:`, message);
}

export async function getLatestXScoutRun(
  client?: SupabaseClient,
): Promise<XScoutRunSummary | null> {
  const supabase = await getClient(client);
  const { data, error } = await supabase
    .from("x_scout_runs")
    .select("*")
    .order("run_started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logXPulseQueryFallback("getLatestXScoutRun", error.message);
    return null;
  }

  return data ? normalizeXScoutRunRow(data as Record<string, unknown>) : null;
}

export async function getLatestXPulseSignals(
  limit = 5,
  client?: SupabaseClient,
): Promise<XPulseSignalSummary[]> {
  const supabase = await getClient(client);
  const { data, error } = await supabase
    .from("x_market_signals")
    .select(
      "id,grain,post_summary,post_url,post_author,post_date,sentiment,category,relevance_score,confidence_score,source_cred_tier,primary_impact_grain,affected_grains,affected_regions,affected_decisions,seasonal_phase,signal_metadata",
    )
    .not("scout_run_id", "is", null)
    .order("post_date", { ascending: false, nullsFirst: false })
    .order("relevance_score", { ascending: false })
    .limit(limit);

  if (error) {
    logXPulseQueryFallback("getLatestXPulseSignals", error.message);
    return [];
  }

  return (data ?? []).map((row) => normalizeXPulseSignalRow(row as Record<string, unknown>));
}

export async function getXPulseWatchSummary(
  client?: SupabaseClient,
): Promise<XPulseWatchSummary> {
  const [latestRun, topSignals] = await Promise.all([
    getLatestXScoutRun(client),
    getLatestXPulseSignals(5, client),
  ]);

  return { latestRun, topSignals };
}
