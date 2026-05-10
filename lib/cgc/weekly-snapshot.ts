import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

export const CGC_WEEKLY_SNAPSHOT_SCHEMA_VERSION =
  "cgc-weekly-snapshot-v1" as const;

export interface CgcWeeklySnapshotMetadata {
  schema_version: typeof CGC_WEEKLY_SNAPSHOT_SCHEMA_VERSION;
  captured_at: string;
  source_page_url: string;
  csv_url: string;
  crop_year: string;
  grain_week: number;
  week_ending_date: string;
  row_count: number;
  latest_week_row_count: number;
  byte_length: number;
  csv_sha256: string;
  csv_hash_basis: "uncompressed_csv_text";
  csv_gzip_sha256: string;
  csv_gzip_path: string;
  metadata_path: string;
  point_in_time_certified: true;
  availability_basis: string;
}

export interface WriteCgcWeeklySnapshotInput {
  csvText: string;
  csvUrl: string;
  pageUrl: string;
  capturedAt: string;
  outputDir: string;
  writeFiles?: boolean;
}

export interface WriteCgcWeeklySnapshotResult {
  status: "captured" | "already_current";
  metadata: CgcWeeklySnapshotMetadata;
  metadataPath: string;
  csvGzipPath: string;
}

interface ParsedCgcMetadata {
  crop_year: string;
  grain_week: number;
  week_ending_date: string;
  latest_week_row_count: number;
  row_count: number;
}

export function extractCurrentCgcCsvUrl(
  pageHtml: string,
  origin: string,
): string {
  const match = pageHtml.match(
    /href=["']([^"']*\/grain-statistics-weekly\/[^"']*\/gsw-shg-en\.csv)["']/i,
  );

  if (!match?.[1]) {
    throw new Error("Could not find current CGC weekly CSV link.");
  }

  return new URL(match[1], origin).toString();
}

export function writeCgcWeeklySnapshot(
  input: WriteCgcWeeklySnapshotInput,
): WriteCgcWeeklySnapshotResult {
  validateCapturedAt(input.capturedAt);

  const parsed = parseCgcMetadata(input.csvText);
  const csvSha256 = `sha256:${sha256(input.csvText)}`;
  const weekDir = join(
    input.outputDir,
    parsed.crop_year,
    `week-${String(parsed.grain_week).padStart(2, "0")}`,
  );
  const writeFiles = input.writeFiles !== false;
  if (writeFiles) {
    mkdirSync(weekDir, { recursive: true });
  }

  const existing = findExistingSnapshotByHash(weekDir, csvSha256);
  if (existing) {
    return {
      status: "already_current",
      metadata: existing.metadata,
      metadataPath: existing.metadataPath,
      csvGzipPath: join(input.outputDir, existing.metadata.csv_gzip_path),
    };
  }

  const capturedStamp = filenameTimestamp(input.capturedAt);
  const gzipBuffer = gzipSync(Buffer.from(input.csvText, "utf8"));
  const shortCsvHash = csvSha256.slice("sha256:".length, "sha256:".length + 8);
  const stem = `${capturedStamp}-cgc-week-${String(parsed.grain_week).padStart(
    2,
    "0",
  )}-${shortCsvHash}`;
  const csvGzipPath = join(weekDir, `${stem}.csv.gz`);
  const metadataPath = join(weekDir, `${stem}.metadata.json`);
  const metadata = {
    schema_version: CGC_WEEKLY_SNAPSHOT_SCHEMA_VERSION,
    captured_at: input.capturedAt,
    source_page_url: input.pageUrl,
    csv_url: input.csvUrl,
    crop_year: parsed.crop_year,
    grain_week: parsed.grain_week,
    week_ending_date: parsed.week_ending_date,
    row_count: parsed.row_count,
    latest_week_row_count: parsed.latest_week_row_count,
    byte_length: Buffer.byteLength(input.csvText, "utf8"),
    csv_sha256: csvSha256,
    csv_hash_basis: "uncompressed_csv_text",
    csv_gzip_sha256: `sha256:${sha256(gzipBuffer)}`,
    csv_gzip_path: toPortableRelativePath(input.outputDir, csvGzipPath),
    metadata_path: toPortableRelativePath(input.outputDir, metadataPath),
    point_in_time_certified: true,
    availability_basis:
      "raw CGC weekly CSV fetched from the current public CGC weekly URL at captured_at",
  } satisfies CgcWeeklySnapshotMetadata;

  if (writeFiles) {
    writeFileSync(csvGzipPath, gzipBuffer);
    writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  }

  return {
    status: "captured",
    metadata,
    metadataPath,
    csvGzipPath,
  };
}

