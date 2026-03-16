import { describe, it, expect } from "vitest";
import { computeDeliveryGap, type DeliveryGapPoint } from "@/lib/utils/delivery-gap";
import type { CumulativeWeekRow } from "@/lib/queries/observations";

function makeRow(grain_week: number, deliveries: number): CumulativeWeekRow {
  return {
    grain_week,
    week_ending_date: `2026-01-0${grain_week}`,
    producer_deliveries_kt: deliveries,
    terminal_receipts_kt: 0,
    exports_kt: 0,
    processing_kt: 0,
    domestic_disappearance_kt: 0,
  };
}

describe("computeDeliveryGap", () => {
  it("computes gap as prior minus current (positive = behind pace)", () => {
    const current = [makeRow(1, 100), makeRow(2, 250)];
    const prior = [makeRow(1, 120), makeRow(2, 300)];
    const result = computeDeliveryGap(current, prior);
    expect(result).toHaveLength(2);
    expect(result[0].gap).toBe(20);
    expect(result[1].gap).toBe(50);
  });

  it("returns negative gap when current ahead of prior", () => {
    const current = [makeRow(1, 150)];
    const prior = [makeRow(1, 100)];
    const result = computeDeliveryGap(current, prior);
    expect(result[0].gap).toBe(-50);
  });

  it("handles missing prior year weeks gracefully", () => {
    const current = [makeRow(1, 100), makeRow(2, 200), makeRow(3, 350)];
    const prior = [makeRow(1, 110), makeRow(2, 220)];
    const result = computeDeliveryGap(current, prior);
    expect(result).toHaveLength(3);
    expect(result[2].prior).toBeNull();
    expect(result[2].gap).toBe(0);
  });

  it("returns empty array for empty inputs", () => {
    expect(computeDeliveryGap([], [])).toEqual([]);
  });

  it("computes summary stats correctly", () => {
    const current = [makeRow(1, 100), makeRow(2, 250)];
    const prior = [makeRow(1, 120), makeRow(2, 300)];
    const result = computeDeliveryGap(current, prior);
    const latest = result[result.length - 1];
    expect(latest.current).toBe(250);
    expect(latest.prior).toBe(300);
    expect(latest.gap).toBe(50);
  });
});
