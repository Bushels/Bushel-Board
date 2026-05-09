import { describe, expect, it } from "vitest";

import {
  CFTC_GRAIN_MAP,
  parseCftcCotRows,
  type CftcApiRow,
} from "./cftc-cot-parser";

function makeRawRow(contractMarketName: string): CftcApiRow {
  return {
    report_date_as_yyyy_mm_dd: "2026-04-28T00:00:00.000",
    contract_market_name: contractMarketName,
    market_and_exchange_names: `${contractMarketName} - CHICAGO BOARD OF TRADE`,
    open_interest_all: "1000",
    prod_merc_positions_long: "100",
    prod_merc_positions_short: "200",
    swap_positions_long_all: "10",
    swap__positions_short_all: "20",
    swap__positions_spread_all: "5",
    m_money_positions_long_all: "300",
    m_money_positions_short_all: "150",
    m_money_positions_spread: "25",
    other_rept_positions_long: "40",
    other_rept_positions_short: "30",
    other_rept_positions_spread: "8",
    nonrept_positions_long_all: "15",
    nonrept_positions_short_all: "12",
    change_in_open_interest_all: "50",
    change_in_prod_merc_long: "1",
    change_in_prod_merc_short: "2",
    change_in_swap_long_all: "3",
    change_in_swap_short_all: "4",
    change_in_m_money_long_all: "5",
    change_in_m_money_short_all: "6",
    change_in_other_rept_long: "7",
    change_in_other_rept_short: "8",
    change_in_nonrept_long_all: "9",
    change_in_nonrept_short_all: "10",
    pct_of_oi_prod_merc_long: "10",
    pct_of_oi_prod_merc_short: "20",
    pct_of_oi_swap_long_all: "1",
    pct_of_oi_swap_short_all: "2",
    pct_of_oi_m_money_long_all: "30",
    pct_of_oi_m_money_short_all: "15",
    pct_of_oi_other_rept_long: "4",
    pct_of_oi_other_rept_short: "3",
    pct_of_oi_nonrept_long_all: "1.5",
    pct_of_oi_nonrept_short_all: "1.2",
    traders_prod_merc_long_all: "11",
    traders_prod_merc_short_all: "12",
    traders_m_money_long_all: "13",
    traders_m_money_short_all: "14",
    traders_m_money_spread_all: "15",
    traders_other_rept_long_all: "16",
    traders_other_rept_short: "17",
    traders_other_rept_spread: "18",
    traders_tot_all: "100",
    conc_gross_le_4_tdr_long: "25",
    conc_gross_le_4_tdr_short: "26",
    conc_gross_le_8_tdr_long: "35",
    conc_gross_le_8_tdr_short: "36",
    conc_net_le_4_tdr_long_all: "20",
    conc_net_le_4_tdr_short_all: "21",
    conc_net_le_8_tdr_long_all: "30",
    conc_net_le_8_tdr_short_all: "31",
  };
}

describe("CFTC grain mapping", () => {
  it("maps OATS as a primary Oats positioning row", () => {
    expect(CFTC_GRAIN_MAP.OATS).toEqual({
      cgcGrain: "Oats",
      mappingType: "primary",
    });

    const [row] = parseCftcCotRows([makeRawRow("OATS")]);

    expect(row).toMatchObject({
      commodity: "OATS",
      cgc_grain: "Oats",
      mapping_type: "primary",
      report_date: "2026-04-28",
      import_source: "cftc-api",
    });
  });
});
