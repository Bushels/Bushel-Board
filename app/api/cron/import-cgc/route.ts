/**
 * GET/POST /api/cron/import-cgc
 *
 * Vercel-hosted proxy that fetches the weekly CGC CSV and forwards it to the
 * `import-cgc-weekly` Supabase Edge Function via the `csv_data` body parameter.
 *
 * Why this route exists:
 *   CGC drops Supabase edge egress IPs at the TCP layer (ECONNRESET), so the
 *   EF's built-in scrape-then-fetch path fails in production. Vercel's
 *   serverless egress is not in the blocklist, so we do the scrape here and
 *   hand the raw CSV to the EF. The EF keeps its upsert + audit logic.
 *
 * Auth: Accepts either
 *   - `Authorization: Bearer <CRON_SECRET>`   (Claude Desktop Routine)
 *   - `x-bushel-internal-secret: <secret>`     (manual / scripted)
 *
 * Body / query params (both optional):
 *   { week?: number, crop_year?: string }
 *   - `week` filters the CSV to a single grain_week (fast path for Thursday run)
 *   - `crop_year` is a hint passed to the EF (long form: "2025-2026")
 *   - Omit both for a full crop-year upsert (slow; used for backfill)
 *
 * Returns JSON: { ok, scrape: {...}, ef: {...}, duration_ms }
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// -- Constants (mirrors supabase/functions/_shared/cgc-source.ts) ------------

const CGC_WEEKLY_PAGE_URL =
  "https://www.grainscanada.gc.ca/en/grain-research/statistics/grain-statistics-weekly/";
const CGC_ORIGIN = "https://www.grainscanada.gc.ca";

const BROWSER_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (compatible; BushelBoardBot/1.0; +https://bushel-board-app.vercel.app)",
  Accept: "text/html,application/xhtml+xml,text/csv,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function authorizeRequest(request: Request): Response | null {
  const cronSecret = process.env.CRON_SECRET;
  const internalSecret = process.env.BUSHEL_INTERNAL_FUNCTION_SECRET;

  const authHeader = request.headers.get("authorization");
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return null;

  const internalHeader = request.headers.get("x-bushel-internal-secret");
  if (internalSecret && internalHeader === internalSecret) return null;

  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

// ---------------------------------------------------------------------------
// CGC scrape-then-fetch
// ---------------------------------------------------------------------------

function extractCurrentCgcCsvUrl(pageHtml: string): string {
  // The real CSV lives one directory deep under the crop year, e.g.
  //   /en/grain-research/statistics/grain-statistics-weekly/2025-26/gsw-shg-en.csv
  // Scraping the index avoids hard-coding a crop-year fragment that rotates
  // every August.
  const match = pageHtml.match(
    /href="([^"]*\/grain-statistics-weekly\/[^"]*\/gsw-shg-en\.csv)"/i
  );
  if (!match?.[1]) {
    throw new Error(
      "Could not find the current CGC CSV link on the weekly statistics page"
    );
  }
  return new URL(match[1], CGC_ORIGIN).toString();
}

function isLikelyCgcCsv(csvText: string): boolean {
  const firstLine = csvText.trimStart().split(/\r?\n/, 1)[0];
  if (!firstLine) return false;
  const expected = [
    "crop_year",
    "grain_week",
    "week_ending_date",
    "worksheet",
    "metric",
    "period",
    "grain",
    "grade",
    "region",
    "ktonnes",
  ];
  const cols = firstLine
    .split(",")
    .map((c) => c.trim().replace(/^"|"$/g, "").toLowerCase().replace(/\s+/g, "_"));
  return expected.every((col, i) => cols[i] === col);
}

async function fetchCgcCsv(): Promise<{
  csvUrl: string;
  csvText: string;
  pageMs: number;
  csvMs: number;
  bytes: number;
}> {
  const pageStart = Date.now();
  const pageRes = await fetch(CGC_WEEKLY_PAGE_URL, {
    headers: BROWSER_HEADERS,
    cache: "no-store",
  });
  if (!pageRes.ok) {
    throw new Error(
      `Failed to load CGC weekly statistics page: HTTP ${pageRes.status}`
    );
  }
  const pageHtml = await pageRes.text();
  const pageMs = Date.now() - pageStart;

  const csvUrl = extractCurrentCgcCsvUrl(pageHtml);

  const csvStart = Date.now();
  const csvRes = await fetch(csvUrl, {
    headers: { ...BROWSER_HEADERS, Referer: CGC_WEEKLY_PAGE_URL },
    cache: "no-store",
  });
  if (!csvRes.ok) {
    throw new Error(`Failed to load CGC CSV: HTTP ${csvRes.status} from ${csvUrl}`);
  }
  const csvText = await csvRes.text();
  const csvMs = Date.now() - csvStart;

  if (!isLikelyCgcCsv(csvText)) {
    throw new Error(
      `CGC response did not look like a CSV file (got ${csvText.length} bytes starting with: ${csvText.slice(0, 80).replace(/\s+/g, " ")})`
    );
  }

  return { csvUrl, csvText, pageMs, csvMs, bytes: csvText.length };
}

// ---------------------------------------------------------------------------
// Forward CSV to Edge Function
// ---------------------------------------------------------------------------

interface ForwardOptions {
  csvText: string;
  week?: number;
  cropYear?: string;
}

interface EfResponse {
  status: number;
  body: unknown;
  durationMs: number;
}

async function forwardToEdgeFunction(opts: ForwardOptions): Promise<EfResponse> {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const internalSecret = process.env.BUSHEL_INTERNAL_FUNCTION_SECRET;

  if (!supabaseUrl || !serviceKey || !internalSecret) {
    throw new Error(
      "Missing env vars (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / BUSHEL_INTERNAL_FUNCTION_SECRET)"
    );
  }

  const body: Record<string, unknown> = { csv_data: opts.csvText };
  if (typeof opts.week === "number" && Number.isFinite(opts.week)) {
    body.week = opts.week;
  }
  if (opts.cropYear) {
    body.crop_year = opts.cropYear;
  }

  const start = Date.now();
  const res = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/functions/v1/import-cgc-weekly`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        "x-bushel-internal-secret": internalSecret,
      },
      body: JSON.stringify(body),
    }
  );
  const durationMs = Date.now() - start;

  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // leave as string — EF sometimes returns empty body on 5xx
  }

  return { status: res.status, body: parsed, durationMs };
}

// ---------------------------------------------------------------------------
// Param parsing
// ---------------------------------------------------------------------------

interface Params {
  week?: number;
  cropYear?: string;
}

function parseWeek(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 && n <= 53 ? n : undefined;
}

async function readParams(request: Request): Promise<Params> {
  const url = new URL(request.url);
  const qsWeek = parseWeek(url.searchParams.get("week"));
  const qsCropYear = url.searchParams.get("crop_year") ?? undefined;

  if (request.method !== "POST") {
    return { week: qsWeek, cropYear: qsCropYear };
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  return {
    week: parseWeek((body as any).week) ?? qsWeek,
    cropYear:
      typeof (body as any).crop_year === "string"
        ? (body as any).crop_year
        : qsCropYear,
  };
}

// ---------------------------------------------------------------------------
// Shared handler
// ---------------------------------------------------------------------------

async function handle(request: Request) {
  const authError = authorizeRequest(request);
  if (authError) return authError;

  const runStart = Date.now();
  let params: Params;
  try {
    params = await readParams(request);
  } catch (err) {
    return Response.json(
      { ok: false, error: `Bad request: ${String(err)}` },
      { status: 400 }
    );
  }

  // 1. Scrape CGC -> CSV text
  let scrape: Awaited<ReturnType<typeof fetchCgcCsv>>;
  try {
    scrape = await fetchCgcCsv();
  } catch (err) {
    return Response.json(
      {
        ok: false,
        stage: "scrape",
        error: String(err),
        duration_ms: Date.now() - runStart,
      },
      { status: 502 }
    );
  }

  // 2. Forward CSV to Edge Function
  let ef: EfResponse;
  try {
    ef = await forwardToEdgeFunction({
      csvText: scrape.csvText,
      week: params.week,
      cropYear: params.cropYear,
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        stage: "edge_function",
        error: String(err),
        scrape: {
          csv_url: scrape.csvUrl,
          bytes: scrape.bytes,
          page_ms: scrape.pageMs,
          csv_ms: scrape.csvMs,
        },
        duration_ms: Date.now() - runStart,
      },
      { status: 502 }
    );
  }

  const ok = ef.status >= 200 && ef.status < 300;
  return Response.json(
    {
      ok,
      params: {
        week: params.week ?? null,
        crop_year: params.cropYear ?? null,
      },
      scrape: {
        csv_url: scrape.csvUrl,
        bytes: scrape.bytes,
        page_ms: scrape.pageMs,
        csv_ms: scrape.csvMs,
      },
      ef: {
        status: ef.status,
        duration_ms: ef.durationMs,
        body: ef.body,
      },
      duration_ms: Date.now() - runStart,
    },
    { status: ok ? 200 : 502 }
  );
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
