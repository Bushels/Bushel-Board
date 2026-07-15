import { describe, expect, it } from "vitest";

import {
  buildGeeMoistureCardModel,
  buildPrairieProgressCardModel,
  buildPriceBasketCardModel,
  buildPriceBasketLegsFromHistory,
  leanFromDomainScore,
  normalizePrairiePackageStatus,
  packageStatusLabel,
} from "@/lib/thesis/wheat-cockpit-builders";
import type { CropStressMapData } from "@/lib/queries/gee-crop-stress-utils";

describe("wheat cockpit builders", () => {
  it("labels a complete Prairie package", () => {
    const model = buildPrairieProgressCardModel({
      weekEnding: "2026-07-13",
      packageStatus: "complete_mb_sk_ab",
    });
    expect(model.packageLabel).toBe(packageStatusLabel("complete_mb_sk_ab"));
    expect(model.provinces.every((p) => p.present)).toBe(true);
  });

  it("marks Manitoba-only as partial", () => {
    const model = buildPrairieProgressCardModel({ packageStatus: "partial_mb_only" });
    expect(model.provinces.find((p) => p.code === "MB")?.present).toBe(true);
    expect(model.provinces.find((p) => p.code === "AB")?.present).toBe(false);
  });

  it("normalizes importer partial_mb_sk into partial Prairie card", () => {
    expect(normalizePrairiePackageStatus("partial_mb_sk")).toBe("partial_prairie_week");
    const model = buildPrairieProgressCardModel({
      packageStatus: "partial_mb_sk",
      loadedProvinces: ["MB", "SK"],
      missingProvinces: ["AB"],
    });
    expect(model.packageStatus).toBe("partial_prairie_week");
    expect(model.provinces.find((p) => p.code === "MB")?.present).toBe(true);
    expect(model.provinces.find((p) => p.code === "SK")?.present).toBe(true);
    expect(model.provinces.find((p) => p.code === "AB")?.present).toBe(false);
  });

  it("prefers loadedProvinces over status defaults", () => {
    const model = buildPrairieProgressCardModel({
      packageStatus: "partial_prairie_week",
      loadedProvinces: ["SK"],
    });
    expect(model.provinces.find((p) => p.code === "MB")?.present).toBe(false);
    expect(model.provinces.find((p) => p.code === "SK")?.present).toBe(true);
  });

  it("surfaces separate CA and US scored weather domains without inventing a combined crop score", () => {
    const model = buildPrairieProgressCardModel({
      weekEnding: "2026-07-13",
      packageStatus: "complete_mb_sk_ab",
      canadaWeatherDomain: {
        score: 12,
        weightedScore: 2.4,
        metrics: [
          {
            label: "Behind-normal development proxy",
            value: "63%",
            numericValue: 63,
          },
        ],
        positiveEvidence: ["Canada development is delayed."],
        negativeEvidence: [],
      },
      usWeatherDomain: {
        score: -30,
        weightedScore: -4.8,
        metrics: [{ label: "Good/excellent", value: "76.0%", numericValue: 76 }],
        positiveEvidence: [],
        negativeEvidence: ["US crop condition adds supply cushion."],
      },
      usdaProgress: {
        weekEnding: "2026-07-05",
        read: "Winter harvest is ahead.",
        metrics: [
          {
            label: "Winter good/excellent",
            value: "26%",
            detail: "48% last year",
            tone: "bull",
          },
          {
            label: "Spring good/excellent",
            value: "54%",
            detail: "near last year",
            tone: "balanced",
          },
        ],
      },
    });

    expect(model.canada.lean).toBe("bull");
    expect(model.us.lean).toBe("bear");
    expect(model.canada.scoreHint).toContain("CA scorecard");
    expect(model.us.scoreHint).toContain("US scorecard");
    expect(model.canada.signals.some((s) => s.scores)).toBe(true);
    expect(model.us.signals.some((s) => s.label.toLowerCase().includes("winter"))).toBe(true);
    expect(model.takeaway.toLowerCase()).toContain("separate");
    expect(leanFromDomainScore(12)).toBe("bull");
    expect(leanFromDomainScore(-30)).toBe("bear");
  });

  it("builds empty GEE card without crashing", () => {
    const model = buildGeeMoistureCardModel(null);
    expect(model.watchOnly).toBe(true);
    expect(model.dataHref).toBe("/data");
    expect(model.belts).toEqual([]);
  });

  it("maps GEE belt summaries into watch-only chips", () => {
    const data: CropStressMapData = {
      latestWeek: "2026-07-10",
      rows: [],
      beltSummaries: [
        {
          cropBelt: "US_HRW",
          regionCode: "BELT",
          regionName: "US HRW",
          weekEnding: "2026-07-10",
          ndviZ: -0.5,
          smZ: -0.4,
          stressIndex: -0.45,
          reading: "stressed-moderate",
        },
      ],
      sourceDatasets: ["MODIS"],
      computedAt: "2026-07-11T12:00:00Z",
      takeaway: "This week, the US winter-wheat belt is showing crop stress.",
    };
    const model = buildGeeMoistureCardModel(data);
    expect(model.watchOnly).toBe(true);
    expect(model.latestWeek).toBe("2026-07-10");
    expect(model.belts).toHaveLength(1);
    expect(model.belts[0]?.label.toLowerCase()).toContain("winter");
  });

  it("detects split price contracts", () => {
    const model = buildPriceBasketCardModel([
      { symbol: "Spring Wheat", lastPrice: 6.5, changePct: 1.2, series: [6.1, 6.3, 6.5] },
      { symbol: "HRW", lastPrice: 6.4, changePct: -0.8, series: [6.5, 6.45, 6.4] },
      { symbol: "SRW", lastPrice: 5.9, changePct: 0.4, series: [5.8, 5.85, 5.9] },
    ]);
    expect(model.agreementLabel.toLowerCase()).toContain("split");
  });

  it("builds Spring/HRW/SRW legs from price history rows", () => {
    const legs = buildPriceBasketLegsFromHistory([
      { leg: "Spring Wheat", priceDate: "2026-07-01", settlementPrice: 6.5, changePct: 0.1 },
      { leg: "Spring Wheat", priceDate: "2026-07-08", settlementPrice: 6.7, changePct: 0.5 },
      { leg: "HRW Wheat", priceDate: "2026-07-08", settlementPrice: 6.2, changePct: -0.4 },
      { leg: "SRW Wheat", priceDate: "2026-07-08", settlementPrice: 5.8, changePct: 0.2 },
    ]);
    expect(legs.map((l) => l.symbol)).toEqual(["Spring Wheat", "HRW", "SRW"]);
    expect(legs[0]?.series).toEqual([6.5, 6.7]);
    expect(legs[0]?.lastPrice).toBe(6.7);
    expect(legs[1]?.changePct).toBe(-0.4);
    const model = buildPriceBasketCardModel(legs);
    expect(model.agreementLabel.toLowerCase()).toContain("split");
  });
});
