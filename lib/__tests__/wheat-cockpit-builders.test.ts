import { describe, expect, it } from "vitest";

import {
  buildGeeMoistureCardModel,
  buildPrairieProgressCardModel,
  buildPriceBasketCardModel,
  packageStatusLabel,
} from "@/lib/thesis/wheat-cockpit-builders";

describe("wheat cockpit builders", () => {
  it("labels a complete Prairie package", () => {
    const model = buildPrairieProgressCardModel({
      weekEnding: "2026-07-13",
      packageStatus: "complete_mb_sk_ab",
    });
    expect(model.packageLabel).toBe(packageStatusLabel("complete_mb_sk_ab"));
    expect(model.provinces.every((p) => p.present)).toBe(true);
    expect(model.takeaway.toLowerCase()).toContain("three");
  });

  it("marks Manitoba-only as partial", () => {
    const model = buildPrairieProgressCardModel({ packageStatus: "partial_mb_only" });
    expect(model.provinces.find((p) => p.code === "MB")?.present).toBe(true);
    expect(model.provinces.find((p) => p.code === "AB")?.present).toBe(false);
  });

  it("builds empty GEE card without crashing", () => {
    const model = buildGeeMoistureCardModel(null);
    expect(model.watchOnly).toBe(true);
    expect(model.dataHref).toBe("/data");
    expect(model.belts).toEqual([]);
  });

  it("detects split price contracts", () => {
    const model = buildPriceBasketCardModel([
      { symbol: "Spring Wheat", lastPrice: 6.5, changePct: 1.2, series: [6.1, 6.3, 6.5] },
      { symbol: "HRW", lastPrice: 6.4, changePct: -0.8, series: [6.5, 6.45, 6.4] },
      { symbol: "SRW", lastPrice: 5.9, changePct: 0.4, series: [5.8, 5.85, 5.9] },
    ]);
    expect(model.agreementLabel.toLowerCase()).toContain("split");
  });
});
