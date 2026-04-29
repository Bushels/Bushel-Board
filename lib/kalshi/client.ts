// lib/kalshi/client.ts
// Server-only Kalshi public API client. Read-only — no auth required.
// Caches results in-memory for 5 minutes to avoid hammering Kalshi on every
// /overview render. Returns [] on any failure (graceful degradation; the
// marketplace strip falls back to a static snapshot if we return nothing).
//
// ── ISOLATION FENCE ─────────────────────────────────────────────────────
// This module is a self-contained Kalshi prediction-market client. It is
// intentionally decoupled from:
//   • the bull/bear grain desk pipeline (market_analysis, score_trajectory,
//     grain-desk swarm, US desk, etc.)
//   • the CGC import / weekly grain monitor pipeline
//   • Supabase / Hermes / any internal data store
// Kalshi data lives only on the Marketplace strip on /overview. Do NOT
// import this client from grain-desk code paths, swarm prompts, or
// stance-score writers — the Kalshi YES/NO probabilities are crowd-funded
// price-prediction signals and are NOT the same thing as our internal
// supply/demand stance scores. Keep them visually and structurally
// separate until a deliberate, designed integration is approved.
// ────────────────────────────────────────────────────────────────────────

import type {
  KalshiCandle,
  KalshiMarket,
  KalshiRawCandle,
  KalshiRawMarket,
  KalshiRawTrade,
  KalshiSeriesSpec,
  KalshiTrade,
} from "./types";

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const USER_AGENT = "BushelBoard/1.0 (+https://bushelboard.com)";
const CACHE_TTL_MS = 5 * 60 * 1000;

// Tunable list of Kalshi grain-related markets to surface on the
// Marketplace strip. Verified comprehensive 2026-04-28 — Kalshi's
// commodity grain universe is exactly these 6 binary price contracts
// (corn / soy / wheat × weekly / monthly). KXFERT (fertilizer) is added
// as a single non-cadenced wildcard for input-cost relevance to farmers.
//
// Order matters: the marketplace strip groups by `cadence` and renders
// each group in its own row, preserving the order within each cadence.
export const FEATURED_KALSHI_TICKERS: KalshiSeriesSpec[] = [
  // Monthly contracts — primary row
  { seriesTicker: "KXCORNMON", crop: "CORN", cadence: "monthly" },
  { seriesTicker: "KXSOYBEANMON", crop: "SOY", cadence: "monthly" },
  { seriesTicker: "KXWHEATMON", crop: "WHEAT", cadence: "monthly" },
  // Input-cost wildcard — sits with the monthly row since it's a
  // year-end resolution (slow-moving, big-picture).
  { seriesTicker: "KXFERT", crop: "FERT", cadence: "wildcard" },
  // Weekly contracts — secondary row
  { seriesTicker: "KXCORNW", crop: "CORN", cadence: "weekly" },
  { seriesTicker: "KXSOYBEANW", crop: "SOY", cadence: "weekly" },
  { seriesTicker: "KXWHEATW", crop: "WHEAT", cadence: "weekly" },
];

interface CacheEntry {
  expiresAt: number;
  data: KalshiMarket[];
}

const cache = new Map<string, CacheEntry>();

function cacheKey(specs: KalshiSeriesSpec[]): string {
  return specs
    .map((s) => `${s.seriesTicker}:${s.crop}:${s.cadence}`)
    .join("|");
}

/** Read internal cache. Exposed for tests. */
export function __getKalshiCacheForTests(): Map<string, CacheEntry> {
  return cache;
}

/** Clear cache between tests. */
export function __clearKalshiCacheForTests(): void {
  cache.clear();
}

/** Coerce a Kalshi numeric-string field into a number, or null when absent. */
export function parseKalshiNumber(
  value: string | number | null | undefined,
): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Format an ISO close_time into a short, human-friendly label. */
export function formatCloseLabel(isoTime: string | null | undefined): string {
  if (!isoTime) return "TBD";
  const d = new Date(isoTime);
  if (Number.isNaN(d.getTime())) return "TBD";
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = d.getUTCDate();
  return `${month} ${day}`;
}

