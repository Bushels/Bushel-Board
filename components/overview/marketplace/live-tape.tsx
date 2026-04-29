"use client";
// components/overview/marketplace/live-tape.tsx
// Always-scrolling ticker tape at the top of the Predictive Market section.
// Polls a single Kalshi /markets/trades endpoint every 12 seconds (one
// request — well under the public rate-limit cliff). On each refresh we
// merge new trades into the visible queue.
//
// CSS-only marquee animation — pure-and-simple, GPU-friendly, respects
// prefers-reduced-motion.
//
// ── INTEGRATION POINT ───────────────────────────────────────────────────
// Belongs to the Kalshi marketplace surface only — see isolation fence
// in lib/kalshi/types.ts.
// ────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import type { KalshiCrop, KalshiTrade } from "@/lib/kalshi/types";

const INK = "#2a261e";
const WHEAT_50 = "#f5f3ee";
const WHEAT_100 = "#ebe7dc";
const WHEAT_200 = "#d7cfba";
const INK_MUTED = "#7c6c43";
const PRAIRIE = "#437a22";
const AMBER = "#b8702a";
const CANOLA = "#c17f24";
const SOIL = "#6b3f2a";

function cropAccent(crop: KalshiCrop): string {
  switch (crop) {
    case "CORN":
      return CANOLA;
    case "SOY":
      return PRAIRIE;
    case "WHEAT":
      return AMBER;
    case "FERT":
      return SOIL;
    default:
      return INK_MUTED;
  }
}

interface TapeEntry {
  trade: KalshiTrade;
  crop: KalshiCrop;
  cropLabel: string;
}

interface LiveTapeProps {
  /** Initial server-rendered trades so the tape isn't empty on first paint. */
  seed: TapeEntry[];
  /** Ticker → crop mapping so we can color trades from the polling endpoint. */
  cropByTicker: Record<string, { crop: KalshiCrop; label: string }>;
  /** Spotlight ticker (the one we'll poll for fresh trades). */
  pollTicker: string;
  /** Poll interval in ms. Default 12s. */
  pollMs?: number;
}

function ageLabel(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const sec = Math.max(0, Math.floor((now - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

export function LiveTape({
  seed,
  cropByTicker,
  pollTicker,
  pollMs = 12000,
}: LiveTapeProps) {
  const [entries, setEntries] = useState<TapeEntry[]>(seed);
  const [now, setNow] = useState(() => Date.now());

  // Tick "now" every second so age labels stay live without re-fetching.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Poll the spotlight market for fresh trades.
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/kalshi/trades?ticker=${encodeURIComponent(pollTicker)}&limit=10`);
        if (!res.ok) return;
        const data = (await res.json()) as { trades?: KalshiTrade[] };
        const fresh = data.trades;
        if (cancelled || !fresh) return;
        setEntries((prev) => {
          const seenIds = new Set(prev.map((p) => `${p.trade.ticker}-${p.trade.createdTime}`));
          const next: TapeEntry[] = [];
          for (const t of fresh) {
            const key = `${t.ticker}-${t.createdTime}`;
            if (seenIds.has(key)) continue;
            const meta = cropByTicker[t.ticker] ?? {
              crop: "OTHER" as const,
              label: t.ticker.split("-")[0],
            };
            next.push({ trade: t, crop: meta.crop as KalshiCrop, cropLabel: meta.label });
          }
          // Newest entries first, capped at 25 so the marquee stays light.
          const merged = [...next, ...prev].slice(0, 25);
          return merged;
        });
      } catch {
        // Silently ignore — tape is enrichment, not core data.
      }
    }
    const id = setInterval(poll, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollTicker, pollMs, cropByTicker]);

  // Render: duplicate the entry list so the marquee can loop seamlessly.
  // The keyframes scroll exactly half the width (because we doubled the
  // content), so the loop point is invisible.
  const marqueeContent = entries.length > 0 ? entries : seed;
  const display = marqueeContent.length > 0 ? [...marqueeContent, ...marqueeContent] : [];

  return (
    <div
      style={{
        position: "relative",
        background: WHEAT_50,
        borderTop: `1px solid ${WHEAT_200}`,
        borderBottom: `1px solid ${WHEAT_200}`,
        overflow: "hidden",
        height: 38,
        fontFamily: "var(--font-dm-sans)",
        fontVariantNumeric: "tabular-nums",
      }}
      aria-label="Live trade tape"
    >
      {/* Edge fade masks */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 60,
          background: `linear-gradient(to right, ${WHEAT_50}, transparent)`,
          zIndex: 2,
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 60,
          background: `linear-gradient(to left, ${WHEAT_50}, transparent)`,
          zIndex: 2,
          pointerEvents: "none",
        }}
      />

      {/* "LIVE" badge anchored left */}
      <div
        style={{
          position: "absolute",
          left: 18,
          top: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
          zIndex: 3,
          fontSize: 10,
          letterSpacing: "0.22em",
          fontWeight: 700,
          color: PRAIRIE,
          textTransform: "uppercase",
          paddingRight: 12,
          background: WHEAT_50,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: PRAIRIE,
            animation: "kalshi-tape-pulse 1.6s ease-in-out infinite",
          }}
        />
        TAPE
      </div>

      {/* Inline keyframes — server-safe */}
      <style>{`
        @keyframes kalshi-tape-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(0.8); }
        }
        @keyframes kalshi-tape-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .kalshi-tape-track {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* Scrolling track */}
      <div
        className="kalshi-tape-track"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          paddingLeft: 90,
          display: "flex",
          alignItems: "center",
          gap: 0,
          whiteSpace: "nowrap",
          animation: "kalshi-tape-scroll 60s linear infinite",
          willChange: "transform",
        }}
      >
        {display.length === 0 ? (
          <span
            style={{
              fontSize: 11,
              color: INK_MUTED,
              fontStyle: "italic",
            }}
          >
            Awaiting first print…
          </span>
        ) : (
          display.map((e, i) => {
            const accent = cropAccent(e.crop);
            const yesPct = Math.round(e.trade.yesPrice * 100);
            const sideGlyph = e.trade.takerSide === "yes" ? "↑" : "↓";
            const sideColor = e.trade.takerSide === "yes" ? PRAIRIE : AMBER;
            return (
              <span
                key={`${e.trade.ticker}-${e.trade.createdTime}-${i}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 28px",
                  fontSize: 11,
                  borderRight: `1px solid ${WHEAT_200}`,
                  height: 22,
                }}
              >
                <span
                  style={{
                    color: accent,
                    fontWeight: 700,
                    letterSpacing: "0.14em",
                  }}
                >
                  {e.cropLabel}
                </span>
                <span style={{ color: sideColor, fontWeight: 700 }}>{sideGlyph}</span>
                <span style={{ color: INK, fontWeight: 600 }}>{yesPct}¢</span>
                <span style={{ color: INK_MUTED, fontSize: 10 }}>
                  {ageLabel(e.trade.createdTime, now)}
                </span>
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}
