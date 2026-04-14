export interface PriceRow {
  grain: string;
  contract: string;
  exchange: string;
  price_date: string;
  settlement_price: number;
  change_amount: number;
  change_pct: number;
  volume: number | null;
  open_interest: number | null;
  currency: string;
  unit: string;
  source: string;
}

export interface GrainPriceSpec {
  grain: string;
  contract: string;
  exchange: string;
  currency: string;
  unit: string;
  centsToBase: boolean;
  yahooSymbol?: string;
  barchartSymbol?: string;
}

export interface ChartData {
  timestamps: number[];
  closes: (number | null)[];
  volumes: (number | null)[];
}

export interface BarchartSnapshot {
  settlementPrice: number;
  changeAmount: number;
  changePct: number;
}

export async function fetchYahooChart(
  symbol: string,
  days: number,
  fetchImpl: typeof fetch = fetch,
): Promise<ChartData | null> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${days + 2}d&interval=1d&includePrePost=false`;

  const attempt = async (): Promise<Response> => {
    return fetchImpl(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BushelBoard/1.0)",
      },
    });
  };

  let resp: Response;
  try {
    resp = await attempt();
  } catch {
    return null;
  }

  if (resp.status === 404) return null;

  if (resp.status === 429 || resp.status >= 500) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      resp = await attempt();
    } catch {
      return null;
    }
    if (!resp.ok) return null;
  }

  if (!resp.ok) return null;

  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    return null;
  }

  const chart = (body as { chart?: { result?: Array<Record<string, unknown>> } })?.chart;
  const result = chart?.result?.[0] as {
    timestamp?: number[];
    indicators?: { quote?: Array<{ close?: (number | null)[]; volume?: (number | null)[] }> };
  } | undefined;
  if (!result) return null;

  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const closes = quote.close ?? [];
  const volumes = quote.volume ?? [];
  if (timestamps.length === 0) return null;

  return { timestamps, closes, volumes };
}

export function buildRowsForGrain(spec: GrainPriceSpec, chart: ChartData): PriceRow[] {
  const rows: PriceRow[] = [];
  const { timestamps, closes, volumes } = chart;

  for (let i = 1; i < timestamps.length; i++) {
    const rawClose = closes[i];
    const rawPrev = closes[i - 1];
    if (rawClose == null || rawPrev == null) continue;

    const price = spec.centsToBase ? rawClose / 100 : rawClose;
    const prev = spec.centsToBase ? rawPrev / 100 : rawPrev;
    const settlement_price = Number(price.toFixed(4));
    const change_amount = Number((price - prev).toFixed(4));
    const change_pct = prev ? Number(((change_amount / prev) * 100).toFixed(3)) : 0;
    const price_date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);

    rows.push({
      grain: spec.grain,
      contract: spec.contract,
      exchange: spec.exchange,
      price_date,
      settlement_price,
      change_amount,
      change_pct,
      volume: volumes[i] != null ? volumes[i] : null,
      open_interest: null,
      currency: spec.currency,
      unit: spec.unit,
      source: "yahoo-finance",
    });
  }

  return rows;
}

export function parseBarchartOverview(html: string): BarchartSnapshot | null {
  const priceMatch = html.match(/"dailyLastPrice":([0-9.]+)/);
  if (!priceMatch) return null;

  const changeMatch = html.match(/"priceChange":(-?[0-9.]+)/);
  const settlementPrice = Number(priceMatch[1]);
  const changeAmount = changeMatch ? Number(changeMatch[1]) : 0;
  const previousClose = settlementPrice - changeAmount;
  const changePct = previousClose !== 0
    ? Number(((changeAmount / previousClose) * 100).toFixed(3))
    : 0;

  return {
    settlementPrice: Number(settlementPrice.toFixed(4)),
    changeAmount: Number(changeAmount.toFixed(4)),
    changePct,
  };
}

export async function fetchBarchartSnapshot(
  symbol: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BarchartSnapshot | null> {
  const url = `https://www.barchart.com/futures/quotes/${encodeURIComponent(symbol)}/overview`;
  let resp: Response;
  try {
    resp = await fetchImpl(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BushelBoard/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } catch {
    return null;
  }

  if (!resp.ok) return null;

  let html: string;
  try {
    html = await resp.text();
  } catch {
    return null;
  }

  return parseBarchartOverview(html);
}

export function buildLatestRowFromSnapshot(
  spec: GrainPriceSpec,
  snapshot: BarchartSnapshot,
  priceDate: string,
): PriceRow {
  return {
    grain: spec.grain,
    contract: spec.contract,
    exchange: spec.exchange,
    price_date: priceDate,
    settlement_price: snapshot.settlementPrice,
    change_amount: snapshot.changeAmount,
    change_pct: snapshot.changePct,
    volume: null,
    open_interest: null,
    currency: spec.currency,
    unit: spec.unit,
    source: "barchart",
  };
}
