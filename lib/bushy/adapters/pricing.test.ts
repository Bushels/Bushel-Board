// WS2 Task 2.2 — Bushy chat harness
// Pricing / cost-calculator tests.
//
// Test strategy:
// - Golden inputs for the two most-common models (Sonnet, Opus).
// - Cached-token discount math is the single most common silent-leak source
//   — two dedicated cases.
// - Unknown-model case must return 0 + emit a console.warn so CI logs catch
//   missing pricing entries rather than billing at face value.
// - Zero-token edge cases to guard against NaN / -0 arithmetic.

import { describe, it, expect, vi, afterEach } from "vitest";
import { calculateCost, MODEL_PRICING } from "./pricing";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("calculateCost", () => {
  it("computes claude-sonnet-4.6 cost from token counts", () => {
    // Sonnet 4.6: $3/M input, $15/M output
    const cost = calculateCost("claude-sonnet-4.6", {
      promptTokens: 1000,
      completionTokens: 500,
      cachedTokens: 0,
    });
    // 1000 * 3e-6 + 500 * 15e-6 = 0.003 + 0.0075 = 0.0105
    expect(cost).toBeCloseTo(1000 * 0.000003 + 500 * 0.000015, 10);
  });

  it("computes claude-opus-4.7 cost", () => {
    // Opus 4.7: $15/M input, $75/M output
    const cost = calculateCost("claude-opus-4.7", {
      promptTokens: 1000,
      completionTokens: 500,
      cachedTokens: 0,
    });
    expect(cost).toBeCloseTo(1000 * 0.000015 + 500 * 0.000075, 10);
  });

  it("discounts cached tokens (Anthropic prompt cache hit) for Sonnet", () => {
    // Sonnet: cached input at 10% of full rate ($0.30/M vs $3/M)
    const cost = calculateCost("claude-sonnet-4.6", {
      promptTokens: 1000,
      completionTokens: 0,
      cachedTokens: 800,
    });
    // 200 uncached * 3e-6 + 800 cached * 0.3e-6 = 0.0006 + 0.00024 = 0.00084
    expect(cost).toBeCloseTo(200 * 0.000003 + 800 * 0.0000003, 10);
  });

  it("discounts cached tokens correctly when ALL tokens are cached", () => {
    // Entire prompt hit the cache — still billed at cached rate, never at 0.
    const cost = calculateCost("claude-sonnet-4.6", {
      promptTokens: 1000,
      completionTokens: 100,
      cachedTokens: 1000,
    });
    // 0 uncached + 1000 cached * 0.3e-6 + 100 completion * 15e-6
    expect(cost).toBeCloseTo(1000 * 0.0000003 + 100 * 0.000015, 10);
  });

  it("treats cachedTokens > promptTokens safely (clamps uncached to 0)", () => {
    // Defensive: some APIs have reported cached_tokens > input_tokens when
    // extended-context caching is involved. Never let the math go negative.
    const cost = calculateCost("claude-sonnet-4.6", {
      promptTokens: 500,
      completionTokens: 100,
      cachedTokens: 800, // exceeds promptTokens
    });
    // Uncached should clamp to 0, cached billed at reported value.
    expect(cost).toBeCloseTo(0 + 800 * 0.0000003 + 100 * 0.000015, 10);
  });

  it("returns 0 for unknown model and emits a console warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cost = calculateCost("model-that-does-not-exist", {
      promptTokens: 1000,
      completionTokens: 500,
      cachedTokens: 0,
    });
    expect(cost).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("model-that-does-not-exist"),
    );
  });

  it("returns 0 for a zero-token turn (no math required)", () => {
    const cost = calculateCost("claude-sonnet-4.6", {
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
    });
    expect(cost).toBe(0);
  });

  it("handles grok-4.20-reasoning (no cache discount — rate equals input)", () => {
    // xAI Responses API currently bills cached input at full rate. Treat
    // cachedInputPerToken === inputPerToken so cost is invariant to cache
    // hits — don't over-credit.
    const flat = calculateCost("grok-4.20-reasoning", {
      promptTokens: 1000,
      completionTokens: 500,
      cachedTokens: 0,
    });
    const withCache = calculateCost("grok-4.20-reasoning", {
      promptTokens: 1000,
      completionTokens: 500,
      cachedTokens: 500,
    });
    expect(withCache).toBeCloseTo(flat, 10);
  });
});

describe("MODEL_PRICING table", () => {
  it("every entry has cachedInputPerToken <= inputPerToken", () => {
    for (const [model, p] of Object.entries(MODEL_PRICING)) {
      expect(
        p.cachedInputPerToken,
        `${model} cached rate must not exceed input rate`,
      ).toBeLessThanOrEqual(p.inputPerToken);
    }
  });

  it("every entry has outputPerToken >= inputPerToken (typical)", () => {
    // Not strictly required, but a sanity tripwire: completion tokens cost
    // more than input for every commercial provider we use.
    for (const [model, p] of Object.entries(MODEL_PRICING)) {
      expect(
        p.outputPerToken,
        `${model} output rate unexpectedly <= input`,
      ).toBeGreaterThanOrEqual(p.inputPerToken);
    }
  });
});
