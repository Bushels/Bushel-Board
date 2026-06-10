import { describe, expect, it } from "vitest";

import {
  PUBLIC_BOARD_FORBIDDEN_TERMS,
  PUBLIC_PARKED_GRAIN_LABELS,
  containsXSignalAdviceLanguage,
  findPublicForbiddenTerms,
  publicForbiddenTermPatternSpecs,
  publicWheatGapLabels,
  sanitizePublicAdviceCopy,
  sanitizePublicXSignalCopy,
  sanitizePublicWheatClassCopy,
} from "@/lib/public-copy-guardrails";

describe("public copy guardrails", () => {
  it("keeps parked public grain labels in the rendered-board forbidden list", () => {
    expect(PUBLIC_BOARD_FORBIDDEN_TERMS).toEqual(
      expect.arrayContaining([...PUBLIC_PARKED_GRAIN_LABELS]),
    );
    expect(PUBLIC_BOARD_FORBIDDEN_TERMS).toEqual(
      expect.arrayContaining(["pricing recommendation", "pricing call", "hedging advice"]),
    );
    expect(PUBLIC_BOARD_FORBIDDEN_TERMS).not.toContain("trade");
  });

  it("sanitizes public advice phrasing without stripping partial words", () => {
    expect(
      sanitizePublicAdviceCopy("buy Canola, pricing recommendation, hedging advice, trade signal, trade"),
    ).toBe("watch term Canola, watch term, watch term, watch term, watch term");
    expect(sanitizePublicAdviceCopy("buy signal, buy, sell signal, sell")).toBe(
      "watch term, watch term, watch term, watch term",
    );
    expect(sanitizePublicAdviceCopy("pricing\nrecommendation and trade\tsignal")).toBe(
      "watch term and watch term",
    );
    expect(sanitizePublicAdviceCopy("pricing-recommendation and trade / signal")).toBe(
      "watch term and watch term",
    );
    expect(sanitizePublicAdviceCopy("The workbook is rebuilt and the seller count is zero.")).toBe(
      "The workbook is rebuilt and the seller count is zero.",
    );
  });

  it("normalizes public X signal display copy with a fallback", () => {
    expect(
      sanitizePublicXSignalCopy("buy Canola, pricing-recommendation, and trade / signal chatter."),
    ).toBe("watch term Canola, watch term, and watch term chatter.");
    expect(sanitizePublicXSignalCopy("buy", "watch evidence")).toBe("watch term");
    expect(sanitizePublicXSignalCopy("   ", "watch evidence")).toBe("watch evidence");
  });

  it("detects broader X-signal advice terms before validation", () => {
    expect(containsXSignalAdviceLanguage("This is a pricing call for wheat.")).toBe(true);
    expect(containsXSignalAdviceLanguage("Fresh price target on canola.")).toBe(true);
    expect(containsXSignalAdviceLanguage("Fresh price\ntarget on canola.")).toBe(true);
    expect(containsXSignalAdviceLanguage("Fresh price-target on canola.")).toBe(true);
    expect(containsXSignalAdviceLanguage("A long canola setup is forming.")).toBe(true);
    expect(containsXSignalAdviceLanguage("Short wheat against corn.")).toBe(true);
    expect(containsXSignalAdviceLanguage("Basis chatter around Saskatchewan delivery slots.")).toBe(false);
  });

  it("builds whole-word browser-smoke patterns", () => {
    const spec = publicForbiddenTermPatternSpecs(["buy"])[0]!;
    const pattern = new RegExp(spec.source, spec.flags);

    expect(pattern.test("buy")).toBe(true);
    expect(pattern.test("buy signal")).toBe(true);
    expect(pattern.test("buyer interest")).toBe(false);

    const phraseSpec = publicForbiddenTermPatternSpecs(["pricing recommendation"])[0]!;
    const phrasePattern = new RegExp(phraseSpec.source, phraseSpec.flags);

    expect(phrasePattern.test("pricing recommendation")).toBe(true);
    expect(phrasePattern.test("pricing\nrecommendation")).toBe(true);
    expect(phrasePattern.test("pricing     recommendation")).toBe(true);
    expect(phrasePattern.test("pricing-recommendation")).toBe(true);
    expect(phrasePattern.test("pricing / recommendation")).toBe(true);
    expect(phrasePattern.test("pricingrecommendation")).toBe(false);
  });

  it("finds forbidden terms with the shared rendered-text scanner", () => {
    expect(
      findPublicForbiddenTerms("Spring-Wheat and pricing/recommendation copy", PUBLIC_BOARD_FORBIDDEN_TERMS),
    ).toEqual(["Spring Wheat", "pricing recommendation"]);
    expect(findPublicForbiddenTerms("buyer interest and seller count", PUBLIC_BOARD_FORBIDDEN_TERMS)).toEqual([]);
  });

  it("collapses parked Wheat class gaps into one public-safe label", () => {
    expect(publicWheatGapLabels(["Spring Wheat mapping", "Winter Wheat mapping", "local basis"])).toEqual([
      "class-specific Wheat mapping",
      "local basis",
    ]);
  });

  it("sanitizes Spring/Winter Wheat class copy without hiding generic Wheat", () => {
    expect(
      sanitizePublicWheatClassCopy("Spring/Winter Wheat and Spring Wheat rows stay parked."),
    ).toBe("class-specific Wheat and class-specific Wheat rows stay parked.");
    expect(sanitizePublicWheatClassCopy("Generic Wheat remains the public lane.")).toBe(
      "Generic Wheat remains the public lane.",
    );
  });
});
