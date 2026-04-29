// app/api/kalshi/trades/route.ts
// Thin proxy in front of Kalshi's public /markets/trades endpoint.
// Used by the LiveTape client component to poll fresh prints without
// needing CORS-friendly direct Kalshi access from the browser. Server-
// side fetch reuses our existing isolated lib/kalshi/client.ts helper.
//
// ── INTEGRATION POINT ───────────────────────────────────────────────────
// Lives strictly inside the Kalshi feature surface — see isolation
// fence in lib/kalshi/types.ts. Do not expand this route to read /
// write internal data stores.
// ────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { fetchRecentTrades } from "@/lib/kalshi/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = url.searchParams.get("ticker");
  const limitParam = url.searchParams.get("limit");

  if (!ticker || !/^[A-Z0-9._-]+$/i.test(ticker) || ticker.length > 80) {
    return NextResponse.json({ trades: [] }, { status: 400 });
  }

  const limit = Math.max(1, Math.min(50, Number(limitParam) || 10));
  const trades = await fetchRecentTrades(ticker, limit);
  return NextResponse.json(
    { trades },
    {
      // Browser-side polling — short freshness, no CDN caching.
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
