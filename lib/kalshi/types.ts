// lib/kalshi/types.ts
// Shared Kalshi types — safe to import from client or server modules.
// The Kalshi public API returns numeric fields as strings; we normalize
// them to numbers in the client and surface the cleaned shape here.
//
// ── ISOLATION FENCE ─────────────────────────────────────────────────────
// These types belong to the Kalshi prediction-market feature only.
// Do NOT extend them with fields from market_analysis, score_trajectory,
// CGC observations, or any other internal-pipeline shape. If you need to
// join Kalshi YES probabilities with internal stance data, build a new
// composition type in the consuming component — keep this file
// Kalshi-only.
// ────────────────────────────────────────────────────────────────────────

export type KalshiCrop = "CORN" | "SOY" | "WHEAT" | "OTHER";

export interface KalshiMarket {
  ticker: string;
  eventTicker: string | null;
  seriesTicker: string;
  title: string;
  subtitle: string | null;
  crop: KalshiCrop;
  status: string;
  yesBid: number | null;
  yesAsk: number | null;
  lastPrice: number | null;
  yesProbability: number | null;
  volume: number;
  openInterest: number;
  closeTime: string | null;
  closeLabel: string;
}

export interface KalshiSeriesSpec {
  seriesTicker: string;
  crop: KalshiCrop;
}

export interface KalshiRawMarket {
  ticker?: string;
  event_ticker?: string;
  title?: string;
  subtitle?: string;
  yes_sub_title?: string;
  status?: string;
  yes_bid_dollars?: string | number | null;
  yes_ask_dollars?: string | number | null;
  last_price_dollars?: string | number | null;
  volume_fp?: string | number | null;
  volume?: string | number | null;
  open_interest_fp?: string | number | null;
  open_interest?: string | number | null;
  close_time?: string | null;
}
