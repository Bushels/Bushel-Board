import { describe, expect, it } from "vitest";
import {
  buildWheatUsdaProgressUpdate,
  conditionClass,
  cumulativeProgressClass,
  normalizeWheatCropProgressRows,
  plantedClass,
  type WheatCropProgressWeek,
} from "@/lib/queries/wheat-crop-progress-utils";

function week(weekEnding: string, overrides: Partial<WheatCropProgressWeek> = {}): WheatCropProgressWeek {
  return {
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

// Mirrors the live consolidated WHEAT rows around week ending 2026-07-05:
// harvested/condition still report the winter crop while headed flipped to the
// spring crop when NASS retired winter heading after 2026-06-14 (95 -> 16).
const JULY_2026_ROWS: WheatCropProgressWeek[] = [
  week("2026-07-05", { goodExcellentPct: 26, harvestedPct: 59, headedPct: 54, geYoyChange: -22, conditionIndex: 2.63 }),
  week("2026-06-28", { goodExcellentPct: 26, harvestedPct: 48, headedPct: 32, geYoyChange: -22, conditionIndex: 2.62 }),
  week("2026-06-21", { goodExcellentPct: 26, harvestedPct: 40, headedPct: 16, geYoyChange: -23, conditionIndex: 2.64 }),
  week("2026-06-14", { goodExcellentPct: 27, harvestedPct: 25, headedPct: 95, geYoyChange: -25, conditionIndex: 2.67 }),
  week("2026-06-07", { goodExcellentPct: 25, harvestedPct: 11, headedPct: 92, plantedPct: 98, conditionIndex: 2.63 }),
  week("2026-05-31", { goodExcellentPct: 26, harvestedPct: 5, headedPct: 87, plantedPct: 94, conditionIndex: 2.69 }),
  week("2025-07-06", { goodExcellentPct: 48, harvestedPct: 53, headedPct: 61, conditionIndex: 3.4 }),
  week("2025-06-29", { goodExcellentPct: 48, harvestedPct: 37, headedPct: 38, conditionIndex: 3.38 }),
];

describe("cumulativeProgressClass", () => {
  it("stays winter while the season series is monotonic", () => {
    expect(cumulativeProgressClass([5, 11, 25, 40, 48, 59])).toBe("winter");
  });

  it("flips to spring after an in-season drop marks the winter series retiring", () => {
    expect(cumulativeProgressClass([87, 92, 95, 16, 32, 54])).toBe("spring");
  });

  it("returns null with no reported values", () => {
    expect(cumulativeProgressClass([null, null])).toBeNull();
  });
});

describe("conditionClass", () => {
  it("labels stable June/July condition as the winter crop", () => {
    expect(
      conditionClass("2026-07-05", [
        { weekEnding: "2026-06-21", value: 26 },
        { weekEnding: "2026-06-28", value: 26 },
        { weekEnding: "2026-07-05", value: 26 },
      ]),
    ).toBe("winter");
  });

  it("detects the winter-to-spring hand-off as a June level shift", () => {
    expect(
      conditionClass("2026-06-28", [
        { weekEnding: "2026-06-14", value: 26 },
        { weekEnding: "2026-06-21", value: 26 },
        { weekEnding: "2026-06-28", value: 54 },
      ]),
    ).toBe("spring");
  });

  it("uses the calendar outside the hand-off window", () => {
    expect(conditionClass("2026-04-12", [{ weekEnding: "2026-04-12", value: 27 }])).toBe("winter");
    expect(conditionClass("2026-08-16", [{ weekEnding: "2026-08-16", value: 52 }])).toBe("spring");
    expect(conditionClass("2026-11-01", [{ weekEnding: "2026-11-01", value: 44 }])).toBe("winter");
  });
});

describe("plantedClass", () => {
  it("labels spring seeding in the first half and winter seeding in the fall", () => {
    expect(plantedClass("2026-05-10")).toBe("spring");
    expect(plantedClass("2026-09-20")).toBe("winter");
  });
});

describe("buildWheatUsdaProgressUpdate", () => {
  it("builds the July 2026 card from live-shaped rows", () => {
    const update = buildWheatUsdaProgressUpdate(JULY_2026_ROWS);
    expect(update).not.toBeNull();
    expect(update?.weekEnding).toBe("2026-07-05");
    expect(update?.releasedAt).toBe("2026-07-06");
    expect(update?.metrics).toHaveLength(4);

    const [harvested, condition, headed, index] = update!.metrics;
    expect(harvested).toMatchObject({
      label: "Winter harvested",
      value: "59%",
      detail: "48% last week; 53% last year",
      tone: "bear",
    });
    expect(condition).toMatchObject({
      label: "Winter good/excellent",
      value: "26%",
      detail: "26% last week; 48% last year",
      tone: "bull",
    });
    expect(headed).toMatchObject({
      label: "Spring headed",
      value: "54%",
      detail: "32% last week; 61% last year",
      tone: "balanced",
    });
    expect(index).toMatchObject({
      label: "Condition index (1-5)",
      value: "2.63 / 5",
      detail: "2.62 last week; 3.40 last year",
      tone: "bull",
    });

    expect(update?.read).toContain("Harvest of the winter crop is moving fast at 59% complete");
    expect(update?.read).toContain("condition remains poor at 26% good or excellent, 22 points below last year");
    expect(update?.read).toContain("The spring crop is 54% headed, near last year's pace");
  });

  it("labels headed as the winter crop before the mid-June hand-off", () => {
    const update = buildWheatUsdaProgressUpdate(JULY_2026_ROWS.slice(3));
    const headed = update?.metrics.find((metric) => metric.label.endsWith("headed"));
    expect(headed).toMatchObject({ label: "Winter headed", value: "95%" });
  });

  it("labels fall rows as spring harvest and winter planting", () => {
    const update = buildWheatUsdaProgressUpdate([
      week("2026-10-04", { harvestedPct: 62, plantedPct: 41 }),
      week("2026-09-27", { harvestedPct: 55, plantedPct: 28 }),
      week("2026-08-30", { harvestedPct: 98 }),
    ]);
    expect(update?.metrics.map((metric) => metric.label)).toEqual(["Spring harvested", "Winter planted"]);
    expect(update?.metrics[0]?.detail).toBe("55% last week");
  });

  it("returns null when no rows or no usable metrics exist", () => {
    expect(buildWheatUsdaProgressUpdate([])).toBeNull();
    expect(buildWheatUsdaProgressUpdate([week("2026-07-05")])).toBeNull();
  });

  it("skips prior-week and prior-year comparisons when rows are too far apart", () => {
    const update = buildWheatUsdaProgressUpdate([
      week("2026-07-05", { harvestedPct: 59 }),
      week("2026-06-07", { harvestedPct: 11 }),
    ]);
    expect(update?.metrics[0]?.detail).toBe("No comparison rows imported yet");
    expect(update?.metrics[0]?.tone).toBe("balanced");
  });
});

describe("normalizeWheatCropProgressRows", () => {
  it("coerces PostgREST numeric strings, drops dateless rows, and sorts newest first", () => {
    const rows = normalizeWheatCropProgressRows([
      {
        week_ending: "2026-06-28",
        good_excellent_pct: "26.000",
        harvested_pct: "48.0",
        headed_pct: 32,
        planted_pct: null,
        ge_pct_yoy_change: "-22.0",
        condition_index: "2.62",
      },
      {
        week_ending: null,
        good_excellent_pct: 99,
        harvested_pct: 99,
        headed_pct: 99,
        planted_pct: 99,
        ge_pct_yoy_change: 0,
        condition_index: 5,
      },
      {
        week_ending: "2026-07-05",
        good_excellent_pct: 26,
        harvested_pct: 59,
        headed_pct: 54,
        planted_pct: null,
        ge_pct_yoy_change: -22,
        condition_index: 2.63,
      },
    ]);

    expect(rows.map((row) => row.weekEnding)).toEqual(["2026-07-05", "2026-06-28"]);
    expect(rows[1]).toMatchObject({ goodExcellentPct: 26, harvestedPct: 48, geYoyChange: -22, conditionIndex: 2.62 });
  });
});
