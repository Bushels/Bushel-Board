import { describe, expect, it } from "vitest";

import {
  buildBushelAgentTeamBrief,
  getBushelAgentTeam,
} from "../bushel-agent-team";

describe("getBushelAgentTeam", () => {
  it("returns the core weekly market team for wheat", () => {
    const team = getBushelAgentTeam("Wheat");
    expect(team.map((agent) => agent.id)).toEqual([
      "delivery_lead",
      "flow_balance",
      "basis_cash",
      "logistics_pipe",
      "sentiment_timing",
      "retrospective_calibration",
      "calibration_guard",
    ]);
  });

  it("adds the oilseed specialist for canola", () => {
    const team = getBushelAgentTeam("Canola");
    expect(team.map((agent) => agent.id)).toContain("crush_oilseed");
  });

  it("adds the specialty-market specialist for oats and peas", () => {
    expect(getBushelAgentTeam("Oats").map((agent) => agent.id)).toContain("specialty_market");
    expect(getBushelAgentTeam("Peas").map((agent) => agent.id)).toContain("specialty_market");
  });

  it("adds both specialists for flaxseed", () => {
    const ids = getBushelAgentTeam("Flaxseed").map((agent) => agent.id);
    expect(ids).toContain("crush_oilseed");
    expect(ids).toContain("specialty_market");
  });
});

describe("buildBushelAgentTeamBrief", () => {
  it("frames the bull and bear cases as the weekly farmer summary", () => {
    const brief = buildBushelAgentTeamBrief("Canola");
    expect(brief).toContain("predictive grain market");
    expect(brief).toContain("weekly summary of what is happening for the farmer");
    expect(brief).toContain("Delivery Lead");
    expect(brief).toContain("Calibration Guard");
    expect(brief).toContain("Retrospective Calibration Agent");
  });
});
