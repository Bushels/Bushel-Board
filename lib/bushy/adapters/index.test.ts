// WS2 Task 2.7 — Bushy chat harness
// Adapter-factory routing tests. Every supported prefix maps to the right
// adapter class. The factory relies on constructors succeeding, so each
// provider's API-key env is pre-set in the test harness.

import { describe, it, expect, beforeEach, vi } from "vitest";

// Minimal SDK mocks so real constructors don't attempt network I/O.
vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { stream: () => ({ [Symbol.asyncIterator]: () => ({}) }) };
    constructor(_opts: unknown) {}
  }
  return { default: MockAnthropic };
});

vi.mock("openai", () => {
  class MockOpenAI {
    chat = { completions: { create: async () => ({}) } };
    constructor(_opts: unknown) {}
  }
  return { default: MockOpenAI };
});

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "anth-test";
  process.env.XAI_API_KEY = "xai-test";
  process.env.OPENAI_API_KEY = "openai-test";
  process.env.OPENROUTER_API_KEY = "or-test";
});

describe("getAdapter", () => {
  it.each([
    ["claude-sonnet-4.6", "anthropic"],
    ["claude-opus-4.7", "anthropic"],
    ["claude-haiku-4.6", "anthropic"],
    ["grok-4.20-reasoning", "xai"],
    ["gpt-4o", "openai"],
    ["gpt-4.1", "openai"],
    ["o1-preview", "openai"],
    ["o3-mini", "openai"],
    ["deepseek/deepseek-chat", "openrouter"],
    ["meta-llama/llama-3.1-70b-instruct", "openrouter"],
    ["qwen/qwen-2.5-72b-instruct", "openrouter"],
  ])("routes %s → %s", async (modelId, expectedProvider) => {
    const { getAdapter } = await import("./index");
    const adapter = getAdapter(modelId);
    expect(adapter.provider).toBe(expectedProvider);
    expect(adapter.modelId).toBe(modelId);
  });

  it("re-exports TurnResult-related types and pricing utilities", async () => {
    const mod = await import("./index");
    expect(typeof mod.calculateCost).toBe("function");
    expect(typeof mod.MODEL_PRICING).toBe("object");
    expect(mod.MODEL_PRICING["claude-sonnet-4.6"]).toBeDefined();
  });
});
