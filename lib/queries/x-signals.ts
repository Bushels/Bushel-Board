import { createClient } from "@/lib/supabase/server";
import { deriveAffectedDecisionsFromClassifiers } from "@/lib/x-api/x-signal-validation";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface XSignalMetadata {
  schema_version?: string;
  grok_claim_type?: "observation" | "quote" | "interpretation" | "unsupported";
  staleness_class?: "same_day" | "fresh_72h" | "week_context" | "stale";
  source_tier?: "tier1" | "tier2" | "tier3" | "tier4" | "unlisted";
  corroboration?: {
    same_claim_count?: number;
    independent_sources?: string[];
    official_source_match?: boolean;
  };
  seasonal_phase?: string;
  impact_breakdown?: {
    supply?: number;
    demand?: number;
    price?: number;
    logistics?: number;
    policy?: number;
    confidence?: number;
  };
  affected_decisions?: string[];
  grok_summary?: string;
  codex_validation_notes?: string[];
  blocked_claims?: string[];
  allowed_claims?: string[];
  needs_official_verification?: boolean;
}

export interface XMarketSignal {
  id: string;
  grain: string;
  post_summary: string;
  post_url?: string | null;
  post_author: string | null;
  post_date: string | null;
  relevance_score: number;
  sentiment: string;
  category: string;
  confidence_score: number;
  search_query: string;
  searched_at?: string | null;
  source?: "x" | "web" | null;
  search_mode?: "pulse" | "deep" | null;
  scout_run_id?: string | null;
  source_cred_tier?: string | null;
  primary_impact_grain?: string | null;
  affected_grains?: string[];
  affected_regions?: string[];
  affected_decisions?: string[];
  seasonal_phase?: string | null;
  signal_metadata?: XSignalMetadata;
  signal_hash?: string | null;
}

export interface XSignalWithFeedback extends XMarketSignal {
  user_voted: boolean;
  user_relevant: boolean | null;
  blended_relevance: number;
  is_new: boolean;
}

export interface FeedStats {
  total_signals: number;
  voted_count: number;
  relevant_count: number;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asSignalMetadata(value: unknown): XSignalMetadata {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as XSignalMetadata)
    : {};
}

export function normalizeXMarketSignalRow(row: Record<string, unknown>): XMarketSignal {
  const signalMetadata = asSignalMetadata(row.signal_metadata);
  const seasonalPhase = typeof row.seasonal_phase === "string" ? row.seasonal_phase : null;
  const storedAffectedDecisions = asStringArray(row.affected_decisions);
  const metadataAffectedDecisions = asStringArray(signalMetadata.affected_decisions);
  return {
    id: String(row.id),
    grain: String(row.grain),
    post_summary: String(row.post_summary),
    post_url: typeof row.post_url === "string" ? row.post_url : null,
    post_author: typeof row.post_author === "string" ? row.post_author : null,
    post_date: typeof row.post_date === "string" ? row.post_date : null,
    relevance_score: Number(row.relevance_score ?? 0),
    sentiment: String(row.sentiment),
    category: String(row.category),
    confidence_score: Number(row.confidence_score ?? 0),
    search_query: String(row.search_query ?? ""),
    searched_at: typeof row.searched_at === "string" ? row.searched_at : null,
    source: (row.source as "x" | "web" | null | undefined) ?? null,
    search_mode: (row.search_mode as "pulse" | "deep" | null | undefined) ?? null,
    scout_run_id: typeof row.scout_run_id === "string" ? row.scout_run_id : null,
    source_cred_tier: typeof row.source_cred_tier === "string" ? row.source_cred_tier : null,
    primary_impact_grain:
      typeof row.primary_impact_grain === "string" ? row.primary_impact_grain : null,
    affected_grains: asStringArray(row.affected_grains),
    affected_regions: asStringArray(row.affected_regions),
    affected_decisions: storedAffectedDecisions.length
      ? storedAffectedDecisions
      : metadataAffectedDecisions.length
        ? metadataAffectedDecisions
        : deriveAffectedDecisionsFromClassifiers(
            String(row.category ?? "other"),
            String(row.sentiment ?? "neutral"),
            seasonalPhase ?? undefined,
          ),
    seasonal_phase: seasonalPhase,
    signal_metadata: signalMetadata,
    signal_hash: typeof row.signal_hash === "string" ? row.signal_hash : null,
  };
}

export async function getXSignalsForGrain(
  grainName: string,
  grainWeek?: number,
): Promise<XMarketSignal[]> {
  const supabase = await createClient();
  let query = supabase
    .from("x_market_signals")
    .select("*")
    .eq("grain", grainName)
    .eq("crop_year", CURRENT_CROP_YEAR)
    .gte("relevance_score", 60)
    .order("relevance_score", { ascending: false })
    .limit(20);

  if (grainWeek) {
    query = query.eq("grain_week", grainWeek);
  }

  const { data } = await query;
  return (data ?? []).map((row) => normalizeXMarketSignalRow(row as Record<string, unknown>));
}

/**
 * Get X signals for a grain with the current user's feedback status.
 * LEFT JOINs signal_feedback to show vote state on each card,
 * and LEFT JOINs v_signal_relevance_scores for blended relevance ordering.
 * Includes searched_at, source, search_mode, and is_new fields.
 */
export async function getXSignalsWithFeedback(
  supabase: SupabaseClient,
  grainName: string,
  grainWeek?: number,
  lastSeen?: string | null,
): Promise<XSignalWithFeedback[]> {
  const { data, error } = await supabase.rpc("get_signals_with_feedback", {
    p_grain: grainName,
    p_crop_year: CURRENT_CROP_YEAR,
    p_grain_week: grainWeek ?? null,
    p_last_seen: lastSeen ?? null,
  });

  if (error) {
    console.error("getXSignalsWithFeedback error:", error.message);
    const basic = await getXSignalsForGrain(grainName, grainWeek);
    return basic.map((signal) => ({
      ...signal,
      user_voted: false,
      user_relevant: null,
      blended_relevance: signal.relevance_score,
      is_new: false,
    }));
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...normalizeXMarketSignalRow(row),
    is_new: (row.is_new as boolean | undefined) ?? false,
    user_voted: row.user_voted as boolean,
    user_relevant: row.user_relevant as boolean | null,
    blended_relevance: row.blended_relevance as number,
  }));
}

/**
 * Get latest X signals across ALL grains for the overview signal tape.
 * No grain filter - returns the most recent high-relevance signals.
 */
export async function getLatestXSignals(
  limit = 20,
): Promise<XMarketSignal[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("x_market_signals")
    .select("*")
    .eq("crop_year", CURRENT_CROP_YEAR)
    .gte("relevance_score", 60)
    .order("searched_at", { ascending: false })
    .order("relevance_score", { ascending: false })
    .limit(limit);
  return (data ?? []).map((row) => normalizeXMarketSignalRow(row as Record<string, unknown>));
}

/**
 * Get user's feed stats for the "Your impact" summary bar.
 */
export async function getUserFeedStats(
  supabase: SupabaseClient,
  userId: string,
  cropYear: string,
  grainWeek: number,
): Promise<FeedStats> {
  const { data, error } = await supabase
    .from("signal_feedback")
    .select("relevant")
    .eq("user_id", userId)
    .eq("crop_year", cropYear)
    .eq("grain_week", grainWeek);

  if (error || !data) {
    return { total_signals: 0, voted_count: 0, relevant_count: 0 };
  }

  return {
    total_signals: 0,
    voted_count: data.length,
    relevant_count: data.filter((row) => row.relevant).length,
  };
}
