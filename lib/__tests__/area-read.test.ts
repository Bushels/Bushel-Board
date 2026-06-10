import { describe, expect, it } from "vitest";

import { buildProvincialFlow, describeSeasonPace } from "@/lib/queries/area-read-utils";
import { areaFromFsa, normalizeFsaInput } from "@/lib/utils/area";

describe("normalizeFsaInput", () => {
  it("accepts FSAs and full postal codes in any casing or spacing", () => {
    expect(normalizeFsaInput("T0L")).toBe("T0L");
    expect(normalizeFsaInput("t0l 1w0")).toBe("T0L");
    expect(normalizeFsaInput(" s7k4j8 ")).toBe("S7K");
    expect(normalizeFsaInput("R2C 0A1")).toBe("R2C");
  });

  it("rejects anything that is not letter-digit-letter", () => {
    expect(normalizeFsaInput("123")).toBeNull();
    expect(normalizeFsaInput("TT0")).toBeNull();
    expect(normalizeFsaInput("")).toBeNull();
    expect(normalizeFsaInput(null)).toBeNull();
    expect(normalizeFsaInput("hold canola")).toBeNull();
  });
});

describe("areaFromFsa", () => {
  it("maps prairie and BC postal letters to provinces", () => {
    expect(areaFromFsa("T0L")).toEqual({ fsa: "T0L", province: "AB", provinceName: "Alberta" });
    expect(areaFromFsa("s7k")).toEqual({ fsa: "S7K", province: "SK", provinceName: "Saskatchewan" });
    expect(areaFromFsa("R2C")).toEqual({ fsa: "R2C", province: "MB", provinceName: "Manitoba" });
    expect(areaFromFsa("V1C")).toEqual({ fsa: "V1C", province: "BC", provinceName: "British Columbia" });
  });

  it("keeps the FSA but reports no province outside coverage", () => {
    expect(areaFromFsa("K1A")).toEqual({ fsa: "K1A", province: null, provinceName: null });
  });

  it("returns null for invalid input", () => {
    expect(areaFromFsa("nope")).toBeNull();
    expect(areaFromFsa(undefined)).toBeNull();
  });
});

describe("buildProvincialFlow", () => {
  const rows = [
    { grain: "Canola", crop_year: "2025-2026", grain_week: 42, period: "Current Week", ktonnes: 47.4 },
    { grain: "Canola", crop_year: "2025-2026", grain_week: 42, period: "Crop Year", ktonnes: "4525.9" },
    { grain: "Canola", crop_year: "2024-2025", grain_week: 42, period: "Crop Year", ktonnes: 4200 },
    { grain: "Wheat", crop_year: "2025-2026", grain_week: 42, period: "Current Week", ktonnes: 88.1 },
    { grain: "Wheat", crop_year: "2025-2026", grain_week: 42, period: "Crop Year", ktonnes: 7200.5 },
    // Oats: prior season only — must be dropped (no current-season evidence).
    { grain: "Oats", crop_year: "2024-2025", grain_week: 42, period: "Crop Year", ktonnes: 900 },
  ];

  it("folds week, season, and same-week prior season into per-grain flows with YoY", () => {
    const flows = buildProvincialFlow(rows, "2025-2026", "2024-2025");

    expect(flows.map((flow) => flow.grain)).toEqual(["Wheat", "Canola"]); // sorted by season volume
    const canola = flows.find((flow) => flow.grain === "Canola")!;
    expect(canola).toEqual({
      grain: "Canola",
      weekKt: 47.4,
      seasonKt: 4525.9,
      priorSeasonKt: 4200,
      seasonYoyPct: 8,
    });
    const wheat = flows.find((flow) => flow.grain === "Wheat")!;
    expect(wheat.seasonYoyPct).toBeNull(); // no prior-season row
  });

  it("handles PostgREST numeric-as-string values", () => {
    const flows = buildProvincialFlow(rows, "2025-2026", "2024-2025");
    expect(flows.find((flow) => flow.grain === "Canola")!.seasonKt).toBe(4525.9);
  });

  it("never divides by a zero prior season", () => {
    const flows = buildProvincialFlow(
      [
        { grain: "Rye", crop_year: "2025-2026", grain_week: 42, period: "Crop Year", ktonnes: 10 },
        { grain: "Rye", crop_year: "2024-2025", grain_week: 42, period: "Crop Year", ktonnes: 0 },
      ],
      "2025-2026",
      "2024-2025",
    );
    expect(flows[0].seasonYoyPct).toBeNull();
  });
});

describe("describeSeasonPace", () => {
  const base = { grain: "Canola", weekKt: 1, seasonKt: 1, priorSeasonKt: 1 };

  it("describes ahead, behind, on-pace, and unknown", () => {
    expect(describeSeasonPace({ ...base, seasonYoyPct: 8 })).toBe("8% ahead of last season");
    expect(describeSeasonPace({ ...base, seasonYoyPct: -4 })).toBe("4% behind last season");
    expect(describeSeasonPace({ ...base, seasonYoyPct: 1 })).toBe("on pace with last season");
    expect(describeSeasonPace({ ...base, seasonYoyPct: null })).toBe("no season comparison yet");
  });
});
