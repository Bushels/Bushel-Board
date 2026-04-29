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
  KalshiCrop,
  KalshiMarket,
  KalshiRawMarket,
  KalshiSeriesSpec,
} from "./types";

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const USER_AGENT = "BushelBoard/1.0 (+https://bushelboard.com)";
const CACHE_TTL_MS = 5 * 60 * 1000;

// Tunable list of grain markets to surface on the Marketplace strip.
// Each spec maps a Kalshi series ticker to the crop label we display.
// Verified active 2026-04-28 — KX*MON contracts have the deepest liquidity
// (low-thousands volume_fp); KXCORNW gives a short-dated wildcard.
export const FEATURED_KALSHI_TICKERS: KalshiSeriesSpec[] = [
  { seriesTicker: "KXCORNMON", crop: "CORN" },
  { seriesTicker: "KXSOYBEANMON", crop: "SOY" },
  { seriesTicker: "KXWHEATMON", crop: "WHEAT" },
  { seriesTicker: "KXCORNW", crop: "CORN" },
];

interface CacheEntry {
  expiresAt: number;
  data: KalshiMarket[];
}

const cache = new Map<string, CacheEntry>();

function cacheKey(specs: KalshiSeriesSpec[]): string {
  return specs.map((s) => `${s.seriesTicker}:${s.crop}`).join("|");
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
    title: raw.title,
    subtitle: raw.subtitle ?? raw.yes_sub_title ?? null,
    crop: spec.crop,
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

/**
 * Fetch one series, returning the most-traded open market (by volume).
 * Returns null on any error or empty response.
 */
export async function fetchTopMarketForSeries(
  spec: KalshiSeriesSpec,
  fetchImpl: typeof fetch = fetch,
): Promise<KalshiMarket | null> {
  const url = `${KALSHI_BASE}/markets?series_ticker=${encodeURIComponent(
    spec.seriesTicker,
  )}&status=open&limit=200`;

  let resp: Response;
  try {
    resp = await fetchImpl(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
  } catch {
    return null;
  }

  if (!resp.ok) return null;

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

/**
 * Fetch the featured Kalshi markets in parallel. Returns a sparse list —
 * any series that fails or has no live markets is silently skipped.
 * Cached in-memory for 5 minutes per spec set.
 */
export async function fetchKalshiMarkets(
  specs: KalshiSeriesSpec[] = FEATURED_KALSHI_TICKERS,
  fetchImpl: typeof fetch = fetch,
): Promise<KalshiMarket[]> {
  const key = cacheKey(specs);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const results = await Promise.all(
    specs.map((spec) => fetchTopMarketForSeries(spec, fetchImpl)),
  );

  const markets = results.filter((m): m is KalshiMarket => m != null);

  cache.set(key, { expiresAt: now + CACHE_TTL_MS, data: markets });
  return markets;
}
