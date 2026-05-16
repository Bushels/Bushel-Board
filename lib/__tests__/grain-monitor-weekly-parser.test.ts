import { describe, expect, it } from "vitest";
import { parsePageMetadata, parseVesselsAndWeather } from "../../scripts/grain-monitor/parsers";

describe("parseVesselsAndWeather", () => {
  it("parses normal plural vessel lineup bullets", () => {
    const page1 = [
      "\u2022 Vancouver vessel lineup for Week 37 2025-26 increased to 13 vessels (The current one-year average at Vancouver is 12 vessels).",
      "\u2022 Prince Rupert vessel lineup for Week 37 2025-26 increased to 4 vessels (The current one-year average at Prince Rupert is 2 vessels).",
      "\u2022 Vessels cleared from Vancouver were 8 and from Prince Rupert were 3 in Week 36.",
      "Vessels Inbound Apr 20, 2026 to Apr 26, 2026 (Week 38)",
      "10",
      "2",
    ].join("\n");

    const parsed = parseVesselsAndWeather(page1, "");

    expect(parsed.vessels_vancouver).toBe(13);
    expect(parsed.vessels_prince_rupert).toBe(4);
    expect(parsed.vessels_cleared_vancouver).toBe(8);
    expect(parsed.vessels_cleared_prince_rupert).toBe(3);
    expect(parsed.vessels_inbound_next_week).toBe(12);
    expect(parsed.vessel_avg_one_year_vancouver).toBe(12);
    expect(parsed.vessel_avg_one_year_prince_rupert).toBe(2);
  });

  it("parses singular Prince Rupert vessel count and split month artifact", () => {
    const page1 = [
      "\u2022 Vancouver vessel lineup for Week 38 2025-26 decreased to 11 vessels (The current one-year average at Vancouver is 12 vessels).",
      "\u2022 Prince Rupert vessel lineup for Week 38 2025-26 decreased to 1 vessel (The current one-year average at Prince Rupert is 2 vessels).",
      "\u2022 Vessels cleared from Vancouver were 6 and from Prince Rupert was 1 in Week 37.",
      "Vessels Inbound Apr 27, 2026 to M ay 03, 2026 (Week 39)",
      "12",
      "2",
    ].join("\n");

    expect(page1).toContain("M ay");

    const parsed = parseVesselsAndWeather(page1, "");

    expect(parsed.vessels_vancouver).toBe(11);
    expect(parsed.vessels_prince_rupert).toBe(1);
    expect(parsed.vessels_cleared_vancouver).toBe(6);
    expect(parsed.vessels_cleared_prince_rupert).toBe(1);
    expect(parsed.vessels_inbound_next_week).toBe(14);
    expect(parsed.vessel_avg_one_year_vancouver).toBe(12);
    expect(parsed.vessel_avg_one_year_prince_rupert).toBe(2);
  });

  it("parses unchanged vessel lineups reported as remained at", () => {
    const page1 = [
      "\u2022 Vancouver vessel lineup for Week 40 2025-26 decreased to 19 vessels (The current one-year average at Vancouver is 20 vessels).",
      "\u2022 Prince Rupert vessel lineup for Week 40 2025-26 remained at 2 vessels (The current one-year average at Prince Rupert is 2 vessels).",
      "\u2022 Vessels cleared from Vancouver was 13 and from Prince Rupert was 2 in Week 40 2025-26.",
      "Vessels Inbound M ay 11, 2026 to M ay 17, 2026 (Week 41)",
      "13",
      "2",
    ].join("\n");

    const parsed = parseVesselsAndWeather(page1, "");

    expect(parsed.vessels_vancouver).toBe(19);
    expect(parsed.vessels_prince_rupert).toBe(2);
    expect(parsed.vessels_cleared_vancouver).toBe(13);
    expect(parsed.vessels_cleared_prince_rupert).toBe(2);
    expect(parsed.vessels_inbound_next_week).toBe(15);
    expect(parsed.vessel_avg_one_year_vancouver).toBe(20);
    expect(parsed.vessel_avg_one_year_prince_rupert).toBe(2);
  });
});

describe("parsePageMetadata", () => {
  it("parses split-month vessel as-of dates", () => {
    const page1 = [
      "Weekly Performance Update",
      "May 12, 2026",
      "For Grain Week 39 2025-26 CY",
      "April 27, 2026 to May 03, 2026",
      "5. Vessels as at M ay 10, 2026",
      "\u2022 Vancouver vessel lineup for Week 40 2025-26 decreased to 19 vessels (The current one-year average at Vancouver is 20 vessels).",
      "Vessels Inbound M ay 11, 2026 to M ay 17, 2026 (Week 41)",
    ].join("\n");

    expect(parsePageMetadata(page1)).toMatchObject({
      grainWeek: 39,
      reportDate: "2026-05-12",
      coveredPeriodStart: "2026-04-27",
      coveredPeriodEnd: "2026-05-03",
      vesselAsOfDate: "2026-05-10",
      vesselWeek: 40,
      inboundPeriod: "M ay 11, 2026 to M ay 17, 2026",
      inboundWeek: 41,
    });
  });
});
