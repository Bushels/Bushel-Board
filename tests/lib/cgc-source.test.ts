import {
  extractCgcCsvMetadata,
  extractCurrentCgcCsvUrl,
  fetchCurrentCgcCsv,
  isLikelyCgcCsv,
} from "@/lib/cgc/source";
import { describe, expect, it, vi } from "vitest";

const SAMPLE_PAGE_HTML = `
  <html>
    <body>
      <a href="/en/grain-research/statistics/grain-statistics-weekly/2025-26/gsw-shg-en.csv">
        Download CSV
      </a>
    </body>
  </html>
`;

const SAMPLE_CSV = [
  "Crop Year,Grain Week,Week Ending Date,worksheet,metric,period,grain,grade,Region,Ktonnes",
  "2025-2026,1,09/08/2025,Primary,Deliveries,Current Week,Wheat,,Alberta,100.0",
  "2025-2026,31,08/03/2026,Primary,Deliveries,Current Week,Wheat,,Alberta,123.4",
].join("\n");

describe("extractCurrentCgcCsvUrl", () => {
  it("extracts the current CSV URL from the weekly statistics page", () => {
    expect(extractCurrentCgcCsvUrl(SAMPLE_PAGE_HTML)).toBe(
      "https://www.grainscanada.gc.ca/en/grain-research/statistics/grain-statistics-weekly/2025-26/gsw-shg-en.csv"
    );
  });

  it("throws when the page does not expose a CSV link", () => {
    expect(() => extractCurrentCgcCsvUrl("<html></html>")).toThrow(
      /Could not find the current CGC CSV link/
    );
  });
});

describe("isLikelyCgcCsv", () => {
  it("accepts the CGC CSV header", () => {
    expect(isLikelyCgcCsv(SAMPLE_CSV)).toBe(true);
  });

  it("rejects HTML responses", () => {
    expect(isLikelyCgcCsv("<!DOCTYPE html><html></html>")).toBe(false);
  });
});

describe("extractCgcCsvMetadata", () => {
  it("reads crop year and week from the first data row", () => {
    expect(extractCgcCsvMetadata(SAMPLE_CSV)).toEqual({
      cropYear: "2025-2026",
      grainWeek: 31,
    });
  });
});

describe("fetchCurrentCgcCsv", () => {
  it("discovers the live CSV and returns its metadata", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(SAMPLE_PAGE_HTML, { status: 200 }))
      .mockResolvedValueOnce(new Response(SAMPLE_CSV, { status: 200 }));

    await expect(fetchCurrentCgcCsv(fetchMock)).resolves.toEqual({
      csvUrl:
        "https://www.grainscanada.gc.ca/en/grain-research/statistics/grain-statistics-weekly/2025-26/gsw-shg-en.csv",
      csvText: SAMPLE_CSV,
      cropYear: "2025-2026",
      grainWeek: 31,
    });
  });

  it("rejects non-CSV payloads", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(SAMPLE_PAGE_HTML, { status: 200 }))
      .mockResolvedValueOnce(
        new Response("<!DOCTYPE html><html></html>", { status: 200 })
      );

    await expect(fetchCurrentCgcCsv(fetchMock)).rejects.toThrow(
      /did not look like a CSV/
    );
  });
});
