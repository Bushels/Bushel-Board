import { describe, expect, it } from "vitest";
import {
  buildCotPositioningResult,
  formatCotPromptContext,
  type CotRawRow,
} from "../../lib/cot-market-structure.ts";

const wheatRows: CotRawRow[] = [
  {
    report_date: "2026-03-10",
    commodity: "WHEAT-HRSpring",
    exchange: "MIAX",
    mapping_type: "primary",
    open_interest: 70000,
    change_open_interest: 1200,
    managed_money_long: 23000,
    managed_money_short: 7000,
    change_managed_money_long: 3500,
    change_managed_money_short: -2200,
    prod_merc_long: 28000,
    prod_merc_short: 46500,
    change_prod_merc_long: -500,
    change_prod_merc_short: 1400,
    grain_week: 32,
  },
  {
    report_date: "2026-03-10",
    commodity: "WHEAT-SRW",
    exchange: "CBOT",
    mapping_type: "secondary",
    open_interest: 560000,
    change_open_interest: -8000,
    managed_money_long: 96000,
    managed_money_short: 118000,
    change_managed_money_long: -3000,
    change_managed_money_short: 1800,
    prod_merc_long: 60000,
    prod_merc_short: 110000,
    change_prod_merc_long: 900,
    change_prod_merc_short: 1200,
    grain_week: 32,
  },
  {
    report_date: "2026-03-03",
    commodity: "WHEAT-HRSpring",
    exchange: "MIAX",
    mapping_type: "primary",
    open_interest: 69000,
    change_open_interest: 900,
    managed_money_long: 19000,
    managed_money_short: 15000,
    change_managed_money_long: 1000,
    change_managed_money_short: -500,
    prod_merc_long: 29600,
    prod_merc_short: 36800,
    change_prod_merc_long: 250,
    change_prod_merc_short: 300,
    grain_week: 31,
  },
  {
    report_date: "2026-02-24",
    commodity: "WHEAT-HRSpring",
    exchange: "MIAX",
    mapping_type: "primary",
    open_interest: 70000,
    change_open_interest: -400,
    managed_money_long: 12900,
    managed_money_short: 22800,
    change_managed_money_long: 600,
    change_managed_money_short: -1200,
    prod_merc_long: 33900,
    prod_merc_short: 28900,
    change_prod_merc_long: -100,
    change_prod_merc_short: 500,
    grain_week: 30,
  },
  {
    report_date: "2026-02-17",
    commodity: "WHEAT-HRSpring",
    exchange: "MIAX",
    mapping_type: "primary",
    open_interest: 74400,
    change_open_interest: -700,
    managed_money_long: 9100,
    managed_money_short: 27800,
    change_managed_money_long: -500,
    change_managed_money_short: 800,
    prod_merc_long: 40400,
    prod_merc_short: 27100,
    change_prod_merc_long: 350,
    change_prod_merc_short: -450,
    grain_week: 29,
  },
];

describe("buildCotPositioningResult", () => {
  it("uses the primary prairie proxy for wheat and retains related contracts", () => {
    const result = buildCotPositioningResult(wheatRows, "Wheat", 6);

    expect(result.latest?.commodity).toBe("WHEAT-HRSpring");
    expect(result.primaryProxyLabel).toContain("Minneapolis spring wheat");
    expect(result.relatedContracts).toHaveLength(1);
    expect(result.relatedContracts[0]?.commodity).toBe("WHEAT-SRW");
  });

  it("derives crowding, change driver, and reversal risk from the recent range", () => {
    const result = buildCotPositioningResult(wheatRows, "Wheat", 6);

    expect(result.latest?.crowding_label).toBe("crowded long");
    expect(result.latest?.change_driver).toBe("fresh buying + shorts covering");
    expect(result.latest?.reversal_risk).toBe("high");
    expect(result.latest?.spec_commercial_divergence).toBe(true);
  });
});

describe("formatCotPromptContext", () => {
  it("turns the structured result into richer AI prompt context", () => {
    const result = buildCotPositioningResult(wheatRows, "Wheat", 6);
    const promptBlock = formatCotPromptContext(result);

    expect(promptBlock).toContain("Prairie proxy");
    expect(promptBlock).toContain("fresh buying + shorts covering");
    expect(promptBlock).toContain("Related futures");
    expect(promptBlock).toContain("Reversal risk: HIGH");
  });
});
