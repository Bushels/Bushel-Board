import { describe, expect, it } from "vitest";

import {
  getIceCanolaFrontMonthSymbol,
  getIceCanolaLastTradingDay,
} from "../canola-contracts";

describe("ICE Canola contract rollover", () => {
  it("keeps May 2026 active before its last trading day", () => {
    expect(getIceCanolaFrontMonthSymbol(new Date("2026-05-06T12:00:00Z"))).toBe("RSK26");
  });

  it("rolls May 2026 to July after the last trading day", () => {
    expect(getIceCanolaFrontMonthSymbol(new Date("2026-05-15T12:00:00Z"))).toBe("RSN26");
  });

  it("rolls November 2026 to January 2027 after the November contract", () => {
    expect(getIceCanolaFrontMonthSymbol(new Date("2026-11-16T12:00:00Z"))).toBe("RSF27");
  });

  it("uses the previous business day when the 14th is a weekend", () => {
    expect(getIceCanolaLastTradingDay(2026, 11).toISOString().slice(0, 10)).toBe("2026-11-13");
  });
});
