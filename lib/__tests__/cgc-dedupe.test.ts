import { describe, expect, it } from "vitest";

import { dedupeCgcRowsForUpsert } from "../cgc/dedupe";
import type { CgcRow } from "../cgc/parser";

describe("dedupeCgcRowsForUpsert", () => {
  it("removes duplicate conflict keys before batch upsert", () => {
    const rows: CgcRow[] = [
      {
        crop_year: "2025-2026",
        grain_week: 35,
        week_ending_date: "2026-04-02",
        worksheet: "Primary",
        metric: "Deliveries",
        period: "Crop Year",
        grain: "Wheat",
        grade: "",
        region: "Alberta",
        ktonnes: 10,
      },
      {
        crop_year: "2025-2026",
        grain_week: 35,
        week_ending_date: "2026-04-02",
        worksheet: "Primary",
        metric: "Deliveries",
        period: "Crop Year",
        grain: "Wheat",
        grade: "",
        region: "Alberta",
        ktonnes: 12,
      },
      {
        crop_year: "2025-2026",
        grain_week: 35,
        week_ending_date: "2026-04-02",
        worksheet: "Primary",
        metric: "Deliveries",
        period: "Crop Year",
        grain: "Wheat",
        grade: "",
        region: "Saskatchewan",
        ktonnes: 15,
      },
    ];

    const deduped = dedupeCgcRowsForUpsert(rows);
    expect(deduped).toHaveLength(2);
    expect(deduped[0]?.ktonnes).toBe(12);
    expect(deduped[1]?.region).toBe("Saskatchewan");
  });
});
