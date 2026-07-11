/**
 * Desk swarm headless runner — shared contracts.
 *
 * Single source of truth for the grain/market lists, model labels, scan_type,
 * conflict keys, and the write-approval phrase used by the service-role desk CLI.
 * Mirrors the canonical DB write contracts verified against the live schema
 * (see docs/plans/2026-06-16-desk-swarm-headless-runner-implementation.md).
 */

export type DeskSide = "cad" | "us";

/** Canonical 16 CGC grain names (verified 2026-04-17). Wrong variants silently skip lookups. */
export const CAD_GRAINS = [
  "Amber Durum",
  "Barley",
  "Beans",
  "Canaryseed",
  "Canola",
  "Chick Peas",
  "Corn",
  "Flaxseed",
  "Lentils",
  "Mustard Seed",
  "Oats",
  "Peas",
  "Rye",
  "Soybeans",
  "Sunflower",
  "Wheat",
] as const;

/** The 4 US desk markets. */
export const US_MARKETS = ["Corn", "Soybeans", "Wheat", "Oats"] as const;

export type CadGrain = (typeof CAD_GRAINS)[number];
export type UsMarket = (typeof US_MARKETS)[number];

/** score_trajectory.scan_type for the Friday desk anchor row. */
export const WEEKLY_SCAN_TYPE = "weekly_debate" as const;

/** model_used (analysis) + model_source (trajectory) labels per side. */
export const CAD_DESK_MODEL = "claude-agent-desk-v1-opus" as const;
export const US_DESK_MODEL = "claude-agent-us-desk-v1-opus" as const;

/** UPSERT conflict targets (verified unique constraints). */
export const CAD_ANALYSIS_CONFLICT = "grain,crop_year,grain_week" as const;
export const US_ANALYSIS_CONFLICT = "market_name,crop_year,market_year" as const;

/** pipeline_runs.triggered_by — scheduled routine runs MUST use 'cron'. */
export const TRIGGERED_BY = "cron" as const;

/**
 * Human-approval phrase that gates real (non-dry-run) writes.
 * Mirrors the Track 54 human-approval discipline without coupling to the
 * Grok-specific assertTrack54WriteGate(). Supply via --approve or DESK_WRITE_APPROVAL.
 */
export const DESK_WRITE_APPROVAL_PHRASE =
  "I approve enabling the desk swarm headless writer after reviewing the dry-run." as const;

export function isDeskSide(value: string): value is DeskSide {
  return value === "cad" || value === "us";
}

export function assertDeskSide(value: string | undefined): DeskSide {
  if (!value || !isDeskSide(value)) {
    throw new Error(`--side must be "cad" or "us" (got: ${value ?? "<missing>"})`);
  }
  return value;
}

/** Analysis/trajectory model label for a side. */
export function deskModelFor(side: DeskSide): string {
  return side === "cad" ? CAD_DESK_MODEL : US_DESK_MODEL;
}

/** Default requested-market list for a side (pipeline_runs.grains_requested). */
export function marketListFor(side: DeskSide): string[] {
  return side === "cad" ? [...CAD_GRAINS] : [...US_MARKETS];
}
