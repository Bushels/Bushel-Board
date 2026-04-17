// WS3 Task 3.2 — Bushy chat harness
// ToolBudget TDD tests. Budget guards apply across three dimensions:
//   - per-turn call count (per-tool override via `limits.perTurn`)
//   - per-conversation call count (per-tool override via `limits.perConversation`)
//   - total conversation cost cap (fleet-wide, not per-tool)
//
// Default limits are module-wide ceilings (perTurnMax/perConvMax/costCapUsd);
// individual tools can tighten via their own BushyTool.rateLimit.

import { describe, it, expect } from "vitest";
import { ToolBudget } from "./budget";

describe("ToolBudget", () => {
  it("allows calls under per-turn limit", () => {
    const b = new ToolBudget({
      perTurnMax: 3,
      perConvMax: 10,
      costCapUsd: 1,
    });
    b.recordCall("get_weather", 0.01);
    b.recordCall("get_weather", 0.01);
    expect(
      b.canCall("get_weather", { perTurn: 3, perConversation: 5 }),
    ).toBe(true);
  });

  it("rejects when per-turn limit exceeded via tool override", () => {
    const b = new ToolBudget({
      perTurnMax: 100,
      perConvMax: 100,
      costCapUsd: 100,
    });
    for (let i = 0; i < 3; i++) b.recordCall("search_x", 0.01);
    expect(
      b.canCall("search_x", { perTurn: 3, perConversation: 10 }),
    ).toBe(false);
  });

  it("rejects when per-conversation limit exceeded via tool override", () => {
    const b = new ToolBudget({
      perTurnMax: 100,
      perConvMax: 100,
      costCapUsd: 100,
    });
    // Interleave turns so per-turn counter resets but per-conv accumulates.
    for (let i = 0; i < 10; i++) {
      b.recordCall("search_x", 0.001);
      b.startTurn();
    }
    expect(
      b.canCall("search_x", { perTurn: 3, perConversation: 10 }),
    ).toBe(false);
  });

  it("rejects when conversation cost cap exceeded", () => {
    const b = new ToolBudget({
      perTurnMax: 100,
      perConvMax: 100,
      costCapUsd: 0.5,
    });
    b.recordCall("search_x", 0.4);
    b.recordCall("search_x", 0.2); // total 0.60 > 0.50
    expect(b.canCall("search_x")).toBe(false);
  });

  it("startTurn clears per-turn counters but keeps conversation totals", () => {
    const b = new ToolBudget({
      perTurnMax: 1,
      perConvMax: 10,
      costCapUsd: 100,
    });
    b.recordCall("get_weather", 0);
    expect(
      b.canCall("get_weather", { perTurn: 1, perConversation: 10 }),
    ).toBe(false);
    b.startTurn();
    // Per-turn resets, per-conv still at 1 (below 10) → allowed again
    expect(
      b.canCall("get_weather", { perTurn: 1, perConversation: 10 }),
    ).toBe(true);
  });

  it("falls back to fleet-wide defaults when no per-tool limits are supplied", () => {
    const b = new ToolBudget({
      perTurnMax: 2,
      perConvMax: 10,
      costCapUsd: 1,
    });
    b.recordCall("any_tool", 0);
    b.recordCall("any_tool", 0);
    expect(b.canCall("any_tool")).toBe(false); // hit fleet perTurnMax=2
  });

  it("snapshot exposes totals for audit logging", () => {
    const b = new ToolBudget({
      perTurnMax: 10,
      perConvMax: 10,
      costCapUsd: 10,
    });
    b.recordCall("search_x", 0.05);
    b.recordCall("get_weather", 0);
    b.recordCall("search_x", 0.05);
    const snap = b.snapshot();
    expect(snap.convCalls["search_x"]).toBe(2);
    expect(snap.convCalls["get_weather"]).toBe(1);
    expect(snap.totalCostUsd).toBeCloseTo(0.1, 10);
  });
});
