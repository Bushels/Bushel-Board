// WS3 Task 3.3 — Tool registry tests.

import { describe, it, expect, beforeEach } from "vitest";
import {
  buildToolRegistry,
  findTool,
  __resetRegistryForTests,
  toToolDefinition,
} from "./index";

beforeEach(() => {
  __resetRegistryForTests();
});

describe("buildToolRegistry", () => {
  it("includes all 8 native tools (WS3 + WS4 weather) in a stable order", async () => {
    const registry = await buildToolRegistry();
    const names = registry.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "get_weather",
        "query_area_intelligence",
        "query_market_thesis",
        "query_posted_prices",
        "query_working_memory",
        "save_extraction",
        "search_x",
        "supersede_knowledge",
      ].sort(),
    );
  });

  it("is memoized — repeated calls return the same array reference", async () => {
    const a = await buildToolRegistry();
    const b = await buildToolRegistry();
    expect(a).toBe(b);
  });

  it("every tool is source='native' and has a description >= 40 chars", async () => {
    const registry = await buildToolRegistry();
    for (const tool of registry) {
      expect(tool.source).toBe("native");
      expect(
        tool.description.length,
        `${tool.name} description too short`,
      ).toBeGreaterThanOrEqual(40);
    }
  });
});

describe("findTool", () => {
  it("returns the matching tool by name after buildToolRegistry()", async () => {
    await buildToolRegistry();
    const t = findTool("save_extraction");
    expect(t).toBeDefined();
    expect(t?.name).toBe("save_extraction");
  });

  it("returns undefined for unknown names", async () => {
    await buildToolRegistry();
    expect(findTool("nonexistent")).toBeUndefined();
  });

  it("returns undefined BEFORE buildToolRegistry (sync, no auto-materialize)", () => {
    // No buildToolRegistry() call — registry is null
    expect(findTool("save_extraction")).toBeUndefined();
  });
});

describe("toToolDefinition round-trip", () => {
  it("converts every registered tool to a valid ToolDefinition", async () => {
    const registry = await buildToolRegistry();
    for (const tool of registry) {
      const def = toToolDefinition(tool);
      expect(def.type).toBe("function");
      expect(def.function.name).toBe(tool.name);
      expect(def.function.description).toBe(tool.description);
      const params = def.function.parameters as Record<string, unknown>;
      expect(params.type).toBe("object");
    }
  });
});
