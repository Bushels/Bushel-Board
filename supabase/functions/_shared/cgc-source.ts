/**
 * CGC CSV source helpers — Deno-compatible copy of lib/cgc/source.ts.
 *
 * Scrape-then-fetch pattern: CGC's actual CSV URL lives one directory deep
 * under the crop year (e.g. /2025-26/gsw-shg-en.csv). Rather than hard-code
 * a URL that can change year-over-year, we load the index page and extract
 * the `.csv` href at runtime.
 */

const CGC_WEEKLY_PAGE_URL =
  "https://www.grainscanada.gc.ca/en/grain-research/statistics/grain-statistics-weekly/";
const CGC_ORIGIN = "https://www.grainscanada.gc.ca";

const CGC_HEADER_COLUMNS = [
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

export interface CgcSourcePayload {
  csvUrl: string;
  csvText: string;
  cropYear: string;
  grainWeek: number;
}

function normalizeHeaderColumn(column: string): string {
  return column.trim().replace(/^"|"$/g, "").toLowerCase().replace(/\s+/g, "_");
}

export function extractCurrentCgcCsvUrl(pageHtml: string): string {
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

export function isLikelyCgcCsv(csvText: string): boolean {
  const firstLine = csvText.trimStart().split(/\r?\n/, 1)[0];
  if (!firstLine) return false;
  const columns = firstLine.split(",").map(normalizeHeaderColumn);
  return CGC_HEADER_COLUMNS.every((col, i) => columns[i] === col);
}

export function extractCgcCsvMetadata(csvText: string): {
  cropYear: string;
  grainWeek: number;
} {
  const lines = csvText.split(/\r?\n/);
  let latestCropYear: string | null = null;
  let latestGrainWeek = -1;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length < 2) continue;

    const cropYear = parts[0]?.trim().replace(/^"|"$/g, "");
    const grainWeek = Number.parseInt(
      parts[1]?.trim().replace(/^"|"$/g, "") ?? "",
      10
    );

    if (cropYear && Number.isFinite(grainWeek) && grainWeek >= latestGrainWeek) {
      latestCropYear = cropYear;
      latestGrainWeek = grainWeek;
    }
  }

  if (latestCropYear && latestGrainWeek >= 0) {
    return { cropYear: latestCropYear, grainWeek: latestGrainWeek };
  }

  throw new Error("Could not determine crop year and grain week from CGC CSV");
}

/**
 * Fetch the latest CGC CSV by scraping the index page for the real URL,
 * then downloading the CSV.
 *
 * Uses browser-like headers to improve compatibility with CGC's bot filter.
 * Callers should still be prepared for transient `fetch` failures and retry
 * on a different day if CGC's infra is blocking.
 */
export async function fetchLatestCgcCsv(): Promise<CgcSourcePayload> {
  const commonHeaders: HeadersInit = {
    "User-Agent":
      "Mozilla/5.0 (compatible; BushelBoardBot/1.0; +https://bushel-board-app.vercel.app)",
    Accept: "text/html,application/xhtml+xml,text/csv,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };

  const pageResponse = await fetch(CGC_WEEKLY_PAGE_URL, {
    headers: commonHeaders,
    cache: "no-store",
  });
  if (!pageResponse.ok) {
    throw new Error(
      `Failed to load CGC weekly statistics page: HTTP ${pageResponse.status}`
    );
  }

  const pageHtml = await pageResponse.text();
  const csvUrl = extractCurrentCgcCsvUrl(pageHtml);

  const csvResponse = await fetch(csvUrl, {
    headers: { ...commonHeaders, Referer: CGC_WEEKLY_PAGE_URL },
    cache: "no-store",
  });
  if (!csvResponse.ok) {
    throw new Error(`Failed to load CGC CSV: HTTP ${csvResponse.status}`);
  }

  const csvText = await csvResponse.text();
  if (!isLikelyCgcCsv(csvText)) {
    throw new Error(
      `CGC response did not look like a CSV file (got ${csvText.length} bytes starting with: ${csvText.slice(0, 80).replace(/\s+/g, " ")})`
    );
  }

  const { cropYear, grainWeek } = extractCgcCsvMetadata(csvText);
  return { csvUrl, csvText, cropYear, grainWeek };
}
