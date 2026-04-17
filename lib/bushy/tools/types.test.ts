// WS3 Task 3.1 — toToolDefinition conversion smoke test.
// Confirms Zod 4's native JSON Schema output is what both OpenAI and
// Anthropic expect in their tool parameter fields.

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { toToolDefinition } from "./types";
import type { BushyTool } from "./types";

describe("toToolDefinition", () => {
  it("produces a valid OpenAI-style ToolDefinition from a Zod schema", () => {
    const tool: BushyTool = {
      name: "save_extraction",
      description: "Capture a farming data point",
      parameters: z.object({
        category: z.enum(["market", "agronomic", "weather"]),
        confidence: z.enum(["reported", "inferred"]),
        reasoning: z.string().min(10),
      }),
      source: "native",
      execute: async () => ({ ok: true, latencyMs: 0 }),
    };

    const def = toToolDefinition(tool);
    expect(def.type).toBe("function");
    expect(def.function.name).toBe("save_extraction");
    expect(def.function.description).toBe("Capture a farming data point");

    const params = def.function.parameters as Record<string, unknown>;
    expect(params.type).toBe("object");

    const properties = params.properties as Record<string, unknown>;
    expect(properties.category).toMatchObject({
      type: "string",
      enum: ["market", "agronomic", "weather"],
    });
    expect(properties.reasoning).toMatchObject({
      type: "string",
      minLength: 10,
    });
    expect(params.required).toEqual(
      expect.arrayContaining(["category", "confidence", "reasoning"]),
    );
  });

  it("handles nullable + optional fields", () => {
    const tool: BushyTool = {
      name: "query_knowledge",
      description: "Read area knowledge",
      parameters: z.object({
        fsa_code: z.string(),
        grain: z.string().nullable(),
        category: z.string().optional(),
      }),
      source: "native",
      execute: async () => ({ ok: true, latencyMs: 0 }),
    };

    const def = toToolDefinition(tool);
    const params = def.function.parameters as {
      required?: string[];
      properties: Record<string, Record<string, unknown>>;
    };
    expect(params.required).toEqual(
      expect.arrayContaining(["fsa_code", "grain"]),
    );
    expect(params.required).not.toContain("category");
  });
});
