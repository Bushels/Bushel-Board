// WS5 Task 5.8 — Intent detection tests (TDD).

import { describe, it, expect } from "vitest";
import { detectIntent } from "./detect-intent";
import type { ChatMessage } from "../adapters/types";

const empty: ChatMessage[] = [];
const priorTurn: ChatMessage[] = [
  { role: "user", content: "hey" },
  { role: "assistant", content: "howdy" },
];

describe("detectIntent", () => {
  it("returns opening_a_conversation when history empty", () => {
    expect(detectIntent("hi", empty)).toContain("opening_a_conversation");
  });

  it("returns handling_disagreement when farmer pushes back", () => {
    expect(
      detectIntent("I think you were wrong about wheat", priorTurn),
    ).toContain("handling_disagreement");
  });

  it("catches 'bullshit' as disagreement signal", () => {
    expect(detectIntent("that canola price was bullshit", priorTurn)).toContain(
      "handling_disagreement",
    );
  });

  it("returns delivering_hard_advice for hold/haul questions", () => {
    expect(
      detectIntent("should I hold or haul my canola?", empty),
    ).toContain("delivering_hard_advice");
  });

  it("caps at 2 topics per turn", () => {
    expect(
      detectIntent(
        "your wrong canola price was bullshit help me decide hold or haul or sell",
        empty,
      ).length,
    ).toBeLessThanOrEqual(2);
  });

  it("falls back to building_rapport when no signals match", () => {
    expect(detectIntent("how was your day", priorTurn)).toContain(
      "building_rapport",
    );
  });

  it("flags negotiating_data_share on price/cost/input mentions", () => {
    expect(detectIntent("what did you pay for fertilizer?", empty)).toContain(
      "negotiating_data_share",
    );
    expect(detectIntent("seed cost this year", empty)).toContain(
      "negotiating_data_share",
    );
  });

  it("flags gathering_information on early question marks", () => {
    // First 3 turns + question -> gathering_information
    expect(detectIntent("what do you think?", priorTurn)).toContain(
      "gathering_information",
    );
  });

  it("does NOT flag gathering_information after many prior turns", () => {
    const longHistory = Array.from({ length: 6 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `turn ${i}`,
    })) as ChatMessage[];
    // Question late in conversation should NOT trigger gathering (we're past rapport-building phase)
    const result = detectIntent("what do you think?", longHistory);
    expect(result).not.toContain("gathering_information");
  });

  it("returns at least one topic for any non-empty input", () => {
    const result = detectIntent("okay", priorTurn);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("does not duplicate topics", () => {
    // Craft a message that could trigger disagreement twice (wrong + bullshit)
    const result = detectIntent("you were wrong, that was bullshit", priorTurn);
    const unique = new Set(result);
    expect(unique.size).toBe(result.length);
  });
});
