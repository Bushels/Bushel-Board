import { describe, it, expect } from "vitest";
import {
  conditionStrokeColor,
  groupByState,
  type SeismographRow,
} from "@/lib/queries/seeding-progress-utils";

const sampleRows: SeismographRow[] = [
  {
    state_code: "IA", state_name: "Iowa",
    centroid_lng: -93.5, centroid_lat: 42.07,
    week_ending: "2026-05-04", planted_pct: 25, emerged_pct: 7,
    harvested_pct: 0, planted_pct_vs_avg: 6,
    good_excellent_pct: 70, condition_index: 3.6, ge_pct_yoy_change: 4,
  },
  {
    state_code: "IA", state_name: "Iowa",
    centroid_lng: -93.5, centroid_lat: 42.07,
    week_ending: "2026-05-11", planted_pct: 55, emerged_pct: 22,
    harvested_pct: 0, planted_pct_vs_avg: 8,
    good_excellent_pct: 72, condition_index: 3.7, ge_pct_yoy_change: 5,
  },
  {
    state_code: "KS", state_name: "Kansas",
    centroid_lng: -98.38, centroid_lat: 38.5,
    week_ending: "2026-05-04", planted_pct: 18, emerged_pct: 4,
    harvested_pct: 0, planted_pct_vs_avg: -2,
    good_excellent_pct: 35, condition_index: 2.4, ge_pct_yoy_change: -19,
  },
];

describe("seeding-progress-utils", () => {
  describe("groupByState", () => {
    it("groups rows by state_code preserving week order", () => {
      const grouped = groupByState(sampleRows);
      expect(Object.keys(grouped).sort()).toEqual(["IA", "KS"]);
      expect(grouped.IA).toHaveLength(2);
      expect(grouped.IA[0].week_ending).toBe("2026-05-04");
      expect(grouped.IA[1].week_ending).toBe("2026-05-11");
    });
  });

  describe("conditionStrokeColor", () => {
    it("returns prairie green for positive YoY", () => {
      expect(conditionStrokeColor(5)).toBe("#437a22");
    });
    it("returns wheat-700 neutral for zero YoY", () => {
      expect(conditionStrokeColor(0)).toBe("#5a4f36");
    });
    it("returns amber for moderate negative", () => {
      expect(conditionStrokeColor(-8)).toBe("#d97706");
    });
    it("returns crimson for severe negative", () => {
      expect(conditionStrokeColor(-19)).toBe("#b8350f");
    });
    it("treats null as neutral", () => {
      expect(conditionStrokeColor(null)).toBe("#5a4f36");
    });
  });
});
