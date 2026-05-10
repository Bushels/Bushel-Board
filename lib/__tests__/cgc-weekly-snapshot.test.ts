import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { gunzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CGC_WEEKLY_SNAPSHOT_SCHEMA_VERSION,
  extractCurrentCgcCsvUrl,
  writeCgcWeeklySnapshot,
} from "../cgc/weekly-snapshot";

const pageHtml = `
<html>
  <body>
    <a href="/en/grain-research/statistics/grain-statistics-weekly/2025/gsw-shg-en.csv">CSV</a>
  </body>
</html>`;

const csvText = `Crop Year,Grain Week,Week Ending Date,worksheet,metric,period,grain,grade,Region,Ktonnes
2025-2026,1,10/08/2025,Primary,Deliveries,Current Week,Canola,,Saskatchewan,28.5
2025-2026,2,17/08/2025,Primary,Deliveries,Current Week,Canola,,Saskatchewan,"1,250.5"
`;

const rolloverCsvText = `Crop Year,Grain Week,Week Ending Date,worksheet,metric,period,grain,grade,Region,Ktonnes
2024-2025,52,2025-07-27,Primary,Deliveries,Current Week,Canola,,Saskatchewan,28.5
2025-2026,1,2025/08/10,Primary,Deliveries,Current Week,Canola,,Saskatchewan,30.5
2025-2026,1,2025/08/10,Summary,Exports,Current Week,Canola,,Vancouver,18.5
`;

