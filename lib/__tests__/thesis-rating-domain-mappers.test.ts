import { describe, expect, it } from "vitest";

import {
  mapCanadaPacketToDomainInputs,
  mapUsPacketToDomainInputs,
} from "@/lib/thesis/rating-domain-mappers";

describe("thesis rating domain packet mappers", () => {
  it("maps strong Canada canola current-week export and process deliveries to bullish demand", () => {
    const domains = mapCanadaPacketToDomainInputs({
      freshness: [{ source_name: "cgc_observations", freshness_status: "strong" }],
      demand: {
        producer_deliveries_current_week: {
          total_kt: 1_000,
          process_deliveries_kt: 340,
        },
        exports: { current_week_kt: 470 },
      },
    });

    const demand = domains.find((domain) => domain.domain === "demand");

    expect(demand).toMatchObject({
      domain: "demand",
      freshness_status: "strong",
      sources: ["cgc_observations"],
      confidence: "high",
      isRequired: true,
      isPrimaryDirectSource: true,
    });
    expect(demand?.score).toBeGreaterThan(0);
    expect(demand?.positive_evidence?.join(" ")).toContain("export share");
    expect(demand?.positive_evidence?.join(" ")).toContain("process share");
  });

  it("maps high Canada deliveries with weak disappearance to bearish movement", () => {
    const domains = mapCanadaPacketToDomainInputs({
      freshness: [{ source_name: "cgc_observations", freshness_status: "strong" }],
      demand: {
        producer_deliveries_current_week: {
          total_kt: 900,
          process_deliveries_kt: 40,
        },
        exports: { current_week_kt: 100 },
      },
    });

    const movement = domains.find((domain) => domain.domain === "movement");

    expect(movement).toMatchObject({
      domain: "movement",
      freshness_status: "strong",
      sources: ["cgc_observations"],
      confidence: "high",
      isRequired: true,
      isPrimaryDirectSource: true,
    });
    expect(movement?.score).toBeLessThan(0);
    expect(movement?.negative_evidence?.join(" ")).toContain("deliveries entered the pipeline");
    expect(movement?.negative_evidence?.join(" ")).toContain("disappearance is weak");
  });

  it("maps admitted US wheat export-sales projection pace over 100% to bullish demand", () => {
    const domains = mapUsPacketToDomainInputs({
      freshness: [{ source_name: "usda_export_sales", freshness_status: "strong" }],
      demand: {
        export_sales: {
          export_pace_pct: 101,
          net_sales_mt: -100,
          total_commitments_mt: 1,
          usda_projection_mt: 10,
        },
      },
    });

    const demand = domains.find((domain) => domain.domain === "demand");

    expect(demand).toMatchObject({
      domain: "demand",
      freshness_status: "strong",
      sources: ["usda_export_sales"],
      confidence: "high",
      isRequired: true,
      isPrimaryDirectSource: true,
    });
    expect(demand?.score).toBeGreaterThan(0);
    expect(demand?.positive_evidence?.join(" ")).toContain("101.0% export projection pace");
    expect(demand?.positive_evidence?.join(" ")).not.toContain("net sales");
  });

  it("blocks US barley/oats projection demand scoring when export projection pace is unavailable", () => {
    const domains = mapUsPacketToDomainInputs({
      freshness: [{ source_name: "usda_export_sales", freshness_status: "strong" }],
      demand: {
        export_sales: {
          export_pace_pct: null,
          net_sales_mt: 500_000,
          total_commitments_mt: 10_000_000,
          usda_projection_mt: 1_000_000,
        },
      },
    });

    const demand = domains.find((domain) => domain.domain === "demand");

    expect(demand?.score ?? 0).toBe(0);
    expect(demand?.positive_evidence ?? []).toHaveLength(0);
    expect(demand?.blocked_claims).toContain("export_projection_pace_unavailable");
  });

  it("maps poor US crop condition to bullish weather risk during the active crop-progress window", () => {
    const domains = mapUsPacketToDomainInputs({
      packet_generated_at: "2026-06-15T12:00:00Z",
      freshness: [{ source_name: "usda_crop_progress", freshness_status: "strong" }],
      supply: {
        crop_progress: {
          us_total: {
            good_excellent_pct: 49,
            ge_pct_yoy_change: -4,
          },
        },
      },
    });

    const weather = domains.find((domain) => domain.domain === "weather");

    expect(weather).toMatchObject({
      domain: "weather",
      freshness_status: "strong",
      sources: ["usda_crop_progress"],
      confidence: "high",
      isRequired: true,
      isPrimaryDirectSource: true,
    });
    expect(weather?.score).toBeGreaterThan(0);
    expect(weather?.positive_evidence?.join(" ")).toContain("US crop stress supports price");
  });

  it("does not score US crop-condition weather risk outside the old-crop/new-crop relevance window", () => {
    const domains = mapUsPacketToDomainInputs({
      packet_generated_at: "2026-01-15T12:00:00Z",
      freshness: [{ source_name: "usda_crop_progress", freshness_status: "strong" }],
      supply: {
        crop_progress: {
          us_total: {
            good_excellent_pct: 45,
            ge_pct_yoy_change: -12,
          },
        },
      },
    });

    expect(domains.find((domain) => domain.domain === "weather")).toBeUndefined();
  });

  it("tolerates malformed packets without throwing", () => {
    expect(mapCanadaPacketToDomainInputs(null)).toEqual([]);
    expect(mapUsPacketToDomainInputs(undefined)).toEqual([]);
  });
});
