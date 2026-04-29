// lib/queries/predictive-market.ts
// Server-only query helper for the Predictive Market editorial brief.
//
// ── ISOLATION FENCE ─────────────────────────────────────────────────────
// This module reads from `predictive_market_briefs` only — the WRITE side
// of the read-from-many, write-to-one architecture used by the
// prediction-market-desk swarm. Do NOT extend this helper to write back
// into market_analysis, score_trajectory, or any internal-pipeline shape.
// The brief is editorial commentary on the divergence between the
// Kalshi crowd and our internal grain-desk stance — mixing it back into
// the desk's own write path would corrupt that divergence signal.
// ────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase/server";

/**
 * One Kalshi market's editorial take inside a brief. Stored as JSONB on
 * the brief row so the swarm can ship variable-length per-market arrays
 * without schema churn.
 */
export interface PredictiveMarketTake {
  /** The leaf Kalshi market ticker, e.g. "KXSOYBEANMON-26APR3017-T1166.99". */
  ticker: string;
  /** The parent series ticker, e.g. "KXSOYBEANMON". */
  series: string;
  /**
   * Editorial verdict for this market:
   *   - "agree":    crowd lines up with our internal stance
   *   - "disagree": crowd is paying for an outcome we lean against
   *   - "watch":    not enough data, or stance is neutral
   */
  stance: "agree" | "disagree" | "watch";
  /** Implied YES probability the crowd is paying for, in percent (0–100). */
  kalshi_yes_pct: number;
  /**
   * Our internal stance score (-100 = bearish, +100 = bullish) for the
   * CGC grain that maps to this Kalshi market. Null when we don't have a
   * stance for the underlying grain (e.g. fertilizer wildcard).
   */
  internal_score: number | null;
  /** One-line farmer-friendly comment. */
  comment: string;
}

/**
 * Frozen-at-write-time snapshot of a single Kalshi market. Mirrors the
 * subset of `KalshiMarket` fields the brief surface actually renders.
 * Stored as JSONB so we don't have to add a column every time we want
 * to surface a new field — the editorial surface owns the rendering.
 */
export interface PredictiveMarketSnapshotEntry {
  ticker: string;
  series: string;
  title: string;
  crop: string;
  cadence: string;
  yes_probability: number | null;
  volume: number;
  close_label: string | null;
}

/**
 * One row from `predictive_market_briefs`. Returned by the
 * `get_latest_predictive_market_brief()` RPC. All editorial fields
 * (headline, lede, bottom_line) are written by the Opus desk chief in
 * Fraunces-tonality, farmer-friendly copy.
 */
export interface PredictiveMarketBrief {
  id: string;
  /** ISO date (YYYY-MM-DD) — the Friday this brief covers. */
  week_ending: string;
  generated_at: string;
  /** Model identifier, e.g. "claude-opus-prediction-desk-v1". */
  model_source: string;
  headline: string;
  lede: string;
  bottom_line: string | null;
  per_market_takes: PredictiveMarketTake[];
  market_snapshot: PredictiveMarketSnapshotEntry[];
}

/**
 * Raw RPC row shape — Supabase numerics may come back as strings, and
 * JSONB columns may come back as already-parsed objects or as strings
 * depending on the driver path. We normalize in {@link normalizeBrief}.
 */
type LatestBriefRpcRow = {
  id: string;
  week_ending: string;
  generated_at: string;
  model_source: string;
  headline: string;
  lede: string;
  bottom_line: string | null;
  per_market_takes: PredictiveMarketTake[] | string | null;
  market_snapshot: PredictiveMarketSnapshotEntry[] | string | null;
};

function parseJsonbArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string" && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeBrief(row: LatestBriefRpcRow): PredictiveMarketBrief {
  return {
    id: String(row.id),
    week_ending: String(row.week_ending),
    generated_at: String(row.generated_at),
    model_source: String(row.model_source),
    headline: String(row.headline),
    lede: String(row.lede),
    bottom_line: row.bottom_line ?? null,
    per_market_takes: parseJsonbArray<PredictiveMarketTake>(row.per_market_takes),
    market_snapshot: parseJsonbArray<PredictiveMarketSnapshotEntry>(row.market_snapshot),
  };
}

/**
 * Fetch the most recently generated predictive-market brief.
 *
 * Returns null when:
 *   - The RPC returns zero rows (no brief written yet)
 *   - The RPC errors (network, schema, etc.) — caller renders an
 *     "early days" empty state in either case
 *
 * The generated Supabase types haven't picked up
 * `get_latest_predictive_market_brief` yet (defined in migration
 * 20260429100000_predictive_market_briefs.sql). Once the type generator
 * is re-run, this `as never` cast can be removed.
 */
export async function getLatestPredictiveMarketBrief(): Promise<PredictiveMarketBrief | null> {
  const supabase = await createClient();

  const { data, error } = await (supabase.rpc as unknown as (
    fn: string
  ) => {
    maybeSingle: () => Promise<{
      data: LatestBriefRpcRow | null;
      error: { message: string } | null;
    }>;
  })("get_latest_predictive_market_brief").maybeSingle();

  if (error) {
    console.error(
      "getLatestPredictiveMarketBrief error:",
      error.message
    );
    return null;
  }

  if (!data) return null;

  return normalizeBrief(data);
}