/** Format a fixed-point volume number into a compact display string. */
export function formatVolume(volume: number): string {
  if (!Number.isFinite(volume) || volume <= 0) return "—";
  if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}m`;
  if (volume >= 1_000) return `$${(volume / 1_000).toFixed(1)}k`;
  return `$${Math.round(volume)}`;
}

/**
 * Pick the best YES probability signal from a market. We prefer the latest
 * traded price; if that's missing or zero, fall back to the mid of the
 * bid/ask, then to the bid alone. Returns a value in [0, 1] or null.
 */
export function deriveYesProbability(
  lastPrice: number | null,
  yesBid: number | null,
  yesAsk: number | null,
): number | null {
  if (lastPrice != null && lastPrice > 0 && lastPrice <= 1) return lastPrice;
  if (yesBid != null && yesAsk != null) {
    const mid = (yesBid + yesAsk) / 2;
    if (mid > 0 && mid <= 1) return mid;
  }
  if (yesBid != null && yesBid > 0 && yesBid <= 1) return yesBid;
  return null;
}

/**
 * KXFERT markets all share the same generic title ("How high will the
 * price of fertilizer get this year?") and only differ by strike level
 * embedded in the ticker (e.g., KXFERT-26-1200 = $1,200 strike). Build
 * a more useful headline from the ticker.
 *
 * Returns the original title unchanged for any non-KXFERT ticker.
 */
export function deriveDisplayTitle(
  rawTitle: string,
  ticker: string,
  seriesTicker: string,
): string {
  if (seriesTicker !== "KXFERT") return rawTitle;
  // KXFERT-{YY}-{strike} → e.g., KXFERT-26-1200 → 1200
  const m = ticker.match(/^KXFERT-\d{2}-(\d+)$/);
  if (!m) return rawTitle;
  const strike = Number(m[1]);
  if (!Number.isFinite(strike) || strike <= 0) return rawTitle;
  return `Will fertilizer reach $${strike}/ton this year?`;
}

/**
 * Normalize one raw Kalshi market response into our display shape.
 * Returns null if the row is missing required identifiers.
 */
export function normalizeKalshiMarket(
  raw: KalshiRawMarket,
  spec: KalshiSeriesSpec,
): KalshiMarket | null {
  if (!raw?.ticker || !raw?.title) return null;

  const yesBid = parseKalshiNumber(raw.yes_bid_dollars);
  const yesAsk = parseKalshiNumber(raw.yes_ask_dollars);
  const lastPrice = parseKalshiNumber(raw.last_price_dollars);
  const volume =
    parseKalshiNumber(raw.volume_fp) ?? parseKalshiNumber(raw.volume) ?? 0;
  const openInterest =
    parseKalshiNumber(raw.open_interest_fp) ??
    parseKalshiNumber(raw.open_interest) ??
    0;

  return {
    ticker: raw.ticker,
    eventTicker: raw.event_ticker ?? null,
    seriesTicker: spec.seriesTicker,
    title: deriveDisplayTitle(raw.title, raw.ticker, spec.seriesTicker),
    subtitle: raw.subtitle ?? raw.yes_sub_title ?? null,
    crop: spec.crop,
    cadence: spec.cadence,
    status: raw.status ?? "unknown",
    yesBid,
    yesAsk,
    lastPrice,
    yesProbability: deriveYesProbability(lastPrice, yesBid, yesAsk),
    volume,
    openInterest,
    closeTime: raw.close_time ?? null,
    closeLabel: formatCloseLabel(raw.close_time),
  };
}

/** Default backoff for the 429/5xx single retry. Exposed for tests to override. */
export const KALSHI_RETRY_DELAY_MS = 750;

/**
 * Fetch one series, returning the most-traded open market (by volume).
 * Returns null on any error or empty response. Retries once on 429/5xx
 * after a short backoff — Kalshi rate-limits aggressive parallel fan-out
 * and this saves us when 7 specs go out at the same time.
 */
export async function fetchTopMarketForSeries(
  spec: KalshiSeriesSpec,
  fetchImpl: typeof fetch = fetch,
  retryDelayMs: number = KALSHI_RETRY_DELAY_MS,
): Promise<KalshiMarket | null> {
  const url = `${KALSHI_BASE}/markets?series_ticker=${encodeURIComponent(
    spec.seriesTicker,
  )}&status=open&limit=200`;

  const attempt = async (): Promise<Response | null> => {
    try {
      return await fetchImpl(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
    } catch {
      return null;
    }
  };

  let resp = await attempt();
  if (resp && (resp.status === 429 || resp.status >= 500)) {
    await new Promise((r) => setTimeout(r, retryDelayMs));
    resp = await attempt();
  }

  if (!resp || !resp.ok) return null;

  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    return null;
  }

  const rawMarkets = (body as { markets?: KalshiRawMarket[] })?.markets;
  if (!Array.isArray(rawMarkets) || rawMarkets.length === 0) return null;

  const normalized: KalshiMarket[] = [];
  for (const raw of rawMarkets) {
    const m = normalizeKalshiMarket(raw, spec);
    if (m && (m.volume > 0 || m.openInterest > 0 || m.yesProbability != null)) {
      normalized.push(m);
    }
  }
  if (normalized.length === 0) return null;

  normalized.sort((a, b) => b.volume - a.volume);
  return normalized[0];
}

/** Stagger between consecutive request starts, in ms. Tunable / test-overridable. */
// Empirically Kalshi's public endpoint sustains ~4 req/sec — at 180ms
// we still saw isolated 429s when candlestick + trade fetches followed
// the markets fan-out. 250ms (= 4 req/sec) clears the cliff comfortably.
// 7 specs × 250ms = 1.75s before all are in flight; cached for 5 min
// after, so this only affects cold renders.
export const KALSHI_STAGGER_MS = 250;

/**
 * Fetch the featured Kalshi markets with a small inter-request stagger.
 * Kalshi rate-limits aggressive parallel fan-out (we saw 429s on 3-of-7
 * when blasting all at once), so each request kicks off `staggerMs` after
 * the previous one. This keeps total latency reasonable while sidestepping
 * the rate-limit cliff. For 7 specs at 120ms stagger that's ~840ms
 * before all are in flight — overlap with Kalshi's ~200ms response means
 * total wall-clock is ~1.1s on cache miss. Cached for 5 min after.
 *
 * Returns a sparse list — any series that fails or has no live markets
 * is silently skipped. Cache is in-memory per (specs, cadence) key.
 */
export async function fetchKalshiMarkets(
  specs: KalshiSeriesSpec[] = FEATURED_KALSHI_TICKERS,
  fetchImpl: typeof fetch = fetch,
  staggerMs: number = KALSHI_STAGGER_MS,
): Promise<KalshiMarket[]> {
  const key = cacheKey(specs);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  // Kick off requests in a staggered fashion: fire #0 immediately, #1 after
  // staggerMs, #2 after 2×staggerMs, etc. They still resolve in parallel.
  const promises = specs.map((spec, i) => {
    const delay = i === 0 ? 0 : i * staggerMs;
    if (delay === 0) {
      return fetchTopMarketForSeries(spec, fetchImpl).catch(() => null);
    }
    return new Promise<KalshiMarket | null>((resolve) => {
      setTimeout(() => {
        fetchTopMarketForSeries(spec, fetchImpl).then(resolve).catch(() => resolve(null));
      }, delay);
    });
  });

  const results = await Promise.all(promises);
  const markets = results.filter((m): m is KalshiMarket => m != null);

  cache.set(key, { expiresAt: now + CACHE_TTL_MS, data: markets });
  return markets;
}

// ─── Candlesticks ──────────────────────────────────────────────────────

/**
 * Normalize a raw Kalshi candlestick row into our display shape. Returns
 * null for rows missing the period timestamp (we use it as the x-axis
 * key). All other fields are best-effort — a candle with neither bid nor
 * ask is still kept so the consumer can decide how to handle gaps.
 */
export function normalizeKalshiCandle(
  raw: KalshiRawCandle,
): KalshiCandle | null {
  if (raw == null || typeof raw.end_period_ts !== "number") return null;
  return {
    endTs: raw.end_period_ts,
    yesBidClose: parseKalshiNumber(raw.yes_bid?.close_dollars),
    yesAskClose: parseKalshiNumber(raw.yes_ask?.close_dollars),
    volume: parseKalshiNumber(raw.volume_fp) ?? 0,
    openInterest: parseKalshiNumber(raw.open_interest_fp) ?? 0,
  };
}

/**
 * Mid-of-bid/ask is the cleanest single-line representation of "what the
 * crowd thinks YES is worth right now". Returns null when neither side
 * is quoted.
 */
export function candleMidPrice(c: KalshiCandle): number | null {
  if (c.yesBidClose != null && c.yesAskClose != null) {
    return (c.yesBidClose + c.yesAskClose) / 2;
  }
  return c.yesBidClose ?? c.yesAskClose;
}

/**
 * Fetch the candlestick series for one market. The Kalshi candlestick
 * endpoint requires the parent series ticker in the URL path even
 * though the leaf ticker uniquely identifies the market.
 *
 * `periodInterval` is in MINUTES — Kalshi accepts 1, 60, 1440 (=1d).
 * For sparklines we default to 60-min over the last 24 hours: 24
 * candles, plenty of resolution, one fetch.
 */
export async function fetchCandlesticks(
  ticker: string,
  seriesTicker: string,
  options: {
    periodInterval?: number;
    lookbackHours?: number;
    fetchImpl?: typeof fetch;
    retryDelayMs?: number;
  } = {},
): Promise<KalshiCandle[]> {
  const periodInterval = options.periodInterval ?? 60;
  const lookbackHours = options.lookbackHours ?? 24;
  const fetchImpl = options.fetchImpl ?? fetch;
  const retryDelayMs = options.retryDelayMs ?? KALSHI_RETRY_DELAY_MS;

  const endTs = Math.floor(Date.now() / 1000);
  const startTs = endTs - lookbackHours * 3600;
  const url =
    `${KALSHI_BASE}/series/${encodeURIComponent(seriesTicker)}` +
    `/markets/${encodeURIComponent(ticker)}/candlesticks` +
    `?start_ts=${startTs}&end_ts=${endTs}&period_interval=${periodInterval}`;

  const attempt = async (): Promise<Response | null> => {
    try {
      return await fetchImpl(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
    } catch {
      return null;
    }
  };

  let resp = await attempt();
  if (resp && (resp.status === 429 || resp.status >= 500)) {
    await new Promise((r) => setTimeout(r, retryDelayMs));
    resp = await attempt();
  }
  if (!resp || !resp.ok) return [];

  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    return [];
  }

  const raw = (body as { candlesticks?: KalshiRawCandle[] })?.candlesticks;
  if (!Array.isArray(raw)) return [];

  const candles = raw
    .map(normalizeKalshiCandle)
    .filter((c): c is KalshiCandle => c != null);
  // Always return chronologically — Kalshi already sorts ascending but
  // belt-and-braces against API surprises.
  candles.sort((a, b) => a.endTs - b.endTs);
  return candles;
}

// ─── Recent trades ─────────────────────────────────────────────────────

/**
 * Normalize a raw Kalshi trade. Kalshi reports yes_price + no_price
 * separately; we collapse to a single `yesPrice` (the implied probability
 * that YES resolves true). When the taker hit YES, yes_price is what they
 * paid; when they hit NO, the implied YES price is `1 - no_price`.
 *
 * Returns null if neither price is parseable (which would be a bug, but
 * defensive coding).
 */
export function normalizeKalshiTrade(
  raw: KalshiRawTrade,
): KalshiTrade | null {
  if (!raw?.ticker || !raw?.created_time) return null;
  const yesPrice = parseKalshiNumber(raw.yes_price_dollars);
  const noPrice = parseKalshiNumber(raw.no_price_dollars);

  let impliedYes: number | null = null;
  if (yesPrice != null && yesPrice >= 0 && yesPrice <= 1) {
    impliedYes = yesPrice;
  } else if (noPrice != null && noPrice >= 0 && noPrice <= 1) {
    impliedYes = 1 - noPrice;
  }
  if (impliedYes == null) return null;

  const takerSide: "yes" | "no" = raw.taker_side === "no" ? "no" : "yes";
  const count = parseKalshiNumber(raw.count_fp) ?? 1;

  return {
    ticker: raw.ticker,
    createdTime: raw.created_time,
    yesPrice: impliedYes,
    takerSide,
    count,
  };
}

/**
 * Fetch the most recent N trades for a single market. Used for the
 * spotlight card's "Recent prints" tape and for the live ticker bar.
 *
 * Kalshi's `/markets/trades?ticker=...` endpoint returns trades newest
 * first; we preserve that order for display.
 */
export async function fetchRecentTrades(
  ticker: string,
  limit: number = 5,
  fetchImpl: typeof fetch = fetch,
  retryDelayMs: number = KALSHI_RETRY_DELAY_MS,
): Promise<KalshiTrade[]> {
  const url =
    `${KALSHI_BASE}/markets/trades` +
    `?ticker=${encodeURIComponent(ticker)}&limit=${Math.max(1, Math.min(limit, 50))}`;

  const attempt = async (): Promise<Response | null> => {
    try {
      return await fetchImpl(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
    } catch {
      return null;
    }
  };

  let resp = await attempt();
  if (resp && (resp.status === 429 || resp.status >= 500)) {
    await new Promise((r) => setTimeout(r, retryDelayMs));
    resp = await attempt();
  }
  if (!resp || !resp.ok) return [];

  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    return [];
  }

  const raw = (body as { trades?: KalshiRawTrade[] })?.trades;
  if (!Array.isArray(raw)) return [];

  return raw
    .map(normalizeKalshiTrade)
    .filter((t): t is KalshiTrade => t != null);
}

// ─── Spotlight picker ──────────────────────────────────────────────────

/**
 * Pick the single market that should headline the dashboard. Strategy:
 *  1. Prefer the market with the largest |movement vs. previous lastPrice|
 *     when we have any data to compare against (returns the biggest mover).
 *  2. Fall back to the highest-volume market when all moves are tied / null
 *     (returns the most-traded market).
 *
 * Returns null for an empty list — the consumer falls back to fallback art.
 */
export function pickSpotlightMarket(
  markets: KalshiMarket[],
): KalshiMarket | null {
  if (markets.length === 0) return null;
  if (markets.length === 1) return markets[0];

  // Highest-volume wins as the baseline editorial choice. Volume is the
  // single best proxy for "where the most attention is right now". A
  // future iteration could weight by |yesBid - yesAsk| spread (liquidity
  // surprise) or by intra-day movement once we wire candlesticks for
  // every card.
  return markets.reduce((best, m) => (m.volume > best.volume ? m : best));
}
