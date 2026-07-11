import { describe, it, expect } from "vitest";
import {
  evaluateFreshness,
  cropProgressInSeason,
  CAD_SLAS,
  US_SLAS,
} from "../../scripts/desk/freshness";

describe("evaluateFreshness", () => {
  it("all sources within SLA -> ok", () => {
    const v = evaluateFreshness([
      { name: "cgc", ageDays: 2, slaDays: 8 },
      { name: "cot", ageDays: 5, slaDays: 8 },
      { name: "price", ageDays: 1, slaDays: 4 },
    ]);
    expect(v.ok).toBe(true);
    expect(v.breached).toEqual([]);
  });

  it("a stale source breaches", () => {
    const v = evaluateFreshness([
      { name: "cgc", ageDays: 12, slaDays: 8 },
      { name: "price", ageDays: 1, slaDays: 4 },
    ]);
    expect(v.ok).toBe(false);
    expect(v.breached).toEqual(["cgc"]);
  });

  it("a missing source (null age) breaches — fail loud, never score on absent data", () => {
    const v = evaluateFreshness([{ name: "cot", ageDays: null, slaDays: 8 }]);
    expect(v.ok).toBe(false);
    expect(v.breached).toEqual(["cot"]);
  });

  it("skip excludes a source from the verdict (seasonal gate)", () => {
    const v = evaluateFreshness([
      { name: "crop_progress", ageDays: null, slaDays: 10, skip: true },
      { name: "wasde", ageDays: 3, slaDays: 35 },
    ]);
    expect(v.ok).toBe(true);
    expect(v.breached).toEqual([]);
    expect(v.checks.find((c) => c.name === "crop_progress")?.skipped).toBe(true);
  });
});

describe("SLA constants + seasonal gate", () => {
  it("CAD SLAs match the prompt", () => {
    expect(CAD_SLAS).toEqual({ cgc: 8, cot: 8, price: 4 });
  });
  it("US SLAs match the prompt", () => {
    expect(US_SLAS).toEqual({ wasde: 35, export_sales: 10, price: 4, cot: 10, crop_progress: 10 });
  });
  it("crop-progress enforced Apr–Nov only", () => {
    expect(cropProgressInSeason(3)).toBe(false);
    expect(cropProgressInSeason(4)).toBe(true);
    expect(cropProgressInSeason(11)).toBe(true);
    expect(cropProgressInSeason(12)).toBe(false);
  });
});