function parseCgcMetadata(csvText: string): ParsedCgcMetadata {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    throw new Error("CGC CSV contains no data rows.");
  }

  const header = rows[0].map((column) =>
    column.trim().toLowerCase().replace(/\s+/g, "_"),
  );
  const iCropYear = columnIndex(header, "crop_year");
  const iGrainWeek = columnIndex(header, "grain_week");
  const iDate = columnIndex(header, "week_ending_date");
  let latest: Omit<ParsedCgcMetadata, "row_count"> | null = null;
  let rowCount = 0;

  for (const row of rows.slice(1)) {
    if (row.length < header.length) {
      continue;
    }

    const cropYear = row[iCropYear]?.trim();
    const grainWeek = Number.parseInt(row[iGrainWeek]?.trim() ?? "", 10);
    const weekEndingDate = normalizeCgcDate(row[iDate]?.trim() ?? "");

    if (!cropYear || !Number.isInteger(grainWeek) || !weekEndingDate) {
      continue;
    }

    rowCount += 1;

    const isNewerCropYear = !latest || cropYear > latest.crop_year;
    const isSameCropYearNewerWeek =
      latest !== null && cropYear === latest.crop_year && grainWeek > latest.grain_week;

    if (isNewerCropYear || isSameCropYearNewerWeek) {
      latest = {
        crop_year: cropYear,
        grain_week: grainWeek,
        week_ending_date: weekEndingDate,
        latest_week_row_count: 1,
      };
      continue;
    }

    if (latest && grainWeek === latest.grain_week && cropYear === latest.crop_year) {
      latest.latest_week_row_count += 1;
    }
  }

  if (!latest) {
    throw new Error("Could not determine latest CGC crop year and grain week.");
  }

  return {
    ...latest,
    row_count: rowCount,
  };
}

function findExistingSnapshotByHash(
  weekDir: string,
  csvSha256: string,
):
  | {
      metadata: CgcWeeklySnapshotMetadata;
      metadataPath: string;
    }
  | null {
  if (!existsSync(weekDir)) {
    return null;
  }

  for (const entry of readdirSync(weekDir)) {
    if (!entry.endsWith(".metadata.json")) {
      continue;
    }

    const metadataPath = join(weekDir, entry);
    const metadata = JSON.parse(
      readFileSync(metadataPath, "utf8"),
    ) as CgcWeeklySnapshotMetadata;

    if (metadata.csv_sha256 === csvSha256) {
      return { metadata, metadataPath };
    }
  }

  return null;
}

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

function normalizeCgcDate(value: string): string {
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${year}-${(month ?? "").padStart(2, "0")}-${(day ?? "").padStart(2, "0")}`;
  }

  const parts = value.split("/");
  if (parts.length !== 3) {
    return value;
  }

  if (parts[0]?.length === 4) {
    const [year, month, day] = parts;
    return `${year}-${(month ?? "").padStart(2, "0")}-${(day ?? "").padStart(2, "0")}`;
  }

  const [day, month, year] = parts;
  return `${year}-${(month ?? "").padStart(2, "0")}-${(day ?? "").padStart(2, "0")}`;
}

function columnIndex(header: string[], name: string): number {
  const index = header.indexOf(name);

  if (index === -1) {
    throw new Error(`Missing required CGC CSV column: ${name}.`);
  }

  return index;
}

function validateCapturedAt(capturedAt: string): void {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(capturedAt)) {
    throw new Error("captured_at must include a timezone offset.");
  }

  if (Number.isNaN(Date.parse(capturedAt))) {
    throw new Error("captured_at must be a valid timestamp.");
  }
}

function filenameTimestamp(timestamp: string): string {
  const parsed = new Date(Date.parse(timestamp));
  const utc = parsed.toISOString();
  return `${utc.slice(0, 10)}-${utc.slice(11, 19).replaceAll(":", "")}Z`;
}

function toPortableRelativePath(root: string, target: string): string {
  return relative(root, target).replaceAll("\\", "/");
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
