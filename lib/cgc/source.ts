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
  return CGC_HEADER_COLUMNS.every((column, index) => columns[index] === column);
}

export function extractCgcCsvMetadata(csvText: string): {
  cropYear: string;
  grainWeek: number;
} {
  const lines = csvText.split(/\r?\n/);
  let latestCropYear: string | null = null;
  let latestGrainWeek = -1;

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
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

export async function fetchCurrentCgcCsv(
  fetchImpl: typeof fetch = fetch
): Promise<CgcSourcePayload> {
  const pageResponse = await fetchImpl(CGC_WEEKLY_PAGE_URL, { cache: "no-store" });
  if (!pageResponse.ok) {
    throw new Error(
      `Failed to load CGC weekly statistics page: HTTP ${pageResponse.status}`
    );
  }

  const pageHtml = await pageResponse.text();
  const csvUrl = extractCurrentCgcCsvUrl(pageHtml);

  const csvResponse = await fetchImpl(csvUrl, { cache: "no-store" });
  if (!csvResponse.ok) {
    throw new Error(`Failed to load CGC CSV: HTTP ${csvResponse.status}`);
  }

  const csvText = await csvResponse.text();
  if (!isLikelyCgcCsv(csvText)) {
    throw new Error("CGC response did not look like a CSV file");
  }

  const { cropYear, grainWeek } = extractCgcCsvMetadata(csvText);
  return { csvUrl, csvText, cropYear, grainWeek };
}
