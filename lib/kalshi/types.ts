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

export type KalshiCrop = "CORN" | "SOY" | "WHEAT" | "FERT" | "OTHER";

// "monthly" + "weekly" map to the two grain-price binary contract cadences;
// "wildcard" is for non-cadenced grain-adjacent series like fertilizer that
// don't fit either bucket. The marketplace strip uses this to group cards
// into editorial rows.
export type KalshiCadence = "monthly" | "weekly" | "wildcard";

export interface KalshiMarket {
  ticker: string;
  eventTicker: string | null;
  seriesTicker: string;
  title: string;
  subtitle: string | null;
  crop: KalshiCrop;
  cadence: KalshiCadence;
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
  cadence: KalshiCadence;
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

/**
 * Single point on the YES-probability time series. We store the close of
 * the period as the headline value (matches what traders mean by "the
 * price at 11:42") and keep volume for the optional liquidity overlay.
 */
export interface KalshiCandle {
  /** Period end timestamp in seconds since epoch. */
  endTs: number;
  /** YES bid close, in dollars (probability ∈ [0, 1]). */
  yesBidClose: number | null;
  /** YES ask close, in dollars. */
  yesAskClose: number | null;
  /** Volume traded in this period, fixed-point. */
  volume: number;
  /** Open interest at end of period. */
  openInterest: number;
}

export interface KalshiRawCandle {
  end_period_ts?: number;
  yes_bid?: {
    close_dollars?: string | number | null;
    high_dollars?: string | number | null;
    low_dollars?: string | number | null;
    open_dollars?: string | number | null;
  };
  yes_ask?: {
    close_dollars?: string | number | null;
    high_dollars?: string | number | null;
    low_dollars?: string | number | null;
    open_dollars?: string | number | null;
  };
  price?: {
    previous_dollars?: string | number | null;
  };
  volume_fp?: string | number | null;
  open_interest_fp?: string | number | null;
}

/**
 * A single trade print on the live tape. We collapse Kalshi's YES/NO
 * representation into a single signed-probability value: when the taker
 * hit YES, we use yes_price; when they hit NO, we use 1 - no_price (the
 * implied YES price). Either way, the displayed number is "what was YES
 * worth at the moment this trade printed".
 */
export interface KalshiTrade {
  ticker: string;
  /** ISO timestamp the trade was created. */
  createdTime: string;
  /** Implied YES price in dollars (probability ∈ [0, 1]). */
  yesPrice: number;
  /** Which side hit the book — "yes" or "no". */
  takerSide: "yes" | "no";
  /** Number of contracts traded. */
  count: number;
}

export interface KalshiRawTrade {
  trade_id?: string;
  ticker?: string;
  created_time?: string;
  yes_price_dollars?: string | number | null;
  no_price_dollars?: string | number | null;
  taker_side?: string;
  count_fp?: string | number | null;
}

/**
 * Bundle of richer per-market data fetched only for the spotlight market
 * (we don't pay this cost for the 6 dense-row markets — the per-render
 * fan-out would blow the rate limit).
 */
export interface KalshiSpotlightExtras {
  candles: KalshiCandle[];
  trades: KalshiTrade[];
}
