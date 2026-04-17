// WS5 Task 5.9 — System prompt composer tests.
//
// Covers:
//   - Base case: voice kernel + viking L0 always present
//   - Intent-driven L1 inclusion (persona + viking)
//   - Placeholder-safe: empty PERSONA_L0/L1 stubs filtered out
//   - Dynamic loaders: lessons + area intel called via RPC; errors swallowed
//   - Farmer card formatting
//   - Tool descriptions appended last
//   - Section ordering is cache-friendly (static before dynamic)

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSystemPrompt, detectVikingTopics } from "./system-prompt";
import { BUSHY_VOICE } from "./voice-kernel";

type RpcResult = { data: unknown; error: { message: string } | null };

function mockSupabase(
  rpcHandlers: Record<string, RpcResult> = {},
): SupabaseClient {
  return {
    rpc: vi.fn(async (name: string) => {
      return rpcHandlers[name] ?? { data: [], error: null };
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("detectVikingTopics", () => {
  it("picks up basis_pricing for 'what's the basis'", () => {
    expect(detectVikingTopics("what's the basis for wheat")).toContain(
      "basis_pricing",
    );
  });

  it("picks up storage_carry for hold vs haul", () => {
    expect(detectVikingTopics("should I hold or haul?")).toContain(
      "storage_carry",
    );
  });

  it("caps at 2 topics", () => {
    expect(
      detectVikingTopics("hedge my futures options basis canola price").length,
    ).toBeLessThanOrEqual(2);
  });

  it("returns empty array when no pattern matches", () => {
    expect(detectVikingTopics("how's your day")).toEqual([]);
  });
});

describe("buildSystemPrompt", () => {
  const baseCtx = {
    userId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
    fsaCode: "T0L",
    currentMessage: "hi there",
    history: [],
    toolRegistry: [],
    farmerCard: {},
  };

  it("always includes voice kernel + viking L0", async () => {
    const supabase = mockSupabase();
    const prompt = await buildSystemPrompt({
      ...baseCtx,
      supabase,
    });
    expect(prompt).toContain(BUSHY_VOICE);
    expect(prompt).toContain("## Grain Analyst Knowledge Card");
  });

  it("filters out empty PERSONA_L0 placeholder (pre-pipeline state)", async () => {
    // PERSONA_L0 is "" until distillation pipeline runs. The composer
    // must not emit empty double-newlines from the filter.
    const supabase = mockSupabase();
    const prompt = await buildSystemPrompt({ ...baseCtx, supabase });
    expect(prompt).not.toContain("\n\n\n\n"); // no quadruple newline from empty section
  });

  it("includes Viking L1 content when message triggers a topic", async () => {
    const supabase = mockSupabase();
    const prompt = await buildSystemPrompt({
      ...baseCtx,
      currentMessage: "what's the basis for canola this week",
      supabase,
    });
    expect(prompt).toContain("Basis & Pricing Knowledge");
  });

  it("invokes get_active_extraction_lessons + get_area_knowledge RPCs", async () => {
    const supabase = mockSupabase();
    await buildSystemPrompt({ ...baseCtx, supabase });

    const rpc = supabase.rpc as ReturnType<typeof vi.fn>;
    const calledNames = rpc.mock.calls.map((c) => c[0]);
    expect(calledNames).toContain("get_active_extraction_lessons");
    expect(calledNames).toContain("get_area_knowledge");
  });

  it("skips area-intel RPC when fsaCode is null", async () => {
    const supabase = mockSupabase();
    await buildSystemPrompt({
      ...baseCtx,
      fsaCode: null,
      supabase,
    });
    const rpc = supabase.rpc as ReturnType<typeof vi.fn>;
    const calledNames = rpc.mock.calls.map((c) => c[0]);
    expect(calledNames).toContain("get_active_extraction_lessons");
    expect(calledNames).not.toContain("get_area_knowledge");
  });

  it("includes active lessons in the prompt", async () => {
    const supabase = mockSupabase({
      get_active_extraction_lessons: {
        data: [
          {
            lesson_text: "Don't capture delivery volumes under 10 bushels.",
            category_scope: "market",
          },
        ],
        error: null,
      },
    });
    const prompt = await buildSystemPrompt({ ...baseCtx, supabase });
    expect(prompt).toContain("Active extraction lessons");
    expect(prompt).toContain("Don't capture delivery volumes");
  });

  it("includes area intel rows when present", async () => {
    const supabase = mockSupabase({
      get_area_knowledge: {
        data: [
          {
            category: "market",
            data_type: "posted_price",
            value_numeric: 685,
            value_text: null,
            grain: "canola",
          },
        ],
        error: null,
      },
    });
    const prompt = await buildSystemPrompt({ ...baseCtx, supabase });
    expect(prompt).toContain("Current area beliefs");
    expect(prompt).toContain("posted_price");
  });

  it("formats farmer card with name, FSA, crop plan", async () => {
    const supabase = mockSupabase();
    const prompt = await buildSystemPrompt({
      ...baseCtx,
      farmerCard: {
        name: "Kyle",
        fsaCode: "T0L",
        cropPlan: {
          crop_year: "2025-2026",
          crops: [
            { grain: "Canola", acres: 1200 },
            { grain: "Wheat", acres: 800 },
          ],
        },
      },
      supabase,
    });
    expect(prompt).toContain("Farmer card");
    expect(prompt).toContain("Name: Kyle");
    expect(prompt).toContain("Canola 1200ac");
  });

  it("appends tool descriptions last", async () => {
    const supabase = mockSupabase();
    const prompt = await buildSystemPrompt({
      ...baseCtx,
      toolRegistry: [
        { name: "get_weather", description: "Get weather" },
        { name: "query_posted_prices", description: "Get posted prices" },
      ],
      supabase,
    });
    expect(prompt).toContain("Available tools");
    expect(prompt).toContain("get_weather");
    // Tool section should come at the end
    const toolIdx = prompt.indexOf("Available tools");
    const vikingIdx = prompt.indexOf("Grain Analyst Knowledge Card");
    expect(toolIdx).toBeGreaterThan(vikingIdx);
  });

  it("swallows RPC errors and still produces a valid prompt", async () => {
    const supabase = mockSupabase({
      get_active_extraction_lessons: {
        data: null,
        error: { message: "RPC offline" },
      },
    });
    const prompt = await buildSystemPrompt({ ...baseCtx, supabase });
    // Prompt is produced despite error; missing lesson section is silent
    expect(prompt).toContain(BUSHY_VOICE);
    expect(prompt).not.toContain("Active extraction lessons");
  });

  it("section ordering is cache-friendly: static before dynamic", async () => {
    const supabase = mockSupabase({
      get_active_extraction_lessons: {
        data: [{ lesson_text: "lesson A", category_scope: null }],
        error: null,
      },
    });
    const prompt = await buildSystemPrompt({
      ...baseCtx,
      farmerCard: { name: "Kyle" },
      toolRegistry: [{ name: "x", description: "x" }],
      supabase,
    });
    const voiceIdx = prompt.indexOf("You are Bushy");
    const vikingIdx = prompt.indexOf("Grain Analyst Knowledge Card");
    const lessonsIdx = prompt.indexOf("Active extraction lessons");
    const farmerIdx = prompt.indexOf("Farmer card");
    const toolsIdx = prompt.indexOf("Available tools");

    expect(voiceIdx).toBeLessThan(vikingIdx);
    expect(vikingIdx).toBeLessThan(lessonsIdx);
    expect(lessonsIdx).toBeLessThan(farmerIdx);
    expect(farmerIdx).toBeLessThan(toolsIdx);
  });
});
