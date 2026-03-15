import {
  isCountryProducerDeliveryObservation,
  sumCountryProducerDeliveries,
} from "@/lib/cgc/delivery-metrics";
import { describe, expect, it } from "vitest";

describe("country producer delivery formula", () => {
  it("includes BC primary deliveries, process deliveries, and producer car shipments", () => {
    const rows = [
      { worksheet: "Primary", metric: "Deliveries", region: "Manitoba", grade: "", ktonnes: 36.0 },
      { worksheet: "Primary", metric: "Deliveries", region: "Saskatchewan", grade: "", ktonnes: 156.8 },
      { worksheet: "Primary", metric: "Deliveries", region: "Alberta", grade: "", ktonnes: 123.2 },
      { worksheet: "Primary", metric: "Deliveries", region: "British Columbia", grade: "", ktonnes: 1.9 },
      { worksheet: "Process", metric: "Producer Deliveries", region: "", grade: "", ktonnes: 139.6 },
      { worksheet: "Producer Cars", metric: "Shipments", region: "Manitoba", grade: "", ktonnes: 1.8 },
      { worksheet: "Producer Cars", metric: "Shipments", region: "Saskatchewan", grade: "", ktonnes: 0.9 },
    ];

    expect(sumCountryProducerDeliveries(rows)).toBeCloseTo(460.2, 5);
  });

  it("ignores grade-level rows so Primary totals are not double-counted", () => {
    const rows = [
      { worksheet: "Primary", metric: "Deliveries", region: "Alberta", grade: "", ktonnes: 123.2 },
      { worksheet: "Primary", metric: "Deliveries", region: "Alberta", grade: "No.1 CANADA", ktonnes: 80.0 },
      { worksheet: "Process", metric: "Producer Deliveries", region: "", grade: "", ktonnes: 139.6 },
    ];

    expect(sumCountryProducerDeliveries(rows)).toBeCloseTo(262.8, 5);
  });

  it("excludes producer car shipment distribution rows and non-delivery regions", () => {
    expect(
      isCountryProducerDeliveryObservation({
        worksheet: "Producer Cars",
        metric: "Shipment Distribution",
        region: "Bay & Lakes",
        grade: "",
        ktonnes: 1.8,
      })
    ).toBe(false);

    expect(
      isCountryProducerDeliveryObservation({
        worksheet: "Primary",
        metric: "Deliveries",
        region: "Ontario",
        grade: "",
        ktonnes: 9.1,
      })
    ).toBe(false);
  });
});
