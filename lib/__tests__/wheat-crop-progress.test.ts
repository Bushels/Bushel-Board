import { describe, expect, it } from "vitest";
import {
  buildWheatUsdaProgressUpdate,
  normalizeWheatCropProgressRows,
  type WheatCropProgressWeek,
} from "@/lib/queries/wheat-crop-progress-utils";

function week(
  wheatClass: WheatCropProgressWeek["wheatClass"],
  weekEnding: string,
  overrides: Partial<WheatCropProgressWeek> = {},
): WheatCropProgressWeek {
  return {
    wheatClass,
    weekEnding,
    goodExcellentPct: null,
    harvestedPct: null,
    headedPct: null,
    plantedPct: null,
    geYoyChange: null,
    conditionIndex: null,
    ...overrides,
  };
}

describe("buildWheatUsdaProgressUpdate", () => {
  it("keeps spring and winter observations separate in one Wheat update", () => {
    const update = buildWheatUsdaProgressUpdate([
      week("spring", "2026-07-12", { goodExcellentPct: 58, headedPct: 72, geYoyChange: 7 }),
      week("spring", "2026-07-05", { goodExcellentPct: 54, headedPct: 54 }),
      week("spring", "2025-07-13", { goodExcellentPct: 51, headedPct: 75 }),
      week("winter", "2026-07-12", { harvestedPct: 63 }),
      week("winter", "2026-07-05", { harvestedPct: 59 }),
      week("winter", "2025-07-13", { harvestedPct: 58 }),
    ]);

    expect(update?.weekEnding).toBe("2026-07-12");
    expect(update?.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Winter harvested", value: "63%" }),
      expect.objectContaining({ label: "Spring good/excellent", value: "58%" }),
      expect.objectContaining({ label: "Spring headed", value: "72%" }),
    ]));
    expect(update?.read).toContain("winter crop");
    expect(update?.read).toContain("spring crop");
  });

  it("never uses legacy mixed rows when explicit class rows exist", () => {
    const update = buildWheatUsdaProgressUpdate([
      week("legacy_mixed", "2026-07-12", { goodExcellentPct: 26 }),
      week("spring", "2026-07-12", { goodExcellentPct: 58 }),
    ]);
    expect(update?.metrics[0]?.value).toBe("58%");
    expect(update?.metrics[0]?.label).toBe("Spring good/excellent");
  });

  it("returns null when no usable metrics exist", () => {
    expect(buildWheatUsdaProgressUpdate([])).toBeNull();
    expect(buildWheatUsdaProgressUpdate([week("spring", "2026-07-12")])).toBeNull();
  });
});

describe("normalizeWheatCropProgressRows", () => {
  it("coerces numerics, preserves class, and sorts newest first", () => {
    const rows = normalizeWheatCropProgressRows([
      {
        wheat_class: "winter",
        week_ending: "2026-07-05",
        good_excellent_pct: null,
        harvested_pct: "59",
        headed_pct: null,
        planted_pct: null,
        ge_pct_yoy_change: null,
        condition_index: null,
      },
      {
        wheat_class: "spring",
        week_ending: "2026-07-12",
        good_excellent_pct: "58",
        harvested_pct: null,
        headed_pct: "72",
        planted_pct: null,
        ge_pct_yoy_change: "7",
        condition_index: "3.47",
      },
    ]);
    expect(rows.map((row) => row.wheatClass)).toEqual(["spring", "winter"]);
    expect(rows[0]).toMatchObject({ goodExcellentPct: 58, headedPct: 72, conditionIndex: 3.47 });
  });
});