describe("CGC weekly point-in-time snapshot", () => {
  it("extracts the current CGC CSV URL from the weekly statistics page", () => {
    expect(
      extractCurrentCgcCsvUrl(
        pageHtml,
        "https://www.grainscanada.gc.ca",
      ),
    ).toBe(
      "https://www.grainscanada.gc.ca/en/grain-research/statistics/grain-statistics-weekly/2025/gsw-shg-en.csv",
    );
  });

  it("writes a compressed raw CSV plus deterministic metadata", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cgc-weekly-snapshot-"));

    try {
      const result = writeCgcWeeklySnapshot({
        csvText,
        csvUrl:
          "https://www.grainscanada.gc.ca/en/grain-research/statistics/grain-statistics-weekly/2025/gsw-shg-en.csv",
        pageUrl:
          "https://www.grainscanada.gc.ca/en/grain-research/statistics/grain-statistics-weekly/",
        capturedAt: "2026-05-10T12:00:00-06:00",
        outputDir: tempDir,
      });

      expect(result.status).toBe("captured");
      expect(result.metadata.schema_version).toBe(
        CGC_WEEKLY_SNAPSHOT_SCHEMA_VERSION,
      );
      expect(result.metadata).toMatchObject({
        crop_year: "2025-2026",
        grain_week: 2,
        week_ending_date: "2025-08-17",
        row_count: 2,
        point_in_time_certified: true,
      });
      expect(result.metadata.csv_sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(result.metadata.csv_hash_basis).toBe("uncompressed_csv_text");
      expect(result.metadata.csv_gzip_sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(result.metadata.csv_gzip_path.endsWith(".csv.gz")).toBe(true);
      expect(result.metadata.csv_gzip_path).toContain(
        result.metadata.csv_sha256.slice("sha256:".length, "sha256:".length + 8),
      );
      expect(existsSync(result.csvGzipPath)).toBe(true);
      expect(existsSync(result.metadataPath)).toBe(true);
      expect(gunzipSync(readFileSync(result.csvGzipPath)).toString("utf8")).toBe(
        csvText,
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("is idempotent when the same week and CSV hash were already captured", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cgc-weekly-snapshot-idem-"));

    try {
      const first = writeCgcWeeklySnapshot({
        csvText,
        csvUrl: "https://example.test/gsw-shg-en.csv",
        pageUrl: "https://example.test/page",
        capturedAt: "2026-05-10T12:00:00-06:00",
        outputDir: tempDir,
      });
      const second = writeCgcWeeklySnapshot({
        csvText,
        csvUrl: "https://example.test/gsw-shg-en.csv",
        pageUrl: "https://example.test/page",
        capturedAt: "2026-05-10T12:05:00-06:00",
        outputDir: tempDir,
      });

      expect(first.status).toBe("captured");
      expect(second.status).toBe("already_current");
      expect(second.metadataPath).toBe(first.metadataPath);
      expect(second.csvGzipPath).toBe(first.csvGzipPath);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("reports already_current during dry-run when the CSV hash was already captured", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cgc-weekly-snapshot-dry-"));

    try {
      const first = writeCgcWeeklySnapshot({
        csvText,
        csvUrl: "https://example.test/gsw-shg-en.csv",
        pageUrl: "https://example.test/page",
        capturedAt: "2026-05-10T12:00:00-06:00",
        outputDir: tempDir,
      });
      const second = writeCgcWeeklySnapshot({
        csvText,
        csvUrl: "https://example.test/gsw-shg-en.csv",
        pageUrl: "https://example.test/page",
        capturedAt: "2026-05-10T12:05:00-06:00",
        outputDir: tempDir,
        writeFiles: false,
      });

      expect(second.status).toBe("already_current");
      expect(second.metadataPath).toBe(first.metadataPath);
      expect(second.csvGzipPath).toBe(first.csvGzipPath);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("selects the newest crop year before comparing grain week numbers", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cgc-weekly-snapshot-rollover-"));

    try {
      const result = writeCgcWeeklySnapshot({
        csvText: rolloverCsvText,
        csvUrl: "https://example.test/gsw-shg-en.csv",
        pageUrl: "https://example.test/page",
        capturedAt: "2026-05-10T12:00:00-06:00",
        outputDir: tempDir,
        writeFiles: false,
      });

      expect(result.metadata).toMatchObject({
        crop_year: "2025-2026",
        grain_week: 1,
        week_ending_date: "2025-08-10",
        latest_week_row_count: 2,
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps same-timestamp captures distinct when the CSV hash changes", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cgc-weekly-snapshot-change-"));

    try {
      const first = writeCgcWeeklySnapshot({
        csvText,
        csvUrl: "https://example.test/gsw-shg-en.csv",
        pageUrl: "https://example.test/page",
        capturedAt: "2026-05-10T12:00:00-06:00",
        outputDir: tempDir,
      });
      const second = writeCgcWeeklySnapshot({
        csvText: `${csvText}\n2025-2026,2,17/08/2025,Summary,Stocks,Current Week,Canola,,Vancouver,2`,
        csvUrl: "https://example.test/gsw-shg-en.csv",
        pageUrl: "https://example.test/page",
        capturedAt: "2026-05-10T12:00:00-06:00",
        outputDir: tempDir,
      });

      expect(second.status).toBe("captured");
      expect(second.metadata.csv_sha256).not.toBe(first.metadata.csv_sha256);
      expect(second.metadataPath).not.toBe(first.metadataPath);
      expect(second.csvGzipPath).not.toBe(first.csvGzipPath);
      expect(existsSync(first.metadataPath)).toBe(true);
      expect(existsSync(second.metadataPath)).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("CGC weekly snapshot CLI", () => {
  it("prints help without touching external systems", () => {
    const result = runSnapshotCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("capture-cgc-weekly-snapshot");
    expect(result.stdout).toContain("--output-dir");
  });

  it("supports offline dry-runs without writing files", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cgc-weekly-snapshot-cli-"));

    try {
      const pagePath = join(tempDir, "page.html");
      const csvPath = join(tempDir, "weekly.csv");
      const outputDir = join(tempDir, "snapshots");
      writeFileSync(pagePath, pageHtml);
      writeFileSync(csvPath, csvText);

      const result = runSnapshotCli([
        "--input-page",
        pagePath,
        "--input-csv",
        csvPath,
        "--captured-at",
        "2026-05-10T12:00:00-06:00",
        "--output-dir",
        outputDir,
        "--dry-run",
      ]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain("dry-run: output not written");
      expect(JSON.parse(result.stdout)).toMatchObject({
        dry_run: true,
        crop_year: "2025-2026",
        grain_week: 2,
      });
      expect(JSON.parse(result.stdout).csv_gzip_path).toContain("snapshots");
      expect(JSON.parse(result.stdout).metadata_path).toContain("snapshots");
      expect(existsSync(outputDir)).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

function runSnapshotCli(args: string[]) {
  return spawnSync(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/capture-cgc-weekly-snapshot.ts",
      ...args,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
}
